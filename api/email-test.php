<?php
/**
 * Email Deliverability Tester API
 *
 * Handles test creation, status checking, analysis retrieval, and cleanup.
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
    require_auth();
}

require_once __DIR__ . '/../includes/email-parser.php';
require_once __DIR__ . '/../includes/email-analyzer.php';

// Auto-create table
try {
    Database::execute('
        CREATE TABLE IF NOT EXISTS email_tests (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            test_token VARCHAR(32) NOT NULL UNIQUE,
            email_address VARCHAR(255) NOT NULL,
            status ENUM(\'waiting\',\'received\',\'analyzing\',\'complete\',\'expired\',\'error\') NOT NULL DEFAULT \'waiting\',
            raw_message LONGTEXT DEFAULT NULL,
            message_size INT UNSIGNED DEFAULT NULL,
            analysis_result JSON DEFAULT NULL,
            score INT UNSIGNED DEFAULT NULL,
            expires_at DATETIME NOT NULL,
            received_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email_tests_token (test_token),
            INDEX idx_email_tests_user (user_id),
            INDEX idx_email_tests_expires (expires_at),
            INDEX idx_email_tests_status (status),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    ');
} catch (Throwable $e) {
}

$user = require_auth();
$parts = get_route_parts();
$action = $parts[1] ?? 'create';

switch ($_SERVER['REQUEST_METHOD']) {
    case 'POST':
        handlePost($action, $user);
        break;
    case 'GET':
        handleGet($parts, $user);
        break;
    default:
        Response::error('Method not allowed', 405);
}

function handlePost(string $action, array $user): void
{
    switch ($action) {
        case 'create':
            createTest($user);
            break;
        case 'check':
            checkForEmail($user);
            break;
        default:
            Response::notFound('Unknown action');
    }
}

function handleGet(array $parts, array $user): void
{
    $action = $parts[1] ?? 'status';
    $token = $parts[2] ?? null;

    switch ($action) {
        case 'status':
            if (!$token) {
                Response::validationError(['token' => 'Test token is required.']);
            }
            getTestStatus($token, $user);
            break;
        case 'analysis':
            if (!$token) {
                Response::validationError(['token' => 'Test token is required.']);
            }
            getAnalysis($token, $user);
            break;
        case 'tests':
            listTests($user);
            break;
        case 'receive-config':
            getReceiveConfig();
            break;
        default:
            Response::notFound('Unknown action');
    }
}

function utcToIso(?string $dt): ?string
{
    if ($dt === null) return null;
    return str_replace(' ', 'T', $dt) . 'Z';
}

function createTest(array $user): void
{
    $domain = defined('EMAIL_TEST_DOMAIN') ? EMAIL_TEST_DOMAIN : '';
    if (empty($domain)) {
        Response::error('Email Test Domain is not configured. Set EMAIL_TEST_DOMAIN in config.php.', 500);
    }

    $token = bin2hex(random_bytes(16));
    $identifier = substr($token, 0, 8);
    $emailAddress = "test-{$identifier}@{$domain}";

    $id = Database::insert(
        'INSERT INTO email_tests (user_id, test_token, email_address, status, expires_at, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL 1 HOUR, UTC_TIMESTAMP())',
        [$user['id'], $token, $emailAddress, 'waiting']
    );

    $test = Database::fetchOne('SELECT expires_at, created_at FROM email_tests WHERE id = ?', [$id]);

    Response::created([
        'id' => $id,
        'test_token' => $token,
        'email_address' => $emailAddress,
        'status' => 'waiting',
        'expires_at' => utcToIso($test['expires_at']),
        'created_at' => utcToIso($test['created_at']),
    ], 'Test email address generated.');
}

function getTestStatus(string $token, array $user): void
{
    $test = Database::fetchOne(
        'SELECT id, test_token, email_address, status, score, received_at, created_at, expires_at FROM email_tests WHERE test_token = ? AND user_id = ?',
        [$token, $user['id']]
    );

    if (!$test) {
        Response::notFound('Test not found.');
    }

    if ($test['status'] === 'waiting' && strtotime($test['expires_at']) < time()) {
        Database::execute('UPDATE email_tests SET status = ? WHERE id = ?', ['expired', $test['id']]);
        $test['status'] = 'expired';
    }

    Response::success([
        'id' => $test['id'],
        'test_token' => $test['test_token'],
        'email_address' => $test['email_address'],
        'status' => $test['status'],
        'score' => $test['score'],
        'received_at' => utcToIso($test['received_at']),
        'created_at' => utcToIso($test['created_at']),
        'expires_at' => utcToIso($test['expires_at']),
    ]);
}

function getAnalysis(string $token, array $user): void
{
    $test = Database::fetchOne(
        'SELECT id, test_token, email_address, status, score, analysis_result, received_at, created_at, expires_at, message_size FROM email_tests WHERE test_token = ? AND user_id = ?',
        [$token, $user['id']]
    );

    if (!$test) {
        Response::notFound('Test not found.');
    }

    $result = null;
    if ($test['analysis_result']) {
        $result = json_decode($test['analysis_result'], true);
    }

    Response::success([
        'id' => $test['id'],
        'test_token' => $test['test_token'],
        'email_address' => $test['email_address'],
        'status' => $test['status'],
        'score' => $test['score'],
        'analysis' => $result,
        'received_at' => utcToIso($test['received_at']),
        'created_at' => utcToIso($test['created_at']),
        'expires_at' => utcToIso($test['expires_at']),
        'message_size' => $test['message_size'],
    ]);
}

function checkForEmail(array $user): void
{
    $data = get_json_body();
    $token = $data['test_token'] ?? '';

    if (empty($token)) {
        Response::validationError(['test_token' => 'Test token is required.']);
    }

    $test = Database::fetchOne(
        'SELECT id, test_token, status, expires_at FROM email_tests WHERE test_token = ? AND user_id = ?',
        [$token, $user['id']]
    );

    if (!$test) {
        Response::notFound('Test not found.');
    }

    if ($test['status'] === 'complete' || $test['status'] === 'received') {
        Response::success(['status' => $test['status']]);
        return;
    }

    if ($test['status'] === 'waiting' && strtotime('now') > strtotime($test['expires_at'] ?? 'now')) {
        Database::execute('UPDATE email_tests SET status = ? WHERE id = ?', ['expired', $test['id']]);
        Response::success(['status' => 'expired']);
        return;
    }

    $fullTest = Database::fetchOne(
        'SELECT raw_message FROM email_tests WHERE id = ?',
        [$test['id']]
    );

    if ($fullTest && !empty($fullTest['raw_message'])) {
        analyzeTest($test['id'], $fullTest['raw_message']);
        $updated = Database::fetchOne(
            'SELECT status, score FROM email_tests WHERE id = ?',
            [$test['id']]
        );
        Response::success(['status' => $updated['status'], 'score' => $updated['score']]);
    } else {
        Response::success(['status' => 'waiting']);
    }
}

function analyzeTest(int $id, string $rawMessage): void
{
    Database::execute('UPDATE email_tests SET status = ? WHERE id = ?', ['analyzing', $id]);

    try {
        $parser = new EmailParser($rawMessage);
        $analyzer = new EmailAnalyzer($parser);
        $result = $analyzer->analyze();

        $resultJson = json_encode($result, JSON_UNESCAPED_UNICODE);

        Database::execute(
            'UPDATE email_tests SET status = ?, analysis_result = ?, score = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
            ['complete', $resultJson, $result['score'], $id]
        );
    } catch (Throwable $e) {
        error_log('[email-test] Analysis error for test ' . $id . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n", 3, __DIR__ . '/../logs/php-errors.log');
        Database::execute(
            'UPDATE email_tests SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
            ['error', $id]
        );
    }
}

function listTests(array $user): void
{
    $tests = Database::fetchAll(
        'SELECT id, test_token, email_address, status, score, received_at, created_at, expires_at FROM email_tests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        [$user['id']]
    );

    foreach ($tests as &$t) {
        $t['received_at'] = utcToIso($t['received_at']);
        $t['created_at'] = utcToIso($t['created_at']);
        $t['expires_at'] = utcToIso($t['expires_at']);
    }

    Response::success($tests);
}

function getReceiveConfig(): void
{
    $domain = defined('EMAIL_TEST_DOMAIN') ? EMAIL_TEST_DOMAIN : '';
    Response::success([
        'domain' => $domain,
        'receive_url' => APP_URL . '/api/email-test-receive',
        'instructions' => 'Configure your mail server to deliver emails sent to *@' . $domain . ' to this endpoint, or use the mail-pipe method.',
    ]);
}

function expireOldTests(): void
{
    Database::execute(
        "UPDATE email_tests SET status = 'expired' WHERE status = 'waiting' AND expires_at < UTC_TIMESTAMP()"
    );
}

expireOldTests();
