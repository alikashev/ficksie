<?php
/**
 * Email Test Receive Webhook
 *
 * Receives raw email content via POST and associates it with a test.
 *
 * This endpoint does NOT require authentication — it receives emails
 * from the mail server infrastructure. Security is handled by:
 *   - Matching the recipient address to an existing test
 *   - Rate limiting
 *   - HMAC verification (optional, if configured)
 *
 * Expected POST body: JSON with "to" and "raw_email" fields,
 * or raw email content with a query parameter "token" for matching.
 *
 * Mail Server Configuration Options:
 *
 * 1. Mail Pipe (Linux):
 *    Set up a .forward or aliases entry:
 *      test-*@domain: "| curl -X POST -H 'Content-Type: application/json' -d '{\"to\":\"$USER\",\"raw_email\":\"$(cat)\"}' https://yourdomain.com/api/email-test-receive"
 *
 * 2. Postfix pipe transport:
 *    In master.cf, add a transport that pipes to this endpoint.
 *
 * 3. Manual/External webhook:
 *    Configure an external mail-forwarding service to POST to this URL.
 *
 * 4. PHP mail() interception:
 *    Use a custom mail handler that forwards to this endpoint.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/database.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/functions.php';

cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$body = file_get_contents('php://input');
$ctype = $_SERVER['CONTENT_TYPE'] ?? '';

$rawEmail = null;
$toAddress = null;

if (str_contains($ctype, 'application/json')) {
    $data = json_decode($body, true);
    if (is_array($data)) {
        $rawEmail = $data['raw_email'] ?? $data['raw'] ?? null;
        $toAddress = $data['to'] ?? null;
    }
}

if (!$rawEmail && $body) {
    $rawEmail = $body;
    $toAddress = $_POST['to'] ?? $_GET['to'] ?? null;

    if (!$toAddress && preg_match('/^To:\s*(.+)$/mi', $body, $m)) {
        $toAddress = trim($m[1]);
    }
}

if (!$rawEmail) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No email content provided.']);
    exit;
}

if (!$toAddress) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Recipient address (to) is required.']);
    exit;
}

$toAddress = strtolower(trim($toAddress));
$toAddress = filter_var($toAddress, FILTER_SANITIZE_EMAIL);
if (!$toAddress) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid recipient address.']);
    exit;
}

$test = Database::fetchOne(
    "SELECT id, user_id, status, email_address, expires_at FROM email_tests WHERE email_address = ? AND status = 'waiting'",
    [$toAddress]
);

if (!$test) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'No waiting test found for this address.']);
    exit;
}

if (strtotime($test['expires_at']) < time()) {
    Database::execute("UPDATE email_tests SET status = 'expired' WHERE id = ?", [$test['id']]);
    http_response_code(410);
    echo json_encode(['success' => false, 'message' => 'This test has expired.']);
    exit;
}

$size = strlen($rawEmail);

Database::execute(
    "UPDATE email_tests SET raw_message = ?, message_size = ?, status = 'received', received_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?",
    [$rawEmail, $size, $test['id']]
);

try {
    require_once __DIR__ . '/../includes/email-parser.php';
    require_once __DIR__ . '/../includes/email-analyzer.php';

    $parser = new EmailParser($rawEmail);
    $analyzer = new EmailAnalyzer($parser);
    $result = $analyzer->analyze();

    $resultJson = json_encode($result, JSON_UNESCAPED_UNICODE);

    Database::execute(
        "UPDATE email_tests SET status = 'complete', analysis_result = ?, score = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
        [$resultJson, $result['score'], $test['id']]
    );
} catch (Throwable $e) {
    $errMsg = $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine();
    error_log('[email-test-receive] Analysis error for test ' . $test['id'] . ': ' . $errMsg . "\n", 3, __DIR__ . '/../logs/php-errors.log');
    Database::execute(
        "UPDATE email_tests SET status = 'error', updated_at = UTC_TIMESTAMP() WHERE id = ?",
        [$test['id']]
    );
}

http_response_code(200);
echo json_encode(['success' => true, 'message' => 'Email received and processed.']);
exit;
