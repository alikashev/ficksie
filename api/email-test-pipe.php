#!/usr/bin/php
<?php
/**
 * Email Test Pipe Script
 *
 * Called by Exim pipe transport when an email is sent to test-*@ficksie.nl
 * Reads the raw email from stdin, injects Authentication-Results from Exim log,
 * and POSTs to the receive webhook.
 *
 * Exim passes RECIPIENT env var via transport config.
 */

$recipient = getenv('RECIPIENT');
if (!$recipient) {
    $localPart = getenv('LOCAL_PART') ?: '';
    $domain = getenv('DOMAIN') ?: '';
    if ($localPart && $domain) {
        $recipient = $localPart . '@' . $domain;
    }
}

if (!$recipient) {
    fwrite(STDERR, "No recipient address available\n");
    exit(1);
}

$rawEmail = '';
if (defined('STDIN') && STDIN) {
    $rawEmail = stream_get_contents(STDIN);
}
if ($rawEmail === '' || $rawEmail === false) {
    $rawEmail = file_get_contents('php://input');
}
if ($rawEmail === false || $rawEmail === '') {
    fwrite(STDERR, "No email content on stdin\n");
    exit(1);
}

$rawEmail = injectAuthResults($rawEmail);

$webhookUrl = 'https://ficksie.nl/api/email-test-receive';

$payload = json_encode([
    'to' => $recipient,
    'raw_email' => $rawEmail,
]);

$ch = curl_init($webhookUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($payload),
    ],
    CURLOPT_SSL_VERIFYPEER => true,
]);

$result = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    fwrite(STDERR, "Curl error: " . $curlError . "\n");
    exit(1);
}

if ($httpCode < 200 || $httpCode >= 300) {
    fwrite(STDERR, "Webhook returned HTTP $httpCode: " . $result . "\n");
    exit(1);
}

exit(0);

function injectAuthResults(string $rawEmail): string
{
    $messageId = extractMessageId($rawEmail);
    if (!$messageId) {
        return $rawEmail;
    }

    $logLine = grepEximLog($messageId);
    if (!$logLine) {
        return $rawEmail;
    }

    $header = buildAuthResultsHeader($logLine, $rawEmail);
    $extraHeaders = buildExtraHeaders($logLine);

    $normalized = str_replace("\r\n", "\n", $rawEmail);
    $boundaryPos = strpos($normalized, "\n\n");
    if ($boundaryPos === false) {
        return $rawEmail;
    }

    $headers = substr($normalized, 0, $boundaryPos);
    $body = substr($normalized, $boundaryPos);

    $injectedHeaders = '';
    if ($header) {
        $injectedHeaders .= "\n" . $header;
    }
    if ($extraHeaders) {
        $injectedHeaders .= "\n" . $extraHeaders;
    }

    if ($injectedHeaders === '') {
        return $rawEmail;
    }

    $injected = $headers . $injectedHeaders . $body;

    return str_replace("\n", "\r\n", $injected);
}

function buildExtraHeaders(string $logLine): ?string
{
    $extra = [];

    $sendingIp = extractSendingIp($logLine);
    $helo = extractHelo($logLine);

    if ($sendingIp) {
        $ptrDomain = checkPtrRecord($sendingIp);
        $extra[] = "X-Ficksie-PTR: " . ($ptrDomain ?: 'fail');

        if ($helo && $ptrDomain) {
            $heloMatch = checkHeloPtrMatch($helo, $ptrDomain);
            $extra[] = "X-Ficksie-HELO: " . $helo . " ptr=" . $ptrDomain . " match=" . ($heloMatch ? 'pass' : 'fail');
        } elseif ($helo) {
            $extra[] = "X-Ficksie-HELO: " . $helo . " ptr=unknown match=unknown";
        }

        $blResults = checkBlocklists($sendingIp);
        $extra[] = "X-Ficksie-BL: " . $blResults;
    }

    $tlsResult = checkTlsFromLog($logLine);
    $extra[] = "X-Ficksie-TLS: " . ($tlsResult ? 'pass' : 'fail');

    $dkimResult = checkDkimFromLog($logLine);
    $dkimDomain = extractDkimDomainFromLog($logLine);
    if ($dkimResult) {
        $extra[] = "X-Ficksie-DKIM-LOG: " . $dkimResult . " domain=" . ($dkimDomain ?: 'unknown');
    }

    if (empty($extra)) {
        return null;
    }

    return implode("\n", $extra);
}

function extractHelo(string $logLine): ?string
{
    if (preg_match('/H=(\S+)/', $logLine, $m)) {
        return $m[1];
    }
    return null;
}

function checkHeloPtrMatch(string $helo, string $ptrDomain): bool
{
    $helo = strtolower(rtrim($helo, '.'));
    $ptr = strtolower(rtrim($ptrDomain, '.'));

    if ($helo === $ptr) return true;

    $heloParts = explode('.', $helo);
    $ptrParts = explode('.', $ptr);

    if (count($heloParts) < 2 || count($ptrParts) < 2) return false;

    $heloOrg = implode('.', array_slice($heloParts, -2));
    $ptrOrg = implode('.', array_slice($ptrParts, -2));

    return $heloOrg === $ptrOrg;
}

function checkBlocklists(string $ip): string
{
    $reversedIp = implode('.', array_reverse(explode('.', $ip)));

    $blocklists = [
        'zen.spamhaus.org' => 'Spamhaus',
        'bl.spamcop.net' => 'SpamCop',
        'b.barracudacentral.org' => 'Barracuda',
        'dnsbl-1.uceprotect.net' => 'UCEPROTECT-1',
        'dnsbl-2.uceprotect.net' => 'UCEPROTECT-2',
        'cbl.abuseat.org' => 'CBL',
        'dnsbl.sorbs.net' => 'SORBS',
        'spam.dnsbl.sorbs.net' => 'SORBS-Spam',
        'dul.dnsbl.sorbs.net' => 'SORBS-DUL',
        'ixed.mailspike.net' => 'MailSpike',
        'wl.mailspike.net' => 'MailSpike-WL',
        'virusbl.de' => 'VirusBL',
        'db.wpbl.info' => 'WPBL',
    ];

    $listed = [];
    foreach ($blocklists as $blDomain => $blName) {
        $query = "{$reversedIp}.{$blDomain}";
        $output = [];
        $returnCode = 0;
        exec("dig A " . escapeshellarg($query) . " +short +time=2 +tries=1 2>/dev/null", $output, $returnCode);

        if ($returnCode === 0 && !empty($output)) {
            $result = trim(implode(' ', $output));
            if ($result !== '' && $result !== '127.0.0.1' && !str_contains($result, 'NXDOMAIN')) {
                $listed[] = $blName;
            }
        }
    }

    if (empty($listed)) {
        return 'clean';
    }

    return 'listed:' . implode(',', $listed);
}

function checkPtrRecord(string $ip): ?string
{
    $output = [];
    $returnCode = 0;
    exec("dig -x " . escapeshellarg($ip) . " +short +time=3 2>/dev/null", $output, $returnCode);

    if ($returnCode !== 0 || empty($output)) {
        return null;
    }

    $ptr = trim(implode(' ', $output), ". \t\n\r\0\x0B");
    if (empty($ptr)) return null;

    return $ptr;
}

function extractMessageId(string $rawEmail): ?string
{
    if (preg_match('/^Message-ID:\s*(.+)$/mi', $rawEmail, $m)) {
        return trim($m[1]);
    }
    return null;
}

function grepEximLog(string $messageId): ?string
{
    $escapedMessageId = escapeshellarg($messageId);

    $logFiles = [
        '/var/log/exim/mainlog',
        '/var/log/exim/mainlog-' . date('Ymd'),
    ];

    foreach ($logFiles as $logFile) {
        if (!is_readable($logFile)) continue;

        $output = [];
        $returnCode = 0;
        exec("grep -m 1 " . $escapedMessageId . " " . escapeshellarg($logFile) . " 2>/dev/null", $output, $returnCode);

        if ($returnCode === 0 && !empty($output)) {
            return $output[0];
        }
    }

    return null;
}

function buildAuthResultsHeader(string $logLine, string $rawEmail): ?string
{
    $hostname = gethostname() ?: 'localhost';

    $dkimResult = checkDkimFromLog($logLine);
    $spfResult = checkSpfViaDns($rawEmail, $logLine);

    $fromDomain = extractFromDomain($rawEmail);

    $parts = [];
    $parts[] = "Authentication-Results: {$hostname}";
    if ($spfResult !== null) {
        $spfPart = "spf={$spfResult}";
        if ($fromDomain) {
            $spfPart .= " header.from={$fromDomain}";
        }
        $parts[] = $spfPart;
    }
    if ($dkimResult !== null) {
        $dkimDomain = extractDkimDomainFromLog($logLine);
        $parts[] = "dkim={$dkimResult}" . ($dkimDomain ? " header.d={$dkimDomain}" : "");
    }

    $dmarcResult = checkDmarcFromLog($logLine);
    if (!$dmarcResult) {
        $dmarcResult = checkDmarcViaDns($rawEmail);
    }
    if ($dmarcResult !== null) {
        $parts[] = "dmarc={$dmarcResult}";
    }

    if (count($parts) < 2) {
        return null;
    }

    return implode(" ", $parts);
}

function checkSpfViaDns(string $rawEmail, string $logLine): ?string
{
    $fromDomain = extractFromDomain($rawEmail);
    if (!$fromDomain) {
        return checkSpfFromLog($logLine);
    }

    $sendingIp = extractSendingIp($logLine);
    if (!$sendingIp) {
        return checkSpfFromLog($logLine);
    }

    $spfRecord = getSpfRecord($fromDomain);
    if (!$spfRecord) {
        return 'none';
    }

    return evaluateSpf($spfRecord, $sendingIp, $fromDomain);
}

function checkSpfFromLog(string $logLine): ?string
{
    if (preg_match('/SPF=(\w+)/i', $logLine, $m)) {
        return strtolower($m[1]);
    }
    return null;
}

function extractSendingIp(string $logLine): ?string
{
    if (preg_match('/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/', $logLine, $m)) {
        return $m[1];
    }
    if (preg_match('/\[([0-9a-fA-F:]+)\]/', $logLine, $m)) {
        return $m[1];
    }
    return null;
}

function getSpfRecord(string $domain): ?string
{
    $output = [];
    $returnCode = 0;
    exec("dig TXT " . escapeshellarg($domain) . " +short +time=3 2>/dev/null", $output, $returnCode);

    if ($returnCode !== 0 || empty($output)) {
        return null;
    }

    foreach ($output as $line) {
        $line = trim($line, '"');
        if (str_starts_with(strtolower($line), 'v=spf1')) {
            return $line;
        }
    }
    return null;
}

function evaluateSpf(string $spfRecord, string $ip, $fromDomain): string
{
    $isIpv6 = str_contains($ip, ':');
    $ipNum = $isIpv6 ? inet_pton($ip) : ip2long($ip);

    $mechanisms = preg_split('/\s+/', $spfRecord);
    array_shift($mechanisms);

    $allQualifier = '+';
    $result = null;

    foreach ($mechanisms as $mechanism) {
        if ($mechanism === '' || str_starts_with($mechanism, 'exp=')) continue;

        $qualifier = '+';
        $spec = $mechanism;
        if (preg_match('/^([+\-~?])(.+)$/', $mechanism, $qm)) {
            $qualifier = $qm[1];
            $spec = $qm[2];
        }

        $matched = false;

        if ($spec === 'all') {
            $allQualifier = $qualifier;
            continue;
        } elseif (str_starts_with($spec, 'ip4:')) {
            $cidr = substr($spec, 4);
            $matched = matchCidr($ip, $cidr, false);
        } elseif (str_starts_with($spec, 'ip6:')) {
            $cidr = substr($spec, 4);
            $matched = matchCidr($ip, $cidr, true);
        } elseif (str_starts_with($spec, 'a') && ($spec === 'a' || str_starts_with($spec, 'a:'))) {
            $aDomain = $spec === 'a' ? $fromDomain : substr($spec, 2);
            $matched = matchADns($aDomain, $ip, $isIpv6);
        } elseif (str_starts_with($spec, 'mx') && ($spec === 'mx' || str_starts_with($spec, 'mx:'))) {
            $mxDomain = $spec === 'mx' ? $fromDomain : substr($spec, 3);
            $matched = matchMxDns($mxDomain, $ip, $isIpv6);
        } elseif (str_starts_with($spec, 'include:')) {
            $includeDomain = substr($spec, 8);
            $includeSpf = getSpfRecord($includeDomain);
            if ($includeSpf) {
                $includeResult = evaluateSpf($includeSpf, $ip, $includeDomain);
                if ($includeResult === 'pass') $matched = true;
            }
        }

        if ($matched) {
            $result = qualifierToResult($qualifier);
            break;
        }
    }

    if ($result === null) {
        $result = qualifierToResult($allQualifier);
    }

    return $result;
}

function matchCidr(string $ip, string $cidr, bool $ipv6): bool
{
    $parts = explode('/', $cidr);
    $network = $parts[0];
    $prefix = $parts[1] ?? ($ipv6 ? 128 : 32);

    if ($ipv6) {
        $ipBin = inet_pton($ip);
        $netBin = inet_pton($network);
        if (!$ipBin || !$netBin) return false;
        $mask = str_repeat("\xff", intdiv($prefix, 8));
        if ($prefix % 8) $mask .= chr(0xff << (8 - ($prefix % 8)));
        $mask = str_pad($mask, 16, "\0");
        return ($ipBin & $mask) === ($netBin & $mask);
    } else {
        $ipLong = ip2long($ip);
        $netLong = ip2long($network);
        if ($ipLong === false || $netLong === false) return false;
        $mask = -1 << (32 - $prefix);
        return ($ipLong & $mask) === ($netLong & $mask);
    }
}

function matchADns(string $domain, string $ip, bool $isIpv6): bool
{
    $type = $isIpv6 ? 'AAAA' : 'A';
    $output = [];
    exec("dig {$type} " . escapeshellarg($domain) . " +short +time=3 2>/dev/null", $output);
    foreach ($output as $addr) {
        $addr = trim($addr);
        if ($addr === $ip) return true;
    }
    return false;
}

function matchMxDns(string $domain, string $ip, bool $isIpv6): bool
{
    $output = [];
    exec("dig MX " . escapeshellarg($domain) . " +short +time=3 2>/dev/null", $output);
    $mxHosts = [];
    foreach ($output as $line) {
        $parts = preg_split('/\s+/', trim($line));
        if (count($parts) >= 2) $mxHosts[] = rtrim($parts[1], '.');
    }
    foreach ($mxHosts as $mx) {
        if (matchADns($mx, $ip, $isIpv6)) return true;
    }
    return false;
}

function qualifierToResult(string $qualifier): string
{
    return match ($qualifier) {
        '+' => 'pass',
        '-' => 'fail',
        '~' => 'softfail',
        '?' => 'neutral',
        default => 'pass',
    };
}

function checkDkimFromLog(string $logLine): ?string
{
    if (preg_match('/DKIM=(\S+)/i', $logLine, $m)) {
        $value = $m[1];

        if (preg_match('/^([a-zA-Z0-9._-]+)\s+([A-Z]+)$/i', $value, $m2)) {
            $flags = strtoupper($m2[2]);
            if (str_contains($flags, 'D') || str_contains($flags, 'S')) {
                return 'pass';
            } else {
                return 'fail';
            }
        }

        if (preg_match('/^([a-zA-Z0-9._-]+)\s+([A-Z]+)\s+([A-Z]+)$/i', $value, $m3)) {
            $flags2 = strtoupper($m3[2]) . strtoupper($m3[3]);
            if (str_contains($flags2, 'D') || str_contains($flags2, 'S')) {
                return 'pass';
            } else {
                return 'fail';
            }
        }

        if (preg_match('/^[a-zA-Z0-9._-]+$/', $value)) {
            return 'pass';
        }

        return null;
    }
    return null;
}

function extractDkimDomainFromLog(string $logLine): ?string
{
    if (preg_match('/DKIM=([^\s]+)/i', $logLine, $m)) {
        return $m[1];
    }
    return null;
}

function checkDmarcFromLog(string $logLine): ?string
{
    if (preg_match('/DMARC=(\w+)/i', $logLine, $m)) {
        return strtolower($m[1]);
    }
    return null;
}

function checkDmarcViaDns(string $rawEmail): ?string
{
    $fromDomain = extractFromDomain($rawEmail);
    if (!$fromDomain) return null;

    $output = [];
    exec("dig TXT " . escapeshellarg("_dmarc." . $fromDomain) . " +short +time=3 2>/dev/null", $output);

    foreach ($output as $line) {
        $line = trim($line, '"');
        if (preg_match('/v=DMARC1/i', $line)) {
            if (preg_match('/\bp=(\w+)/i', $line, $m)) {
                $policy = strtolower($m[1]);
                if ($policy === 'reject' || $policy === 'quarantine') {
                    return 'pass';
                }
                return $policy;
            }
            return 'pass';
        }
    }
    return null;
}

function extractFromDomain(string $rawEmail): ?string
{
    if (preg_match('/^From:\s*.*@([a-zA-Z0-9._-]+)/mi', $rawEmail, $m)) {
        return strtolower($m[1]);
    }
    return null;
}

function checkTlsFromLog(string $logLine): bool
{
    if (preg_match('/X=TLS/i', $logLine)) {
        return true;
    }
    if (preg_match('/\bP=esmtps\b/i', $logLine)) {
        return true;
    }
    if (preg_match('/\bP=smtps\b/i', $logLine)) {
        return true;
    }
    if (preg_match('/TLSv[0-9.]+/i', $logLine)) {
        return true;
    }
    return false;
}
