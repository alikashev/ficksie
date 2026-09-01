# AGENTS.md - Ficksie Project Guide

## Project Overview
Ficksie is a PHP 8+ / MySQL / vanilla JS single-page application (SPA) offering web utilities (DNS lookup, password generator, SSL toolkit, email deliverability tester). No frameworks, no build tools — plain PHP + MySQL + vanilla JavaScript.

## Architecture
- **Routing**: All requests go through `.htaccess` → `index.php` (SPA shell) or `api/index.php` (API router)
- **Frontend**: Vanilla JS SPA with tab/sidebar navigation, client-side routing via `dispatchRender()`
- **Backend**: PHP 8+ with MySQL/MariaDB via custom `Database` class
- **Styling**: Single `assets/css/style.css` with CSS custom properties, all new CSS prefixed with tool-specific prefix (e.g. `edt-` for email deliverability tester)

## Critical Architecture Rules
- **NO frameworks** — no React, Vue, Laravel, etc.
- **Reuse existing CSS classes** — check `style.css` for existing patterns before creating new ones
- **Prefix all new CSS** with tool abbreviation (e.g. `edt-`, `ssl-`, `dns-`)
- **Integrate into existing tab/sidebar/viewMeta system** — see `assets/js/app.js`
- **API routes** registered in `api/index.php` router
- **All API responses** use ` jsonResponse()` helper
- **All input sanitized** — use `Database::getInstance()->sanitize()`
- **No eval, no innerHTML with raw user data** — use `escHtml()` for all output
- **Never embed dynamic text in `data-*` attributes** — `escHtml()` does not escape double quotes; values with quotes break/truncate. Tag elements with an ID and look values up from `state` instead

## Environment
- **Server**: DirectAdmin on CentOS 8
- **PHP**: 8.x, timezone set to UTC (`date_default_timezone_set('UTC')` in `config.php`)
- **MySQL/MariaDB**: timezone Europe/Amsterdam (UTC+2) — all DB datetime logic must use `UTC_TIMESTAMP()` not `NOW()`
- **MTA**: Exim 4.99.4 (Dovecot for IMAP/POP)
- **DNS**: Cloudflare proxied
- **Config**: `EMAIL_TEST_DOMAIN = 'ficksie.nl'`

## Known Bugs / Quirks
- `Database::execute()` calls `self::query()` twice (executes SQL twice) — pre-existing bug, don't fix unless asked
- `Database::connect()` is the method name (not `getConnection()`)
- Exim pipe transport does NOT inject `Authentication-Results` headers (only mailbox delivery does)
- Exim log format: `DKIM=<domain> [flags]` in mainlog; no SPF/DMARC logged
- Exim ACL includes `.include_if_exists /etc/exim.acl_check_recipient.pre.conf`
- Exim router includes `.include_if_exists /etc/exim.routers.pre.conf`
- Exim transport includes `.include_if_exists /etc/exim.transports.pre.conf`
- Exim daemon must be restarted (`systemctl restart exim`) after config file changes
- **DNS tool caching is DISABLED** — `dnsCacheGet()` in `api/dns.php` always returns null and `dnsCacheSet()` is a no-op. DNS/WHOIS data is always fetched live for every domain (per user requirement). The `dns_cache` table still exists but is unused; `dnsCacheClear()` remains for cleanup.
- **DNSSEC detection** — `checkDnssec()` runs in both full and quick modes and queries DNSKEY (48) + DS (43) via Cloudflare DoH (`queryDohRaw()`), because `dns_get_record` cannot see DNSKEY on Cloudflare-fronted domains (they answer ANY with HINFO). A zone is reported as DNSSEC-enabled when either DNSKEY or DS records are found. The WHOIS override regex also recognizes `signedDelegation`/`delegationSigned` values from RDAP.

## Email Deliverability Tester (Current Feature)

### Status: COMPLETE (all phases done)
All parser bugs fixed, analyzer overhauled with professional-grade scoring, pipe script rewritten with DNS-based auth checks + PTR + TLS, frontend redesigned with centered results/auth grid/recommendations, CSS fully written.

### What Was Built
1. **Email parser** (`includes/email-parser.php`) — parses raw email with `\n` line endings, strips `From ` envelope line, handles MIME boundaries case-insensitively
2. **Email analyzer** (`includes/email-analyzer.php`) — v2 scoring model: Auth=50pts, Network=20pts, Message=15pts, Content=15pts. Adds alignment, PTR, TLS, DKIM crypto verification, blocklist, HELO/rDNS, dangerous HTML, short URL, MX record checks. Fixed alt attribute counting bug.
3. **Pipe script** (`api/email-test-pipe.php`) — Exim pipe script with DNS-based auth checks, PTR reverse DNS validation, TLS detection, HELO extraction, blocklist checking (13 lists), injects Authentication-Results + X-Ficksie-PTR + X-Ficksie-TLS + X-Ficksie-HELO + X-Ficksie-BL + X-Ficksie-DKIM-LOG headers
4. **API** (`api/email-test.php`) — CRUD + analysis endpoints
5. **Webhook** (`api/email-test-receive.php`) — unauthenticated POST receiver
6. **Frontend** (`assets/js/email-tester.js`) — auth detail panels showing DNS records, key/value config rows for SPF/DKIM/DMARC, DKIM crypto verification badge, centered results, SVG score ring, intelligent recommendations, network cards (PTR/TLS/Blocklists/HELO)
7. **CSS** (`assets/css/style.css`) — all `edt-` prefixed styles complete

### Key Files
- `config.php` — `EMAIL_TEST_DOMAIN = 'ficksie.nl'`, PHP timezone UTC
- `database/schema.sql` — `email_tests` table
- `includes/database.php` — `Database` class (has double-query bug in `execute()`)
- `includes/email-parser.php` — raw email parser (5 bugs fixed in prior session)
- `includes/email-analyzer.php` — deliverability analysis/scoring engine
- `api/email-test.php` — CRUD API + `utcToIso()` helper
- `api/email-test-receive.php` — unauthenticated webhook
- `api/email-test-pipe.php` — Exim pipe script with DNS auth checks
- `api/index.php` — router with `email-test` + `email-test-receive` routes
- `assets/js/email-tester.js` — frontend JS (v2)
- `assets/js/app.js` — viewMeta, tools array, dispatchRender, `escHtml()`, `getActiveBody()`
- `assets/css/style.css` — all styles (v116)
- `index.php` — sidebar nav, cache bust, script tags
- Exim config files in `/etc/exim.*.pre.conf`

### Scoring Results
- Before fixes: 30/100 (Poor)
- After parser fixes only (no auth headers): 88/100 (Good)
- With injected auth headers: 100/100 (Excellent)
- After analyzer overhaul (alignment/PTR/TLS): professional-grade scoring matching tools like mail-tester.com

### Cache Busting (current versions)
- CSS: `v=116`
- JS email-tester: `v=7`
- app.js: `v=122`

## Testing Checklist
- [ ] End-to-end: send email from Outlook → verify full pipeline (Exim → pipe script → analyzer → frontend shows score with recommendations)
- [ ] Test edge cases: expired tests, malformed emails, HTML-only emails, emails from different providers
- [ ] Verify auth panels render correctly (SPF/DKIM/DMARC detail panels with DNS records, key/value rows, badges)
- [ ] Verify recommendations appear and are contextually accurate
- [ ] Test responsive layout on mobile viewport
