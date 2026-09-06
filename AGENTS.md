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

## AI Chat Assistant (Current Feature)

### Status: LIVE
Backend, API routes, DB tables, and the frontend (`ai-chat.js` + `ch-` CSS) all wired and streaming against NVIDIA. `NVIDIA_API_KEY` is set.

Known quirks handled:
- `api/ai.php` must read `$resource = $parts[1]` (the sub-action after the `ai` prefix) — was `$parts[0]` which matched `'ai'` and 404'd every route.
- Default model was EOL'd by NVIDIA (`nvidia/llama-3.3-nemotron-super-49b-v1`, gone 2026-08-26). Current default: `nvidia/nemotron-3-super-120b-a12b`.
- `ai_stream_reply()` retries up to 3× when a stream "succeeds" but emits zero `content` chunks (NVIDIA reasoning-model empty-completion quirk). If all attempts are empty, an error bubble is shown.

### What Was Built
1. **`includes/ai.php`** — `AiHelper` class: curated model catalog (~26 models) + live NVIDIA model fetch via `ai_cache` (TTL 86400s), `isChatModel`/`isVisionModel`/`friendlyError`, SSE helpers (`sseStart`/`sseEvent`), streaming chat via curl write-function, conversation/message/attachment DB CRUD, `buildRequestMessages` (vision images → `image_url` data-URIs), `resolveAttachments`, `throttleOk`, auto-title, orphan attachment cleanup
2. **`api/ai.php`** — routes: `GET/POST models`, `GET/POST/PATCH/DELETE /conversations[/{id}]`, `POST /conversations/{id}/messages` (SSE: `start`/`delta`/`reason`/`error`/`[DONE]`), `POST /conversations/{id}/regenerate` (SSE), `POST/GET/DELETE /attachments` (magic-number validated images); auto-creates tables, `session_write_close()` before SSE
3. **`assets/js/ai-chat.js`** — `renderAiChat()` entry, `aiState`, model menu/tags, conversation list (open/create/rename/delete), welcome+suggestions, hand-rolled Markdown renderer, hljs code blocks, SSE parsing with throttled re-render, AbortController stop, regenerate, edit-and-resend (`edit_message_id`), copy, image attachments (picker/drag-drop, pending chips, vision gating), responsive sidebar overlay
4. **Integration** — `index.php`: new "AI Assistant" nav group + `data-view="ai-chat"` pill, `ai-chat.js` script before `app.js`, highlight.js 11.9.0 (atom-one-dark) CDN; `app.js`: `viewMeta['ai-chat']` entry + `case 'ai-chat'` in `dispatchRender`; `style.css` v128 appended `ch-` block (uses `calc(100vh - 140px)` like `.rte-wrap`)

### Key Files
- `config.php` — `NVIDIA_API_KEY=''` (unset), `NVIDIA_BASE_URL`, `NVIDIA_DEFAULT_MODEL`, `AI_SYSTEM_PROMPT` (ficksie-specific), attachment/message/`NVIDIA_MODELS_CACHE_TTL` config
- `includes/ai.php` — `AiHelper`, the whole backend brain
- `api/ai.php` — REST routes + SSE + uploads
- `api/index.php` — `case 'ai'` registered (line ~72)
- `assets/js/ai-chat.js` — frontend (v=1)
- `assets/css/style.css` — `ch-` block (v=128)
- `index.php` — nav pill + script includes + CSS version `?v=128`

### Known Quirks / Rules
- **API key never in the browser** — only `config.php` → `AiHelper`
- Attachment images served inline from same origin only; validated by creator + magic number; pending rows cleaned up on delete
- SSE lines: `data: {json}` and final `data: [DONE]`; the frontend parses newline-delimited `data:` lines
- `buildRequestMessages()` injects current model context; vision models get `image_url` data-URIs
- DB timezone rule applies (use `UTC_TIMESTAMP()`); `ai_messages` has a `reasoning` column
- Model menu + welcome banner degrade gracefully when `NVIDIA_API_KEY` is empty (setup mode)
- `aiState.listInited` guards duplicate model fetch; `chSyncAfterStream()` converges placeholder ids after each stream
- **First-question throttle bug (fixed)** — `throttleOk()` used `last_message_at`, which `createConversation` sets at creation time, so a brand-new conversation's very first message was rejected with "You are sending messages too quickly." It now returns true when the conversation has zero messages.
- **SSE handlers must `return` after streaming** — in `api/ai.php` the `messages`/`regenerate` POST branches must `return` immediately after `ai_handle_send()`/`ai_handle_regenerate()`. Otherwise control falls through to `Response::error('Method not allowed', 405)`, which fires `http_response_code()` after SSE headers and pollutes the error log ("headers already sent").

### To Finish
1. Set `NVIDIA_API_KEY` in `config.php` (from https://build.nvidia.com)
2. Live HTTP streaming smoke test (curl `POST /api/ai/conversations/{id}/messages`, expect `data:` SSE lines)
3. Test real vision flow with a Qwen-VL / Gemma 3 / Llama 4 model

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
- **AI tables MUST be utf8mb4** — `config.php` sets `DB_CHARSET = 'utf8mb4'`, but MariaDB's server default is latin1, so `api/ai.php` CREATE TABLE statements and `database/schema.sql` MUST append `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`. If a table ends up latin1, model output containing non-Latin-1 chars (em-dash, U+2011 `‑`, smart quotes) makes `AiHelper::updateAssistantMessage()` throw `1366 Incorrect string value` after SSE already streamed — the assistant row stays empty and the UI shows "(no response)". If you ever see empty assistant rows + "headers already sent at includes/ai.php" warnings, check `SHOW TABLE STATUS` collation on `ai_messages`.

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
