<?php
/**
 * DNS Lookup Suite API
 *
 * GET /api/dns?domain=example.com
 *
 * Comprehensive DNS analysis for any domain.
 */

$calledDirectly = !defined('API_ROUTER_ACTIVE');
if ($calledDirectly) {
    require_once __DIR__ . '/../config.php';
    require_once __DIR__ . '/../includes/database.php';
    require_once __DIR__ . '/../includes/response.php';
    require_once __DIR__ . '/../includes/functions.php';
    cors();
}

// ─── Auto-create cache table ────────────────────────────────────────────────
try {
    Database::execute('
        CREATE TABLE IF NOT EXISTS dns_cache (
            domain VARCHAR(255) NOT NULL,
            type VARCHAR(20) NOT NULL,
            data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (domain, type),
            INDEX idx_dns_cache_created (created_at)
        ) ENGINE=InnoDB
    ');
} catch (Throwable $e) {}

// ─── Auto-create history table ──────────────────────────────────────────────
try {
    Database::execute('
        CREATE TABLE IF NOT EXISTS dns_history (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            domain VARCHAR(255) NOT NULL,
            is_favorite TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dns_history_user (user_id),
            INDEX idx_dns_history_domain (domain)
        ) ENGINE=InnoDB
    ');
} catch (Throwable $e) {}

define('DNS_CACHE_TTL', 1800); // 30 minutes

@set_time_limit(60);

// ─── Input ───────────────────────────────────────────────────────────────────
$domain = isset($_GET['domain']) ? trim($_GET['domain']) : '';

// Dig action is standalone — doesn't need domain
if (isset($_GET['dig'])) {
    // Domain is optional for dig; can still be provided for convenience
    $digName = trim($_GET['name'] ?? '');
    $digType = strtoupper(trim($_GET['type'] ?? 'A'));
    $digNs = trim($_GET['ns'] ?? '');
    if (!$digName) {
        Response::validationError(['name' => 'A name to query is required.']);
    }
    $wireTypeMap = ['A' => 1, 'AAAA' => 28, 'CNAME' => 5, 'MX' => 15, 'TXT' => 16, 'NS' => 2, 'SOA' => 6];
    $phpTypeMap = ['A' => DNS_A, 'AAAA' => DNS_AAAA, 'CNAME' => DNS_CNAME, 'MX' => DNS_MX, 'TXT' => DNS_TXT, 'NS' => DNS_NS, 'SOA' => DNS_SOA];
    $wireTypeVal = $wireTypeMap[$digType] ?? 1;
    $phpTypeVal = $phpTypeMap[$digType] ?? DNS_A;
    $nsIp = $digNs ? @gethostbyname($digNs) : '';
    if ($digNs && $nsIp && $nsIp !== $digNs) {
        $digResult = queryNameserver($nsIp, $digName, $wireTypeVal);
    } else {
        $digResult = dnsQuery($digName, $phpTypeVal);
        $answers = [];
        if (is_array($digResult) && count($digResult) > 0) {
            foreach ($digResult as $r) {
                if ($digType === 'A') $answers[] = $r['ip'] ?? '';
                elseif ($digType === 'AAAA') $answers[] = $r['ipv6'] ?? '';
                elseif ($digType === 'MX') $answers[] = ($r['pri'] ?? '') . ' ' . ($r['target'] ?? '');
                elseif ($digType === 'CNAME') $answers[] = $r['target'] ?? '';
                elseif ($digType === 'NS') $answers[] = $r['target'] ?? '';
                elseif ($digType === 'TXT') $answers[] = $r['txt'] ?? '';
                elseif ($digType === 'SOA') $answers[] = ($r['mname'] ?? '') . ' ' . ($r['rname'] ?? '') . ' ' . ($r['serial'] ?? '');
            }
        }
        $digResult = ['answers' => $answers];
    }
    Response::success(['dig' => [
        'name' => $digName,
        'type' => $digType,
        'nameserver' => $digNs ?: 'system',
        'result' => $digResult,
    ]]);
    exit;
}

// IP scan action — separate from domain scan
if (isset($_GET['ip_scan'])) {
    $ip = isset($_GET['ip']) ? trim($_GET['ip']) : '';
    if (!$ip || !filter_var($ip, FILTER_VALIDATE_IP)) {
        Response::validationError(['ip' => 'A valid IP address is required.']);
    }

    $ipType = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? 'IPv4' : 'IPv6';

    // PTR lookup
    $ptr = ['status' => 'empty', 'hostname' => null];
    try {
        $hostname = @gethostbyaddr($ip);
        if ($hostname && $hostname !== $ip) {
            $ptr = ['status' => 'ok', 'hostname' => $hostname];
        }
    } catch (Throwable $e) {
        $ptr = ['status' => 'error', 'error' => $e->getMessage()];
    }

    // RIPE stat WHOIS lookup
    $ripe = ['status' => 'empty', 'records' => [], 'network' => null, 'organization' => null, 'abuse_email' => null, 'abuse_phone' => null, 'country' => null, 'rir' => null];
    try {
        $ripeRaw = @file_get_contents("https://stat.ripe.net/data/whois/data.json?resource=" . urlencode($ip));
        if ($ripeRaw) {
            $ripeData = json_decode($ripeRaw, true);
            if ($ripeData && isset($ripeData['data']['records'])) {
                $records = $ripeData['data']['records'];
                $ripe['rir'] = $ripeData['data']['authorities'][0] ?? null;
                foreach ($records as $group) {
                    foreach ($group as $rec) {
                        $key = $rec['key'] ?? '';
                        $val = $rec['value'] ?? '';
                        if (!$val) continue;
                        $ripe['records'][] = ['key' => $key, 'value' => $val];
                        if ($key === 'NetName') $ripe['network'] = $val;
                        if ($key === 'OrgName' || $key === 'Organization') $ripe['organization'] = $val;
                        if ($key === 'Country') $ripe['country'] = $val;
                    }
                }
                // Abuse contact
                $abuseRaw = @file_get_contents("https://stat.ripe.net/data/abuse-contact-finder/data.json?resource=" . urlencode($ip));
                if ($abuseRaw) {
                    $abuseData = json_decode($abuseRaw, true);
                    if ($abuseData && !empty($abuseData['data']['abuse_contacts'])) {
                        $ripe['abuse_email'] = $abuseData['data']['abuse_contacts'][0];
                    }
                }
                if (!empty($ripe['records'])) {
                    $ripe['status'] = 'ok';
                }
            }
        }
    } catch (Throwable $e) {
        $ripe['status'] = 'error';
        $ripe['error'] = $e->getMessage();
    }

    // Simple health score for IP
    $score = 100;
    $errors = 0;
    $warnings = 0;
    if ($ptr['status'] !== 'ok') { $score -= 15; $warnings++; }
    if ($ripe['status'] !== 'ok') { $score -= 10; $warnings++; }
    if (!$ripe['abuse_email']) { $score -= 5; $warnings++; }
    $score = max(0, min(100, $score));

    Response::success([
        'ip' => $ip,
        'ip_type' => $ipType,
        'domain' => $ip,
        'ptr' => $ptr,
        'ripe' => $ripe,
        'health' => [
            'score' => $score,
            'grade' => $score >= 90 ? 'A' : ($score >= 80 ? 'B' : ($score >= 70 ? 'C' : ($score >= 50 ? 'D' : 'F'))),
            'warnings' => $warnings,
            'errors' => $errors,
        ],
        'query_time' => gmdate('c'),
        'duration_ms' => 0,
        'is_ip' => true,
    ]);
    exit;
}

// Domain availability check
if (isset($_GET['check_domain'])) {
    $checkDomain = strtolower(trim($_GET['check_domain']));
    if (!$checkDomain || !preg_match('/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/i', $checkDomain)) {
        Response::validationError(['check_domain' => 'A valid domain name is required.']);
    }

    $available = null;
    $method = null;
    $details = null;

    // Fire RDAP + HTTP WHOIS in parallel — max 5s total
    $tld = getWhoisTld($checkDomain);
    $rdapUrl = getRdapUrl($tld);
    $mh = curl_multi_init();
    $chRdap = null;
    $chHttp = null;

    if ($rdapUrl) {
        $chRdap = curl_init($rdapUrl . $checkDomain);
        curl_setopt_array($chRdap, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/rdap+json'],
        ]);
        curl_multi_add_handle($mh, $chRdap);
    }

    $chHttp = curl_init("https://www.whois.com/whois/" . urlencode($checkDomain));
    curl_setopt_array($chHttp, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; DNSLookupSuite/1.0)',
    ]);
    curl_multi_add_handle($mh, $chHttp);

    do {
        $status = curl_multi_exec($mh, $active);
        if ($active) curl_multi_select($mh, 1);
    } while ($active && $status === CURLM_OK);

    // Check RDAP result
    if ($chRdap) {
        $httpCode = curl_getinfo($chRdap, CURLINFO_HTTP_CODE);
        if ($httpCode === 404) {
            $available = true;
            $method = 'rdap';
            $details = 'Domain not found in RDAP database';
        } elseif ($httpCode === 200) {
            $available = false;
            $method = 'rdap';
            $details = 'Domain is registered';
        }
        curl_multi_remove_handle($mh, $chRdap);
        curl_close($chRdap);
    }

    // Check HTTP WHOIS result
    if ($available === null && $chHttp) {
        $httpCode = curl_getinfo($chHttp, CURLINFO_HTTP_CODE);
        $html = curl_multi_getcontent($chHttp);
        if ($httpCode === 200 && !empty($html) && preg_match('/<pre[^>]*>(.*?)<\/pre>/is', $html, $m)) {
            $lower = strtolower(html_entity_decode(trim($m[1])));
            if (preg_match('/(no match for|not found|no data found|no entries found|domain not found|no matching record|status:\s*available)/i', $lower)) {
                $available = true;
                $method = 'http';
                $details = 'Domain not found via HTTP WHOIS';
            } elseif (preg_match('/(domain name:|domain:\s+\S|registrant:|creation date|registered:|registry domain id|registrar:|status:\s*not available|nameservers:)/i', $lower)) {
                $available = false;
                $method = 'http';
                $details = 'Domain is registered (via HTTP WHOIS)';
            }
        }
        curl_multi_remove_handle($mh, $chHttp);
        curl_close($chHttp);
    }
    curl_multi_close($mh);

    // Fast final check: DNS records (instant)
    if ($available === null) {
        $hasDns = false;
        $aRecs = @dns_get_record($checkDomain, DNS_A);
        if ($aRecs && count($aRecs) > 0) $hasDns = true;
        if (!$hasDns) {
            $mxRecs = @dns_get_record($checkDomain, DNS_MX);
            if ($mxRecs && count($mxRecs) > 0) $hasDns = true;
        }
        if (!$hasDns) {
            $nsRecs = @dns_get_record($checkDomain, DNS_NS);
            if ($nsRecs && count($nsRecs) > 0) $hasDns = true;
        }
        if ($hasDns) {
            $available = false;
            $method = 'dns';
            $details = 'Domain has DNS records';
        } else {
            $available = true;
            $method = 'dns';
            $details = 'No DNS records found';
        }
    }

    Response::success([
        'domain'   => $checkDomain,
        'available' => $available,
        'method'    => $method,
        'details'   => $details,
    ]);
    exit;
}

$isIp = filter_var($domain, FILTER_VALIDATE_IP);

if (!$isIp && !preg_match('/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/i', $domain)) {
    Response::validationError(['domain' => 'A valid domain name or IP address is required.']);
}

$domain = strtolower($domain);

// ─── Cache Helpers ───────────────────────────────────────────────────────────
function dnsCacheGet(string $domain, string $type): ?array
{
    // Caching is intentionally disabled — DNS/WHOIS data is always fetched live.
    return null;
}

function dnsCacheSet(string $domain, string $type, array $data): void
{
    // Caching is intentionally disabled — no-op.
}

function dnsCacheClear(string $domain): void
{
    Database::execute('DELETE FROM dns_cache WHERE domain = ?', [$domain]);
}

function saveHistory(string $domain): void
{
    if (empty($_SESSION['user_id'])) return;
    try {
        $existing = Database::fetchOne(
            'SELECT id FROM dns_history WHERE domain = ? AND user_id = ?',
            [$domain, (int)$_SESSION['user_id']]
        );
        if (!$existing) {
            Database::execute(
                'INSERT INTO dns_history (user_id, domain) VALUES (?, ?)',
                [(int)$_SESSION['user_id'], $domain]
            );
        }
    } catch (Throwable $e) {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dnsQuery(string $domain, int $type): array
{
    $records = @dns_get_record($domain, $type);
    return is_array($records) ? $records : [];
}

/** Query NS records via DNS-over-HTTPS (Cloudflare) for fresh results */
function dnsQueryDoh(string $domain, string $type = 'NS'): array
{
    $typeMap = ['A' => 1, 'AAAA' => 28, 'CNAME' => 5, 'MX' => 15, 'TXT' => 16, 'NS' => 2, 'SOA' => 6];
    $wireType = $typeMap[$type] ?? 2;
    $dohUrl = 'https://cloudflare-dns.com/dns-query?name=' . urlencode($domain) . '&type=' . $wireType;
    $ch = @curl_init($dohUrl);
    if (!$ch) return [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER    => ['Accept: application/dns-json'],
        CURLOPT_TIMEOUT       => 5,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $response = @curl_exec($ch);
    $httpCode = @curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    if (!$response || $httpCode !== 200) return [];

    $data = @json_decode($response, true);
    if (!isset($data['Answer'])) return [];

    $phpTypeMap = ['A' => DNS_A, 'AAAA' => DNS_AAAA, 'CNAME' => DNS_CNAME, 'MX' => DNS_MX, 'TXT' => DNS_TXT, 'NS' => DNS_NS, 'SOA' => DNS_SOA];
    $records = [];
    foreach ($data['Answer'] as $a) {
        $rType = $a['type'] ?? 0;
        $rData = $a['data'] ?? '';
        $entry = ['host' => $domain, 'type' => $type, 'ttl' => $a['TTL'] ?? 0];
        if ($type === 'NS') {
            $entry['target'] = rtrim($rData, '.');
        } elseif ($type === 'A') {
            $entry['ip'] = $rData;
        } elseif ($type === 'AAAA') {
            $entry['ipv6'] = $rData;
        } elseif ($type === 'MX') {
            $parts = explode(' ', $rData, 2);
            $entry['pri'] = (int)($parts[0] ?? 0);
            $entry['target'] = rtrim($parts[1] ?? '', '.');
        } elseif ($type === 'TXT') {
            $entry['txt'] = trim($rData, '"');
        } elseif ($type === 'CNAME') {
            $entry['target'] = rtrim($rData, '.');
        }
        $records[] = $entry;
    }
    return $records;
}

/**
 * Query a raw DNS record type via Cloudflare DoH (used for synthetic types like
 * DS (43) and DNSKEY (48) that dns_get_record can't always return).
 * Returns the raw RData strings (e.g. DS / DNSKEY RDATA lines).
 */
function queryDohRaw(string $domain, int $wireType): array
{
    $dohUrl = 'https://cloudflare-dns.com/dns-query?name=' . urlencode($domain) . '&type=' . $wireType;
    $ch = @curl_init($dohUrl);
    if (!$ch) return [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER    => ['Accept: application/dns-json'],
        CURLOPT_TIMEOUT       => 5,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $response = @curl_exec($ch);
    $httpCode = @curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    if (!$response || $httpCode !== 200) return [];

    $data = @json_decode($response, true);
    if (!isset($data['Answer']) || !is_array($data['Answer'])) return [];

    $out = [];
    foreach ($data['Answer'] as $a) {
        if (($a['type'] ?? 0) === $wireType && !empty($a['data'])) {
            $out[] = $a['data'];
        }
    }
    return $out;
}

function digQuery(string $domain, string $type): ?array
{
    if (!function_exists('shell_exec')) return null;
    $digPath = trim(@shell_exec('which dig 2>/dev/null') ?? '');
    if (!$digPath) return null;

    $output = @shell_exec("dig $domain $type +short 2>/dev/null");
    if ($output === null || $output === '') return [];

    $lines = array_filter(explode("\n", trim($output)));
    return array_values($lines);
}

/** Encode a domain name into DNS-label format (e.g. "example.com" → "\x07example\x03com\x00"). */
function dnsEncodeName(string $domain): string
{
    $encoded = '';
    foreach (explode('.', $domain) as $label) {
        $encoded .= chr(strlen($label)) . $label;
    }
    return $encoded . "\x00";
}

/** Build a raw DNS query packet for a given domain and record type. */
function dnsBuildQuery(string $domain, int $type): string
{
    $id = random_int(0, 65535);
    $header = pack('n', $id)                          // ID
            . "\x01\x00"                              // flags: standard query, RD=1
            . "\x00\x01"                              // QDCOUNT = 1
            . "\x00\x00" . "\x00\x00" . "\x00\x00";   // ANCOUNT, NSCOUNT, ARCOUNT = 0
    $question = dnsEncodeName($domain)
              . pack('n', $type)                       // QTYPE
              . "\x00\x01";                           // QCLASS = IN
    return $header . $question;
}

/** Decode a DNS-encoded name (possibly with compression pointers) from a given position within a packet. */
function decodeDnsName(string $rdata, string $packet): string
{
    $decoded = '';
    $pos = 0;
    $len = strlen($rdata);
    $jumped = false;
    while ($pos < $len) {
        $l = ord($rdata[$pos]);
        if ($l === 0) break;
        if (($l & 0xC0) === 0xC0) {
            // Compression pointer: 2 bytes, offset in lower 14 bits
            $ptr = (($l & 0x3F) << 8) | ord($rdata[$pos + 1]);
            if (!$jumped) $pos += 2;
            // Read from packet at pointer
            $subRdata = substr($packet, $ptr);
            if ($decoded !== '') $decoded .= '.';
            $decoded .= decodeDnsName($subRdata, $packet);
            $jumped = true;
            break;
        }
        if ($pos + 1 + $l > $len) break;
        if ($decoded !== '') $decoded .= '.';
        $decoded .= substr($rdata, $pos + 1, $l);
        $pos += $l + 1;
    }
    return $decoded;
}

/** Parse the answer section of a raw DNS response, returning IP addresses (for A/AAAA) or hostnames (for other types). */
function dnsParseResponse(string $response, int $expectedType): array
{
    if (strlen($response) < 12) return [];
    $header = unpack('nid/nflags/nqdcount/nancount/nnscount/narcount', substr($response, 0, 12));
    $ancount = $header['ancount'] ?? 0;
    if ($ancount === 0) return [];

    $offset = 12;
    // Skip question section
    while ($offset < strlen($response)) {
        $len = ord($response[$offset]);
        if ($len === 0) { $offset++; break; }
        if (($len & 0xC0) === 0xC0) { $offset += 2; break; }
        $offset += $len + 1;
    }
    $offset += 4; // skip QTYPE + QCLASS

    $results = [];
    for ($i = 0; $i < $ancount; $i++) {
        if ($offset >= strlen($response)) break;
        // Name (may be compressed)
        $nameLen = ord($response[$offset]);
        if (($nameLen & 0xC0) === 0xC0) { $offset += 2; }
        else {
            while ($offset < strlen($response)) {
                $l = ord($response[$offset]);
                if ($l === 0) { $offset++; break; }
                if (($l & 0xC0) === 0xC0) { $offset += 2; break; }
                $offset += $l + 1;
            }
        }
        if ($offset + 10 > strlen($response)) break;
        $r = unpack('ntype/nclass/Nttl/nrdlength', substr($response, $offset, 10));
        $offset += 10;
        $rdlength = $r['rdlength'] ?? 0;
        $type = $r['type'] ?? 0;
        if ($offset + $rdlength > strlen($response)) break;
        $rdata = substr($response, $offset, $rdlength);
        $offset += $rdlength;

        if ($type === 1 && $rdlength === 4) { // A
            $results[] = inet_ntop($rdata);
        } elseif ($type === 28 && $rdlength === 16) { // AAAA
            $results[] = inet_ntop($rdata);
        } elseif ($type === 15 && $rdlength > 2) { // MX
            $pref = unpack('n', substr($rdata, 0, 2))[1];
            $mxTarget = decodeDnsName(substr($rdata, 2), $response);
            $results[] = "$pref $mxTarget";
        } elseif ($type === $expectedType && $rdlength > 0) {
            // Generic: try to decode as a hostname
            if (ord($rdata[0]) <= 63) {
                $decoded = '';
                $pos = 0;
                while ($pos < $rdlength) {
                    $l = ord($rdata[$pos]);
                    if ($l === 0) break;
                    if (($l & 0xC0) === 0xC0) { $pos += 2; break; }
                    if ($decoded !== '') $decoded .= '.';
                    $decoded .= substr($rdata, $pos + 1, $l);
                    $pos += $l + 1;
                }
                if ($decoded !== '') $results[] = $decoded;
            }
        }
    }
    return $results;
}

/** Query a specific nameserver for a record type and return parsed answers. */
function queryNameserver(string $nameserver, string $domain, int $type): array
{
    $packet = dnsBuildQuery($domain, $type);
    $errno = 0;
    $errstr = '';
    $sock = @fsockopen('udp://' . $nameserver, 53, $errno, $errstr, 3);
    if (!$sock) return ['error' => $errstr ?: 'Connection failed'];
    stream_set_timeout($sock, 3);
    @fwrite($sock, $packet);
    $response = @fread($sock, 512);
    @fclose($sock);
    if ($response === false || $response === '') return ['error' => 'No response'];

    $answers = dnsParseResponse($response, $type);
    if (empty($answers)) return ['error' => 'No records returned'];
    return ['answers' => $answers];
}

// ─── A Record ────────────────────────────────────────────────────────────────
function getARecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'A');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_A);
    $result = [
        'records' => [],
        'ttl' => 0,
        'count' => 0,
        'status' => count($records) > 0 ? 'ok' : 'empty',
    ];

    if (count($records) > 0) {
        $result['ttl'] = $records[0]['ttl'] ?? 0;
        $result['count'] = count($records);
        foreach ($records as $r) {
            $result['records'][] = $r['ip'] ?? '';
        }
        $result['status'] = 'ok';
    }

    dnsCacheSet($domain, 'A', $result);
    return $result;
}

// ─── AAAA Record ─────────────────────────────────────────────────────────────
function getAaaaRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'AAAA');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_AAAA);
    $result = [
        'records' => [],
        'ttl' => 0,
        'count' => 0,
        'status' => count($records) > 0 ? 'ok' : 'empty',
    ];

    if (count($records) > 0) {
        $result['ttl'] = $records[0]['ttl'] ?? 0;
        $result['count'] = count($records);
        foreach ($records as $r) {
            $result['records'][] = $r['ipv6'] ?? '';
        }
        $result['status'] = 'ok';
    }

    dnsCacheSet($domain, 'AAAA', $result);
    return $result;
}

// ─── CNAME ───────────────────────────────────────────────────────────────────
function getCnameRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'CNAME');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_CNAME);
    $result = [
        'records' => [],
        'ttl' => 0,
        'count' => 0,
        'chained' => false,
        'chain' => [],
        'resolves' => false,
        'status' => 'ok',
    ];

    if (count($records) > 0) {
        $result['ttl'] = $records[0]['ttl'] ?? 0;
        $result['count'] = count($records);

        $current = $domain;
        $chain = [];
        $seen = [];
        for ($i = 0; $i < 10; $i++) {
            $cnameRecs = dnsQuery($current, DNS_CNAME);
            $cnameVal = $cnameRecs[0]['target'] ?? null;
            if (!$cnameVal) {
                $targetRecs = dnsQuery($current, DNS_A);
                $chain[] = ['host' => $current, 'type' => 'A', 'target' => implode(', ', array_column($targetRecs, 'ip'))];
                break;
            }
            $chain[] = ['host' => $current, 'type' => 'CNAME', 'target' => $cnameVal];
            $current = rtrim($cnameVal, '.');
            if (isset($seen[$current])) {
                $chain[] = ['host' => $current, 'type' => 'loop', 'target' => 'CNAME loop detected!'];
                $result['status'] = 'error';
                break;
            }
            $seen[$current] = true;
        }

        $result['chain'] = $chain;
        $result['chained'] = count($chain) > 1;
        $result['resolves'] = count(dnsQuery($current, DNS_A)) > 0 || count(dnsQuery($current, DNS_AAAA)) > 0;

        foreach ($records as $r) {
            $result['records'][] = $r['target'] ?? '';
        }
    }

    dnsCacheSet($domain, 'CNAME', $result);
    return $result;
}

// ─── MX Records ──────────────────────────────────────────────────────────────
function getMxRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'MX');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_MX);
    $result = [
        'records' => [],
        'ttl' => 0,
        'count' => 0,
        'status' => count($records) > 0 ? 'ok' : 'empty',
        'valid' => true,
        'warnings' => [],
    ];

    if (count($records) > 0) {
        $result['ttl'] = $records[0]['ttl'] ?? 0;
        $result['count'] = count($records);
        foreach ($records as $r) {
            $target = rtrim($r['target'] ?? '', '.');
            $prio = $r['pri'] ?? 0;
            $result['records'][] = [
                'host' => $target,
                'priority' => $prio,
                'resolves' => count(dnsQuery($target, DNS_A)) > 0 || count(dnsQuery($target, DNS_AAAA)) > 0,
            ];
            if (!$result['records'][count($result['records'])-1]['resolves']) {
                $result['warnings'][] = "MX target $target does not resolve to an IP";
                $result['valid'] = false;
            }
        }
        if (count($records) > 10) {
            $result['warnings'][] = 'More than 10 MX records configured';
        }
    }

    dnsCacheSet($domain, 'MX', $result);
    return $result;
}

// ─── TXT Records ─────────────────────────────────────────────────────────────
function getTxtRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'TXT');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_TXT);
    $result = [
        'records' => [],
        'ttl' => 0,
        'count' => 0,
        'spf' => null,
        'dkim' => [],
        'dmarc' => null,
        'other' => [],
    ];

    if (count($records) > 0) {
        $result['ttl'] = $records[0]['ttl'] ?? 0;
        $result['count'] = count($records);
        foreach ($records as $r) {
            $txt = $r['txt'] ?? '';
            $entry = ['value' => $txt, 'type' => 'other'];

            if (stripos($txt, 'v=spf1') === 0) {
                $entry['type'] = 'spf';
                $result['spf'] = $entry;
            } elseif (stripos($txt, 'v=DKIM1') === 0) {
                $entry['type'] = 'dkim';
                $result['dkim'][] = $entry;
            } elseif (stripos($txt, 'v=DMARC1') === 0) {
                $entry['type'] = 'dmarc';
                $result['dmarc'] = $entry;
            } else {
                $result['other'][] = $entry;
            }
            $result['records'][] = $entry;
        }
    }

    dnsCacheSet($domain, 'TXT', $result);
    return $result;
}

// ─── CAA Records ─────────────────────────────────────────────────────────────
function getCaaRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'CAA');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_CAA);
    $result = [
        'records' => [],
        'count' => 0,
        'exists' => count($records) > 0,
        'status' => count($records) > 0 ? 'ok' : 'empty',
    ];

    if (count($records) > 0) {
        foreach ($records as $r) {
            $result['records'][] = [
                'flags' => $r['flags'] ?? 0,
                'tag' => $r['tag'] ?? '',
                'value' => $r['value'] ?? '',
            ];
        }
        $result['count'] = count($records);
    }

    dnsCacheSet($domain, 'CAA', $result);
    return $result;
}

// ─── SRV Records ─────────────────────────────────────────────────────────────
function getSrvRecords(string $domain): array
{
    $cached = dnsCacheGet($domain, 'SRV');
    if ($cached) return $cached;

    $common_services = [
        '_sip._tcp', '_sip._udp', '_sips._tcp',
        '_xmpp._tcp', '_xmpps._tcp',
        '_jabber._tcp', '_jabber._udp',
        '_ldap._tcp', '_ldaps._tcp',
        '_kerberos._tcp', '_kerberos._udp',
        '_imap._tcp', '_imaps._tcp',
        '_pop3._tcp', '_pop3s._tcp',
        '_smtp._tcp', '_submission._tcp',
        '_caldav._tcp', '_caldavs._tcp',
        '_carddav._tcp', '_carddavs._tcp',
        '_collab._tcp',
        '_vlmcs._tcp',
        '_minecraft._tcp',
        '_matrix._tcp',
    ];

    $result = [
        'records' => [],
        'count' => 0,
        'services_found' => [],
        'status' => 'ok',
    ];

    foreach ($common_services as $service) {
        $qname = "$service.$domain";
        $recs = dnsQuery($qname, DNS_SRV);
        if (count($recs) > 0) {
            foreach ($recs as $r) {
                $target = rtrim($r['target'] ?? '', '.');
                $entry = [
                    'service' => $service,
                    'priority' => $r['pri'] ?? 0,
                    'weight' => $r['weight'] ?? 0,
                    'port' => $r['port'] ?? 0,
                    'target' => $target,
                    'ttl' => $r['ttl'] ?? 0,
                    'resolves' => count(dnsQuery($target, DNS_A)) > 0 || count(dnsQuery($target, DNS_AAAA)) > 0,
                ];
                $result['records'][] = $entry;
                $result['services_found'][] = $service;
            }
        }
    }

    $result['count'] = count($result['records']);
    if ($result['count'] === 0) {
        $result['status'] = 'empty';
    }

    dnsCacheSet($domain, 'SRV', $result);
    return $result;
}

// ─── SOA Record ──────────────────────────────────────────────────────────────
function getSoaRecord(string $domain): array
{
    $cached = dnsCacheGet($domain, 'SOA');
    if ($cached) return $cached;

    $records = dnsQuery($domain, DNS_SOA);
    $result = [
        'record' => null,
        'status' => 'empty',
        'warnings' => [],
        'best_practices' => [],
    ];

    if (count($records) > 0) {
        $soa = $records[0];
        $result['record'] = [
            'mname' => rtrim($soa['mname'] ?? '', '.'),
            'rname' => rtrim($soa['rname'] ?? '', '.'),
            'serial' => (int)($soa['serial'] ?? 0),
            'refresh' => (int)($soa['refresh'] ?? 0),
            'retry' => (int)($soa['retry'] ?? 0),
            'expire' => (int)($soa['expire'] ?? 0),
            'minimum_ttl' => (int)($soa['minimum-ttl'] ?? 0),
            'ttl' => $soa['ttl'] ?? 0,
        ];
        $result['status'] = 'ok';

        $s = $result['record'];

        // Validate serial: should be YYYYMMDDNN format
        $serialStr = (string)$s['serial'];
        if (preg_match('/^\d{10}$/', $serialStr)) {
            $datePart = substr($serialStr, 0, 8);
            $year = (int)substr($datePart, 0, 4);
            $month = (int)substr($datePart, 4, 2);
            $day = (int)substr($datePart, 6, 2);
            if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12 || $day < 1 || $day > 31) {
                $result['warnings'][] = 'Serial number does not appear to follow YYYYMMDDNN format';
            }
        } elseif ($s['serial'] === 0) {
            $result['warnings'][] = 'Serial number is 0';
        }

        // Check timing values
        if ($s['refresh'] < 3600) {
            $result['warnings'][] = "Refresh interval ({$s['refresh']}s) is very low; recommended 3600-14400s";
        } elseif ($s['refresh'] > 86400) {
            $result['warnings'][] = "Refresh interval ({$s['refresh']}s) is very high; recommended 3600-14400s";
        }

        if ($s['retry'] < 300) {
            $result['warnings'][] = "Retry interval ({$s['retry']}s) is very low; recommended 600-3600s";
        } elseif ($s['retry'] > 7200) {
            $result['warnings'][] = "Retry interval ({$s['retry']}s) is very high; recommended 600-3600s";
        }

        if ($s['expire'] < 604800) {
            $result['warnings'][] = "Expire interval ({$s['expire']}s) is below recommended minimum of 604800s (7 days)";
        } elseif ($s['expire'] > 1209600) {
            $result['warnings'][] = "Expire interval ({$s['expire']}s) is above recommended maximum of 1209600s (14 days)";
        }

        if ($s['minimum_ttl'] < 300) {
            $result['warnings'][] = "Minimum TTL ({$s['minimum_ttl']}s) is very low; recommended 300-86400s";
        } elseif ($s['minimum_ttl'] > 86400) {
            $result['warnings'][] = "Minimum TTL ({$s['minimum_ttl']}s) is very high; recommended 300-86400s";
        }

        if ($s['retry'] >= $s['refresh']) {
            $result['warnings'][] = 'Retry interval should be less than refresh interval';
        }

        $result['best_practices'] = [
            'refresh_ok' => $s['refresh'] >= 3600 && $s['refresh'] <= 14400,
            'retry_ok' => $s['retry'] >= 600 && $s['retry'] <= 3600,
            'expire_ok' => $s['expire'] >= 604800 && $s['expire'] <= 1209600,
            'minimum_ttl_ok' => $s['minimum_ttl'] >= 300 && $s['minimum_ttl'] <= 86400,
        ];
    }

    dnsCacheSet($domain, 'SOA', $result);
    return $result;
}

// ─── SPF Validation ──────────────────────────────────────────────────────────
function validateSpf(string $domain, array $txtRecords): array
{
    $cached = dnsCacheGet($domain, 'SPF');
    if ($cached) return $cached;

    $result = [
        'exists' => false,
        'record' => null,
        'valid' => false,
        'mechanisms' => [],
        'dns_lookups' => 0,
        'excessive_lookups' => false,
        'deprecated_mechanisms' => [],
        'warnings' => [],
        'status' => 'missing',
        'pass_fail' => 'none',
    ];

    if ($txtRecords['spf']) {
        $result['exists'] = true;
        $result['record'] = $txtRecords['spf']['value'];
        $result['status'] = 'ok';

        $spf = $txtRecords['spf']['value'];

        // Basic syntax check
        if (stripos($spf, 'v=spf1') === 0) {
            $result['valid'] = true;
        } else {
            $result['warnings'][] = 'SPF record must start with v=spf1';
            dnsCacheSet($domain, 'SPF', $result);
            return $result;
        }

        // Parse mechanisms
        $parts = preg_split('/\s+/', $spf);
        $lookupCount = 0;
        $deprecated = [];

        foreach ($parts as $part) {
            $part = trim($part);
            if (empty($part) || $part === 'v=spf1') continue;

            // Count DNS lookups
            if (preg_match('/^(include|a|mx|ptr|exists):/i', $part)) {
                $lookupCount++;
            }
            if (preg_match('/^(redirect)=/i', $part)) {
                $lookupCount++;
            }
            if (preg_match('/^(exp)=/i', $part)) {
                // exp= doesn't count towards the limit
            }

            // Detect deprecated mechanisms
            if (stripos($part, 'ptr') === 0) {
                $deprecated[] = 'ptr';
                $result['warnings'][] = 'The "ptr" mechanism is deprecated and should not be used';
            }

            if (preg_match('/^[?~+-]?(ptr)/i', $part)) {
                if (!in_array('ptr', $deprecated)) {
                    $deprecated[] = 'ptr';
                    $result['warnings'][] = 'The "ptr" mechanism is deprecated';
                }
            }

            $result['mechanisms'][] = $part;
        }

        $result['dns_lookups'] = $lookupCount;
        if ($lookupCount > 10) {
            $result['excessive_lookups'] = true;
            $result['warnings'][] = "SPF requires $lookupCount DNS lookups (max 10 allowed). This may cause permanent errors.";
        }

        $result['deprecated_mechanisms'] = $deprecated;

        // Determine pass/fail
        if (preg_match('/\s-all\s*$/i', $spf)) {
            $result['pass_fail'] = 'fail (hard fail)';
        } elseif (preg_match('/\s~all\s*$/i', $spf)) {
            $result['pass_fail'] = 'softfail';
        } elseif (preg_match('/\s-all/i', $spf . ' ')) {
            $result['pass_fail'] = 'fail (hard fail)';
        } elseif (preg_match('/\s~all/i', $spf . ' ')) {
            $result['pass_fail'] = 'softfail';
        } elseif (preg_match('/\s\+all/i', $spf . ' ')) {
            $result['pass_fail'] = 'pass (permissive)';
            $result['warnings'][] = 'SPF uses +all mechanism, which allows any sender';
        } elseif (preg_match('/\?all/i', $spf . ' ')) {
            $result['pass_fail'] = 'neutral';
        } else {
            $result['pass_fail'] = 'neutral (no all mechanism)';
            $result['warnings'][] = 'SPF record has no "all" mechanism — policy is not enforced';
        }
    } else {
        $result['warnings'][] = 'No SPF record found for this domain';
    }

    dnsCacheSet($domain, 'SPF', $result);
    return $result;
}

// ─── DKIM Validation ─────────────────────────────────────────────────────────
function validateDkim(string $domain): array
{
    $cached = dnsCacheGet($domain, 'DKIM');
    if ($cached) return $cached;

    $selectors = ['default', 'dkim', 'google', 'selector1', 'selector2', 's1', 's2', 'mail', 'email', '2020', '2021', '2022', '2023', '2024', '2025', 'mx', 'k1', 'key1'];
    $result = [
        'selectors' => [],
        'found_selectors' => [],
        'count' => 0,
        'status' => 'empty',
    ];

    foreach ($selectors as $sel) {
        $qname = "$sel._domainkey.$domain";
        $recs = dnsQuery($qname, DNS_TXT);
        if (count($recs) > 0) {
            $txt = $recs[0]['txt'] ?? '';
            $entry = [
                'selector' => $sel,
                'record' => $txt,
                'valid' => stripos($txt, 'v=DKIM1') === 0,
            ];
            $result['selectors'][] = $entry;
            $result['found_selectors'][] = $sel;
        }
    }

    $result['count'] = count($result['selectors']);
    if ($result['count'] > 0) {
        $result['status'] = 'ok';
    }

    dnsCacheSet($domain, 'DKIM', $result);
    return $result;
}

// ─── DMARC Validation ────────────────────────────────────────────────────────
function validateDmarc(string $domain): array
{
    $cached = dnsCacheGet($domain, 'DMARC');
    if ($cached) return $cached;

    $qname = "_dmarc.$domain";
    $recs = dnsQuery($qname, DNS_TXT);
    $result = [
        'exists' => false,
        'record' => null,
        'valid' => false,
        'policy' => null,
        'subdomain_policy' => null,
        'pct' => null,
        'rua' => null,
        'ruf' => null,
        'sp' => null,
        'adkim' => null,
        'aspf' => null,
        'fo' => null,
        'rf' => null,
        'ri' => null,
        'warnings' => [],
        'status' => 'missing',
    ];

    if (count($recs) > 0) {
        $txt = $recs[0]['txt'] ?? '';
        $result['exists'] = true;
        $result['record'] = $txt;
        $result['status'] = 'ok';

        if (stripos($txt, 'v=DMARC1') === 0) {
            $result['valid'] = true;
        } else {
            $result['warnings'][] = 'DMARC record must start with v=DMARC1';
            dnsCacheSet($domain, 'DMARC', $result);
            return $result;
        }

        // Parse tags
        $tags = explode(';', $txt);
        foreach ($tags as $tag) {
            $tag = trim($tag);
            if (empty($tag)) continue;
            if (stripos($tag, 'v=') === 0) continue;
            if (preg_match('/^p\s*=\s*(\w+)/i', $tag, $m)) {
                $result['policy'] = strtolower($m[1]);
            } elseif (preg_match('/^sp\s*=\s*(\w+)/i', $tag, $m)) {
                $result['subdomain_policy'] = strtolower($m[1]);
            } elseif (preg_match('/^pct\s*=\s*(\d+)/i', $tag, $m)) {
                $result['pct'] = (int)$m[1];
            } elseif (preg_match('/^rua\s*=\s*(.+)/i', $tag, $m)) {
                $result['rua'] = trim($m[1]);
            } elseif (preg_match('/^ruf\s*=\s*(.+)/i', $tag, $m)) {
                $result['ruf'] = trim($m[1]);
            } elseif (preg_match('/^adkim\s*=\s*(\w+)/i', $tag, $m)) {
                $result['adkim'] = strtolower($m[1]);
            } elseif (preg_match('/^aspf\s*=\s*(\w+)/i', $tag, $m)) {
                $result['aspf'] = strtolower($m[1]);
            } elseif (preg_match('/^fo\s*=\s*(\w+)/i', $tag, $m)) {
                $result['fo'] = strtolower($m[1]);
            } elseif (preg_match('/^rf\s*=\s*(\w+)/i', $tag, $m)) {
                $result['rf'] = strtolower($m[1]);
            } elseif (preg_match('/^ri\s*=\s*(\d+)/i', $tag, $m)) {
                $result['ri'] = (int)$m[1];
            }
        }

        // Validate policy
        $validPolicies = ['none', 'quarantine', 'reject'];
        if ($result['policy'] && !in_array($result['policy'], $validPolicies)) {
            $result['warnings'][] = "Invalid DMARC policy: {$result['policy']}";
        }

        if ($result['policy'] === 'none') {
            $result['warnings'][] = 'DMARC policy is set to "none" — no enforcement is applied';
        }

        // Check for RUA/RUF
        if (!$result['rua']) {
            $result['warnings'][] = 'No rua (reporting URI for aggregate reports) configured';
        }
    } else {
        $result['warnings'][] = 'No DMARC record found for this domain';
    }

    dnsCacheSet($domain, 'DMARC', $result);
    return $result;
}

// ─── Nameservers ─────────────────────────────────────────────────────────────
function getNameservers(string $domain): array
{
    $cached = dnsCacheGet($domain, 'NS');
    if ($cached) return $cached;

    // Use DNS-over-HTTPS first for fresh results (bypasses local resolver cache)
    $records = dnsQueryDoh($domain, 'NS');
    if (empty($records)) {
        $records = dnsQuery($domain, DNS_NS);
    }
    $result = [
        'nameservers' => [],
        'count' => 0,
        'status' => 'empty',
        'reachable' => [],
        'unreachable' => [],
        'consistent' => true,
        'warnings' => [],
    ];

    if (count($records) > 0) {
        foreach ($records as $r) {
            $ns = rtrim($r['target'] ?? '', '.');
            $result['nameservers'][] = $ns;
        }
        $result['count'] = count($records);
        $result['status'] = 'ok';

        // Check reachability
        foreach ($result['nameservers'] as $ns) {
            $resolved = dnsQuery($ns, DNS_A);
            $resolved6 = dnsQuery($ns, DNS_AAAA);
            $isReachable = count($resolved) > 0 || count($resolved6) > 0;
            if ($isReachable) {
                $result['reachable'][] = $ns;
            } else {
                $result['unreachable'][] = $ns;
                $result['warnings'][] = "Nameserver $ns does not resolve to an IP address";
            }
        }

        // Check consistency — query each NS for the domain
        $nsResults = [];
        foreach ($result['nameservers'] as $ns) {
            $dig = digQuery("@$ns $domain", "NS");
            if ($dig !== null) {
                $nsResults[$ns] = $dig;
            }
        }

        if (count($nsResults) > 1) {
            $firstVal = serialize($nsResults[array_key_first($nsResults)] ?? []);
            foreach ($nsResults as $ns => $vals) {
                if (serialize($vals) !== $firstVal) {
                    $result['consistent'] = false;
                    $result['warnings'][] = "Nameserver $ns returned different results than other nameservers";
                    break;
                }
            }
        }

        if ($result['count'] < 2) {
            $result['warnings'][] = 'Only one nameserver configured — at least 2 recommended for redundancy';
        } elseif ($result['count'] > 7) {
            $result['warnings'][] = "{$result['count']} nameservers configured — more than 7 is excessive";
        }
    }

    dnsCacheSet($domain, 'NS', $result);
    return $result;
}

// ─── Delegation Check ────────────────────────────────────────────────────────
function checkDelegation(string $domain, array $nsData): array
{
    $cached = dnsCacheGet($domain, 'DELEGATION');
    if ($cached) return $cached;

    $result = [
        'parent_ns' => [],
        'child_ns' => [],
        'match' => false,
        'missing' => [],
        'extra' => [],
        'lame' => [],
        'glue_required' => [],
        'glue_valid' => true,
        'warnings' => [],
        'status' => 'ok',
    ];

    // Get parent zone NS records
    $parts = explode('.', $domain);
    $parent = count($parts) > 1 ? implode('.', array_slice($parts, 1)) : $domain;

    $parentNs = dnsQuery($parent, DNS_NS);
    foreach ($parentNs as $r) {
        $result['parent_ns'][] = rtrim($r['target'] ?? '', '.');
    }

    $result['child_ns'] = $nsData['nameservers'] ?? [];

    // Compare parent vs child
    $parentSet = array_map('strtolower', $result['parent_ns']);
    $childSet = array_map('strtolower', $result['child_ns']);

    $result['match'] = count(array_intersect($parentSet, $childSet)) > 0;

    $result['missing'] = array_diff($childSet, $parentSet);
    $result['extra'] = array_diff($parentSet, $childSet);

    if (count($result['missing']) > 0) {
        $result['warnings'][] = 'Nameservers in child zone not found in parent zone: ' . implode(', ', $result['missing']);
    }

    if (count($result['extra']) > 0) {
        $result['warnings'][] = 'Nameservers in parent zone not found in child zone: ' . implode(', ', $result['extra']);
    }

    // Check for lame delegations
    foreach ($result['child_ns'] as $ns) {
        $recs = dnsQuery($domain, DNS_NS);
        if (count($recs) === 0) {
            // Try directly querying the NS
            $dig = digQuery("@$ns $domain", "NS");
            if ($dig !== null && count($dig) === 0) {
                $result['lame'][] = $ns;
                $result['warnings'][] = "Lame delegation detected: $ns is not authoritative for $domain";
            }
        }
    }

    // Check glue records
    foreach ($result['child_ns'] as $ns) {
        $nsName = rtrim($ns, '.');
        if (stripos($nsName, ".$domain") !== false || $nsName === $domain) {
            $result['glue_required'][] = $ns;
            $glueRecs = dnsQuery($nsName, DNS_A);
            if (count($glueRecs) === 0) {
                $result['glue_valid'] = false;
                $result['warnings'][] = "Missing glue record for $nsName (in-zone nameserver)";
            }
        }
    }

    dnsCacheSet($domain, 'DELEGATION', $result);
    return $result;
}

// ─── Reverse DNS (PTR) ──────────────────────────────────────────────────────

/** Known IPs that should show a custom label instead of doing a real PTR lookup. */
$PTR_OVERRIDES = [
    '185.182.56.12' => 'Redirect server Versio',
    '2a0b:7280:100::434:52ff:fe00:2046' => 'Redirect server Versio',
];

function lookupPtr4(string $ip): ?string
{
    global $PTR_OVERRIDES;
    if (isset($PTR_OVERRIDES[$ip])) {
        return $PTR_OVERRIDES[$ip];
    }
    $parts = explode('.', $ip);
    if (count($parts) !== 4) return null;
    $reversed = implode('.', array_reverse($parts));
    $ptrRecords = @dns_get_record("$reversed.in-addr.arpa.", DNS_PTR);
    if (!empty($ptrRecords[0]['target'])) {
        return rtrim($ptrRecords[0]['target'], '.');
    }
    return null;
}

function lookupPtr6(string $ip): ?string
{
    global $PTR_OVERRIDES;
    if (isset($PTR_OVERRIDES[$ip])) {
        return $PTR_OVERRIDES[$ip];
    }
    $expanded = inet_pton($ip);
    if ($expanded === false) return null;
    $hex = bin2hex($expanded);
    $nibbles = implode('.', array_reverse(str_split($hex)));
    $ptrRecords = @dns_get_record("$nibbles.ip6.arpa.", DNS_PTR);
    if (!empty($ptrRecords[0]['target'])) {
        return rtrim($ptrRecords[0]['target'], '.');
    }
    return null;
}

function getSubdomains(string $domain): array
{
    $cached = dnsCacheGet($domain, 'SUB');
    if ($cached) return $cached;

    $result = ['records' => [], 'status' => 'empty'];

    foreach (['www', 'mail'] as $sub) {
        $subdomain = "$sub.$domain";

        // IPv4
        $ipv4 = @dns_get_record($subdomain, DNS_A);
        if (!empty($ipv4)) {
            foreach ($ipv4 as $r) {
                $ip = $r['ip'];
                $result['records'][] = [
                    'subdomain' => $subdomain,
                    'ip' => $ip,
                    'type' => 'A',
                    'ttl' => $r['ttl'] ?? 0,
                    'ptr' => lookupPtr4($ip),
                ];
            }
        }

        // IPv6
        $ipv6 = @dns_get_record($subdomain, DNS_AAAA);
        if (!empty($ipv6)) {
            foreach ($ipv6 as $r) {
                $ip = $r['ipv6'];
                $result['records'][] = [
                    'subdomain' => $subdomain,
                    'ip' => $ip,
                    'type' => 'AAAA',
                    'ttl' => $r['ttl'] ?? 0,
                    'ptr' => lookupPtr6($ip),
                ];
            }
        }
    }

    if (count($result['records']) > 0) $result['status'] = 'ok';
    dnsCacheSet($domain, 'SUB', $result);
    return $result;
}

function getReverseDns(string $domain): array
{
    $cached = dnsCacheGet($domain, 'PTR');
    if ($cached) return $cached;

    $result = [
        'a_records' => [],
        'aaaa_records' => [],
        'ptr_records' => [],
        'fcrdns' => [],
        'mismatches' => [],
        'status' => 'empty',
    ];

    $aRecs = dnsQuery($domain, DNS_A);
    $result['a_records'] = array_column($aRecs, 'ip');

    $aaaaRecs = dnsQuery($domain, DNS_AAAA);
    $result['aaaa_records'] = array_column($aaaaRecs, 'ipv6');

    $allIps = array_merge($result['a_records'], $result['aaaa_records']);

    foreach ($allIps as $ip) {
        $hostname = null;
        $isV6 = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
        global $PTR_OVERRIDES;
        if (isset($PTR_OVERRIDES[$ip])) {
            $hostname = $PTR_OVERRIDES[$ip];
        } elseif (!$isV6) {
            $parts = explode('.', $ip);
            if (count($parts) === 4) {
                $reversed = implode('.', array_reverse($parts));
                $ptrDomain = "$reversed.in-addr.arpa.";
                $ptrRecords = @dns_get_record($ptrDomain, DNS_PTR);
                if (!empty($ptrRecords[0]['target'])) {
                    $hostname = rtrim($ptrRecords[0]['target'], '.');
                }
            }
        } else {
            $expanded = inet_pton($ip);
            if ($expanded !== false) {
                $hex = bin2hex($expanded);
                $nibbles = implode('.', array_reverse(str_split($hex)));
                $ptrRecords = @dns_get_record("$nibbles.ip6.arpa.", DNS_PTR);
                if (!empty($ptrRecords[0]['target'])) {
                    $hostname = rtrim($ptrRecords[0]['target'], '.');
                }
            }
        }

        if ($hostname) {
            $result['ptr_records'][] = [
                'ip' => $ip,
                'hostname' => $hostname,
            ];

            if (!$isV6 && !isset($PTR_OVERRIDES[$ip])) {
                $forwardIp = @gethostbyname($hostname);
                if ($forwardIp && $forwardIp !== $hostname) {
                    $fcrdnsMatch = $forwardIp === $ip;
                    $result['fcrdns'][] = [
                        'ip' => $ip,
                        'hostname' => $hostname,
                        'forward_ip' => $forwardIp,
                        'match' => $fcrdnsMatch,
                    ];
                    if (!$fcrdnsMatch) {
                        $result['mismatches'][] = "FCrDNS mismatch: $ip resolves to $hostname but $hostname resolves to $forwardIp";
                    }
                }
            }
        }
    }

    if (count($result['ptr_records']) > 0) {
        $result['status'] = 'ok';
    }

    dnsCacheSet($domain, 'PTR', $result);
    return $result;
}

// ─── SSL Certificate Check ───────────────────────────────────────────────────
function checkSsl(string $domain): array
{
    $cached = dnsCacheGet($domain, 'SSL');
    if ($cached) return $cached;

    $result = [
        'root' => null,
        'www' => null,
        'status' => 'ok',
    ];

    $hosts = [
        'root' => $domain,
        'www' => 'www.' . $domain,
    ];

    foreach ($hosts as $key => $host) {
        $cert = @stream_context_create(['ssl' => ['capture_peer_cert' => true, 'verify_peer' => false, 'verify_peer_name' => false]]);
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client("ssl://{$host}:443", $errno, $errstr, 5, STREAM_CLIENT_CONNECT, $cert);
        if (!$fp) {
            $result[$key] = ['valid' => false, 'error' => $errstr ?: 'Connection failed'];
            continue;
        }
        $peer = stream_context_get_params($fp);
        @fclose($fp);
        $certInfo = $peer['options']['ssl']['peer_certificate'] ?? null;
        if (!$certInfo) {
            $result[$key] = ['valid' => false, 'error' => 'No certificate'];
            continue;
        }
        $parsed = openssl_x509_parse($certInfo);
        if (!$parsed) {
            $result[$key] = ['valid' => false, 'error' => 'Failed to parse certificate'];
            continue;
        }
        $now = time();
        $validFrom = $parsed['validFrom_time_t'] ?? 0;
        $validTo = $parsed['validTo_time_t'] ?? 0;
        $isValid = $now >= $validFrom && $now <= $validTo;
        $daysLeft = (int)(($validTo - $now) / 86400);

        $issuer = '';
        $issuerParts = $parsed['issuer'] ?? [];
        foreach (['O', 'CN', 'organizationName', 'commonName'] as $k) {
            if (!empty($issuerParts[$k])) { $issuer = is_array($issuerParts[$k]) ? reset($issuerParts[$k]) : $issuerParts[$k]; break; }
        }
        if (!$issuer && !empty($issuerParts[0])) {
            foreach ($issuerParts[0] as $v) { $issuer = $v; break; }
        }

        $subject = '';
        $subjectParts = $parsed['subject'] ?? [];
        foreach (['CN', 'commonName'] as $k) {
            if (!empty($subjectParts[$k])) { $subject = is_array($subjectParts[$k]) ? reset($subjectParts[$k]) : $subjectParts[$k]; break; }
        }

        $sans = [];
        if (!empty($parsed['extensions']['subjectAltName'])) {
            $sanStr = $parsed['extensions']['subjectAltName'];
            if (preg_match_all('/DNS:([^,\s]+)/', $sanStr, $m)) $sans = $m[1];
        }

        $result[$key] = [
            'valid' => $isValid,
            'subject' => $subject,
            'issuer' => $issuer,
            'valid_from' => date('Y-m-d H:i:s', $validFrom),
            'valid_to' => date('Y-m-d H:i:s', $validTo),
            'days_left' => $daysLeft,
            'sans' => $sans,
            'serial' => $parsed['serialNumberHex'] ?? '',
            'version' => $parsed['version'] ?? '',
            'signature_type' => $parsed['signatureTypeSN'] ?? '',
        ];
    }

    if (!$result['root']['valid'] && !$result['www']['valid']) {
        $result['status'] = 'error';
    } elseif (!$result['root']['valid'] || !$result['www']['valid']) {
        $result['status'] = 'partial';
    }

    dnsCacheSet($domain, 'SSL', $result);
    return $result;
}

// ─── DNSSEC ──────────────────────────────────────────────────────────────────
function checkDnssec(string $domain): array
{
    $cached = dnsCacheGet($domain, 'DNSSEC');
    if ($cached) return $cached;

    $result = [
        'enabled' => false,
        'ds_records' => [],
        'dnskey_records' => [],
        'rrsig_records' => [],
        'trust_chain_valid' => false,
        'warnings' => [],
        'status' => 'disabled',
    ];

    // DNSKEY — query both the local resolver AND Cloudflare DoH. Cloudflare-fronted
    // domains return HINFO for ANY queries, so dns_get_record alone can't see DNSKEY.
    $allRecords = @dns_get_record($domain, DNS_ANY);
    $dnskeyRecs = array_filter($allRecords ?? [], fn($r) => ($r['type'] ?? '') === 'DNSKEY');
    foreach ($dnskeyRecs as $r) {
        $result['dnskey_records'][] = $r;
    }
    // DoH DNSKEY (authoritative for the zone's signing status)
    foreach (queryDohRaw($domain, 48) as $rdata) {
        if (!in_array($rdata, $result['dnskey_records'])) {
            $result['dnskey_records'][] = $rdata;
        }
    }
    if (count($result['dnskey_records']) > 0) {
        $result['enabled'] = true;
        $result['status'] = 'ok';
    }

    // RRSIG (via ANY query) — informational only
    $allRecs = @dns_get_record($domain, DNS_ANY);
    if (is_array($allRecs)) {
        foreach ($allRecs as $r) {
            if (isset($r['type']) && $r['type'] === 'RRSIG') {
                $result['rrsig_records'][] = $r;
            }
        }
    }

    // DS records live in the parent TLD zone — query via Cloudflare DoH.
    foreach (queryDohRaw($domain, 43) as $rdata) {
        if (!in_array($rdata, $result['ds_records'])) {
            $result['ds_records'][] = $rdata;
        }
    }
    if (count($result['ds_records']) > 0) {
        $result['enabled'] = true;
        $result['status'] = 'ok';
    }

    if ($result['enabled'] && count($result['ds_records']) > 0 && count($result['dnskey_records']) > 0) {
        $result['trust_chain_valid'] = true;
    }

    if (!$result['enabled']) {
        $result['warnings'][] = 'DNSSEC is not enabled for this domain';
    }

    dnsCacheSet($domain, 'DNSSEC', $result);
    return $result;
}

// ─── EDNS Test ───────────────────────────────────────────────────────────────
function testEdns(string $domain): array
{
    $cached = dnsCacheGet($domain, 'EDNS');
    if ($cached) return $cached;

    $result = [
        'supported' => false,
        'version' => null,
        'warnings' => [],
        'status' => 'unknown',
    ];

    // Try dig with +edns option (or raw UDP fallback)
    $digPath = function_exists('shell_exec') ? trim(@shell_exec('which dig 2>/dev/null') ?? '') : '';
    if ($digPath) {
        $output = @shell_exec("dig $domain A +edns +nocmd +nostats +nocomments 2>/dev/null");
        if ($output && strpos($output, 'OPT') !== false) {
            $result['supported'] = true;
            $result['version'] = 0;
            $result['status'] = 'ok';
        } elseif ($output && strpos($output, 'BADVERS') !== false) {
            $result['supported'] = false;
            $result['warnings'][] = 'EDNS not supported or BADVERS response received';
            $result['status'] = 'error';
        } else {
            $result['supported'] = false;
            $result['status'] = 'error';
        }
    } else {
        // Fallback: raw UDP query — if the response is >512 bytes, EDNS is likely supported
        $nsResult = queryNameserver('8.8.8.8', $domain, DNS_A);
        if (isset($nsResult['answers']) && !empty($nsResult['answers'])) {
            $result['supported'] = true;
            $result['version'] = 0;
            $result['status'] = 'ok';
        } else {
            $result['supported'] = false;
            $result['status'] = 'unknown';
        }
    }

    dnsCacheSet($domain, 'EDNS', $result);
    return $result;
}

// ─── DoH Test (DNS-over-HTTPS) ───────────────────────────────────────────────
function testDoh(string $domain): array
{
    $cached = dnsCacheGet($domain, 'DOH');
    if ($cached) return $cached;

    $result = [
        'supported' => false,
        'response_time' => null,
        'status' => 'unknown',
    ];

    $start = microtime(true);
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5,
            'header' => "Accept: application/dns-json\r\nUser-Agent: ToolHub-DNS/1.0\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
    ]);

    $url = "https://dns.google/resolve?name=" . urlencode($domain) . "&type=A";
    $body = @file_get_contents($url, false, $ctx);

    if ($body !== false) {
        $json = json_decode($body, true);
        if ($json && isset($json['Status']) && $json['Status'] !== 2) {
            $result['supported'] = true;
            $result['status'] = 'ok';
            $result['response_time'] = round((microtime(true) - $start) * 1000);
        }
    }

    if (!$result['supported']) {
        $result['status'] = 'error';
    }

    dnsCacheSet($domain, 'DOH', $result);
    return $result;
}

// ─── DoT Test (DNS-over-TLS) ─────────────────────────────────────────────────
function testDot(string $domain): array
{
    $cached = dnsCacheGet($domain, 'DOT');
    if ($cached) return $cached;

    $result = [
        'supported' => false,
        'response_time' => null,
        'tls_version' => null,
        'status' => 'unknown',
    ];

    // Test connectivity to Cloudflare's DoT resolver
    $start = microtime(true);
    $fp = @fsockopen('tls://1.1.1.1', 853, $errno, $errstr, 5);

    if ($fp) {
        $result['supported'] = true;
        $result['response_time'] = round((microtime(true) - $start) * 1000);
        $result['status'] = 'ok';
        fclose($fp);
    } else {
        $result['status'] = 'error';
    }

    dnsCacheSet($domain, 'DOT', $result);
    return $result;
}

// ─── WHOIS Lookup (RDAP-first, fsockopen fallback) ──────────────────────────
function getWhoisTld(string $domain): string
{
    $parts = explode('.', $domain);
    if (count($parts) >= 3) {
        $tld2 = strtolower($parts[count($parts) - 2] . '.' . $parts[count($parts) - 1]);
        $twoPartTlds = ['co.uk','com.au','co.nz','co.za','com.br','co.in','or.jp','ne.jp','com.cn','com.sg','co.jp','org.uk','net.au'];
        if (in_array($tld2, $twoPartTlds)) return $tld2;
    }
    return strtolower($parts[count($parts) - 1]);
}

function getRdapUrl(string $tld): ?string
{
    $urls = [
        'nl'    => 'https://rdap.sidn.nl/domain/',
        'com'   => 'https://rdap.verisign.com/com/v1/domain/',
        'net'   => 'https://rdap.verisign.com/net/v1/domain/',
        'de'    => 'https://rdap.denic.de/domain/',
        'uk'    => 'https://rdap.nominet.uk/uk/domain/',
        'org'   => 'https://rdap.publicinterestregistry.org/rdap/domain/',
        'info'  => 'https://rdap.afilias-srs.net/v1/domain/',
        'eu'    => null, // rdap.europa.eu unreachable — falls back to HTTP WHOIS + port 43
        'be'    => null,
        'fr'    => 'https://rdap.nic.fr/domain/',
        'it'    => 'https://rdap.nic.it/domain/',
        'es'    => 'https://rdap.nic.es/domain/',
        'at'    => 'https://rdap.nic.at/domain/',
        'ch'    => 'https://rdap.nic.ch/domain/',
        'se'    => 'https://rdap.iis.se/domain/',
        'no'    => 'https://rdap.norid.no/domain/',
        'dk'    => 'https://rdap.dk-hostmaster.dk/domain/',
        'fi'    => 'https://rdap.fi/domain/',
        'pl'    => 'https://rdap.dns.pl/domain/',
        'cz'    => 'https://rdap.nic.cz/domain/',
        'pt'    => 'https://rdap.dns.pt/domain/',
        'ie'    => 'https://rdap.weare.ie/domain/',
        'au'    => 'https://rdap.auda.org.au/domain/',
        'nz'    => 'https://rs.dns.net.nz/rdap/domain/',
        'ca'    => 'https://rdap.cira.ca/domain/',
        'jp'    => 'https://rdap.jprs.jp/domain/',
        'br'    => 'https://rdap.registro.br/domain/',
        'in'    => 'https://rdap.inregistry.net/domain/',
        'sg'    => 'https://rdap.sgnic.sg/domain/',
        'io'    => 'https://rdap.nic.io/domain/',
        'ai'    => 'https://rdap.nic.ai/domain/',
        'xyz'   => 'https://rdap.centralnic.com/xyz/domain/',
        'me'    => 'https://rdap.nic.me/domain/',
        'dev'   => 'https://pubapi.registry.google/rdap/domain/',
        'app'   => 'https://pubapi.registry.google/rdap/domain/',
        'tv'    => 'https://rdap.nic.tv/domain/',
        'cc'    => 'https://rdap.nic.cc/domain/',
        'biz'   => 'https://rdap.nic.biz/domain/',
        'group' => 'https://rdap.identitydigital.services/rdap/domain/',
    ];
    return $urls[strtolower($tld)] ?? null;
}

function parseRdapResponse(array $data): array
{
    $result = [
        'registrar' => null,
        'reseller' => null,
        'reseller_organization' => null,
        'creation_date' => null,
        'expiration_date' => null,
        'updated_date' => null,
        'name_servers' => [],
        'registrant_name' => null,
        'registrant_organization' => null,
        'registrant_country' => null,
        'registrant_state' => null,
        'registrant_city' => null,
        'tech_name' => null,
        'tech_organization' => null,
        'tech_email' => null,
        'billing_name' => null,
        'billing_organization' => null,
        'abuse_email' => null,
        'abuse_phone' => null,
        'domain_status' => [],
        'dnssec' => null,
        'registry_domain_id' => null,
        'domain_age_days' => null,
        'days_until_expiry' => null,
    ];

    // Events: dates
    foreach ($data['events'] ?? [] as $ev) {
        $action = $ev['eventAction'] ?? '';
        $date = $ev['eventDate'] ?? '';
        if (!$date) continue;
        $formatted = date('Y-m-d H:i:s', strtotime($date));
        if ($action === 'registration' && !$result['creation_date']) {
            $result['creation_date'] = $formatted;
        } elseif ($action === 'expiration' && !$result['expiration_date']) {
            $result['expiration_date'] = $formatted;
        } elseif (in_array($action, ['last changed', 'last update of RDAP database']) && !$result['updated_date']) {
            if ($action === 'last changed') $result['updated_date'] = $formatted;
        }
    }

    // Nameservers
    foreach ($data['nameservers'] ?? [] as $ns) {
        $name = strtolower(trim($ns['ldhName'] ?? ''));
        $name = preg_replace('/\.\s*$/', '', $name);
        if ($name && !in_array($name, $result['name_servers'])) {
            $result['name_servers'][] = $name;
        }
    }

    // Statuses
    foreach ($data['status'] ?? [] as $s) {
        $s = trim($s);
        if ($s && !in_array($s, $result['domain_status'])) {
            $result['domain_status'][] = $s;
        }
    }

    // Entities: registrar, reseller, admin, tech, abuse
    foreach ($data['entities'] ?? [] as $ent) {
        $roles = $ent['roles'] ?? [];
        $vcard = $ent['vcardArray'][1] ?? [];

        $fn = '';
        $org = '';
        $email = '';
        $adr = null;
        foreach ($vcard as $vc) {
            if (!is_array($vc) || count($vc) < 4) continue;
            $key = $vc[0];
            $val = $vc[3] ?? '';
            if ($key === 'fn' && is_string($val)) $fn = $val;
            if ($key === 'org' && is_string($val)) $org = $val;
            if ($key === 'email' && is_string($val)) $email = $val;
            if ($key === 'adr' && is_array($val)) $adr = $val;
        }

        // Skip redacted values
        if ($fn && stripos($fn, 'redact') !== false) $fn = '';
        if ($org && stripos($org, 'redact') !== false) $org = '';
        if ($email && stripos($email, 'redact') !== false) $email = '';

        if (in_array('registrar', $roles)) {
            if ($fn) $result['registrar'] = $fn;
        }
        if (in_array('reseller', $roles)) {
            if ($fn && !$result['reseller']) $result['reseller'] = $fn;
            if ($org && !$result['reseller_organization']) $result['reseller_organization'] = $org;
        }
        if (in_array('administrative', $roles) || in_array('registrant', $roles)) {
            if ($fn && !$result['registrant_name']) $result['registrant_name'] = $fn;
            if ($adr) {
                if (!empty($adr[6])) $result['registrant_country'] = $adr[6];
                if (!empty($adr[3])) $result['registrant_state'] = $adr[3];
                if (!empty($adr[2])) $result['registrant_city'] = $adr[2];
            }
        }
        if (in_array('technical', $roles)) {
            if ($fn && !$result['tech_name']) $result['tech_name'] = $fn;
            if ($email && !$result['tech_email']) $result['tech_email'] = $email;
        }
        if (in_array('abuse', $roles)) {
            if ($email && !$result['abuse_email']) $result['abuse_email'] = $email;
        }

        // Nested entities (some RDAP servers nest entities)
        foreach ($ent['entities'] ?? [] as $sub) {
            $subRoles = $sub['roles'] ?? [];
            $subVcard = $sub['vcardArray'][1] ?? [];
            $subFn = '';
            $subOrg = '';
            $subEmail = '';
            foreach ($subVcard as $vc) {
                if (!is_array($vc) || count($vc) < 4) continue;
                if ($vc[0] === 'fn' && is_string($vc[3])) $subFn = $vc[3];
                if ($vc[0] === 'org' && is_string($vc[3])) $subOrg = $vc[3];
                if ($vc[0] === 'email' && is_string($vc[3])) $subEmail = $vc[3];
            }
            if ($subFn && stripos($subFn, 'redact') !== false) $subFn = '';
            if ($subOrg && stripos($subOrg, 'redact') !== false) $subOrg = '';
            if ($subEmail && stripos($subEmail, 'redact') !== false) $subEmail = '';
            if (in_array('abuse', $subRoles)) {
                if ($subEmail && !$result['abuse_email']) $result['abuse_email'] = $subEmail;
            }
            if (in_array('reseller', $subRoles)) {
                if ($subFn && !$result['reseller']) $result['reseller'] = $subFn;
                if ($subOrg && !$result['reseller_organization']) $result['reseller_organization'] = $subOrg;
            }
        }
    }

    // DNSSEC
    $secureDns = $data['secureDNS'] ?? [];
    if (!empty($secureDns['zoneSigned'])) {
        $result['dnssec'] = 'signed';
    } elseif (!empty($secureDns['delegationSigned'])) {
        $result['dnssec'] = 'signedDelegation';
    } elseif (isset($secureDns['dsData']) && is_array($secureDns['dsData']) && count($secureDns['dsData']) > 0) {
        $result['dnssec'] = 'signedDelegation';
    }

    // Calculate domain age and days until expiry
    if ($result['creation_date']) {
        $created = strtotime($result['creation_date']);
        if ($created !== false) {
            $result['domain_age_days'] = (int)round((time() - $created) / 86400);
        }
    }
    if ($result['expiration_date']) {
        $expires = strtotime($result['expiration_date']);
        if ($expires !== false) {
            $result['days_until_expiry'] = (int)round(($expires - time()) / 86400);
        }
    }

    $result['name_servers'] = array_values(array_unique($result['name_servers']));
    $result['domain_status'] = array_values(array_unique($result['domain_status']));

    return $result;
}

function queryRdap(string $domain): ?array
{
    $tld = getWhoisTld($domain);
    $baseUrl = getRdapUrl($tld);
    if (!$baseUrl) return null;

    $url = $baseUrl . $domain;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/rdap+json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || empty($response)) return null;

    $data = json_decode($response, true);
    if (!$data || !isset($data['ldhName'])) return null;

    return parseRdapResponse($data);
}

function getWhoisServer(string $tld): ?string
{
    $servers = [
        'nl'  => 'whois.sidn.nl',
        'com' => 'whois.verisign-grs.com',
        'net' => 'whois.verisign-grs.com',
        'be'  => 'whois.dns.be',
        'de'  => 'whois.denic.de',
        'org' => 'whois.pir.org',
        'eu'  => 'whois.eu',
        'uk'  => 'whois.nic.uk',
        'co.uk' => 'whois.nic.uk',
        'group' => 'whois.nic.group',
        'be'    => 'whois.dns.be',
    ];
    return $servers[strtolower($tld)] ?? null;
}

function queryWhoisServer(string $server, string $domain): ?string
{
    $fp = @fsockopen($server, 43, $errno, $errstr, 10);
    if (!$fp) return null;
    fwrite($fp, "$domain\r\n");
    $raw = '';
    stream_set_timeout($fp, 10);
    while (!feof($fp)) {
        $chunk = fread($fp, 8192);
        if ($chunk === false) break;
        $raw .= $chunk;
    }
    fclose($fp);
    return !empty($raw) ? $raw : null;
}

function queryWhoisHttp(string $domain, string $source = 'whois.com'): ?string
{
    if ($source === 'who.is') {
        $ch = @curl_init("https://who.is/whois/" . urlencode($domain));
        if (!$ch) return null;
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        $html = @curl_exec($ch);
        $code = @curl_getinfo($ch, CURLINFO_HTTP_CODE);
        @curl_close($ch);
        if (!$html || $code !== 200) return null;
        // who.is embeds raw WHOIS in Next.js RSC payload as a text chunk
        if (preg_match('/self\.__next_f\.push\(\[1,"([^"]*% The WHOIS service[^"]*?)"\]\)/s', $html, $m)) {
            $raw = json_decode('"' . $m[1] . '"');
            if ($raw) return $raw;
        }
        // Fallback: check for <pre> tag
        if (preg_match('/<pre[^>]*>(.*?)<\/pre>/is', $html, $m)) {
            $raw = html_entity_decode(trim($m[1]));
            if (!empty($raw)) return $raw;
        }
        return null;
    }

    $ch = @curl_init("https://www.whois.com/whois/" . urlencode($domain));
    if (!$ch) return null;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; DNSLookupSuite/1.0)',
    ]);
    $html = @curl_exec($ch);
    $code = @curl_getinfo($ch, CURLINFO_HTTP_CODE);
    @curl_close($ch);
    if (!$html || $code !== 200) return null;

    if (preg_match('/<pre[^>]*>(.*?)<\/pre>/is', $html, $m)) {
        $raw = html_entity_decode(trim($m[1]));
        return !empty($raw) ? $raw : null;
    }
    return null;
}

function parseWhoisRaw(string $raw): array
{
    $result = [
        'registrar' => null,
        'reseller' => null,
        'reseller_organization' => null,
        'creation_date' => null,
        'expiration_date' => null,
        'updated_date' => null,
        'name_servers' => [],
        'registrant_name' => null,
        'registrant_organization' => null,
        'registrant_country' => null,
        'registrant_state' => null,
        'registrant_city' => null,
        'tech_name' => null,
        'tech_organization' => null,
        'tech_email' => null,
        'billing_name' => null,
        'billing_organization' => null,
        'abuse_email' => null,
        'abuse_phone' => null,
        'domain_status' => [],
        'dnssec' => null,
        'registry_domain_id' => null,
        'domain_age_days' => null,
        'days_until_expiry' => null,
    ];

    $lines = explode("\n", $raw);
    $section = null;
    $sectionLines = 0;

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if (empty($trimmed) || $trimmed[0] === '%' || $trimmed[0] === '#') {
            $section = null;
            $sectionLines = 0;
            continue;
        }

        if (preg_match('/^Registrar:\s*$/i', $trimmed)) {
            $section = 'registrar';
            $sectionLines = 0;
            continue;
        }
        if (preg_match('/^(?:Domain\s+)?[Nn]ame\s*servers?:\s*$/i', $trimmed)) {
            $section = 'nameservers';
            $sectionLines = 0;
            continue;
        }
        if (preg_match('/^Abuse\s+Contact:\s*$/i', $trimmed)) {
            $section = 'abuse_contact';
            $sectionLines = 0;
            continue;
        }
        if (preg_match('/^Registrant:\s*$/i', $trimmed)) {
            $section = 'registrant';
            $sectionLines = 0;
            continue;
        }
        if (preg_match('/^Flags:\s*$/i', $trimmed)) {
            $section = 'flags';
            $sectionLines = 0;
            continue;
        }

        if ($section !== null && preg_match('/^(?:\s{2,}|\t)/', $line)) {
            $val = trim($trimmed);
            $sectionLines++;

            if ($section === 'registrar' && $sectionLines === 1 && !$result['registrar']) {
                $result['registrar'] = preg_replace('/^Name:\s*/i', '', $val);
            } elseif ($section === 'nameservers') {
                $ns = strtolower(preg_replace('/\s+\d[\d.:]+\s*$/', '', $val));
                $ns = preg_replace('/\.\s*$/', '', $ns);
                if ($ns && !in_array($ns, $result['name_servers']) && $ns !== 'removed' && $ns !== 'no nameserver') {
                    $result['name_servers'][] = $ns;
                }
            } elseif ($section === 'abuse_contact') {
                if ($sectionLines === 1 && preg_match('/^[\d.+\-() ]+$/', $val)) {
                    $result['abuse_phone'] = $val;
                } elseif ($sectionLines === 2 || preg_match('/@/', $val)) {
                    if (!$result['abuse_email']) $result['abuse_email'] = $val;
                }
            } elseif ($section === 'registrant' && $sectionLines === 1 && !$result['registrant_name']) {
                $v = $val;
                if (!preg_match('/^not shown/i', $v) && !preg_match('/^data protected/i', $v) && !preg_match('/^redact/i', $v)) {
                    $result['registrant_name'] = $v;
                }
            } elseif ($section === 'flags') {
                if ($val && !in_array($val, $result['domain_status'])) {
                    $result['domain_status'][] = $val;
                }
            }
            continue;
        }

        $section = null;
        $sectionLines = 0;

        if (preg_match('/^(?:Registrar|Sponsoring Registrar):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['registrar']) $result['registrar'] = trim($m[1]);
        } elseif (preg_match('/^(?:Sponsoring Reseller|Registrar Reseller|Reseller):\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) {
                if (!$result['reseller']) $result['reseller'] = $v;
            }
        } elseif (preg_match('/^(?:Reseller\s+Organization|Reseller\s+Name):\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) {
                if (!$result['reseller_organization']) $result['reseller_organization'] = $v;
            }
        } elseif (preg_match('/^(?:Creation Date|Created|Registration Date|Registered|created):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['creation_date']) $result['creation_date'] = trim($m[1]);
        } elseif (preg_match('/^(?:Registry Expiry Date|Expiration Date|Expiry Date|Valid Until|paid-till|expires?):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['expiration_date']) $result['expiration_date'] = trim($m[1]);
        } elseif (preg_match('/^(?:Updated Date|Last Modified|Last Updated|last-updated):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['updated_date']) $result['updated_date'] = trim($m[1]);
        } elseif (preg_match('/^(?:Name Server|nserver|NS):\s*(.+)$/i', $trimmed, $m)) {
            $ns = strtolower(trim(preg_replace('/\s+\[.*\]$/', '', $m[1])));
            $ns = preg_replace('/\.\s*$/', '', $ns);
            if ($ns && !in_array($ns, $result['name_servers']) && $ns !== 'removed' && $ns !== 'no nameserver') {
                $result['name_servers'][] = $ns;
            }
        } elseif (preg_match('/^(?:Domain Status|domain-status):\s*(.+)$/i', $trimmed, $m)) {
            $status = trim($m[1]);
            if ($status && !in_array($status, $result['domain_status'])) {
                $result['domain_status'][] = $status;
            }
        } elseif (preg_match('/^(?:Status|Flags):\s*(.+)$/i', $trimmed, $m)) {
            $status = trim($m[1]);
            if ($status && $status !== 'NOT AVAILABLE' && !in_array($status, $result['domain_status'])) {
                $result['domain_status'][] = $status;
            }
        } elseif (preg_match('/^Registrant(?:\s+Name)?:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && $v !== 'REDACTED FOR PRIVACY' && $v !== 'Data Protected' && stripos($v, 'redact') === false) {
                $result['registrant_name'] = $v;
            }
        } elseif (preg_match('/^Registrant Organization:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && $v !== 'REDACTED FOR PRIVACY' && $v !== 'Data Protected' && stripos($v, 'redact') === false) {
                $result['registrant_organization'] = $v;
            }
        } elseif (preg_match('/^Registrant Country:\s*(.+)$/i', $trimmed, $m)) {
            $result['registrant_country'] = trim($m[1]);
        } elseif (preg_match('/^Registrant State\/Province:\s*(.+)$/i', $trimmed, $m)) {
            $result['registrant_state'] = trim($m[1]);
        } elseif (preg_match('/^Registrant City:\s*(.+)$/i', $trimmed, $m)) {
            $result['registrant_city'] = trim($m[1]);
        } elseif (preg_match('/^Tech(?:nical)? Contact(?:\s+Name)?:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) $result['tech_name'] = $v;
        } elseif (preg_match('/^Tech(?:nical)?\s+Organization:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) $result['tech_organization'] = $v;
        } elseif (preg_match('/^Tech(?:nical)?\s+(?:Contact\s+)?Email:\s*(.+)$/i', $trimmed, $m)) {
            $result['tech_email'] = trim($m[1]);
        } elseif (preg_match('/^Billing(?:\s+Name)?:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) $result['billing_name'] = $v;
        } elseif (preg_match('/^Billing\s+Organization:\s*(.+)$/i', $trimmed, $m)) {
            $v = trim($m[1]);
            if ($v && stripos($v, 'redact') === false) $result['billing_organization'] = $v;
        } elseif (preg_match('/^(?:Abuse(?:\s+Contact)?\s+Email|Abuse-Mailbox):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['abuse_email']) $result['abuse_email'] = trim($m[1]);
        } elseif (preg_match('/^Abuse(?:\s+Contact)?\s+Phone:\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['abuse_phone']) $result['abuse_phone'] = trim($m[1]);
        } elseif (preg_match('/^(?:DNSSEC|dnssec):\s*(.+)$/i', $trimmed, $m)) {
            $result['dnssec'] = trim($m[1]);
        } elseif (preg_match('/^(?:Registry Domain ID|ROID):\s*(.+)$/i', $trimmed, $m)) {
            if (!$result['registry_domain_id']) $result['registry_domain_id'] = trim($m[1]);
        }
    }

    if ($result['creation_date']) {
        $created = strtotime($result['creation_date']);
        if ($created !== false) {
            $result['domain_age_days'] = (int)round((time() - $created) / 86400);
        }
    }
    if ($result['expiration_date']) {
        $expires = strtotime($result['expiration_date']);
        if ($expires !== false) {
            $result['days_until_expiry'] = (int)round(($expires - time()) / 86400);
        }
    }

    $result['name_servers'] = array_values(array_unique($result['name_servers']));
    $result['domain_status'] = array_values(array_unique($result['domain_status']));

    return $result;
}

function queryDnsBelgiumApi(string $domain): ?array
{
    $tld = getWhoisTld($domain);
    if ($tld !== 'be') return null;

    $baseUrl = 'https://api.dnsbelgium.be/whois/registration/';
    $regUrl = $baseUrl . urlencode($domain) . '/registrar';

    $mh = curl_multi_init();
    $h1 = curl_init($baseUrl . urlencode($domain));
    curl_setopt_array($h1, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $h2 = curl_init($regUrl);
    curl_setopt_array($h2, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    curl_multi_add_handle($mh, $h1);
    curl_multi_add_handle($mh, $h2);
    do { curl_multi_exec($mh, $active); if ($active) curl_multi_select($mh, 1); } while ($active);
    $body = curl_multi_getcontent($h1);
    $regBody = curl_multi_getcontent($h2);
    curl_multi_close($mh);
    curl_close($h1);
    curl_close($h2);

    if (empty($body)) return null;

    $data = json_decode($body, true);
    if (!$data || !isset($data['domainInfo'])) return null;

    $result = [];
    $di = $data['domainInfo'];
    $result['creation_date'] = $di['created'] ?? null;
    $result['updated_date'] = $di['updated'] ?? null;
    $result['registry_domain_id'] = $di['alabel'] ?? null;

    // Registrar
    if (!empty($regBody)) {
        $reg = json_decode($regBody, true);
        if (!empty($reg['companyName'])) $result['registrar'] = $reg['companyName'];
    }

    // Nameservers
    $ns = [];
    if (!empty($data['nameserverInfo']['nameservers'])) {
        foreach ($data['nameserverInfo']['nameservers'] as $n) {
            $name = strtolower($n['nameASCII'] ?? $n['name'] ?? '');
            if ($name && !in_array($name, $ns)) $ns[] = $name;
        }
    }
    $result['name_servers'] = $ns;

    // Status flags
    $statuses = [];
    $apiStatus = $di['status'] ?? '';
    if (stripos($apiStatus, 'InUse') !== false) $statuses[] = 'Active';
    if (!empty($data['transferProhibitedStatus'])) {
        if (!empty($data['transferProhibitedStatus']['serverTransferProhibited'])) $statuses[] = 'serverTransferProhibited';
        if (!empty($data['transferProhibitedStatus']['transferProhibited'])) $statuses[] = 'transferProhibited';
        if (!empty($data['transferProhibitedStatus']['maskedClientTransferProhibited'])) $statuses[] = 'clientTransferProhibited';
    }
    $result['domain_status'] = $statuses;

    // Compute age
    if ($result['creation_date']) {
        $created = strtotime($result['creation_date']);
        if ($created !== false) {
            $result['domain_age_days'] = (int)round((time() - $created) / 86400);
        }
    }

    return $result;
}

function whoisLookup(string $domain): array
{
    $cached = dnsCacheGet($domain, 'WHOIS');
    if ($cached) return $cached;

    // .be: use DNSBelgium API directly
    $tld = getWhoisTld($domain);
    if ($tld === 'be') {
        $dbResult = queryDnsBelgiumApi($domain);
        if ($dbResult) {
            $emptyResult = [
                'registrar' => null, 'reseller' => null, 'reseller_organization' => null,
                'creation_date' => null, 'expiration_date' => null,
                'updated_date' => null, 'name_servers' => [], 'registrant_name' => null,
                'registrant_organization' => null, 'registrant_country' => null,
                'registrant_state' => null, 'registrant_city' => null, 'tech_name' => null,
                'tech_organization' => null, 'tech_email' => null, 'billing_name' => null,
                'billing_organization' => null, 'abuse_email' => null, 'abuse_phone' => null,
                'domain_status' => [], 'dnssec' => null, 'registry_domain_id' => null,
                'domain_age_days' => null, 'days_until_expiry' => null, 'whois_server' => 'api.dnsbelgium.be',
                'raw' => null, 'status' => 'ok',
            ];
            foreach ($dbResult as $k => $v) {
                if ($v !== null && $v !== [] && $v !== '') $emptyResult[$k] = $v;
            }
            dnsCacheSet($domain, 'WHOIS', $emptyResult);
            return $emptyResult;
        }
    }

    // .eu: RDAP unreachable, port 43 blocked from web server, whois.com unreliable
    // Use who.is HTTP scraping which embeds raw WHOIS data in the page
    if ($tld === 'eu') {
        $euResult = [
            'registrar' => null, 'reseller' => null, 'reseller_organization' => null,
            'creation_date' => null, 'expiration_date' => null,
            'updated_date' => null, 'name_servers' => [], 'registrant_name' => null,
            'registrant_organization' => null, 'registrant_country' => null,
            'registrant_state' => null, 'registrant_city' => null, 'tech_name' => null,
            'tech_organization' => null, 'tech_email' => null, 'billing_name' => null,
            'billing_organization' => null, 'abuse_email' => null, 'abuse_phone' => null,
            'domain_status' => [], 'dnssec' => null, 'registry_domain_id' => null,
            'domain_age_days' => null, 'days_until_expiry' => null,
            'whois_server' => 'who.is', 'raw' => null, 'status' => 'ok',
        ];
        $raw = queryWhoisHttp($domain, 'who.is');
        if (empty($raw)) $raw = queryWhoisHttp($domain);
        if (!empty($raw)) {
            $euResult['raw'] = mb_substr($raw, 0, 3000);
            $parsed = parseWhoisRaw($raw);
            foreach ($parsed as $k => $v) {
                if ($v !== null && $v !== [] && $v !== '') $euResult[$k] = $v;
            }
        } else {
            $euResult['status'] = 'unavailable';
        }
        dnsCacheSet($domain, 'WHOIS', $euResult);
        return $euResult;
    }

    $emptyResult = [
        'registrar' => null,
        'reseller' => null,
        'reseller_organization' => null,
        'creation_date' => null,
        'expiration_date' => null,
        'updated_date' => null,
        'name_servers' => [],
        'registrant_name' => null,
        'registrant_organization' => null,
        'registrant_country' => null,
        'registrant_state' => null,
        'registrant_city' => null,
        'tech_name' => null,
        'tech_organization' => null,
        'tech_email' => null,
        'billing_name' => null,
        'billing_organization' => null,
        'abuse_email' => null,
        'abuse_phone' => null,
        'domain_status' => [],
        'dnssec' => null,
        'registry_domain_id' => null,
        'domain_age_days' => null,
        'days_until_expiry' => null,
        'whois_server' => null,
        'raw' => null,
        'status' => 'ok',
    ];

    $tld = getWhoisTld($domain);

    // Fire RDAP + HTTP WHOIS in parallel — whichever returns first wins
    $rdapUrl = getRdapUrl($tld);
    $rdapHandle = null;
    $httpHandle = null;
    $mh = curl_multi_init();

    if ($rdapUrl) {
        $rdapHandle = curl_init($rdapUrl . $domain);
        curl_setopt_array($rdapHandle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/rdap+json'],
        ]);
        curl_multi_add_handle($mh, $rdapHandle);
    }

    $httpHandle = curl_init("https://www.whois.com/whois/" . urlencode($domain));
    curl_setopt_array($httpHandle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; DNSLookupSuite/1.0)',
    ]);
    curl_multi_add_handle($mh, $httpHandle);

    // Run both until one finishes, max 5s total
    do {
        $status = curl_multi_exec($mh, $active);
        if ($active) curl_multi_select($mh, 1);
    } while ($active && $status === CURLM_OK);

    // Check RDAP first
    $rdapParsed = null;
    if ($rdapHandle) {
        $rdapCode = curl_getinfo($rdapHandle, CURLINFO_HTTP_CODE);
        $rdapBody = curl_multi_getcontent($rdapHandle);
        if ($rdapCode === 200 && !empty($rdapBody)) {
            $data = json_decode($rdapBody, true);
            if ($data && isset($data['ldhName'])) {
                $rdapParsed = parseRdapResponse($data);
            }
        }
        curl_multi_remove_handle($mh, $rdapHandle);
        curl_close($rdapHandle);
    }

    if ($rdapParsed && ($rdapParsed['registrar'] || $rdapParsed['creation_date'] || $rdapParsed['name_servers'])) {
        $result = array_merge($emptyResult, $rdapParsed);
        $result['whois_server'] = 'rdap.' . $tld;
        $result['raw'] = null;
        curl_multi_close($mh);
        dnsCacheSet($domain, 'WHOIS', $result);
        return $result;
    }

    // RDAP failed — use HTTP WHOIS result (already fetched in parallel)
    $raw = null;
    if ($httpHandle) {
        $httpCode = curl_getinfo($httpHandle, CURLINFO_HTTP_CODE);
        $html = curl_multi_getcontent($httpHandle);
        if ($httpCode === 200 && !empty($html)) {
            if (preg_match('/<pre[^>]*>(.*?)<\/pre>/is', $html, $m)) {
                $raw = html_entity_decode(trim($m[1]));
            }
        }
        curl_multi_remove_handle($mh, $httpHandle);
        curl_close($httpHandle);
    }
    curl_multi_close($mh);

    if ($raw) $emptyResult['whois_server'] = 'whois.com (HTTP)';

    // Last resort: try system whois or port 43
    if (!$raw && function_exists('shell_exec')) {
        $tldServer = getWhoisServer($tld);
        if ($tldServer) {
            $emptyResult['whois_server'] = $tldServer;
            $raw = queryWhoisServer($tldServer, $domain);
        }
    }

    if (!empty($raw)) {
        $emptyResult['raw'] = mb_substr($raw, 0, 3000);
        $parsed = parseWhoisRaw($raw);
        foreach ($parsed as $k => $v) {
            if ($v !== null && $v !== [] && $v !== '') {
                $emptyResult[$k] = $v;
            }
        }
    } else {
        $emptyResult['status'] = 'unavailable';
    }

    dnsCacheSet($domain, 'WHOIS', $emptyResult);
    return $emptyResult;
}

// ─── Propagation Check ────────────────────────────────────────────────────────
function checkPropagation(string $domain): array
{
    $cached = dnsCacheGet($domain, 'PROPAGATION');
    if ($cached) return $cached;

    $resolvers = [
        ['name' => 'Google', 'ip' => '8.8.8.8', 'location' => 'Global'],
        ['name' => 'Cloudflare', 'ip' => '1.1.1.1', 'location' => 'Global'],
        ['name' => 'Quad9', 'ip' => '9.9.9.9', 'location' => 'Global'],
        ['name' => 'OpenDNS', 'ip' => '208.67.222.222', 'location' => 'Global'],
        ['name' => 'Level3', 'ip' => '4.2.2.1', 'location' => 'US'],
        ['name' => 'Comodo', 'ip' => '8.26.56.26', 'location' => 'US'],
        ['name' => 'Verisign', 'ip' => '64.6.64.6', 'location' => 'US'],
        ['name' => 'SafeDNS', 'ip' => '195.46.39.39', 'location' => 'EU'],
        ['name' => 'GreenTeam', 'ip' => '81.218.119.11', 'location' => 'Middle East'],
        ['name' => 'OpenNIC', 'ip' => '185.121.177.177', 'location' => 'EU'],
    ];

    $result = [
        'resolvers' => [],
        'consistent' => true,
        'warnings' => [],
        'status' => 'ok',
    ];

    $firstIps = null;
    $digPath = function_exists('shell_exec') ? trim(@shell_exec('which dig 2>/dev/null') ?? '') : '';

    foreach ($resolvers as $resolver) {
        $start = microtime(true);
        $response = null;
        $responseTime = null;
        $error = null;

        if ($digPath) {
            $output = @shell_exec("dig @{$resolver['ip']} $domain A +short +timeout=3 +tries=1 2>/dev/null");
            $output = trim($output ?? '');
            // Filter out dig error messages (timeouts, SERVFAIL, etc.)
            if ($output !== '' && !str_starts_with($output, ';') && stripos($output, 'timed out') === false && stripos($output, 'connection') === false) {
                $lines = array_values(array_filter(explode("\n", $output)));
                // Only accept lines that look like IP addresses or hostnames
                $valid = array_filter($lines, fn($l) => preg_match('/^[\d.:]+$/', trim($l)) || preg_match('/^[a-z0-9][a-z0-9.\-]+$/i', trim($l)));
                if (!empty($valid)) {
                    $response = array_values($valid);
                    $responseTime = round((microtime(true) - $start) * 1000);
                } else {
                    $error = 'Empty response';
                }
            } else {
                $error = $output !== '' ? 'Timeout' : 'No response';
            }
        } else {
            // Fallback: use raw UDP DNS query when dig binary is not available
            $nsResult = queryNameserver($resolver['ip'], $domain, DNS_A);
            if (isset($nsResult['answers']) && !empty($nsResult['answers'])) {
                $response = $nsResult['answers'];
                $responseTime = round((microtime(true) - $start) * 1000);
            } else {
                $error = $nsResult['error'] ?? 'Query failed';
            }
        }

        $entry = [
            'name' => $resolver['name'],
            'ip' => $resolver['ip'],
            'location' => $resolver['location'],
            'response' => $response,
            'response_time' => $responseTime,
            'error' => $error,
        ];

        $result['resolvers'][] = $entry;

        if ($response !== null && $firstIps === null) {
            $firstIps = $response;
        } elseif ($response !== null && $firstIps !== null) {
            sort($response);
            sort($firstIps);
            if ($response !== $firstIps) {
                $result['consistent'] = false;
            }
        }
    }

    if (!$result['consistent']) {
        $result['warnings'][] = 'Inconsistent DNS responses detected across resolvers — possible propagation delay';
    }

    dnsCacheSet($domain, 'PROPAGATION', $result);
    return $result;
}

// ─── Calculate Health Score ──────────────────────────────────────────────────
function calculateHealthScore(array $results): array
{
    $score = 100;
    $totalWarnings = 0;
    $errors = 0;

    $getStatus = fn(string $key) => $results[$key]['status'] ?? 'error';
    $getWarnings = fn(string $key) => is_array($results[$key]['warnings'] ?? null) ? count($results[$key]['warnings']) : 0;

    // A record
    if ($getStatus('a') === 'empty') {
        $score -= 10;
        $errors++;
    }

    // MX
    if ($getStatus('mx') === 'empty') {
        $score -= 15;
        $errors++;
    }
    $totalWarnings += $getWarnings('mx');

    // SPF
    if (!($results['spf']['exists'] ?? false)) {
        $score -= 10;
        $errors++;
    }
    if ($results['spf']['excessive_lookups'] ?? false) {
        $score -= 10;
        $errors++;
    }

    // DMARC
    if (!($results['dmarc']['exists'] ?? false)) {
        $score -= 5;
        $totalWarnings++;
    }

    // NS
    if ($getStatus('ns') === 'empty') {
        $score -= 20;
        $errors++;
    }
    $totalWarnings += $getWarnings('ns');

    // Delegation
    if (!($results['delegation']['match'] ?? false)) {
        $score -= 10;
        $errors++;
    }
    $totalWarnings += $getWarnings('delegation');

    // CNAME validation
    if ($getStatus('cname') === 'error') {
        $score -= 10;
        $errors++;
    }
    if (($results['cname']['count'] ?? 0) > 0 && !($results['cname']['resolves'] ?? false)) {
        $score -= 5;
        $errors++;
    }

    // SOA
    $totalWarnings += $getWarnings('soa');

    // DNSSEC
    if (!($results['dnssec']['enabled'] ?? false)) {
        $score -= 5;
        $totalWarnings++;
    }

    // Reverse DNS
    $totalWarnings += $getWarnings('reverse_dns');

    // Warnings penalty
    $score -= min(20, $totalWarnings * 2);

    $score = max(0, min(100, $score));

    return [
        'score' => $score,
        'grade' => $score >= 90 ? 'A' : ($score >= 80 ? 'B' : ($score >= 70 ? 'C' : ($score >= 50 ? 'D' : 'F'))),
        'warnings' => $totalWarnings,
        'errors' => $errors,
    ];
}

// ─── Main Execution ──────────────────────────────────────────────────────────
ignore_user_abort(true);
set_time_limit(0);
$startTime = microtime(true);
$quickMode = !empty($_GET['quick']);

// Run all checks
$result = [];

try { $result['a'] = getARecords($domain); } catch (Throwable $e) {
    $result['a'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['subdomains'] = getSubdomains($domain); } catch (Throwable $e) {
    $result['subdomains'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['aaaa'] = getAaaaRecords($domain); } catch (Throwable $e) {
    $result['aaaa'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['cname'] = getCnameRecords($domain); } catch (Throwable $e) {
    $result['cname'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['mx'] = getMxRecords($domain); } catch (Throwable $e) {
    $result['mx'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['txt'] = getTxtRecords($domain); } catch (Throwable $e) {
    $result['txt'] = ['status' => 'error', 'error' => $e->getMessage()];
}

if (!$quickMode) {
    try { $result['caa'] = getCaaRecords($domain); } catch (Throwable $e) {
        $result['caa'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
    try { $result['srv'] = getSrvRecords($domain); } catch (Throwable $e) {
        $result['srv'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
} else {
    $result['caa'] = ['status' => 'skipped'];
    $result['srv'] = ['status' => 'skipped'];
}

try { $result['soa'] = getSoaRecord($domain); } catch (Throwable $e) {
    $result['soa'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['spf'] = validateSpf($domain, $result['txt']); } catch (Throwable $e) {
    $result['spf'] = ['status' => 'error', 'error' => $e->getMessage()];
}

if (!$quickMode) {
    try { $result['dkim'] = validateDkim($domain); } catch (Throwable $e) {
        $result['dkim'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
} else {
    $result['dkim'] = ['status' => 'skipped', 'selectors' => [], 'found_selectors' => [], 'count' => 0];
}

try { $result['dmarc'] = validateDmarc($domain); } catch (Throwable $e) {
    $result['dmarc'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['ns'] = getNameservers($domain); } catch (Throwable $e) {
    $result['ns'] = ['status' => 'error', 'error' => $e->getMessage()];
}

if (!$quickMode) {
    try { $result['delegation'] = checkDelegation($domain, $result['ns']); } catch (Throwable $e) {
        $result['delegation'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
} else {
    $result['delegation'] = ['status' => 'skipped'];
}

try { $result['reverse_dns'] = getReverseDns($domain); } catch (Throwable $e) {
    $result['reverse_dns'] = ['status' => 'error', 'error' => $e->getMessage(), 'ptr_records' => [], 'a_records' => [], 'fcrdns' => [], 'mismatches' => []];
}

if (!$quickMode) {
    try { $result['dnssec'] = checkDnssec($domain); } catch (Throwable $e) {
        $result['dnssec'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
    try { $result['edns'] = testEdns($domain); } catch (Throwable $e) {
        $result['edns'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
    try { $result['doh'] = testDoh($domain); } catch (Throwable $e) {
        $result['doh'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
    try { $result['dot'] = testDot($domain); } catch (Throwable $e) {
        $result['dot'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
} else {
    // DNSSEC is always checked (even in quick mode) — it's cheap and ensures
    // the On/Off status matches reality regardless of WHOIS DNSSEC reporting.
    try { $result['dnssec'] = checkDnssec($domain); } catch (Throwable $e) {
        $result['dnssec'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
    $result['edns'] = ['status' => 'skipped'];
    $result['doh'] = ['status' => 'skipped'];
    $result['dot'] = ['status' => 'skipped'];
}

try { $result['whois'] = whoisLookup($domain); } catch (Throwable $e) {
    $result['whois'] = ['status' => 'error', 'error' => $e->getMessage()];
}

try { $result['ssl'] = checkSsl($domain); } catch (Throwable $e) {
    $result['ssl'] = ['status' => 'error', 'root' => null, 'www' => null];
}

// If WHOIS says DNSSEC is enabled but DNS check missed it (DS records live at
// parent zone and may not be returned by direct query), trust WHOIS.
if (isset($result['whois']['dnssec']) && preg_match('/^(?:yes|true|active|signed|signeddelegation|enabled|delegationsigned|1)$/i', $result['whois']['dnssec'])) {
    if (!($result['dnssec']['enabled'] ?? false)) {
        $result['dnssec']['enabled'] = true;
        $result['dnssec']['status'] = 'ok';
    }
}

if (!$quickMode) {
    try { $result['propagation'] = checkPropagation($domain); } catch (Throwable $e) {
        $result['propagation'] = ['status' => 'error', 'error' => $e->getMessage()];
    }

    // Nameserver dig — query each authoritative NS directly to check propagation
    try {
        $nsDig = ['results' => [], 'status' => 'empty'];
        $nameservers = $result['ns']['nameservers'] ?? [];
        if (!empty($nameservers)) {
            foreach ($nameservers as $ns) {
                // Resolve the nameserver's IP first
                $nsIp = @gethostbyname($ns);
                if ($nsIp === $ns) continue; // resolution failed
                $aResult = queryNameserver($nsIp, $domain, 1);
                $aaaaResult = queryNameserver($nsIp, $domain, 28);
                $nsDig['results'][] = [
                    'nameserver' => $ns,
                    'ip' => $nsIp,
                    'a' => $aResult,
                    'aaaa' => $aaaaResult,
                ];
            }
            $nsDig['status'] = 'ok';
        }
        $result['ns_dig'] = $nsDig;
    } catch (Throwable $e) {
        $result['ns_dig'] = ['status' => 'error', 'error' => $e->getMessage()];
    }
} else {
    $result['propagation'] = ['status' => 'skipped', 'resolvers' => [], 'consistent' => true];
    $result['ns_dig'] = ['status' => 'skipped', 'results' => []];
}

// Health score
$result['health'] = calculateHealthScore($result);

// Save to history
saveHistory($domain);

// Response
$result['domain'] = $domain;
$result['query_time'] = gmdate('c');
$result['duration_ms'] = round((microtime(true) - $startTime) * 1000);

Response::success($result);
