<?php
/**
 * ficksie Configuration
 *
 * Copy this file to config.php and update the values.
 */

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'admin_toolshub');
define('DB_USER', 'admin_toolshub');
define('DB_PASS', 'HfE54mVDACfh8GzE95Zz');
define('DB_CHARSET', 'utf8mb4');

define('APP_NAME', 'ficksie');
define('APP_URL', 'http://akxx.nl');
define('APP_ENV', 'production'); // development | production
define('DEBUG', false);

// Timezone
date_default_timezone_set('UTC');

// IP Reputation API Keys (optional — leave empty to skip those sources)
// Get AbuseIPDB key: https://www.abuseipdb.com/register
define('ABUSEIPDB_KEY', '');
// Get VirusTotal key: https://www.virustotal.com/gui/join-us
define('VIRUSTOTAL_KEY', '');

// Email Deliverability Tester
// The domain used for generating test email addresses (e.g., test.yourdomain.com)
// Configure your mail server to deliver emails sent to *@EMAIL_TEST_DOMAIN to the Ficksie receive endpoint.
define('EMAIL_TEST_DOMAIN', '');
