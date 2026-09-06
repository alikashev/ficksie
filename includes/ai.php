<?php
/**
 * AI Assistant — NVIDIA NIM integration (server side).
 *
 * All NVIDIA API traffic (including the API key) lives here. Nothing secret is
 * ever exposed to the browser.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/database.php';

class AiHelper
{
    // ============================================================
    // Configuration
    // ============================================================

    public static function configured(): bool
    {
        return defined('NVIDIA_API_KEY') && NVIDIA_API_KEY !== '';
    }

    public static function baseUrl(): string
    {
        $url = defined('NVIDIA_BASE_URL') ? NVIDIA_BASE_URL : 'https://integrate.api.nvidia.com/v1';
        return rtrim($url, '/');
    }

    public static function defaultModel(): string
    {
        return defined('NVIDIA_DEFAULT_MODEL') ? NVIDIA_DEFAULT_MODEL : 'nvidia/nemotron-3-super-120b-a12b';
    }

    public static function systemPrompt(): string
    {
        return defined('AI_SYSTEM_PROMPT') ? AI_SYSTEM_PROMPT : '';
    }

    public static function log(string $msg, array $ctx = []): void
    {
        error_log('[ai] ' . $msg . ($ctx ? ' ' . json_encode($ctx, JSON_UNESCAPED_UNICODE) : ''));
    }

    // ============================================================
    // Model catalog
    // ------------------------------------------------------------
    // The live list of models is fetched from NVIDIA itself so we never ship
    // an outdated hardcoded list. A curated metadata map enriches known
    // models with friendly display names / capability tags; unknown models
    // get a sensible generated name + capability heuristics. Models and
    // capabilities can be edited here or in the NVIDIA response.
    // ============================================================

    private static function catalog(): array
    {
        return [
            // --- NVIDIA Nemotron ---
            'nvidia/nemotron-3-super-120b-a12b' => [
                'name' => 'Nemotron 3 Super',
                'description' => 'NVIDIA\u2019s flagship general model with glowing reasoning, coding and instruction following.',
                'tags' => ['reasoning', 'general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 32768,
                'context' => 131072,
            ],
            'nvidia/llama-3.1-nemotron-70b-instruct' => [
                'name' => 'Nemotron 70B',
                'description' => 'NVIDIA\u2019s instruction-tuned workhorse for chat, Q&A and everyday tasks.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'nvidia/nemotron-mini-4b-instruct' => [
                'name' => 'Nemotron Mini',
                'description' => 'A tiny, very fast helper for quick answers and simple chores.',
                'tags' => ['fast', 'general'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 4096,
                'context' => 8192,
            ],

            // --- Meta Llama ---
            'meta/llama-4-maverick-17b-128e-instruct' => [
                'name' => 'Llama 4 Maverick',
                'description' => 'Fast, clever and vision-capable. Great for every-day chat with images.',
                'tags' => ['general', 'fast', 'vision', 'coding'],
                'vision' => true,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'meta/llama-4-scout-17b-16e-instruct' => [
                'name' => 'Llama 4 Scout',
                'description' => 'Lightweight and speedy, understands images too. Good for quick prompts.',
                'tags' => ['fast', 'vision', 'general'],
                'vision' => true,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'meta/llama-3.3-70b-instruct' => [
                'name' => 'Llama 3.3 70B',
                'description' => 'A dependable, well-balanced open model for general conversations.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'meta/llama-3.1-8b-instruct' => [
                'name' => 'Llama 3.1 8B',
                'description' => 'Small and quick — fine for simple questions, cheap and snappy.',
                'tags' => ['fast', 'general'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'meta/llama-3.1-70b-instruct' => [
                'name' => 'Llama 3.1 70B',
                'description' => 'Reliable all-purpose conversational model.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'meta/llama-3.1-405b-instruct' => [
                'name' => 'Llama 3.1 405B',
                'description' => 'The biggest Llama — maximum knowledge, slower to answer.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'slow',
                'max_tokens' => 8192,
                'context' => 131072,
            ],

            // --- Qwen ---
            'qwen/qwen2.5-72b-instruct' => [
                'name' => 'Qwen 2.5 72B',
                'description' => 'Strong multilingual general chat with great instruction following.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'qwen/qwen2.5-coder-32b-instruct' => [
                'name' => 'Qwen Coder 32B',
                'description' => 'Specialised for code: writing, reviewing, explaining and fixing.',
                'tags' => ['coding'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'qwen/qwen2.5-vl-72b-instruct' => [
                'name' => 'Qwen VL 72B',
                'description' => 'Vision specialist: describes and answers questions about images, charts and documents.',
                'tags' => ['vision', 'general'],
                'vision' => true,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],

            // --- DeepSeek ---
            'deepseek-ai/deepseek-r1' => [
                'name' => 'DeepSeek R1',
                'description' => 'Reasoning powerhouse. Shows its thinking for maths, logic and hard problems.',
                'tags' => ['reasoning'],
                'vision' => false,
                'speed' => 'slow',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'deepseek-ai/deepseek-v3-0324' => [
                'name' => 'DeepSeek V3',
                'description' => 'Balanced general model with a hint of extra reasoning power.',
                'tags' => ['general', 'reasoning'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],

            // --- Mistral ---
            'mistralai/mistral-large' => [
                'name' => 'Mistral Large',
                'description' => 'Mistral\u2019s flagship: high-quality answers across domains.',
                'tags' => ['general', 'reasoning'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'mistralai/mistral-nemo-12b-instruct' => [
                'name' => 'Mistral NeMo 12B',
                'description' => 'Compact and dependable, good for quick everyday answers.',
                'tags' => ['general', 'fast'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'mistralai/mistral-7b-instruct-v0.3' => [
                'name' => 'Mistral 7B',
                'description' => 'Small, fast and free-ish — great for lightweight chat.',
                'tags' => ['fast', 'general'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 32768,
            ],

            // --- GPT-OSS (OpenAI's open-weight family on NVIDIA) ---
            'openai/gpt-oss-120b' => [
                'name' => 'GPT-OSS 120B',
                'description' => 'Open-weight powerhouse tuned for coding and long, complex tasks.',
                'tags' => ['coding', 'reasoning'],
                'vision' => false,
                'speed' => 'slow',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'openai/gpt-oss-20b' => [
                'name' => 'GPT-OSS 20B',
                'description' => 'Speedy open-weight model with a strong coding knack.',
                'tags' => ['coding', 'fast'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 131072,
            ],

            // --- Moonshot Kimi ---
            'moonshotai/kimi-k2-0905-instruct' => [
                'name' => 'Kimi K2',
                'description' => 'Agentic and code-heavy model that handles long, structured work.',
                'tags' => ['coding', 'reasoning'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'moonshotai/kimi-k2.5' => [
                'name' => 'Kimi K2.5',
                'description' => 'Latest Kimi — strong at agentic and coding tasks.',
                'tags' => ['coding', 'reasoning'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],

            // --- Google / Microsoft ---
            'google/codegemma-7b' => [
                'name' => 'CodeGemma 7B',
                'description' => 'Purpose-built for code completion and coding help.',
                'tags' => ['coding', 'fast'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 8192,
            ],
            'google/gemma-2-27b-it' => [
                'name' => 'Gemma 2 27B',
                'description' => 'Google\u2019s open all-rounder, clears and consistent.',
                'tags' => ['general'],
                'vision' => false,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 8192,
            ],
            'google/gemma-3-27b-it' => [
                'name' => 'Gemma 3 27B',
                'description' => 'Multimodal Gemma — text and image understanding.',
                'tags' => ['general', 'vision'],
                'vision' => true,
                'speed' => 'medium',
                'max_tokens' => 8192,
                'context' => 131072,
            ],
            'microsoft/phi-4' => [
                'name' => 'Phi-4',
                'description' => 'Microsoft\u2019s compact model, surprisingly strong at reasoning and maths.',
                'tags' => ['reasoning', 'fast'],
                'vision' => false,
                'speed' => 'fast',
                'max_tokens' => 8192,
                'context' => 16384,
            ],
        ];
    }

    /** Models / endpoint patterns that are NOT useful for a chatbot. */
    private static function isChatModel(string $id): bool
    {
        $exclude = '/text-embedding|^embedding|embed-v|-embed-|_rerank|rerank|transcri|asr|tts|whisper|text-to-|image-to|img2|stable-diffusion|sdxl|flux|dall|imagegen|image\/|controlnet|inpainting|outpainting|upscal|ocr|reward|guard|moder|classification|classifier|segment|recognition|bert|retrieval|search|nemo-ocr|path |augment|tokeniz|dbrx|cosmos|csm|hummingbot/i';
        return !preg_match($exclude, $id);
    }

    /** Heuristic: models whose id marks them as vision/multimodal. */
    public static function isVisionModel(string $id): bool
    {
        $catalog = self::catalog();
        if (isset($catalog[$id]['vision'])) {
            return (bool) $catalog[$id]['vision'];
        }
        return (bool) preg_match('/(^|\/)[^\/]*(vision|multimodal|-vl(?:-|\b)|maverick|scout|\bomni|gemma-3|gemma3)/i', $id);
    }

    private static function displayNameFor(string $id): string
    {
        $catalog = self::catalog();
        if (isset($catalog[$id]['name'])) {
            return $catalog[$id]['name'];
        }
        // e.g. "nvidia/llama-4-maverick-17b-128e-instruct" -> "Llama 4 Maverick 17b"
        $parts = explode('/', $id);
        $slug = end($parts);
        $slug = preg_replace('/-(?:instruct|chat|it|v\d+(?:\.\d+)*)$/i', '', $slug);
        $slug = str_replace(['-'], ' ', $slug);
        $slug = ucwords($slug);
        $slug = preg_replace('/\s+(\d+(?:b|m|e|B|M|E))/', ' $1', $slug);
        return $slug ?: $id;
    }

    private static function describeFor(string $id): string
    {
        if (self::isVisionModel($id)) {
            return 'Available through NVIDIA\u2019s catalog. Handles images and is a good general-purpose pick.';
        }
        return 'Available through NVIDIA\u2019s catalog. Suitable for general chat.';
    }

    private static function decorate(string $id): array
    {
        $catalog = self::catalog();
        $m = $catalog[$id] ?? [];
        $vision = self::isVisionModel($id);
        $tags = $m['tags'] ?? ($vision ? ['general', 'vision'] : ['general']);
        return [
            'id' => $id,
            'name' => $m['name'] ?? self::displayNameFor($id),
            'description' => $m['description'] ?? self::describeFor($id),
            'tags' => $tags,
            'vision' => $vision,
            'speed' => $m['speed'] ?? 'medium',
            'max_tokens' => $m['max_tokens'] ?? 2048,
            'context' => $m['context'] ?? null,
        ];
    }

    /**
     * Returns the model catalog for the UI.
     *
     * @return array{configured: bool, live: bool, source: string, default_model: string, models: array}
     */
    public static function models(bool $force = false): array
    {
        $configured = self::configured();
        $liveIds = null;

        if ($configured) {
            $liveIds = self::cachedLiveModels($force);
        }

        $catalog = self::catalog();
        $curated = array_keys($catalog);
        $out = [];

        if (is_array($liveIds)) {
            $live = array_values(array_filter($liveIds, fn($id) => is_string($id) && self::isChatModel($id)));
            $live = array_values(array_unique($live));
            $seen = [];
            foreach ($curated as $id) {
                if (in_array($id, $live, true)) {
                    $out[] = self::decorate($id);
                    $seen[$id] = true;
                }
            }
            foreach ($live as $id) {
                if (!isset($seen[$id])) {
                    $out[] = self::decorate($id);
                }
            }
        } else {
            $out = array_map(fn($id) => self::decorate($id), $curated);
        }

        // Keep known NON-chat curated entries (if they ever sneak in) out of the list.
        $out = array_values(array_filter($out, fn($m) => self::isChatModel($m['id'])));

        return [
            'configured' => $configured,
            'live' => is_array($liveIds),
            'source' => is_array($liveIds) ? 'nvidia' : 'local',
            'default_model' => self::defaultModel(),
            'models' => $out,
        ];
    }

    // ============================================================
    // NVIDIA HTTP plumbing
    // ============================================================

    private static function cachedLiveModels(bool $force = false): ?array
    {
        if (!$force) {
            $ttl = defined('NVIDIA_MODELS_CACHE_TTL') ? (int) NVIDIA_MODELS_CACHE_TTL : 86400;
            try {
                $row = Database::fetchOne(
                    "SELECT data, TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age
                     FROM ai_cache WHERE cache_key = 'nvidia_models'"
                );
                if ($row && (int) $row['age'] < $ttl) {
                    $data = json_decode((string) $row['data'], true);
                    if (is_array($data) && isset($data['data'])) {
                        return array_column($data['data'], 'id');
                    }
                }
            } catch (Throwable $e) {
                self::log('cache read failed', ['err' => $e->getMessage()]);
            }
        }

        $raw = self::httpJson('GET', '/models');
        if (!is_array($raw) || !isset($raw['data']) || !is_array($raw['data'])) {
            return null;
        }

        $ids = array_values(array_filter(
            array_map(fn($m) => is_array($m) ? ($m['id'] ?? null) : null, $raw['data']),
            fn($id) => is_string($id)
        ));

        try {
            Database::execute(
                'INSERT INTO ai_cache (cache_key, data, created_at)
                 VALUES (\'nvidia_models\', ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE data = VALUES(data), created_at = UTC_TIMESTAMP()',
                [json_encode(['data' => array_map(fn($id) => ['id' => $id], $ids)])]
            );
        } catch (Throwable $e) {
            self::log('cache write failed', ['err' => $e->getMessage()]);
        }

        return $ids;
    }

    /** Raw GET/POST to NVIDIA. Returns decoded JSON array or null. */
    private static function httpJson(string $method, string $path, ?array $payload = null): ?array
    {
        if (!self::configured()) {
            return null;
        }

        $ch = curl_init(self::baseUrl() . $path);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . NVIDIA_API_KEY,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ];

        if ($method === 'POST' && $payload !== null) {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($payload);
        }

        curl_setopt_array($ch, $opts);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false || $status >= 400) {
            self::log('httpJson error', ['method' => $method, 'path' => $path, 'status' => $status, 'curl' => $err, 'body' => substr((string) $body, 0, 500)]);
            return null;
        }

        $decoded = json_decode((string) $body, true);
        return is_array($decoded) ? $decoded : null;
    }

    // ============================================================
    // SSE streaming helpers (used by api/ai.php)
    // ============================================================

    public static function sseStart(): void
    {
        ignore_user_abort(true);
        set_time_limit(0);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        ob_implicit_flush(true);
        flush();
    }

    public static function sseEvent(string $type, array $data = []): void
    {
        $payload = array_merge(['type' => $type], $data);
        echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n\n";
        flush();
    }

    public static function sseError(string $message): void
    {
        self::sseEvent('error', ['message' => $message]);
        echo "data: [DONE]\n\n";
        flush();
    }

    /** Map a raw NVIDIA failure to a clean, user friendly message. */
    public static function friendlyError(int $status, string $body): string
    {
        $msg = '';
        if ($body !== '') {
            $data = json_decode($body, true);
            if (is_array($data)) {
                $msg = trim((string) ($data['message'] ?? $data['error'] ?? ''));
                if (is_array($data['error'] ?? null)) {
                    $msg = trim((string) ($data['error']['message'] ?? ''));
                }
            }
        }

        if ($status === 0) {
            return 'Could not reach the AI service. Please try again shortly.';
        }
        if ($status === 400 || $status === 422) {
            if (stripos($msg, 'context') !== false || stripos($msg, 'token') !== false) {
                return 'This conversation has become too long for the current model. Start a new conversation or pick a model with a larger context.';
            }
            return 'The AI could not process that request. Try rephrasing, or switch to a different model.';
        }
        if ($status === 401 || $status === 403) {
            return 'The AI service rejected the API key. Check the NVIDIA_API_KEY setting in config.php.';
        }
        if ($status === 404) {
            return 'That model is not available through the AI service anymore. Pick another model.';
        }
        if ($status === 429) {
            return 'AI request limit reached. Give it a minute and try again.';
        }
        if ($status >= 500) {
            return 'The AI service is temporarily overloaded. Try again in a few seconds.';
        }
        return 'Something went wrong with the AI request. Please try again.';
    }

    /**
     * Stream a chat completion from NVIDIA.
     *
     * @param array    $messages OpenAI-style message list.
     * @param string   $model    NVIDIA model id.
     * @param int      $maxTokens
     * @param callable $onDelta  fn(string $text) — normal completion text.
     * @param callable $onReason fn(string $text) — hidden reasoning text (if the model emits it).
     * @param callable $onFinish fn(bool $stopped, ?array $usage)
     *
     * @return array{ok: bool, error: ?string}
     */
    public static function chatStream(
        array $messages,
        string $model,
        int $maxTokens,
        callable $onDelta,
        callable $onReason,
        callable $onFinish
    ): array {
        if (!self::configured()) {
            return ['ok' => false, 'error' => 'The AI assistant is not configured yet. Add an NVIDIA API key to config.php (NVIDIA_API_KEY).'];
        }

        $httpCode = 0;
        $sseBuf = '';
        $errorBody = '';
        $text = '';
        $stopped = false;
        $finished = false;
        $deltaCount = 0;
        $aborted = false;

        $payload = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => 0.7,
            'top_p' => 0.95,
            'max_tokens' => $maxTokens,
            'stream' => true,
        ];

        $ch = curl_init(self::baseUrl() . '/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . NVIDIA_API_KEY,
                'Content-Type: application/json',
                'Accept: text/event-stream',
            ],
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 300,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$httpCode) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                    $httpCode = (int) $m[1];
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($curl, $chunk) use (
                &$httpCode, &$sseBuf, &$errorBody, &$text, &$stopped, &$finished, &$deltaCount, &$aborted,
                $onDelta, $onReason
            ) {
                if ($httpCode >= 400) {
                    $errorBody .= $chunk;
                    return strlen($chunk);
                }

                $sseBuf .= $chunk;
                while (($pos = strpos($sseBuf, "\n")) !== false) {
                    $line = substr($sseBuf, 0, $pos);
                    $sseBuf = substr($sseBuf, $pos + 1);
                    $line = rtrim($line);
                    if ($line === '' || !str_starts_with($line, 'data:')) {
                        continue;
                    }
                    $data = trim(substr($line, 5));
                    if ($data === '[DONE]') {
                        $finished = true;
                        continue;
                    }
                    $json = json_decode($data, true);
                    if (!is_array($json)) {
                        continue;
                    }
                    $choice = $json['choices'][0] ?? null;
                    $delta = is_array($choice) ? ($choice['delta'] ?? []) : [];
                    if (isset($delta['reasoning_content']) && is_string($delta['reasoning_content']) && $delta['reasoning_content'] !== '') {
                        $onReason($delta['reasoning_content']);
                    }
                    if (isset($delta['content']) && is_string($delta['content']) && $delta['content'] !== '') {
                        $text .= $delta['content'];
                        $deltaCount++;
                        if ($deltaCount % 4 === 0 && connection_aborted()) {
                            $stopped = true;
                            $aborted = true;
                            return 0; // abort the transfer
                        }
                        $onDelta($delta['content']);
                    }
                }
                if (!$aborted && connection_aborted()) {
                    $stopped = true;
                    $aborted = true;
                    return 0;
                }
                return strlen($chunk);
            },
        ]);

        curl_exec($ch);
        $curlErr = curl_error($ch);
        $curlErrNo = curl_errno($ch);
        curl_close($ch);

        if ($httpCode >= 400 || $errorBody !== '') {
            self::log('chatStream failed', ['model' => $model, 'status' => $httpCode, 'curl' => $curlErr, 'body' => substr($errorBody, 0, 1000)]);
            return ['ok' => false, 'error' => self::friendlyError($httpCode, $errorBody)];
        }

        if (!$finished && !$stopped) {
            if ($curlErr !== '') {
                self::log('chatStream curl error', ['model' => $model, 'err' => $curlErr, 'errno' => $curlErrNo]);
                return ['ok' => false, 'error' => 'Could not reach the AI service. Please try again shortly.'];
            }
            return ['ok' => false, 'error' => 'The AI response was interrupted. Please try again.'];
        }

        $onFinish($stopped, null);
        return ['ok' => true, 'error' => null];
    }

    // ============================================================
    // Conversations / messages / attachments (DB)
    // ============================================================

    public static function createConversation(array $user, string $model, ?string $title = null): int
    {
        $model = self::sanitizeModel($model);
        $title = $title !== null ? mb_substr(trim($title), 0, 200) : 'New conversation';
        return Database::insert(
            'INSERT INTO ai_conversations (user_id, title, model, system_prompt, last_message_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [(int) $user['id'], $title, $model, self::systemPrompt()]
        );
    }

    public static function sanitizeModel(?string $model): string
    {
        $model = trim((string) $model);
        if ($model === '' || strlen($model) > 150 || !preg_match('#^[a-z0-9][a-z0-9._/\-]{0,150}$#i', $model)) {
            return self::defaultModel();
        }
        return $model;
    }

    public static function listConversations(int $userId): array
    {
        return Database::fetchAll(
            'SELECT c.*,
                    (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count
             FROM ai_conversations c
             WHERE c.user_id = ?
             ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
             LIMIT 200',
            [$userId]
        );
    }

    public static function getConversation(int $userId, int $id): ?array
    {
        return Database::fetchOne(
            'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
            [$id, $userId]
        );
    }

    public static function updateConversation(int $userId, int $id, ?string $title = null, ?string $model = null): void
    {
        $sets = [];
        $params = [];
        if ($title !== null) {
            $sets[] = 'title = ?';
            $params[] = mb_substr(trim($title), 0, 200);
        }
        if ($model !== null) {
            $model = self::sanitizeModel($model);
            $sets[] = 'model = ?';
            $params[] = $model;
        }
        if (!$sets) {
            return;
        }
        $params[] = $userId;
        $params[] = $id;
        Database::execute(
            'UPDATE ai_conversations SET ' . implode(', ', $sets) . ' WHERE user_id = ? AND id = ?',
            $params
        );
    }

    public static function deleteConversation(int $userId, int $id): bool
    {
        return Database::execute('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?', [$id, $userId]) > 0;
    }

    public static function listMessages(int $conversationId): array
    {
        return Database::fetchAll(
            'SELECT id, conversation_id, role, content, reasoning, attachments, model, is_error,
                    prompt_tokens, completion_tokens, created_at
             FROM ai_messages WHERE conversation_id = ?
             ORDER BY id ASC',
            [$conversationId]
        );
    }

    public static function addUserMessage(int $conversationId, int $userId, string $content, array $attachments = []): int
    {
        return Database::insert(
            'INSERT INTO ai_messages (conversation_id, user_id, role, content, attachments)
             VALUES (?, ?, \'user\', ?, ?)',
            [$conversationId, $userId, $content, $attachments ? json_encode($attachments, JSON_UNESCAPED_UNICODE) : null]
        );
    }

    public static function addAssistantMessage(int $conversationId, int $userId, string $model, string $content = '', string $reasoning = ''): int
    {
        return Database::insert(
            'INSERT INTO ai_messages (conversation_id, user_id, role, content, reasoning, model)
             VALUES (?, ?, \'assistant\', ?, ?, ?)',
            [$conversationId, $userId, $content, $reasoning, $model]
        );
    }

    public static function updateAssistantMessage(int $messageId, string $content, ?array $usage = null, ?string $reasoning = null): void
    {
        if ($usage !== null) {
            Database::execute(
                'UPDATE ai_messages SET content = ?, reasoning = COALESCE(?, reasoning), prompt_tokens = ?, completion_tokens = ? WHERE id = ?',
                [$content, $reasoning, (int) ($usage['prompt_tokens'] ?? 0), (int) ($usage['completion_tokens'] ?? 0), $messageId]
            );
        } else {
            Database::execute('UPDATE ai_messages SET content = ?, reasoning = COALESCE(?, reasoning) WHERE id = ?', [$content, $reasoning, $messageId]);
        }
    }

    public static function markMessageError(int $messageId, string $content): void
    {
        Database::execute(
            'UPDATE ai_messages SET content = ?, is_error = 1 WHERE id = ?',
            [$content, $messageId]
        );
    }

    public static function deleteMessageAndAfter(int $conversationId, int $messageId): void
    {
        Database::execute(
            'DELETE FROM ai_messages WHERE conversation_id = ? AND id >= ?',
            [$conversationId, $messageId]
        );
    }

    public static function deleteMessagesFrom(int $conversationId, int $afterMessageId): void
    {
        Database::execute(
            'DELETE FROM ai_messages WHERE conversation_id = ? AND id > ?',
            [$conversationId, $afterMessageId]
        );
    }

    public static function lastMessage(int $conversationId, string $role): ?array
    {
        return Database::fetchOne(
            'SELECT * FROM ai_messages WHERE conversation_id = ? AND role = ?
             ORDER BY id DESC LIMIT 1',
            [$conversationId, $role]
        );
    }

    public static function touchConversation(int $conversationId): void
    {
        Database::execute(
            'UPDATE ai_conversations SET last_message_at = UTC_TIMESTAMP() WHERE id = ?',
            [$conversationId]
        );
    }

    public static function autoTitle(int $conversationId, string $fallbackText): void
    {
        $conv = Database::fetchOne('SELECT title FROM ai_conversations WHERE id = ?', [$conversationId]);
        if (!$conv) {
            return;
        }
        if ($conv['title'] === 'New conversation') {
            $text = preg_replace('/\s+/', ' ', trim($fallbackText));
            $text = mb_substr($text, 0, 60);
            Database::execute('UPDATE ai_conversations SET title = ? WHERE id = ?', [$text, $conversationId]);
        }
    }

    /** Fast-but-harmless abuse throttle: one message per ~1.5s per conversation. */
    public static function throttleOk(int $conversationId): bool
    {
        $row = Database::fetchOne(
            'SELECT last_message_at, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS msg_count
             FROM ai_conversations c WHERE c.id = ?',
            [$conversationId]
        );
        if (!$row || $row['last_message_at'] === null) {
            return true;
        }
        // A brand-new conversation has zero messages and last_message_at set at
        // creation time — never throttle its very first question.
        if ((int) $row['msg_count'] === 0) {
            return true;
        }
        return strtotime((string) $row['last_message_at']) + 1 < time();
    }

    // ============================================================
    // Attachments
    // ============================================================

    public static function storeAttachment(int $userId, ?int $conversationId, string $filename, string $mime, int $size, string $data): int
    {
        $kind = str_starts_with($mime, 'image/') ? 'image' : 'file';
        return Database::insert(
            'INSERT INTO ai_attachments (user_id, conversation_id, filename, mime, size, kind, data)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$userId, $conversationId, mb_substr($filename, 0, 255), $mime, $size, $kind, $data]
        );
    }

    public static function getAttachment(int $userId, int $id): ?array
    {
        return Database::fetchOne(
            'SELECT id, user_id, conversation_id, filename, mime, size, kind, data
             FROM ai_attachments WHERE id = ? AND user_id = ?',
            [$id, $userId]
        );
    }

    public static function deleteAttachment(int $userId, int $id): bool
    {
        return Database::execute('DELETE FROM ai_attachments WHERE id = ? AND user_id = ?', [$id, $userId]) > 0;
    }

    public static function assignAttachmentConversation(int $userId, int $conversationId, array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $params = array_merge([$conversationId], $ids, [$userId]);
        Database::execute(
            "UPDATE ai_attachments SET conversation_id = ?
             WHERE id IN ($placeholders) AND user_id = ? AND conversation_id IS NULL",
            $params
        );
    }

    public static function cleanupOrphanAttachments(int $userId, array $keepIds): void
    {
        $keep = array_map('intval', $keepIds);
        if (!$keep) {
            return;
        }
        $placeholders = implode(', ', array_fill(0, count($keep), '?'));
        $params = array_merge([$userId, 60], $keep);
        try {
            Database::execute(
                "DELETE FROM ai_attachments
                 WHERE user_id = ? AND TIMESTAMPDIFF(MINUTE, created_at, UTC_TIMESTAMP()) > ?
                   AND id NOT IN ($placeholders)",
                $params
            );
        } catch (Throwable $e) {
        }
    }

    // ============================================================
    // Building the OpenAI-style request from stored messages
    // ============================================================

    /**
     * @return array{ok: bool, error: ?string, messages: array}
     */
    public static function buildRequestMessages(array $messages, bool $visionModel): array
    {
        $out = [];
        foreach ($messages as $m) {
            $role = $m['role'];
            $content = (string) $m['content'];

            if ($role === 'assistant') {
                if ($m['is_error']) {
                    continue; // never feed a failed reply back to the model
                }
                $out[] = ['role' => 'assistant', 'content' => $content];
                continue;
            }

            // role === 'user'
            $atts = json_decode((string) ($m['attachments'] ?? 'null'), true);
            $imageIds = [];
            if (is_array($atts)) {
                foreach ($atts as $a) {
                    if (is_array($a) && (($a['kind'] ?? 'image') === 'image') && isset($a['id'])) {
                        $imageIds[] = (int) $a['id'];
                    }
                }
            }

            if (!$imageIds || !$visionModel) {
                $out[] = ['role' => 'user', 'content' => $content];
                if ($imageIds && !$visionModel) {
                    self::log('skipped image content for non-vision model', ['count' => count($imageIds)]);
                }
                continue;
            }

            $parts = [['type' => 'text', 'text' => $content]];
            $meta = Database::fetchAll(
                'SELECT id, mime, data FROM ai_attachments WHERE id IN ('
                    . implode(',', array_fill(0, count($imageIds), '?')) . ')',
                $imageIds
            );
            foreach ($meta as $row) {
                if (str_starts_with($row['mime'], 'image/')) {
                    $parts[] = [
                        'type' => 'image_url',
                        'image_url' => ['url' => 'data:' . $row['mime'] . ';base64,' . base64_encode((string) $row['data'])],
                    ];
                }
            }
            $out[] = ['role' => 'user', 'content' => $parts];
        }

        return ['ok' => true, 'error' => null, 'messages' => $out];
    }

    /** Serialize attachments (for the user message JSON column) from submitted ids. */
    public static function resolveAttachments(array $user, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $ids = array_slice($ids, 0, (int) (defined('AI_ATTACHMENT_MAX_FILES') ? AI_ATTACHMENT_MAX_FILES : 8));
        if (!$ids) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $params = array_merge($ids, [$user['id']]);
        $rows = Database::fetchAll(
            "SELECT id, filename, mime, size, kind
             FROM ai_attachments
             WHERE id IN ($placeholders) AND user_id = ?
             ORDER BY FIELD(id, " . implode(',', $ids) . ')',
            $params
        );
        return array_map(fn($r) => [
            'id' => (int) $r['id'],
            'filename' => $r['filename'],
            'mime' => $r['mime'],
            'size' => (int) $r['size'],
            'kind' => $r['kind'],
        ], $rows);
    }
}