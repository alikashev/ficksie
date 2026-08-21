<?php
/**
 * Email Parser
 *
 * Parses raw email messages into structured data for analysis.
 */

class EmailParser
{
    private string $raw;
    private array $headers = [];
    private array $basicInfo = [];
    private array $mimeParts = [];
    private array $attachments = [];
    private array $links = [];
    private array $receivedHeaders = [];
    private ?string $bodyPlain = null;
    private ?string $bodyHtml = null;
    private string $rawHeaders = '';
    private string $rawBody = '';

    public function __construct(string $rawEmail)
    {
        $this->raw = $rawEmail;
        $this->parse();
    }

    private function parse(): void
    {
        $raw = $this->raw;

        // Strip mbox "From " envelope line prepended by MTA pipe transport
        if (str_starts_with($raw, "From ")) {
            $nlPos = strpos($raw, "\n");
            if ($nlPos !== false) {
                $raw = substr($raw, $nlPos + 1);
            }
        }

        // Normalize line endings: CRLF → LF
        $raw = str_replace("\r\n", "\n", $raw);

        $this->raw = $raw;

        // Split headers from body on blank line
        $boundaryPos = strpos($raw, "\n\n");

        if ($boundaryPos !== false) {
            $this->rawHeaders = substr($raw, 0, $boundaryPos);
            $this->rawBody = substr($raw, $boundaryPos + 2);
        } else {
            $this->rawHeaders = $raw;
        }

        $this->parseHeaders();
        $this->extractBasicInfo();
        $this->parseMime();
        $this->extractLinks();
    }

    private function parseHeaders(): void
    {
        $lines = explode("\n", $this->rawHeaders);
        $currentKey = '';
        $currentValue = '';

        foreach ($lines as $line) {
            if ($line === '') continue;

            if (preg_match('/^[ \t]/', $line) && $currentKey !== '') {
                $currentValue .= ' ' . trim($line);
            } else {
                if ($currentKey !== '') {
                    $lcKey = strtolower($currentKey);
                    $this->headers[$lcKey][] = [
                        'key' => $currentKey,
                        'value' => trim($currentValue),
                    ];
                }
                $colonPos = strpos($line, ':');
                if ($colonPos !== false) {
                    $currentKey = trim(substr($line, 0, $colonPos));
                    $currentValue = trim(substr($line, $colonPos + 1));
                }
            }
        }

        if ($currentKey !== '') {
            $lcKey = strtolower($currentKey);
            $this->headers[$lcKey][] = [
                'key' => $currentKey,
                'value' => trim($currentValue),
            ];
        }
    }

    private function extractBasicInfo(): void
    {
        $this->basicInfo['from'] = $this->getHeaderValue('from');
        $this->basicInfo['to'] = $this->getHeaderValue('to');
        $this->basicInfo['reply_to'] = $this->getHeaderValue('reply-to');
        $this->basicInfo['subject'] = $this->getHeaderValue('subject');
        $this->basicInfo['date'] = $this->getHeaderValue('date');
        $this->basicInfo['message_id'] = $this->getHeaderValue('message-id');
        $this->basicInfo['mime_version'] = $this->getHeaderValue('mime-version');
        $this->basicInfo['content_type'] = $this->getHeaderValue('content-type');
        $this->basicInfo['content_encoding'] = $this->getHeaderValue('content-transfer-encoding');
        $this->basicInfo['charset'] = $this->extractCharset();
        $this->basicInfo['return_path'] = $this->getHeaderValue('return-path');
        $this->basicInfo['list_unsubscribe'] = $this->getHeaderValue('list-unsubscribe');
        $this->basicInfo['list_unsubscribe_post'] = $this->getHeaderValue('list-unsubscribe-post');

        $this->receivedHeaders = $this->headers['received'] ?? [];
    }

    public function getHeaderValue(string $key): ?string
    {
        $lcKey = strtolower($key);
        if (isset($this->headers[$lcKey]) && !empty($this->headers[$lcKey])) {
            return $this->headers[$lcKey][0]['value'];
        }
        return null;
    }

    private function extractCharset(): ?string
    {
        $ct = $this->basicInfo['content_type'] ?? '';
        if (preg_match('/charset=["\']?([^"\';\s]+)/i', $ct, $m)) {
            return strtolower(trim($m[1]));
        }
        return null;
    }

    private function parseMime(): void
    {
        $contentType = $this->basicInfo['content_type'] ?? 'text/plain';
        $contentTypeLower = strtolower($contentType);

        if (strpos($contentTypeLower, 'multipart/') === 0) {
            $boundary = $this->extractBoundary($contentType);
            if ($boundary) {
                $this->parseMultipart($boundary);
            }
        } else {
            $this->mimeParts[] = [
                'type' => $contentTypeLower,
                'encoding' => $this->basicInfo['content_encoding'] ?? '7bit',
                'content' => $this->decodeBody($this->rawBody, $this->basicInfo['content_encoding'] ?? '7bit'),
                'headers' => [],
            ];

            if (strpos($contentTypeLower, 'text/plain') !== false) {
                $this->bodyPlain = $this->mimeParts[0]['content'] ?? '';
            } elseif (strpos($contentTypeLower, 'text/html') !== false) {
                $this->bodyHtml = $this->mimeParts[0]['content'] ?? '';
            }
        }
    }

    private function extractBoundary(string $contentType): ?string
    {
        if (preg_match('/boundary=["\']?([^"\';\s]+)/i', $contentType, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    private function parseMultipart(string $boundary, int $depth = 0): void
    {
        if ($depth > 10) return;

        $parts = explode('--' . $boundary, $this->rawBody);
        array_shift($parts);

        foreach ($parts as $part) {
            if (trim($part) === '' || trim($part) === '--') continue;

            $part = ltrim($part, "\r\n");

            $headerEndPos = strpos($part, "\r\n\r\n");
            if ($headerEndPos === false) {
                $headerEndPos = strpos($part, "\n\n");
            }

            if ($headerEndPos === false) {
                $this->mimeParts[] = [
                    'type' => 'text/plain',
                    'encoding' => '7bit',
                    'content' => $part,
                    'headers' => [],
                ];
                continue;
            }

            $partHeaders = substr($part, 0, $headerEndPos);
            $partBody = substr($part, $headerEndPos + 2);

            $partHeaderArr = $this->parsePartHeaders($partHeaders);
            $partContentType = strtolower($this->getPartHeaderValue($partHeaderArr, 'content-type') ?: 'text/plain');
            $partEncoding = $this->getPartHeaderValue($partHeaderArr, 'content-transfer-encoding') ?: '7bit';
            $partDisposition = strtolower($this->getPartHeaderValue($partHeaderArr, 'content-disposition') ?: '');
            $partFilename = $this->extractFilename($partHeaderArr);

            $decoded = $this->decodeBody($partBody, $partEncoding);

            if (strpos($partContentType, 'multipart/') === 0) {
                $subBoundary = $this->extractBoundary($partContentType);
                if ($subBoundary) {
                    $this->parseMultipart($subBoundary, $depth + 1);
                }
                continue;
            }

            $this->mimeParts[] = [
                'type' => $partContentType,
                'encoding' => $partEncoding,
                'content' => $decoded,
                'headers' => $partHeaderArr,
                'disposition' => $partDisposition,
                'filename' => $partFilename,
            ];

            if (strpos($partDisposition, 'attachment') !== false || $partFilename) {
                $this->attachments[] = [
                    'filename' => $partFilename ?: 'unknown',
                    'content_type' => $partContentType,
                    'size' => strlen($decoded),
                    'disposition' => $partDisposition,
                ];
            } elseif (strpos($partContentType, 'text/plain') !== false) {
                $this->bodyPlain = $decoded;
            } elseif (strpos($partContentType, 'text/html') !== false) {
                $this->bodyHtml = $decoded;
            }
        }
    }

    private function parsePartHeaders(string $raw): array
    {
        $headers = [];
        $lines = explode("\n", $raw);
        $currentKey = '';
        $currentValue = '';

        foreach ($lines as $line) {
            if ($line === '') continue;
            if (preg_match('/^[ \t]/', $line) && $currentKey !== '') {
                $currentValue .= ' ' . trim($line);
            } else {
                if ($currentKey !== '') {
                    $headers[] = ['key' => $currentKey, 'value' => trim($currentValue)];
                }
                $colonPos = strpos($line, ':');
                if ($colonPos !== false) {
                    $currentKey = trim(substr($line, 0, $colonPos));
                    $currentValue = trim(substr($line, $colonPos + 1));
                }
            }
        }
        if ($currentKey !== '') {
            $headers[] = ['key' => $currentKey, 'value' => trim($currentValue)];
        }
        return $headers;
    }

    private function getPartHeaderValue(array $headers, string $key): ?string
    {
        $lcKey = strtolower($key);
        foreach ($headers as $h) {
            if (strtolower($h['key']) === $lcKey) return $h['value'];
        }
        return null;
    }

    private function extractFilename(array $headers): ?string
    {
        $disp = $this->getPartHeaderValue($headers, 'content-disposition');
        if ($disp && preg_match('/filename=["\']?([^"\';\s]+)/i', $disp, $m)) {
            return trim($m[1]);
        }
        $ct = $this->getPartHeaderValue($headers, 'content-type');
        if ($ct && preg_match('/name=["\']?([^"\';\s]+)/i', $ct, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    private function decodeBody(string $body, string $encoding): string
    {
        $encoding = strtolower(trim($encoding));
        return match ($encoding) {
            'base64' => base64_decode($body) ?: $body,
            'quoted-printable' => quoted_printable_decode($body),
            default => $body,
        };
    }

    private function extractLinks(): void
    {
        $html = $this->bodyHtml;
        if (!$html) return;

        $htmlLower = strtolower($html);
        $links = [];

        preg_match_all('/<a\s[^>]*href=["\']([^"\']*)["\']/i', $html, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $url = trim($m[1]);
            if ($url === '' || $url[0] === '#') continue;
            $links[] = [
                'url' => $url,
                'protocol' => $this->extractProtocol($url),
                'hostname' => $this->extractHostname($url),
                'https' => stripos($url, 'https://') === 0,
            ];
        }

        preg_match_all('/src=["\']([^"\']*)["\']/i', $html, $imgMatches, PREG_SET_ORDER);
        foreach ($imgMatches as $m) {
            $url = trim($m[1]);
            if ($url === '' || str_starts_with($url, 'data:')) continue;
            $links[] = [
                'url' => $url,
                'protocol' => $this->extractProtocol($url),
                'hostname' => $this->extractHostname($url),
                'https' => stripos($url, 'https://') === 0,
                'type' => 'image',
            ];
        }

        $this->links = array_values($this->dedupeLinks($links));
    }

    private function extractProtocol(string $url): string
    {
        if (preg_match('/^([a-z][a-z0-9+.-]*):/i', $url, $m)) {
            return strtolower($m[1]);
        }
        return '';
    }

    private function extractHostname(string $url): ?string
    {
        if (preg_match('#^[a-z][a-z0-9+.-]*://([^/:@]+)#i', $url, $m)) {
            return strtolower($m[1]);
        }
        if (preg_match('/^mailto:/i', $url)) {
            return null;
        }
        return null;
    }

    private function dedupeLinks(array $links): array
    {
        $seen = [];
        $result = [];
        foreach ($links as $link) {
            $key = $link['url'];
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $result[] = $link;
            }
        }
        return $result;
    }

    public function getHeaders(): array
    {
        $all = [];
        foreach ($this->headers as $key => $entries) {
            foreach ($entries as $entry) {
                $all[] = $entry;
            }
        }
        return $all;
    }

    public function getHeaderValues(string $key): array
    {
        $lcKey = strtolower($key);
        return $this->headers[$lcKey] ?? [];
    }

    public function getBasicInfo(): array
    {
        return $this->basicInfo;
    }

    public function getMimeParts(): array
    {
        return $this->mimeParts;
    }

    public function getAttachments(): array
    {
        return $this->attachments;
    }

    public function getLinks(): array
    {
        return $this->links;
    }

    public function getReceivedHeaders(): array
    {
        return $this->receivedHeaders;
    }

    public function getBodyPlain(): ?string
    {
        return $this->bodyPlain;
    }

    public function getBodyHtml(): ?string
    {
        return $this->bodyHtml;
    }

    public function getRawHeaders(): string
    {
        return $this->rawHeaders;
    }

    public function getRawBody(): string
    {
        return $this->rawBody;
    }

    public function getRaw(): string
    {
        return $this->raw;
    }

    public function getHeaderCount(): int
    {
        $count = 0;
        foreach ($this->headers as $entries) {
            $count += count($entries);
        }
        return $count;
    }

    public function getMimeStructure(): array
    {
        $structure = [];
        foreach ($this->mimeParts as $part) {
            $structure[] = [
                'type' => $part['type'],
                'disposition' => $part['disposition'] ?? null,
                'filename' => $part['filename'] ?? null,
                'size' => strlen($part['content'] ?? ''),
                'encoding' => $part['encoding'],
            ];
        }
        return $structure;
    }
}
