<?php
/**
 * AI Assistant API
 *
 * Routes: /api/ai/models
 *         /api/ai/conversations
 *         /api/ai/conversations/{id}
 *         /api/ai/conversations/{id}/messages|regenerate
 *         /api/ai/attachments
 *
 * Message + regenerate endpoints use Server-Sent Events for streaming.
 */

$calledDirectly = !defined('API_ROUTER_ACTIVE');
if ($calledDirectly) {
    require_once __DIR__ . '/../config.php';
    require_once __DIR__ . '/../includes/database.php';
    require_once __DIR__ . '/../includes/response.php';
    require_once __DIR__ . '/../includes/functions.php';
    cors();

    $sessionLifetime = defined('SESSION_LIFETIME') ? SESSION_LIFETIME : 30 * 24 * 3600;
    ini_set('session.gc_maxlifetime', $sessionLifetime);
    session_name('toolhub_session');
    session_start();
}

require_once __DIR__ . '/../includes/ai.php';

// Auto-create tables (idempotent; mirrors database/schema.sql)
try {
    Database::execute("CREATE TABLE IF NOT EXISTS ai_cache (
        cache_key VARCHAR(64) PRIMARY KEY,
        data MEDIUMBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    Database::execute("CREATE TABLE IF NOT EXISTS ai_conversations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
        model VARCHAR(150) NOT NULL DEFAULT 'nvidia/nemotron-3-super-120b-a12b',
        system_prompt TEXT DEFAULT NULL,
        last_message_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ai_conv_user (user_id, last_message_at),
        FOREIGN KEY fk_ai_conv_user (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    Database::execute("CREATE TABLE IF NOT EXISTS ai_messages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        role ENUM('user','assistant') NOT NULL,
        content MEDIUMTEXT NOT NULL,
        attachments JSON DEFAULT NULL,
        model VARCHAR(150) DEFAULT NULL,
        is_error TINYINT(1) NOT NULL DEFAULT 0,
        prompt_tokens INT UNSIGNED DEFAULT NULL,
        completion_tokens INT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_msg_conv (conversation_id, id),
        FOREIGN KEY fk_ai_msg_conv (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY fk_ai_msg_user (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    Database::execute("CREATE TABLE IF NOT EXISTS ai_attachments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        conversation_id INT UNSIGNED DEFAULT NULL,
        filename VARCHAR(255) NOT NULL,
        mime VARCHAR(100) NOT NULL,
        size INT UNSIGNED NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'image',
        data LONGBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_att_conv (conversation_id),
        INDEX idx_ai_att_user (user_id),
        FOREIGN KEY fk_ai_att_user (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY fk_ai_att_conv (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
} catch (Throwable $e) {
    // Tables presumably already exist with slightly different definitions.
}

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$parts = get_route_parts();
$resource = $parts[1] ?? '';

// Release the session lock so long-running SSE streams don't block other requests.
session_write_close();

/** Body helper. */
function ai_body(): array
{
    $data = get_json_body();
    return is_array($data) ? $data : [];
}

/** Serialize a conversation row for the client (UTC -> ISO). */
function ai_conv_out(array $conv): array
{
    return [
        'id' => (int) $conv['id'],
        'title' => (string) $conv['title'],
        'model' => (string) $conv['model'],
        'system_prompt' => $conv['system_prompt'] ?? null,
        'last_message_at' => isset($conv['last_message_at']) && $conv['last_message_at'] !== null
            ? str_replace(' ', 'T', (string) $conv['last_message_at']) . 'Z'
            : null,
        'created_at' => str_replace(' ', 'T', (string) $conv['created_at']) . 'Z',
        'updated_at' => str_replace(' ', 'T', (string) $conv['updated_at']) . 'Z',
        'message_count' => isset($conv['message_count']) ? (int) $conv['message_count'] : null,
    ];
}

/** Serialize a message row for the client. */
function ai_msg_out(array $m): array
{
    $atts = json_decode((string) ($m['attachments'] ?? 'null'), true);
    return [
        'id' => (int) $m['id'],
        'role' => $m['role'],
        'content' => (string) $m['content'],
        'reasoning' => isset($m['reasoning']) && $m['reasoning'] !== null ? (string) $m['reasoning'] : '',
        'attachments' => is_array($atts) ? $atts : [],
        'model' => $m['model'] ?? null,
        'is_error' => (int) ($m['is_error'] ?? 0) === 1,
        'prompt_tokens' => isset($m['prompt_tokens']) ? (int) $m['prompt_tokens'] : null,
        'completion_tokens' => isset($m['completion_tokens']) ? (int) $m['completion_tokens'] : null,
        'created_at' => str_replace(' ', 'T', (string) $m['created_at']) . 'Z',
    ];
}

/**
 * Stream an assistant reply for a conversation (shared by send / edit / regenerate).
 */
function ai_stream_reply(array $conv, int $userId): void
{
    AiHelper::sseStart();

    $visionModel = AiHelper::isVisionModel($conv['model']);
    $rawMessages = AiHelper::listMessages((int) $conv['id']);

    // Rebuild -> OpenAI message list. Errors/edge cases surface before SSE header? No: header already sent.
    $built = AiHelper::buildRequestMessages($rawMessages, $visionModel);
    if (!$built['ok']) {
        AiHelper::sseError($built['error']);
        return;
    }

    $openaiMessages = $built['messages'];
    if (count($openaiMessages) === 0) {
        AiHelper::sseError('There is nothing to send yet. Type a message first.');
        return;
    }

    $systemPrompt = (string) $conv['system_prompt'];
    if ($systemPrompt !== '') {
        $openaiMessages = array_merge([['role' => 'system', 'content' => $systemPrompt]], $openaiMessages);
    }

    $meta = null;
    $modelCatalog = AiHelper::models();
    foreach ($modelCatalog['models'] as $m) {
        if ($m['id'] === $conv['model']) {
            $meta = $m;
            break;
        }
    }
    $maxTokens = $meta['max_tokens'] ?? (defined('NVIDIA_DEFAULT_MAX_TOKENS') ? NVIDIA_DEFAULT_MAX_TOKENS : 2048);

    $messageId = AiHelper::addAssistantMessage((int) $conv['id'], $userId, (string) $conv['model']);

    AiHelper::sseEvent('start', ['message_id' => $messageId, 'model' => $conv['model']]);

    // Reasoning models occasionally emit only reasoning (or nothing at all) on a
    // given turn. Retry a few times so a genuinely empty completion doesn't leave
    // the user staring at a blank assistant bubble.
    $buffer = '';
    $reasonBuf = '';
    $result = null;
    $maxAttempts = 3;

    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        $buffer = '';
        $reasonBuf = '';

        $result = AiHelper::chatStream(
            $openaiMessages,
            (string) $conv['model'],
            (int) $maxTokens,
            function (string $delta) use (&$buffer): void {
                $buffer .= $delta;
                AiHelper::sseEvent('delta', ['text' => $delta]);
            },
            function (string $reason) use (&$reasonBuf): void {
                $reasonBuf .= $reason;
                AiHelper::sseEvent('reason', ['text' => $reason]);
            },
            function (bool $stopped, ?array $usage): void {
                // stream finished; nothing extra to emit
            }
        );

        // A "successful" stream that produced no visible answer (no content) is an
        // NVIDIA empty-completion quirk; retry instead of persisting a blank bubble.
        if ($result['ok'] && trim($buffer) === '') {
            if ($attempt < $maxAttempts) {
                continue;
            }
            if (trim($reasonBuf) === '') {
                $result = ['ok' => false, 'error' => 'The AI returned an empty response. Please try again.'];
            }
        }
        break;
    }

    // Persist whatever we have, even on disconnect, abort or failure.
    if ($result['ok']) {
        try {
            AiHelper::updateAssistantMessage($messageId, $buffer, null, $reasonBuf !== '' ? $reasonBuf : null);
            AiHelper::touchConversation((int) $conv['id']);
        } catch (Throwable $e) {
            AiHelper::log('persist failed', ['err' => $e->getMessage()]);
            AiHelper::sseEvent('error', ['message' => 'The reply could not be saved. Please try again.']);
            echo "data: [DONE]\n\n";
            flush();
            return;
        }
    } else {
        AiHelper::markMessageError($messageId, $result['error'] ?? 'The AI request failed.');
        AiHelper::sseEvent('error', ['message' => $result['error'] ?? 'The AI request failed.']);
        echo "data: [DONE]\n\n";
        flush();
        return;
    }

    echo "data: [DONE]\n\n";
    flush();
}

/** Shared plumbing for "send a new message" (and "edit & resend"). */
function ai_handle_send(array $conv, array $user): void
{
    $body = ai_body();
    $content = trim((string) ($body['content'] ?? ''));
    $editMessageId = isset($body['edit_message_id']) ? (int) $body['edit_message_id'] : 0;
    $attachmentIds = isset($body['attachments']) && is_array($body['attachments'])
        ? array_map('intval', $body['attachments'])
        : [];

    $maxChars = defined('AI_MESSAGE_MAX_CHARS') ? (int) AI_MESSAGE_MAX_CHARS : 40000;

    if ($content === '' && !$attachmentIds) {
        Response::validationError(['content' => 'Message cannot be empty.']);
    }
    if (mb_strlen($content) > $maxChars) {
        Response::validationError(['content' => 'Message is too long (' . number_format($maxChars) . ' characters max).']);
    }

    $visionModel = AiHelper::isVisionModel($conv['model']);

    if ($attachmentIds && !$visionModel) {
        AiHelper::sseStart();
        AiHelper::sseError('This model cannot read images. Pick a vision-capable model (' . $conv['model'] . ' does not support image input).');
        return;
    }

    $attachments = $attachmentIds ? AiHelper::resolveAttachments($user, $attachmentIds) : [];

    // Editing an existing user message?
    if ($editMessageId > 0) {
        $target = Database::fetchOne(
            'SELECT id, role, user_id FROM ai_messages WHERE id = ? AND conversation_id = ?',
            [$editMessageId, $conv['id']]
        );
        if (!$target || $target['role'] !== 'user') {
            Response::error('Message not found or not editable.', 404);
        }
        // Delete the edited message and everything after it.
        AiHelper::deleteMessageAndAfter((int) $conv['id'], $editMessageId);
    }

    $messageId = AiHelper::addUserMessage((int) $conv['id'], (int) $user['id'], $content, $attachments);
    AiHelper::assignAttachmentConversation((int) $user['id'], (int) $conv['id'], $attachmentIds);
    AiHelper::autoTitle((int) $conv['id'], $content !== '' ? $content : $attachments[0]['filename'] ?? 'New conversation');
    AiHelper::cleanupOrphanAttachments((int) $user['id'], array_column($attachments, 'id'));
    AiHelper::touchConversation((int) $conv['id']);

    ai_stream_reply($conv, (int) $user['id']);
}

/** Regenerate the last assistant reply in a conversation. */
function ai_handle_regenerate(array $conv, array $user): void
{
    $last = AiHelper::lastMessage((int) $conv['id'], 'assistant');
    if (!$last) {
        AiHelper::sseStart();
        AiHelper::sseError('No assistant reply to regenerate yet.');
        return;
    }
    AiHelper::deleteMessageAndAfter((int) $conv['id'], (int) $last['id']);
    ai_stream_reply($conv, (int) $user['id']);
}

// ============================================================
// Route dispatch
// ============================================================

switch ($resource) {
    case 'models':
        if ($method === 'GET') {
            Response::success(AiHelper::models(true), 'OK');
        }
        Response::error('Method not allowed', 405);
        break;

    case 'conversations':
        $convId = isset($parts[2]) ? (int) $parts[2] : 0;
        $sub = $parts[3] ?? null;

        if (!$convId) {
            if ($method === 'GET') {
                $rows = AiHelper::listConversations((int) $user['id']);
                Response::success(array_map('ai_conv_out', $rows), 'OK');
            } elseif ($method === 'POST') {
                $body = ai_body();
                $model = $body['model'] ?? null;
                $title = isset($body['title']) ? (string) $body['title'] : null;
                $id = AiHelper::createConversation($user, (string) $model, $title);
                $conv = AiHelper::getConversation((int) $user['id'], $id);
                Response::success(ai_conv_out($conv), 'Conversation created', 201);
            }
            Response::error('Method not allowed', 405);
            break;
        }

        $conv = AiHelper::getConversation((int) $user['id'], $convId);
        if (!$conv) {
            Response::notFound('Conversation not found');
        }

        if ($sub === 'messages') {
            if ($method === 'POST') {
                if (!AiHelper::throttleOk($convId)) {
                    AiHelper::sseStart();
                    AiHelper::sseError('You are sending messages too quickly. Wait a second before sending again.');
                    return;
                }
                ai_handle_send($conv, $user);
                // SSE stream already flushed; avoid a trailing JSON error under it.
                return;
            }
            Response::error('Method not allowed', 405);
            return;
        }

        if ($sub === 'regenerate') {
            if ($method === 'POST') {
                ai_handle_regenerate($conv, $user);
                return;
            }
            Response::error('Method not allowed', 405);
            return;
        }

        if ($sub === null) {
            if ($method === 'GET') {
                $messages = array_map('ai_msg_out', AiHelper::listMessages($convId));
                Response::success([
                    'conversation' => ai_conv_out($conv),
                    'messages' => $messages,
                ], 'OK');
            } elseif ($method === 'PATCH') {
                $body = ai_body();
                $title = isset($body['title']) ? (string) $body['title'] : null;
                $model = isset($body['model']) ? (string) $body['model'] : null;
                AiHelper::updateConversation((int) $user['id'], $convId, $title, $model);
                $conv = AiHelper::getConversation((int) $user['id'], $convId);
                Response::success(ai_conv_out($conv), 'Conversation updated');
            } elseif ($method === 'DELETE') {
                AiHelper::deleteConversation((int) $user['id'], $convId);
                Response::success(null, 'Conversation deleted');
            }
            Response::error('Method not allowed', 405);
            return;
        }

        Response::notFound('Unknown conversation action');
        break;

    case 'attachments':
        $attId = isset($parts[2]) ? (int) $parts[2] : 0;

        if (!$attId) {
            if ($method === 'POST') {
                handleUpload($user);
            }
            Response::error('Method not allowed', 405);
            break;
        }

        $att = AiHelper::getAttachment((int) $user['id'], $attId);
        if (!$att) {
            Response::notFound('Attachment not found');
        }

        if ($method === 'GET') {
            header('Content-Type: ' . $att['mime']);
            header('Content-Length: ' . $att['size']);
            header('Content-Disposition: inline; filename*=UTF-8\'\'' . rawurlencode($att['filename']));
            header('Cache-Control: private, max-age=3600');
            header('X-Content-Type-Options: nosniff');
            echo $att['data'];
            exit; // phpcs:ignore
        }

        if ($method === 'DELETE') {
            AiHelper::deleteAttachment((int) $user['id'], $attId);
            Response::success(null, 'Attachment deleted');
        }

        Response::error('Method not allowed', 405);
        break;

    default:
        Response::notFound('Unknown AI endpoint');
}

/**
 * Handle multipart image uploads (field name: "files").
 */
function handleUpload(array $user): void
{
    $maxBytes = defined('AI_ATTACHMENT_MAX_BYTES') ? (int) AI_ATTACHMENT_MAX_BYTES : 5 * 1024 * 1024;
    $maxFiles = defined('AI_ATTACHMENT_MAX_FILES') ? (int) AI_ATTACHMENT_MAX_FILES : 8;
    $allowedMimes = ['image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp'], 'image/gif' => ['gif']];

    if (empty($_FILES['files'])) {
        Response::validationError(['files' => 'No file provided.']);
    }

    $files = is_array($_FILES['files']['name']) ? $_FILES['files']['name'] : [$_FILES['files']['name']];
    $count = count($files);
    if ($count > $maxFiles) {
        Response::validationError(['files' => 'Too many files (max ' . $maxFiles . ' per message).']);
    }

    $uploaded = [];
    $errors = [];

    for ($i = 0; $i < $count; $i++) {
        $tmp = $_FILES['files']['tmp_name'][$i];
        $name = (string) $_FILES['files']['name'][$i];
        $err = (int) $_FILES['files']['error'][$i];

        if ($err !== UPLOAD_ERR_OK) {
            $errors[] = ['filename' => $name, 'error' => 'Upload failed (error code ' . $err . ').'];
            continue;
        }

        $size = (int) $_FILES['files']['size'][$i];
        if ($size <= 0 || $size > $maxBytes) {
            $errors[] = ['filename' => $name, 'error' => 'File is empty or larger than ' . round($maxBytes / 1024 / 1024) . ' MB.'];
            continue;
        }

        $info = @getimagesize($tmp);
        if ($info === false || !isset($allowedMimes[$info['mime']])) {
            $errors[] = ['filename' => $name, 'error' => 'Unsupported file. Only JPEG, PNG, WebP or GIF images are allowed.'];
            continue;
        }

        $data = file_get_contents($tmp);
        if ($data === false) {
            $errors[] = ['filename' => $name, 'error' => 'The file could not be read by the server.'];
            continue;
        }

        $cleanName = basename($name);
        $ext = strtolower(pathinfo($cleanName, PATHINFO_EXTENSION));
        if (!in_array($ext, array_map('strtolower', $allowedMimes[$info['mime']]), true)) {
            $cleanName .= '.' . $allowedMimes[$info['mime']][0];
        }

        $id = AiHelper::storeAttachment((int) $user['id'], null, $cleanName, $info['mime'], $size, $data);
        $uploaded[] = [
            'id' => $id,
            'filename' => $cleanName,
            'mime' => $info['mime'],
            'size' => $size,
            'kind' => 'image',
        ];
    }

    if (!$uploaded && $errors) {
        Response::validationError(['files' => $errors[0]['error'] ?? 'Upload failed.']);
    }

    Response::success(['attachments' => $uploaded, 'errors' => $errors], 'Upload complete', $uploaded ? 201 : 200);
}