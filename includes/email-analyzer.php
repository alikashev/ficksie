<?php
/**
 * Email Analyzer
 *
 * Analyzes a parsed email for deliverability, authentication, content quality,
 * and spam-related signals. Produces a score (0-100) and detailed findings.
 *
 * Scoring model (aligned with mail-tester.com / lolwuz.nl):
 *   Authentication (SPF/DKIM/DMARC/Alignment) = ~50 points
 *   Network (PTR, TLS, HELO, Blocklists)      = ~20 points
 *   Message Structure                          = ~15 points
 *   Content Quality                            = ~15 points
 */

class EmailAnalyzer
{
    private EmailParser $parser;
    private array $findings = [];
    private int $score = 100;
    private array $categories = [];

    public function __construct(EmailParser $parser)
    {
        $this->parser = $parser;
    }

    public function analyze(): array
    {
        $this->findings = [];
        $this->score = 100;
        $this->categories = [
            'authentication' => ['label' => 'Authentication', 'checks' => []],
            'network' => ['label' => 'Network & Delivery', 'checks' => []],
            'message' => ['label' => 'Message Structure', 'checks' => []],
            'content' => ['label' => 'Content Quality', 'checks' => []],
            'links' => ['label' => 'Links & URLs', 'checks' => []],
        ];

        $this->analyzeAuthentication();
        $this->analyzeNetwork();
        $this->analyzeMessageStructure();
        $this->analyzeContent();
        $this->analyzeLinks();

        $this->score = max(0, min(100, $this->score));

        $grade = match (true) {
            $this->score >= 90 => 'Excellent',
            $this->score >= 75 => 'Good',
            $this->score >= 50 => 'Fair',
            $this->score >= 25 => 'Poor',
            default => 'Critical',
        };

        $passed = [];
        $warnings = [];
        $errors = [];
        foreach ($this->findings as $f) {
            if ($f['status'] === 'pass') $passed[] = $f;
            elseif ($f['status'] === 'warning') $warnings[] = $f;
            elseif ($f['status'] === 'fail') $errors[] = $f;
        }

        $summary = $this->generateSummary($passed, $warnings, $errors);

        return [
            'score' => $this->score,
            'grade' => $grade,
            'summary' => $summary,
            'passed' => $passed,
            'warnings' => $warnings,
            'errors' => $errors,
            'categories' => $this->categories,
            'findings' => $this->findings,
        ];
    }

    private function addFinding(string $category, string $title, string $status, string $message, ?string $detail = null): void
    {
        $finding = [
            'category' => $category,
            'title' => $title,
            'status' => $status,
            'message' => $message,
            'detail' => $detail,
        ];
        $this->findings[] = $finding;

        if (isset($this->categories[$category])) {
            $this->categories[$category]['checks'][] = $finding;
        }
    }

    private function deduct(int $weight, string $category, string $check): void
    {
        $this->score -= $weight;
    }

    // ─── Authentication ─────────────────────────────────────────────────

    private function analyzeAuthentication(): void
    {
        $this->analyzeSpf();
        $this->analyzeDkim();
        $this->analyzeDmarc();
        $this->analyzeAlignment();
    }

    private function analyzeSpf(): void
    {
        $spfHeader = $this->parser->getHeaderValue('received-spf');
        $authResults = $this->parser->getHeaderValue('authentication-results') ?? '';

        $spfResult = null;
        if ($spfHeader) {
            $spfLower = strtolower($spfHeader);
            if (str_starts_with($spfLower, 'pass')) $spfResult = 'pass';
            elseif (str_starts_with($spfLower, 'fail')) $spfResult = 'fail';
            elseif (str_starts_with($spfLower, 'softfail')) $spfResult = 'softfail';
            elseif (str_starts_with($spfLower, 'neutral')) $spfResult = 'neutral';
            elseif (str_starts_with($spfLower, 'none')) $spfResult = 'none';
            else $spfResult = 'unknown';
        }

        if (!$spfResult && preg_match('/spf=(\w+)/i', $authResults, $m)) {
            $spfResult = strtolower($m[1]);
        }

        if (!$spfResult) {
            $arcAuth = $this->parser->getHeaderValue('arc-authentication-results') ?? '';
            if (preg_match('/spf=(\w+)/i', $arcAuth, $m)) {
                $arcVal = strtolower($m[1]);
                if ($arcVal !== 'none' && $arcVal !== 'unknown') {
                    $spfResult = $arcVal;
                }
            }
        }

        $fromDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['from'] ?? '');

        $senderIp = null;
        $envelopeFrom = null;
        $helo = null;
        if ($spfHeader) {
            if (preg_match('/\bip=([a-fA-F0-9.:]+)/', $spfHeader, $m)) $senderIp = $m[1];
            if (preg_match('/\benvelope-from=(\S+)/i', $spfHeader, $m)) $envelopeFrom = $m[1];
            if (preg_match('/\bhelo=(\S+)/i', $spfHeader, $m)) $helo = $m[1];
        }

        $spfRecord = null;
        if ($fromDomain) {
            $records = @dns_get_record($fromDomain, DNS_TXT);
            if (!empty($records)) {
                foreach ($records as $rec) {
                    $txt = $rec['txt'] ?? '';
                    if (stripos($txt, 'v=spf1') === 0) {
                        $spfRecord = $txt;
                        break;
                    }
                }
            }
        }

        if ($spfResult === 'pass') {
            $this->addFinding('authentication', 'SPF', 'pass', 'Sender Policy Framework passed.', 'Domain: ' . ($fromDomain ?: 'unknown'));
        } elseif ($spfResult === 'fail') {
            $this->addFinding('authentication', 'SPF', 'fail', 'SPF authentication failed.', $spfHeader);
            $this->deduct(25, 'authentication', 'spf');
        } elseif ($spfResult === 'softfail') {
            $this->addFinding('authentication', 'SPF', 'warning', 'SPF softfail.', $spfHeader);
            $this->deduct(8, 'authentication', 'spf');
        } elseif ($spfResult === 'neutral') {
            $this->addFinding('authentication', 'SPF', 'pass', 'SPF neutral.', $spfHeader);
        } elseif ($spfResult === 'none') {
            $this->addFinding('authentication', 'SPF', 'fail', 'No SPF record found.', 'Add a TXT record for ' . ($fromDomain ?: 'your domain') . ' with SPF information.');
            $this->deduct(20, 'authentication', 'spf');
        } else {
            $this->addFinding('authentication', 'SPF', 'warning', 'SPF result could not be determined.', $spfHeader);
            $this->deduct(2, 'authentication', 'spf');
        }

        $this->categories['authentication']['spf'] = [
            'result' => $spfResult,
            'domain' => $fromDomain,
            'raw' => $spfHeader,
            'spf_record' => $spfRecord,
            'sender_ip' => $senderIp,
            'envelope_from' => $envelopeFrom,
            'helo' => $helo,
        ];
    }

    private function analyzeDkim(): void
    {
        $dkimSig = $this->parser->getHeaderValue('dkim-signature');
        $authResults = $this->parser->getHeaderValue('authentication-results') ?? '';

        $dkimResult = null;
        $dkimDomain = null;
        $dkimSelector = null;
        $algorithm = null;
        $canonicalization = null;

        if ($dkimSig) {
            if (preg_match('/d=([a-zA-Z0-9._-]+)/i', $dkimSig, $m)) {
                $dkimDomain = strtolower($m[1]);
            }
            if (preg_match('/s=([a-zA-Z0-9._-]+)/i', $dkimSig, $m)) {
                $dkimSelector = strtolower($m[1]);
            }
            if (preg_match('/a=([a-zA-Z0-9._-]+)/i', $dkimSig, $m)) {
                $algorithm = strtolower($m[1]);
            }
            if (preg_match('/c=([a-zA-Z0-9._\/-]+)/i', $dkimSig, $m)) {
                $canonicalization = strtolower($m[1]);
            }
        }

        if (preg_match('/dkim=(\w+)/i', $authResults, $m)) {
            $dkimResult = strtolower($m[1]);
        }

        if (!$dkimResult) {
            $arcAuth = $this->parser->getHeaderValue('arc-authentication-results') ?? '';
            if (preg_match('/dkim=(\w+)/i', $arcAuth, $m)) {
                $arcVal = strtolower($m[1]);
                if ($arcVal !== 'none') {
                    $dkimResult = $arcVal;
                }
            }
        }

        $xParamResult = $this->parser->getHeaderValue('x-ficksie-dkim-log');
        if ($xParamResult && !$dkimResult) {
            if (preg_match('/^(\w+)/', $xParamResult, $m) && preg_match('/domain=(\S+)/i', $xParamResult, $dm)) {
                $dkimResult = strtolower($m[1]);
                if (!$dkimDomain) $dkimDomain = strtolower($dm[1]);
            }
        }

        $keyFound = false;
        $cryptoVerified = false;
        if ($dkimSig && $dkimDomain && $dkimSelector) {
            $pubKey = $this->fetchDkimPublicKey($dkimDomain, $dkimSelector);
            $keyFound = $pubKey !== null;
            $cryptoVerified = $this->verifyDkimSignature($dkimSig, $dkimDomain, $dkimSelector);
        }

        if ($dkimResult === 'pass' || $cryptoVerified) {
            $detail = 'Signing domain: ' . ($dkimDomain ?: 'unknown');
            if ($cryptoVerified) {
                $detail .= ' | Cryptographically verified';
            }
            $this->addFinding('authentication', 'DKIM', 'pass', 'DKIM signature validated successfully.', $detail);
        } elseif ($dkimResult === 'fail' && !$cryptoVerified) {
            $this->addFinding('authentication', 'DKIM', 'fail', 'DKIM signature validation failed.', 'Domain: ' . ($dkimDomain ?: 'unknown'));
            $this->deduct(25, 'authentication', 'dkim');
        } elseif ($dkimSig) {
            if ($cryptoVerified) {
                $this->addFinding('authentication', 'DKIM', 'pass', 'DKIM signature present and cryptographically verified.', 'Signing domain: ' . ($dkimDomain ?: 'unknown'));
            } else {
                $this->addFinding('authentication', 'DKIM', 'pass', 'DKIM signature present and signed by ' . ($dkimDomain ?: 'unknown') . '.', 'Signature present; cryptographic verification not performed by receiving server.');
            }
        } else {
            $this->addFinding('authentication', 'DKIM', 'warning', 'No DKIM signature found.', 'The sending domain should configure DKIM signing.');
            $this->deduct(5, 'authentication', 'dkim');
        }

        $this->categories['authentication']['dkim'] = [
            'result' => $dkimResult,
            'domain' => $dkimDomain,
            'selector' => $dkimSelector,
            'has_signature' => $dkimSig !== null,
            'crypto_verified' => $cryptoVerified,
            'algorithm' => $algorithm,
            'canonicalization' => $canonicalization,
            'key_found' => $keyFound,
        ];
    }

    private function analyzeDmarc(): void
    {
        $authResults = $this->parser->getHeaderValue('authentication-results') ?? '';
        $dmarcResult = null;

        if (preg_match('/dmarc=(\w+)/i', $authResults, $m)) {
            $dmarcResult = strtolower($m[1]);
        }

        if (!$dmarcResult) {
            $arcAuth = $this->parser->getHeaderValue('arc-authentication-results') ?? '';
            if (preg_match('/dmarc=(\w+)/i', $arcAuth, $m)) {
                $arcVal = strtolower($m[1]);
                if ($arcVal !== 'none') {
                    $dmarcResult = $arcVal;
                }
            }
        }

        $fromDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['from'] ?? '');

        $dmarcRecord = null;
        $policy = null;
        $subdomainPolicy = null;
        $rua = null;
        $ruf = null;
        $adkim = null;
        $aspf = null;

        if ($fromDomain) {
            $records = @dns_get_record('_dmarc.' . $fromDomain, DNS_TXT);
            if (!empty($records)) {
                foreach ($records as $rec) {
                    $txt = $rec['txt'] ?? '';
                    if (stripos($txt, 'v=DMARC1') === 0 || stripos($txt, 'v=DMARC1;') !== false) {
                        $dmarcRecord = $txt;
                        if (preg_match('/;\s*p=(\w+)/i', $txt, $m)) $policy = strtolower($m[1]);
                        if (preg_match('/;\s*sp=(\w+)/i', $txt, $m)) $subdomainPolicy = strtolower($m[1]);
                        if (preg_match('/;\s*rua=mailto:([^\s;]+)/i', $txt, $m)) $rua = $m[1];
                        if (preg_match('/;\s*ruf=mailto:([^\s;]+)/i', $txt, $m)) $ruf = $m[1];
                        if (preg_match('/;\s*adkim=([a-z]+)/i', $txt, $m)) $adkim = strtolower($m[1]);
                        if (preg_match('/;\s*aspf=([a-z]+)/i', $txt, $m)) $aspf = strtolower($m[1]);
                        break;
                    }
                }
            }
        }

        if ($dmarcResult === 'pass') {
            $this->addFinding('authentication', 'DMARC', 'pass', 'DMARC policy check passed.', 'Domain: ' . ($fromDomain ?: 'unknown'));
        } elseif ($dmarcResult === 'fail') {
            $this->addFinding('authentication', 'DMARC', 'fail', 'DMARC check failed.', 'Configure a DMARC policy for ' . ($fromDomain ?: 'your domain') . '.');
            $this->deduct(15, 'authentication', 'dmarc');
        } elseif ($dmarcResult === 'none') {
            $this->addFinding('authentication', 'DMARC', 'pass', 'DMARC policy set to none (monitoring mode).', 'Consider upgrading to p=quarantine or p=reject.');
        } elseif ($dmarcResult) {
            $this->addFinding('authentication', 'DMARC', 'pass', 'DMARC result: ' . $dmarcResult, null);
        } else {
            $this->addFinding('authentication', 'DMARC', 'warning', 'No DMARC result found.', 'Configure DMARC for ' . ($fromDomain ?: 'your domain') . '.');
            $this->deduct(5, 'authentication', 'dmarc');
        }

        $this->categories['authentication']['dmarc'] = [
            'result' => $dmarcResult,
            'domain' => $fromDomain,
            'dmarc_record' => $dmarcRecord,
            'policy' => $policy,
            'subdomain_policy' => $subdomainPolicy,
            'rua' => $rua,
            'ruf' => $ruf,
            'adkim' => $adkim,
            'aspf' => $aspf,
        ];
    }

    private function analyzeAlignment(): void
    {
        $fromDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['from'] ?? '');
        if (!$fromDomain) {
            $this->addFinding('authentication', 'DMARC Alignment', 'warning', 'Cannot check alignment — From domain not available.', null);
            return;
        }

        $authResults = $this->parser->getHeaderValue('authentication-results') ?? '';
        $spfDomain = null;
        $dkimDomain = null;

        if (preg_match('/header\.from=([a-zA-Z0-9._-]+)/i', $authResults, $m)) {
            $spfDomain = strtolower($m[1]);
        }
        if (preg_match('/header\.d=([a-zA-Z0-9._-]+)/i', $authResults, $m)) {
            $dkimDomain = strtolower($m[1]);
        }

        $spfAligned = false;
        $dkimAligned = false;

        if ($spfDomain) {
            $spfAligned = $this->checkAlignment($fromDomain, $spfDomain);
        }
        if ($dkimDomain) {
            $dkimAligned = $this->checkAlignment($fromDomain, $dkimDomain);
        }

        $this->categories['authentication']['alignment'] = [
            'from_domain' => $fromDomain,
            'spf_domain' => $spfDomain,
            'dkim_domain' => $dkimDomain,
            'spf_aligned' => $spfAligned,
            'dkim_aligned' => $dkimAligned,
        ];

        if ($spfAligned || $dkimAligned) {
            $alignedVia = $spfAligned && $dkimAligned ? 'SPF and DKIM' : ($spfAligned ? 'SPF' : 'DKIM');
            $this->addFinding('authentication', 'DMARC Alignment', 'pass', "DMARC alignment passed via {$alignedVia}.", "From: {$fromDomain}");
        } else {
            $dmarcResult = $this->categories['authentication']['dmarc']['result'] ?? null;
            if ($dmarcResult === 'pass') {
                $this->addFinding('authentication', 'DMARC Alignment', 'pass', 'DMARC alignment passed (determined by receiving server).', null);
            } else {
                $this->addFinding('authentication', 'DMARC Alignment', 'warning', 'DMARC alignment could not be verified from headers.', 'SPF: ' . ($spfDomain ?: 'none') . ', DKIM: ' . ($dkimDomain ?: 'none'));
                $this->deduct(3, 'authentication', 'alignment');
            }
        }
    }

    private function checkAlignment(string $fromDomain, string $authDomain): bool
    {
        $fromDomain = strtolower($fromDomain);
        $authDomain = strtolower($authDomain);

        if ($fromDomain === $authDomain) return true;

        $fromParts = explode('.', $fromDomain);
        $authParts = explode('.', $authDomain);

        if (count($fromParts) < 2 || count($authParts) < 2) return false;

        $fromOrg = implode('.', array_slice($fromParts, -2));
        $authOrg = implode('.', array_slice($authParts, -2));

        return $fromOrg === $authOrg;
    }

    // ─── DKIM Cryptographic Verification ───────────────────────────────

    private function verifyDkimSignature(string $dkimSigHeader, string $domain, string $selector): bool
    {
        try {
            $sigParts = $this->parseDkimSignature($dkimSigHeader);
            if (!$sigParts) return false;

            $publicKey = $this->fetchDkimPublicKey($domain, $selector);
            if (!$publicKey) return false;

            $algorithm = strtoupper($sigParts['a'] ?? 'rsa-sha256');
            $hashAlgo = str_contains($algorithm, 'SHA256') ? 'sha256' : 'sha1';

            $bodyHash = $this->computeBodyHash($sigParts['c'] ?? 'simple', $hashAlgo);
            if ($bodyHash === false) return false;

            $expectedBh = base64_decode($sigParts['bh'] ?? '');
            if ($bodyHash !== $expectedBh) return false;

            $signedData = $this->buildSignedData($sigParts, $hashAlgo);
            if ($signedData === false) return false;

            $signature = base64_decode($sigParts['b'] ?? '');
            if (empty($signature)) return false;

            $pubKeyPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split($publicKey, 64, "\n") . "-----END PUBLIC KEY-----\n";
            $result = openssl_verify($signedData, $signature, $pubKeyPem, $hashAlgo);

            return $result === 1;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function parseDkimSignature(string $header): ?array
    {
        $header = trim($header);
        if (stripos($header, 'DKIM-Signature:') === 0) {
            $header = trim(substr($header, 16));
        }

        $parts = [];
        $currentKey = '';
        $currentValue = '';

        $tokens = preg_split('/;\s*/', $header);
        foreach ($tokens as $token) {
            $token = trim($token);
            if (preg_match('/^([a-zA-Z]+)=(.*)$/', $token, $m)) {
                if ($currentKey !== '') {
                    $parts[strtolower($currentKey)] = trim($currentValue);
                }
                $currentKey = $m[1];
                $currentValue = $m[2];
            } else {
                $currentValue .= ' ' . $token;
            }
        }
        if ($currentKey !== '') {
            $parts[strtolower($currentKey)] = trim($currentValue);
        }

        if (empty($parts['d']) || empty($parts['s']) || empty($parts['b'])) {
            return null;
        }

        return $parts;
    }

    private function fetchDkimPublicKey(string $domain, string $selector): ?string
    {
        $dnsQuery = "{$selector}._domainkey.{$domain}";
        $records = @dns_get_record($dnsQuery, DNS_TXT);

        if (empty($records)) {
            return null;
        }

        $dkimParts = [];
        foreach ($records as $record) {
            $line = trim($record['txt'] ?? '');
            if ($line === '') continue;
            if (str_contains($line, 'v=DKIM1') || str_contains($line, 'v=dkim1') || preg_match('/\bk=rsa/i', $line) || preg_match('/\bp=[A-Za-z0-9+\/=]/', $line)) {
                $dkimParts[] = $line;
            }
        }

        if (empty($dkimParts)) return null;

        $txtRecord = implode('', $dkimParts);

        if (preg_match('/\bk=(\w+)/i', $txtRecord, $km)) {
            $keyType = strtolower($km[1]);
            if ($keyType !== 'rsa') return null;
        }

        $noSpaceRecord = preg_replace('/\s+/', '', $txtRecord);

        if (preg_match('/\bp=([A-Za-z0-9+\/=]+)/', $noSpaceRecord, $m)) {
            return $m[1];
        }

        return null;
    }

    private function computeBodyHash(string $canonicalization, string $hashAlgo): string|false
    {
        $raw = $this->parser->getRaw();
        $nlPos = strpos($raw, "\n\n");
        if ($nlPos === false) {
            $nlPos = strpos($raw, "\r\n\r\n");
            if ($nlPos === false) return false;
            $body = substr($raw, $nlPos + 4);
        } else {
            $body = substr($raw, $nlPos + 2);
        }

        if (str_starts_with($canonicalization, 'relaxed')) {
            $body = str_replace("\r\n", "\n", $body);
            $body = preg_replace('/[ \t]+$/m', '', $body);
            $body = rtrim($body, "\n") . "\n";
            $body = str_replace("\n", "\r\n", $body);
        }

        return hash($hashAlgo, $body, true);
    }

    private function buildSignedData(array $sigParts, string $hashAlgo): string|false
    {
        $canonicalization = $sigParts['c'] ?? 'simple';
        $headerCanon = 'simple';
        $bodyCanon = 'simple';
        if (str_contains($canonicalization, '/')) {
            [$headerCanon, $bodyCanon] = explode('/', $canonicalization, 2);
        }

        $signedHeaders = array_map('strtolower', explode(':', $sigParts['h'] ?? ''));

        $raw = $this->parser->getRaw();
        $nlPos = strpos($raw, "\n\n");
        if ($nlPos === false) {
            $nlPos = strpos($raw, "\r\n\r\n");
            if ($nlPos === false) return false;
        }
        $rawHeaders = substr($raw, 0, $nlPos);

        $lines = explode("\n", str_replace("\r\n", "\n", $rawHeaders));
        $headerValues = [];
        $currentKey = '';
        $currentValue = '';

        foreach ($lines as $line) {
            if ($line === '' || $line[0] === ' ' || $line[0] === "\t") {
                $currentValue .= ' ' . trim($line);
                continue;
            }
            if ($currentKey !== '') {
                $lcKey = strtolower($currentKey);
                if (in_array($lcKey, $signedHeaders) && !isset($headerValues[$lcKey])) {
                    $headerValues[$lcKey] = ['key' => $currentKey, 'value' => trim($currentValue)];
                }
            }
            $colonPos = strpos($line, ':');
            if ($colonPos !== false) {
                $currentKey = trim(substr($line, 0, $colonPos));
                $currentValue = substr($line, $colonPos + 1);
            }
        }
        if ($currentKey !== '') {
            $lcKey = strtolower($currentKey);
            if (in_array($lcKey, $signedHeaders) && !isset($headerValues[$lcKey])) {
                $headerValues[$lcKey] = ['key' => $currentKey, 'value' => trim($currentValue)];
            }
        }

        $dkimSigClean = $sigParts;
        unset($dkimSigClean['b']);
        $dkimPairs = [];
        foreach ($dkimSigClean as $k => $v) {
            $dkimPairs[] = "{$k}={$v}";
        }
        $dkimSigString = 'DKIM-Signature: ' . implode('; ', $dkimPairs) . '; b=';

        $signedData = '';
        foreach ($signedHeaders as $h) {
            if (!isset($headerValues[$h])) continue;
            $entry = $headerValues[$h];

            $key = $entry['key'];
            $value = $entry['value'];

            if ($headerCanon === 'relaxed') {
                $key = strtolower($key);
                $value = preg_replace('/\s+/', ' ', $value);
                $value = trim($value);
            }

            $signedData .= "{$key}:{$value}\r\n";
        }

        if (in_array('dkim-signature', $signedHeaders)) {
            if ($headerCanon === 'relaxed') {
                $cleanSig = preg_replace('/\s+/', ' ', $dkimSigString);
                $cleanSig = trim($cleanSig);
            } else {
                $cleanSig = $dkimSigString;
            }
            $signedData .= $cleanSig . "\r\n";
        }

        return $signedData;
    }

    // ─── Network & Delivery ─────────────────────────────────────────────

    private function analyzeNetwork(): void
    {
        $this->analyzeReceivedPath();
        $this->analyzeReverseDns();
        $this->analyzeTls();
        $this->analyzeHelo();
        $this->analyzeBlocklists();
    }

    private function analyzeReceivedPath(): void
    {
        $received = $this->parser->getReceivedHeaders();

        $this->categories['network']['hop_count'] = count($received);

        $senders = [];
        $sendingIps = [];

        foreach ($received as $rh) {
            $parsed = $this->parseReceivedHeader($rh['value']);
            if ($parsed['from']) $senders[] = $parsed['from'];
            if ($parsed['fromIp']) $sendingIps[] = $parsed['fromIp'];
            if ($parsed['by']) $senders[] = $parsed['by'];
        }

        $uniqueIps = array_unique($sendingIps);
        $this->categories['network']['sending_ips'] = $uniqueIps;
        $this->categories['network']['servers'] = array_unique($senders);

        if (count($received) === 0) {
            $this->addFinding('network', 'Received Headers', 'warning', 'No Received headers found.', null);
            $this->deduct(2, 'network', 'received');
        } else {
            $this->addFinding('network', 'Received Headers', 'pass', count($received) . ' hop(s) detected in the delivery path.');
        }

        $fromDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['from'] ?? '');
        $returnPathDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['return_path'] ?? '');
        if ($fromDomain && $returnPathDomain && $fromDomain !== $returnPathDomain) {
            $this->addFinding('network', 'Return-Path', 'info', 'Return-Path domain (' . $returnPathDomain . ') differs from From domain (' . $fromDomain . ').', 'Common with forwarding services.');
        } elseif ($fromDomain && $returnPathDomain) {
            $this->addFinding('network', 'Return-Path', 'pass', 'Return-Path domain matches From domain.');
        }
    }

    private function analyzeReverseDns(): void
    {
        $ptrRaw = $this->parser->getHeaderValue('x-ficksie-ptr') ?? null;

        if ($ptrRaw !== null && $ptrRaw !== 'fail') {
            $this->categories['network']['ptr'] = 'pass';
            $this->categories['network']['ptr_domain'] = $ptrRaw;
            $this->addFinding('network', 'Reverse DNS (PTR)', 'pass', 'Sending IP has a valid reverse DNS record.', 'PTR: ' . $ptrRaw);
        } elseif ($ptrRaw === 'fail') {
            $this->categories['network']['ptr'] = 'fail';
            $this->addFinding('network', 'Reverse DNS (PTR)', 'warning', 'Sending IP does not have a valid reverse DNS (PTR) record.', 'Configure a PTR record for your sending IP.');
            $this->deduct(5, 'network', 'ptr');
        } else {
            $this->categories['network']['ptr'] = 'unknown';
        }
    }

    private function analyzeTls(): void
    {
        $tlsResult = $this->parser->getHeaderValue('x-ficksie-tls') ?? null;

        if ($tlsResult === 'pass') {
            $this->categories['network']['tls'] = 'pass';
            $this->addFinding('network', 'TLS Encryption', 'pass', 'Connection was encrypted with TLS.');
        } elseif ($tlsResult === 'fail') {
            $this->categories['network']['tls'] = 'fail';
            $this->addFinding('network', 'TLS Encryption', 'warning', 'Connection was NOT encrypted with TLS.', 'Configure TLS for outbound connections.');
            $this->deduct(5, 'network', 'tls');
        } else {
            $this->categories['network']['tls'] = 'unknown';
        }
    }

    private function analyzeHelo(): void
    {
        $heloRaw = $this->parser->getHeaderValue('x-ficksie-helo') ?? null;

        if ($heloRaw && preg_match('/^(\S+)\s+ptr=(\S+)\s+match=(\w+)$/', $heloRaw, $m)) {
            $helo = $m[1];
            $ptrDomain = $m[2];
            $matchResult = $m[3];

            $this->categories['network']['helo'] = $helo;
            $this->categories['network']['helo_ptr_match'] = $matchResult;

            if ($matchResult === 'pass') {
                $this->addFinding('network', 'HELO / rDNS Match', 'pass', 'HELO hostname matches reverse DNS.', "HELO: {$helo}, rDNS: {$ptrDomain}");
            } else {
                $this->addFinding('network', 'HELO / rDNS Mismatch', 'warning', 'HELO hostname does not match reverse DNS.', "HELO: {$helo}, rDNS: {$ptrDomain}. This may affect deliverability with some receivers.");
                $this->deduct(3, 'network', 'helo');
            }
        } elseif ($heloRaw && preg_match('/^(\S+)/', $heloRaw, $m)) {
            $this->categories['network']['helo'] = $m[1];
        }
    }

    private function analyzeBlocklists(): void
    {
        $blRaw = $this->parser->getHeaderValue('x-ficksie-bl') ?? null;

        if ($blRaw === 'clean') {
            $this->categories['network']['blocklists'] = 'clean';
            $this->addFinding('network', 'IP Blocklists', 'pass', 'Sending IP is not listed on any blocklists checked.');
        } elseif ($blRaw && str_starts_with($blRaw, 'listed:')) {
            $listedStr = substr($blRaw, 7);
            $listed = explode(',', $listedStr);
            $this->categories['network']['blocklists'] = 'listed';
            $this->categories['network']['blocklists_listed'] = $listed;
            $this->addFinding('network', 'IP Blocklists', 'fail', 'Sending IP is listed on ' . count($listed) . ' blocklist(s).', 'Lists: ' . implode(', ', $listed));
            $this->deduct(15, 'network', 'blocklists');
        } else {
            $this->categories['network']['blocklists'] = 'unknown';
        }
    }

    private function parseReceivedHeader(string $value): array
    {
        $result = ['from' => '', 'fromIp' => '', 'by' => '', 'byIp' => '', 'protocol' => '', 'timestamp' => ''];

        if (preg_match('/from\s+(\S+?)(?:\s+\((?:\S+\s+)?\[?([0-9a-fA-F.:]+)\]?\))?/i', $value, $m)) {
            $result['from'] = $m[1];
            $result['fromIp'] = $m[2] ?? '';
        }
        if (preg_match('/by\s+(\S+?)(?:\s+\((?:\S+\s+)?\[?([0-9a-fA-F.:]+)\]?\))?(?:\s+with)/i', $value, $m)) {
            $result['by'] = $m[1];
            $result['byIp'] = $m[2] ?? '';
        }
        if (preg_match('/with\s+(\S+)/i', $value, $m)) {
            $result['protocol'] = $m[1];
        }

        $semi = strrpos($value, ';');
        if ($semi !== false) {
            $result['timestamp'] = trim(substr($value, $semi + 1));
        }

        return $result;
    }

    // ─── Message Structure ─────────────────────────────────────────────

    private function analyzeMessageStructure(): void
    {
        $this->analyzeMimeStructure();
        $this->analyzePlainText();
        $this->analyzeHtmlQuality();
        $this->analyzeImageRatio();
        $this->analyzeHeaders();
        $this->analyzeMxRecords();
    }

    private function analyzeMimeStructure(): void
    {
        $parts = $this->parser->getMimeParts();
        $attachments = $this->parser->getAttachments();

        $hasPlainText = false;
        $hasHtml = false;
        foreach ($parts as $part) {
            if (strpos($part['type'], 'text/plain') !== false) $hasPlainText = true;
            if (strpos($part['type'], 'text/html') !== false) $hasHtml = true;
        }

        if ($hasPlainText && $hasHtml) {
            $this->addFinding('message', 'MIME Structure', 'pass', 'Message contains both plain text and HTML alternatives.');
        } elseif ($hasPlainText && !$hasHtml) {
            $this->addFinding('message', 'MIME Structure', 'pass', 'Message contains plain text only.');
        } elseif ($hasHtml && !$hasPlainText) {
            $this->addFinding('message', 'MIME Structure', 'warning', 'HTML-only message without a plain text alternative.', 'Add a text/plain version for better compatibility.');
            $this->deduct(3, 'message', 'mime');
        } else {
            $this->addFinding('message', 'MIME Structure', 'warning', 'No text content detected.', null);
            $this->deduct(5, 'message', 'mime');
        }

        if (!empty($attachments)) {
            $this->addFinding('message', 'Attachments', 'pass', count($attachments) . ' attachment(s) detected.', null);
        }

        $this->categories['message']['mime'] = [
            'has_plain_text' => $hasPlainText,
            'has_html' => $hasHtml,
            'attachments' => $attachments,
            'structure' => $this->parser->getMimeStructure(),
        ];
    }

    private function analyzePlainText(): void
    {
        $plain = $this->parser->getBodyPlain();
        if (!$plain) return;

        if (strlen(trim($plain)) === 0) {
            $this->addFinding('message', 'Plain Text Version', 'warning', 'Plain text version is empty.', null);
            $this->deduct(2, 'message', 'plaintext');
        }
    }

    private function analyzeHtmlQuality(): void
    {
        $html = $this->parser->getBodyHtml();
        if (!$html) return;

        $issues = [];

        $tagCount = preg_match_all('/<[a-zA-Z]/', $html);
        if ($tagCount > 500) {
            $issues[] = 'Excessive HTML tag count (' . $tagCount . ')';
        }

        $inlineStyles = preg_match_all('/style\s*=/i', $html);
        if ($inlineStyles > 100) {
            $issues[] = 'Heavy use of inline styles (' . $inlineStyles . ')';
        }

        $imgCount = 0;
        preg_match_all('/<img\s/i', $html, $imgMatches);
        $imgCount = count($imgMatches[0]);

        if ($imgCount > 10) {
            $issues[] = 'High image count (' . $imgCount . ')';
        }

        $missingAlt = 0;
        preg_match_all('/<img\s[^>]*>/i', $html, $imgTags);
        foreach ($imgTags[0] as $tag) {
            if (!preg_match('/alt\s*=/i', $tag)) {
                $missingAlt++;
            }
        }
        if ($missingAlt > 0) {
            $issues[] = $missingAlt . ' image(s) missing alt attributes';
        }

        $dangerousPatterns = [
            '/<script[\s>]/i' => 'JavaScript',
            '/<iframe[\s>]/i' => 'iframe',
            '/<embed[\s>]/i' => 'embed',
            '/<applet[\s>]/i' => 'applet',
            '/<object[\s>]/i' => 'object',
            '/javascript\s*:/i' => 'javascript: URI',
            '/on(load|error|click|mouseover)\s*=/i' => 'inline event handler',
        ];

        foreach ($dangerousPatterns as $pattern => $name) {
            if (preg_match($pattern, $html)) {
                $issues[] = "Dangerous HTML element detected: {$name}";
            }
        }

        $shortUrlPatterns = [
            '/bit\.ly\//i', '/tinyurl\.com\//i', '/t\.co\//i',
            '/goo\.gl\//i', '/ow\.ly\//i', '/is\.gd\//i',
            '/buff\.ly\//i', '/bl\.ms\//i', '/ift\.tt\//i',
            '/qr\.ae\//i', '/cutt\.ly\//i', '/shorte\.st\//i',
        ];

        $shortUrls = [];
        foreach ($shortUrlPatterns as $pattern) {
            if (preg_match_all($pattern, $html, $m)) {
                $shortUrls = array_merge($shortUrls, $m[0]);
            }
        }
        if (!empty($shortUrls)) {
            $issues[] = count($shortUrls) . ' short URL(s) detected (bit.ly, tinyurl, etc.)';
        }

        $plainText = $this->parser->getBodyPlain() ?? strip_tags($html);
        $textLength = strlen(trim($plainText));
        $htmlLength = strlen($html);
        $ratio = $htmlLength > 0 ? round(($textLength / $htmlLength) * 100) : 0;

        $this->categories['message']['html'] = [
            'tag_count' => $tagCount,
            'inline_styles' => $inlineStyles,
            'image_count' => $imgCount,
            'images_without_alt' => $missingAlt,
            'text_ratio' => $ratio,
            'has_dangerous_html' => !empty(array_filter($issues, fn($i) => str_starts_with($i, 'Dangerous'))),
            'short_urls' => $shortUrls,
        ];

        if (!empty($issues)) {
            $this->addFinding('message', 'HTML Quality', 'warning', count($issues) . ' issue(s) found.', implode("\n", $issues));
            $this->deduct(min(5, count($issues)), 'message', 'html');
        } else {
            $this->addFinding('message', 'HTML Quality', 'pass', 'HTML structure looks reasonable.', null);
        }
    }

    private function analyzeImageRatio(): void
    {
        $html = $this->parser->getBodyHtml();
        if (!$html) return;

        $imgCount = 0;
        preg_match_all('/<img\s/i', $html, $imgMatches);
        $imgCount = count($imgMatches[0]);

        $textLength = strlen(strip_tags($html));

        if ($imgCount > 0 && $textLength < 100 && $imgCount > 3) {
            $this->addFinding('message', 'Image-to-Text Ratio', 'warning', 'High image-to-text ratio.', 'Add more text content.');
            $this->deduct(3, 'message', 'imageratio');
        } elseif ($imgCount > 0) {
            $this->addFinding('message', 'Image-to-Text Ratio', 'pass', 'Image-to-text ratio looks reasonable.');
        }
    }

    private function analyzeHeaders(): void
    {
        $info = $this->parser->getBasicInfo();
        $issues = [];

        if (empty($info['message_id'])) {
            $issues[] = 'Missing Message-ID header';
        }
        if (empty($info['date'])) {
            $issues[] = 'Missing Date header';
        }
        if (empty($info['from'])) {
            $issues[] = 'Missing From header';
        }
        if (empty($info['to'])) {
            $issues[] = 'Missing To header';
        }
        if (empty($info['mime_version'])) {
            $issues[] = 'Missing MIME-Version header';
        }
        if (empty($info['content_type'])) {
            $issues[] = 'Missing Content-Type header';
        }

        if (!empty($issues)) {
            $this->addFinding('message', 'Header Completeness', 'warning', count($issues) . ' header issue(s).', implode("\n", $issues));
            $this->deduct(min(5, count($issues)), 'message', 'headers');
        } else {
            $this->addFinding('message', 'Header Completeness', 'pass', 'All essential headers are present.');
        }

        $this->categories['message']['headers'] = [
            'message_id' => $info['message_id'] ?? null,
            'date' => $info['date'] ?? null,
            'from' => $info['from'] ?? null,
            'to' => $info['to'] ?? null,
            'subject' => $info['subject'] ?? null,
            'reply_to' => $info['reply_to'] ?? null,
            'return_path' => $info['return_path'] ?? null,
            'mime_version' => $info['mime_version'] ?? null,
            'content_type' => $info['content_type'] ?? null,
            'charset' => $info['charset'] ?? null,
            'encoding' => $info['content_encoding'] ?? null,
            'list_unsubscribe' => $info['list_unsubscribe'] ?? null,
        ];
    }

    private function analyzeMxRecords(): void
    {
        $fromDomain = $this->extractDomainFromEmail($this->parser->getBasicInfo()['from'] ?? '');
        if (!$fromDomain) return;

        $records = @dns_get_record($fromDomain, DNS_MX);

        if (!empty($records)) {
            $mxCount = count($records);
            $this->categories['message']['mx_records'] = $mxCount;
            $this->addFinding('message', 'MX Records', 'pass', "Domain {$fromDomain} has {$mxCount} MX record(s).");
        } else {
            $this->categories['message']['mx_records'] = 0;
            $this->addFinding('message', 'MX Records', 'info', "No MX records found for {$fromDomain}.", 'Not all domains need MX records (e.g., sending-only domains).');
        }
    }

    // ─── Content Quality ───────────────────────────────────────────────

    private function analyzeContent(): void
    {
        $this->analyzeUppercase();
        $this->analyzePunctuation();
        $this->analyzeSpamWords();
        $this->analyzeSubject();
        $this->analyzeSpamSignals();
    }

    private function analyzeUppercase(): void
    {
        $text = $this->parser->getBodyPlain() ?? $this->parser->getBodyHtml();
        if (!$text) return;

        $textOnly = strip_tags($text);
        $upperCount = preg_match_all('/[A-Z]/', $textOnly);
        $totalAlpha = preg_match_all('/[a-zA-Z]/', $textOnly);

        if ($totalAlpha === 0) return;

        $upperRatio = $upperCount / $totalAlpha;
        if ($upperRatio > 0.7 && strlen($textOnly) > 100) {
            $this->addFinding('content', 'Uppercase Text', 'warning', 'Excessive use of uppercase text (' . round($upperRatio * 100) . '%).', null);
            $this->deduct(2, 'content', 'uppercase');
        } else {
            $this->addFinding('content', 'Uppercase Text', 'pass', 'Uppercase usage is within normal range.');
        }
    }

    private function analyzePunctuation(): void
    {
        $text = $this->parser->getBodyPlain();
        if (!$text) return;

        $exclamations = substr_count($text, '!');
        $questionMarks = substr_count($text, '?');
        $totalLength = strlen($text);

        if ($totalLength > 0 && ($exclamations + $questionMarks) / $totalLength > 0.05) {
            $this->addFinding('content', 'Excessive Punctuation', 'warning', 'Excessive use of exclamation/question marks.', null);
            $this->deduct(1, 'content', 'punctuation');
        }
    }

    private function analyzeSpamWords(): void
    {
        $text = strtolower($this->parser->getBodyPlain() ?? $this->parser->getBodyHtml() ?? '');
        $text = strip_tags($text);

        $spamWords = [
            'act now', 'limited time', 'click here', 'buy now', 'order now',
            'dear friend', 'you have been selected', 'no cost', 'risk free',
            '100% free', 'no obligation', 'special promotion', 'apply now',
            'subscribe now', 'join millions', 'do it today', 'do not delete',
            "don't delete", "don't hesitate", 'fantastic deal', 'for free',
            'get it now', 'giveaway', 'great offer', 'incredible deal',
            'lowest price', 'no catch', 'no fees', 'no strings attached',
            'offer expires', 'once in a lifetime', 'prize', 'pure profit',
            'special deal', 'what are you waiting for', 'while supplies last',
        ];

        $found = [];
        foreach ($spamWords as $word) {
            if (str_contains($text, $word)) {
                $found[] = $word;
            }
        }

        if (count($found) >= 5) {
            $this->addFinding('content', 'Spam-related Words', 'warning', count($found) . ' spam-related phrase(s) detected.', 'Phrases: ' . implode(', ', array_slice($found, 0, 5)));
            $this->deduct(min(5, count($found)), 'content', 'spamwords');
        } elseif (count($found) > 0) {
            $this->addFinding('content', 'Spam-related Words', 'info', count($found) . ' potential spam-related phrase(s).', implode(', ', $found));
        } else {
            $this->addFinding('content', 'Spam-related Words', 'pass', 'No spam-related phrases detected.');
        }
    }

    private function analyzeSubject(): void
    {
        $subject = $this->parser->getBasicInfo()['subject'] ?? '';
        if (empty($subject)) {
            $this->addFinding('content', 'Subject Line', 'warning', 'Email has no subject line.', null);
            $this->deduct(3, 'content', 'subject');
            return;
        }

        $issues = [];
        if (strlen($subject) > 150) {
            $issues[] = 'Subject is very long (' . strlen($subject) . ' characters)';
        }
        if (preg_match('/^(RE:|FW:|FWD:)/i', $subject)) {
            $subjectBody = preg_replace('/^(RE:|FW:|FWD:)\s*/i', '', $subject);
            if (preg_match('/^(RE:|FW:|FWD:)/i', $subjectBody)) {
                $issues[] = 'Multiple RE:/FW: prefixes detected';
            }
        }
        $allUpper = strtoupper($subject) === $subject && strlen($subject) > 5;
        if ($allUpper) {
            $issues[] = 'Subject is entirely in uppercase';
        }

        if (!empty($issues)) {
            $this->addFinding('content', 'Subject Line', 'warning', count($issues) . ' issue(s).', implode("\n", $issues));
            $this->deduct(min(3, count($issues)), 'content', 'subject');
        } else {
            $this->addFinding('content', 'Subject Line', 'pass', 'Subject line looks reasonable.');
        }
    }

    private function analyzeSpamSignals(): void
    {
        $xSpamScore = $this->parser->getHeaderValue('x-spam-score');
        $xSpamFlag = $this->parser->getHeaderValue('x-spam-flag');

        if ($xSpamScore) {
            $score = floatval($xSpamScore);
            if ($score > 5) {
                $this->addFinding('content', 'Spam Score Header', 'warning', 'High X-Spam-Score: ' . $xSpamScore, null);
                $this->deduct(8, 'content', 'spam_score');
            } elseif ($score > 2) {
                $this->addFinding('content', 'Spam Score Header', 'warning', 'Moderate X-Spam-Score: ' . $xSpamScore, null);
                $this->deduct(3, 'content', 'spam_score');
            }
        }

        if ($xSpamFlag && strtolower($xSpamFlag) === 'yes') {
            $this->addFinding('content', 'Spam Flag', 'warning', 'X-Spam-Flag: Yes.', null);
            $this->deduct(5, 'content', 'spam_flag');
        }

        $info = $this->parser->getBasicInfo();
        if ($info['list_unsubscribe']) {
            $this->addFinding('network', 'List-Unsubscribe', 'pass', 'List-Unsubscribe header is present.', null);
        } else {
            $this->addFinding('network', 'List-Unsubscribe', 'info', 'No List-Unsubscribe header.', 'Required for bulk/mass emails.');
        }
    }

    // ─── Links ─────────────────────────────────────────────────────────

    private function analyzeLinks(): void
    {
        $links = $this->parser->getLinks();

        $this->categories['links']['count'] = count($links);

        if (empty($links)) {
            $this->addFinding('links', 'Link Count', 'pass', 'No links detected in the message.');
            $this->categories['links']['details'] = [];
            return;
        }

        $this->categories['links']['details'] = $links;

        $httpCount = 0;
        foreach ($links as $link) {
            if (!$link['https'] && !str_starts_with($link['url'], 'mailto:')) {
                $httpCount++;
            }
        }

        if ($httpCount > 0) {
            $this->addFinding('links', 'HTTP Links', 'warning', $httpCount . ' link(s) use HTTP instead of HTTPS.', 'Use HTTPS links.');
            $this->deduct(min(3, $httpCount), 'links', 'http');
        } else {
            $this->addFinding('links', 'HTTPS Usage', 'pass', 'All links use HTTPS.');
        }

        $this->addFinding('links', 'Link Count', 'pass', count($links) . ' unique link(s) found.');
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private function extractDomainFromEmail(string $email): ?string
    {
        if (preg_match('/@([a-zA-Z0-9._-]+)>?$/', trim($email), $m)) {
            return strtolower($m[1]);
        }
        return null;
    }

    private function generateSummary(array $passed, array $warnings, array $errors): string
    {
        if (empty($warnings) && empty($errors)) {
            return 'Your email passed all checks. No issues detected.';
        }

        $parts = [];
        if (!empty($errors)) {
            $parts[] = count($errors) . ' error(s) need attention';
        }
        if (!empty($warnings)) {
            $parts[] = count($warnings) . ' warning(s) to review';
        }
        if (!empty($passed)) {
            $parts[] = count($passed) . ' check(s) passed';
        }

        return implode('. ', $parts) . '.';
    }
}
