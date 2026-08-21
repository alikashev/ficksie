<?php
/**
 * API Router
 *
 * Routes: /api/modules, /api/categories, /api/commands
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/database.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/functions.php';

cors();

// Session
$sessionLifetime = defined('SESSION_LIFETIME') ? SESSION_LIFETIME : 30 * 24 * 3600;
ini_set('session.gc_maxlifetime', $sessionLifetime);
ini_set('session.cookie_lifetime', $sessionLifetime);
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_samesite', 'Lax');
session_name('toolhub_session');
session_start();

$parts = get_route_parts();
$resource = $parts[0] ?? null;

define('API_ROUTER_ACTIVE', true);

try {
    // Require auth for all routes except auth and email-test-receive
    if ($resource !== 'auth' && $resource !== 'email-test-receive') {
        require_auth();
    }

    switch ($resource) {
        case 'auth':
            require __DIR__ . '/auth.php';
            break;
        case 'modules':
            require __DIR__ . '/modules.php';
            break;
        case 'categories':
            require __DIR__ . '/categories.php';
            break;
        case 'commands':
            require __DIR__ . '/commands.php';
            break;
        case 'search':
            require __DIR__ . '/search.php';
            break;
        case 'snippets':
            require __DIR__ . '/snippets.php';
            break;
        case 'ip-reputation':
            require __DIR__ . '/ip-reputation.php';
            break;
        case 'dns':
            require __DIR__ . '/dns.php';
            break;
        case 'ssl':
            require __DIR__ . '/ssl.php';
            break;
        case 'email-test':
            require __DIR__ . '/email-test.php';
            break;
        case 'email-test-receive':
            require __DIR__ . '/email-test-receive.php';
            break;
        default:
            Response::notFound('API endpoint not found');
    }
} catch (PDOException $e) {
    if (DEBUG) {
        Response::error('Database error: ' . $e->getMessage(), 500);
    } else {
        Response::error('Internal server error', 500);
    }
} catch (Throwable $e) {
    if (DEBUG) {
        Response::error($e->getMessage(), 500);
    } else {
        Response::error('Internal server error', 500);
    }
}
