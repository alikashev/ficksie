# Ficksie

A modular web application for managing developer tools — store Linux commands, save email response snippets, anonymize email addresses, analyze DNS, check SSL certificates, generate CSRs, decode certificates, investigate IP reputation, test email deliverability, transform text with 34 built-in operations, and track customer reviews across hosting platforms. Built with PHP + MySQL and a vanilla JavaScript SPA frontend.

No build tools, no Node.js, no framework dependencies. Just upload and go.

## Features

- **Authentication** — Secure login/register system with bcrypt passwords, session management, and admin user management.
- **Command Hub** — Store, organize, and copy Linux commands (quotes and multi-line commands copy fully). Group them by category with color-coded badges. Compact 3-column card grid (2 below 1400px, 1 on mobile) with per-row equal heights, descriptions shown above scrollable two-line command previews, plus live search and category filtering.
- **Snippets** — Save standard email responses and copy them as plain text with whitespace preserved.
- **Email Anonymizer** — Instantly mask email addresses (preserves first character and TLD).
- **Email Header Visualizer** — Parse and analyze email headers for forensic traces.
- **Text Editor** — Rich text editor with templates and variables.
- **Password Generator** — Generate strong random passwords with customizable length and character sets.
- **DNS Lookup Suite** — Comprehensive DNS analysis with a two-column layout: main card shows A, AAAA, CNAME, MX, TXT, CAA, SRV, SOA records, SPF/DKIM/DMARC validation, nameserver checks, delegation analysis, reverse DNS (PTR), subdomain discovery, DNSSEC status, EDNS support, email authentication, propagation, and protocol detection. Right sidebar shows WHOIS, SSL certificates, and a built-in dig query tool. Export to JSON, PDF, or clipboard.
- **SSL/TLS Toolkit** — Certificate checker, chain validator, TLS version tester, HSTS checker, combined security audit, CSR decoder, and CSR generator with SAN support.
- **Email Deliverability Tester** — Generate a unique test email address, send an email to it, and receive a comprehensive analysis of authentication (SPF, DKIM, DMARC, ARC), message structure, MIME, HTML quality, content signals, links, attachments, and delivery path. Produces a transparent 0-100 score with actionable recommendations.
- **Text Toolkit** — 34 client-side text operations in six categories: Transform (case conversion, slugs, reversing), Clean (trim, dedupe, sort, strip HTML/entities/punctuation), Extract (domains, URLs, emails, IPs, numbers, hashtags), Encode/Decode (URL, Base64), Format (JSON, CSV, line numbers), and Analyze (text statistics, word frequency, find & replace, regex tester). Everything runs locally in the browser — no data ever leaves your machine.
- **IP Reputation Checker** — Aggregate data from ip-api.com (ASN/GeoIP), Spamhaus DNSBL, TOR exit node detection, AbuseIPDB, and VirusTotal. Computes a risk score and reputation rating.
- **Review Tracker** — Track and manage customer review requests across hosting platforms (Yourhosting, Versio, Argeweb, Hosting.nl) on Trustpilot, Google, and Webhosters. Monthly stats bar with requested/received counts and bonus calculation (€20/received). Inline status toggling, star ratings, search, multi-column filtering, and a full CRUD modal.
- **Dashboard** — Quick overview of all tools with stats, CRM & provider links, and external tool shortcuts with branded icons.
- **Spotlight Search** — Press `Ctrl+F` (`Cmd+F` on Mac) anywhere for a Spotlight-style overlay that searches every tool, CRM/provider link, nested sub-link, and external tool with keyboard navigation and match highlighting.
- **Collapsible Sidebar** — Tools organized into collapsible groups (Email Tools, Text & Content, Network & Security, Utility, Sales, Administration). Groups save open/closed state. Desktop collapsed (icon-only) mode shows groups on hover. Admin group pinned to bottom.
- **Multi-tab SPA** — Open multiple tools simultaneously in tabs (up to 10). Each tab preserves its own state.
- **Dark/Light theme** — Persistent toggle.
- **Responsive** — Works on desktop and mobile.

## Requirements

- PHP 8.0+
- MySQL 5.7+ / MariaDB 10.3+
- Apache with mod_rewrite (or any server that supports URL rewriting)
- PHP extensions: `openssl`, `curl` (optional, for DNSSEC DS lookups)

## Quick Start

### 1. Upload

Copy the project files into your web root (e.g. `public_html/` or `htdocs/`).

### 2. Create the database

Using phpMyAdmin or the MySQL CLI, run the schema and seed scripts in order:

```sql
source database/schema.sql;
source database/seed.sql;
```

### 3. Configure

Copy `config.example.php` to `config.php` and edit it with your database credentials and optional API keys:

```php
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'your_database');
define('DB_USER', 'your_user');
define('DB_PASS', 'your_password');
define('DB_CHARSET', 'utf8mb4');

define('APP_NAME', 'ficksie');
define('APP_URL', 'https://yourdomain.com');
define('APP_ENV', 'production'); // development | production
define('DEBUG', false);

// Timezone
date_default_timezone_set('UTC');

// IP Reputation API Keys (optional — leave empty to skip those sources)
define('ABUSEIPDB_KEY', '');    // https://www.abuseipdb.com/register
define('VIRUSTOTAL_KEY', '');   // https://www.virustotal.com/gui/join-us

// Email Deliverability Tester (required for Email Tester)
define('EMAIL_TEST_DOMAIN', 'test.yourdomain.com');
```

### 4. Visit

Open `https://yourdomain.com/` in your browser. The first user to register becomes the admin.

## Configuration Reference

| Config | Description | Default |
|---|---|---|
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_NAME` | Database name | — |
| `DB_USER` | Database user | — |
| `DB_PASS` | Database password | — |
| `DB_CHARSET` | Connection charset | `utf8mb4` |
| `APP_NAME` | Application name | `ficksie` |
| `APP_URL` | Base URL (no trailing slash) | — |
| `APP_ENV` | `development` or `production` | `production` |
| `DEBUG` | Show detailed errors | `false` |
| `ABUSEIPDB_KEY` | AbuseIPDB API key (optional) | `''` |
| `VIRUSTOTAL_KEY` | VirusTotal API key (optional) | `''` |
| `EMAIL_TEST_DOMAIN` | Domain for generating test email addresses (required for Email Tester) | `''` |

## Development

Use the built-in PHP server for local development:

```bash
php -S localhost:8080 router.php
```

Then open `http://localhost:8080/`.

## Project Structure

```
├── api/                        # REST API endpoints
│   ├── index.php               # Router (dispatches to handlers)
│   ├── auth.php                # Login, register, logout, user management
│   ├── commands.php            # Command CRUD
│   ├── categories.php          # Category CRUD
│   ├── modules.php             # Tool module registry
│   ├── snippets.php            # Snippet CRUD
│   ├── search.php              # Global search
│   ├── dns.php                 # DNS Lookup Suite
│   ├── ssl.php                 # SSL/TLS (check, chain, tls, hsts, audit, csr-decode, csr-generate)
│   ├── ip-reputation.php       # IP Reputation Checker
│   ├── email-test.php          # Email Deliverability Tester (test creation, status, analysis)
│   ├── email-test-receive.php  # Webhook for receiving raw emails (no auth required)
│   ├── email-test-pipe.php     # Exim pipe transport script with DNS-based auth checks
│   └── reviews.php             # Review Tracker CRUD (list, create, update, delete)
├── assets/
│   ├── css/style.css           # Complete stylesheet
│   └── js/
│       ├── app.js              # SPA core, tab system, dashboard, Spotlight search, sidebar
│       ├── dns.js              # DNS tool frontend logic
│       ├── ssl-toolkit.js      # SSL/TLS tool frontend logic (audit, CSR decoder, CSR generator)
│       ├── password-generator.js # Password generator frontend logic
│       ├── email-tester.js     # Email Deliverability Tester frontend logic
│       ├── review-tracker.js   # Review Tracker frontend logic
│       └── text-toolkit.js     # Text Toolkit frontend logic (34 client-side operations)
├── database/
│   ├── schema.sql              # Database tables
│   └── seed.sql                # Sample data
├── includes/
│   ├── database.php            # PDO singleton
│   ├── functions.php           # Route parser, CORS, sanitization, auth helpers
│   ├── response.php            # JSON response helpers
│   ├── email-parser.php        # Raw email parser (headers, MIME, links, attachments)
│   └── email-analyzer.php      # Deliverability analysis engine (scoring, findings)
├── config.php                  # Application configuration (gitignored)
├── config.example.php          # Configuration template
├── index.php                   # SPA entry point (sidebar, modals, loads all JS/CSS)
├── router.php                  # Dev server router
└── .htaccess                   # Apache rewrite rules
```

## Tools

### Authentication

Session-based auth with bcrypt password hashing. Registration is only available when no users exist (first user becomes admin). Admins can create, update, and delete users through the API.

- `POST /api/auth/login` — Sign in
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Current user info
- `POST /api/auth/register` — Create first admin account
- `GET /api/auth/users` — List users (admin)
- `POST /api/auth/users` — Create user (admin)
- `PUT /api/auth/users/{id}` — Update user (admin)
- `DELETE /api/auth/users/{id}` — Delete user (admin)

### DNS Lookup Suite

Full DNS analysis for any domain. Results are cached in the database for 30 minutes. Two-column layout: main card (records, auth, security, delegation, propagation, protocols, export) and right sidebar (WHOIS, SSL, Dig).

- **Record lookups** — A, AAAA, CNAME (with chain tracing), MX, TXT, CAA, SRV, SOA
- **Email security** — SPF validation (mechanism parsing, lookup count, deprecation warnings), DKIM selector scanning, DMARC policy analysis
- **Nameserver checks** — Reachability, consistency, delegation validation, glue record verification
- **Reverse DNS** — PTR lookups for IPv4/IPv6, FCrDNS validation, custom PTR overrides
- **Subdomains** — Common subdomain discovery (www, mail)
- **DNSSEC** — DS/DNSKEY/RRSIG record detection, trust chain validation
- **EDNS** — Support detection
- **Dig tool** — Query any record type against any nameserver (in sidebar)
- **Export** — JSON, PDF, clipboard copy

### SSL/TLS Toolkit

Three tools merged into one, plus a combined audit mode:

#### Certificate Audit (combined)
- Runs cert check, chain validation, TLS version scan, and HSTS analysis in a single request
- Overall status banner reflects the worst finding across all checks
- Chain analysis includes CA bundle verification with fallback for `open_basedir`-restricted environments
- HSTS grade (A–F) and missing-HSTS detection surfaced in overall status

#### Certificate Check
- Expiry dates, days remaining, subject/issuer info, SANs, wildcard coverage detection
- Self-signed detection, serial number, fingerprint (SHA-256), signature algorithm

#### Chain Validator
- Full certificate chain reconstruction from server
- Signature verification between each link using `openssl_x509_verify`
- Root detection (self-signed vs intermediate CA)
- CA bundle verification — checks if the last cert's issuer exists in the system trust store
- Visual chain display with missing root card and fix instructions

#### TLS Version Tester
- Probes TLS 1.0–1.3 support with cipher, bit strength, and connection timing
- Security notes for deprecated versions (1.0/1.1) and missing modern versions (1.3)

#### HSTS Checker
- Header detection, max-age/subdomains/preload evaluation
- Scored 0–80, graded A–F
- Recommendations for missing or weak configuration

#### CSR Decoder
- Paste a CSR to decode subject, organization, SANs, key size, signature algorithm, and challenge password

#### CSR Generator
- Generate CSRs with customizable subject fields and SANs (domains + IPs)
- Supports ECDSA (P-256/P-384) and RSA (2048/4096) key types
- Outputs PEM-encoded CSR and private key, copy/download ready

### IP Reputation Checker

Aggregates multiple threat intelligence sources:

- **ip-api.com** — ASN, GeoIP, ISP, hosting/proxy/mobile detection
- **Spamhaus ZEN** — DNS-based blacklist lookup
- **TOR exit nodes** — Exit node detection
- **AbuseIPDB** — Abuse confidence score and reports (requires API key)
- **VirusTotal** — Multi-engine detection ratio (requires API key)

Returns a composite risk score (0–100) and reputation rating (safe/suspicious/malicious).

### Password Generator

Client-side password generator with customizable length and character classes (uppercase, lowercase, digits, symbols).

### Text Toolkit

Thirty-four text operations, all executed client-side (100% private — nothing is sent to the server). Organized into six categories with a quick-action bar, live char/word counts, and copy/download/swap/paste/clear actions:

- **Transform** — UPPERCASE, lowercase, Title Case, Sentence case, URL slug (Unicode-aware), reverse text, reverse lines, shuffle lines
- **Clean** — Trim lines, remove empty lines, deduplicate lines, sort lines (natural/alphanumeric, case options), strip HTML tags, decode HTML entities, remove punctuation, tabs ↔ spaces, add prefix/suffix
- **Extract** — Domains (with TLD validation), URLs (balanced-paren aware), email addresses, IP addresses (IPv4 + IPv6), numbers, hashtags & mentions
- **Encode / Decode** — URL encode/decode (malformed input surfaces an error), Base64 encode/decode (Unicode-safe via TextEncoder)
- **Format** — JSON formatter/minifier/validator (error position reporting), CSV → columns with separator options, line numbering
- **Analyze** — Text statistics (9 metrics incl. reading time), word frequency with bar chart, find & replace (case/whole-word options), regex tester with capture groups and flag toggles

Debounced live refresh as you type; fixed-height panels so switching operations never shifts the layout.

### Email Deliverability Tester

A Mail-Tester-inspired tool for testing email deliverability and authentication. Generates a unique temporary email address, receives the test email, and produces a comprehensive analysis.

#### Features

- **Authentication Analysis** — SPF, DKIM, DMARC, and ARC verification with detailed results, DNS record display, alignment checks, and DKIM crypto verification
- **Message Structure** — MIME structure analysis, plain-text/HTML detection, attachments
- **Content Quality** — Spam word detection, uppercase analysis, punctuation, subject line review, dangerous HTML detection, short URL detection
- **Link Analysis** — URL extraction, HTTPS status, malformed URL detection
- **Delivery Path** — Received header parsing, hop count, sending IP tracking, PTR validation, TLS detection
- **Spam Signals** — X-Spam-Score/Flag detection, List-Unsubscribe presence, blocklist checking (13 DNSBLs)
- **Transparent Scoring** — 0-100 score with clear grade (Excellent/Good/Fair/Poor/Critical) and intelligent recommendations

#### Configuration

Add to `config.php`:

```php
define('EMAIL_TEST_DOMAIN', 'test.yourdomain.com');
```

#### Mail Server Setup

To receive emails for the test domain, configure your mail server to deliver emails sent to `*@EMAIL_TEST_DOMAIN` to the Ficksie receive endpoint:

**Option 1: Postfix Pipe Transport**

Add to `/etc/aliases` or Postfix transport:
```
test-*: "| curl -X POST -H 'Content-Type: application/json' -d '{\"to\":\"$USER\",\"raw_email\":\"$(cat)\"}' https://yourdomain.com/api/email-test-receive"
```

**Option 2: Exim Pipe Transport**

Route mail for the test domain through the included pipe script (`api/email-test-pipe.php`), which performs DNS-based SPF/DKIM/DMARC checks, PTR validation, TLS detection, HELO extraction, and blocklist lookups before injecting `Authentication-Results` headers:

```
test_domain:
    driver = redirect
    domains = +local_domains
    local_part_prefix = test-
    data = "|/usr/bin/php /path/to/public_html/api/email-test-pipe.php ${local_part}"
    pipe_transport = address_pipe
```

**Option 3: Forward to a Script**

Set up a mail alias that pipes the raw email to a PHP script which POSTs to the receive endpoint.

**Option 4: External Webhook**

Configure an external mail-forwarding service or inbound email provider to POST raw emails to:
```
POST https://yourdomain.com/api/email-test-receive
Content-Type: application/json
Body: {"to": "test-xxxx@yourdomain.com", "raw_email": "...raw email..."}
```

#### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/email-test/create` | Generate a new test email address |
| GET | `/api/email-test/status/{token}` | Check test status |
| GET | `/api/email-test/analysis/{token}` | Get full analysis results |
| POST | `/api/email-test/check` | Check for received email and analyze |
| GET | `/api/email-test/tests` | List recent tests |
| POST | `/api/email-test-receive` | Webhook to receive raw emails (no auth) |

#### Security

- Raw email content is stored temporarily in the database
- Tests expire after 1 hour
- Each user can only access their own tests
- Received email HTML is never rendered directly in the UI
- The receive webhook validates recipient addresses against existing tests
- Old tests are cleaned up automatically

#### Cleanup

Tests in `waiting` status are automatically marked as `expired` after their `expires_at` time. You can periodically clean up old records:

```sql
DELETE FROM email_tests WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
```

### Review Tracker

Track and manage customer review requests across hosting brands and review platforms. Full CRUD with monthly stats and bonus calculation.

#### Features

- **Monthly Stats Bar** — Centered stats bar with month navigation showing requested count (amber), received count, and bonus (€20 per received review)
- **Review Table** — Ticket number, customer name, date, label badge (color-coded per brand), platform badge (with icon), star rating, clickable status toggle, external review link, edit/delete actions
- **Inline Status Toggle** — Click the status badge to flip between "Review Requested" and "Review Received" without opening the modal
- **Add/Edit Modal** — Full form with ticket number, customer name, date, label, platform, interactive star rating input with hover preview and clear button, optional review link and notes
- **Search** — Live search across ticket number, customer name, label, and platform
- **Filtering** — Four-column filter row: Label, Platform, Status, Rating
- **Received Highlight** — Rows with "Review Received" status get a green background

#### Supported Labels
Yourhosting, Versio, Argeweb, Hosting.nl

#### Supported Platforms
Trustpilot, Google, Webhosters

#### API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/reviews` | No | List all reviews. Supports `?search=`, `?status=`, `?label=`, `?platform=`, `?rating=` filters |
| GET | `/api/reviews/{id}` | No | Get a single review |
| POST | `/api/reviews` | Yes | Create a new review |
| PUT | `/api/reviews/{id}` | Yes | Update a review (partial updates supported) |
| DELETE | `/api/reviews/{id}` | Yes | Delete a review |

#### Database Schema

```sql
CREATE TABLE reviews (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED DEFAULT NULL,
    ticket_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    review_date   DATE NOT NULL,
    label         ENUM('Yourhosting','Versio','Argeweb','Hosting.nl') NOT NULL,
    platform      ENUM('Trustpilot','Google','Webhosters') NOT NULL,
    rating        TINYINT UNSIGNED DEFAULT NULL,
    review_link   VARCHAR(500) DEFAULT NULL,
    notes         TEXT DEFAULT NULL,
    status        ENUM('Review Requested','Review Received') NOT NULL DEFAULT 'Review Requested',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

## Dashboard

The dashboard includes:

- **Spotlight Search** — `Ctrl+F` / `Cmd+F` opens a Spotlight-style overlay (frosted blur, keyboard navigation with arrow keys, Enter to open, Esc to close). Available from any tab. Searches all tools (with hidden keywords, e.g. "cert" finds SSL/TLS), CRM & provider links including nested sub-links, external tools, and user management. Tools open in-app; links open in a new tab.
- **Tool cards** — Quick access to all tools with descriptions and icons
- **Stats** — Command count, snippet count, registered users
- **CRM & Provider Links** — Direct links to hosting provider panels (Versio, Flexwebhosting, Neostrada, Yourhosting, etc.) with expandable sub-links, sorted alphabetically with branded icon initials
- **External Tools** — Quick access to third-party services (ScoreBuddy, Realtime Register, Jira, Openprovider, email, etc.) sorted alphabetically with branded icon initials

## Architecture Notes

### SPA Tab System
- Multi-tab interface — open multiple tools in parallel, each with independent state
- Up to 10 concurrent tabs
- Tabs persist across navigation; switching tabs is instant (CSS toggle only)
- Each tool's render function manages its own DOM within a tab panel

### Collapsible Sidebar
- Tools organized into collapsible groups: Email Tools, Text & Content, Network & Security, Utility, Sales, Administration
- Group open/closed state persists to `localStorage`
- Desktop collapsed (icon-only) mode: groups hidden by default, revealed on sidebar hover
- Admin group pinned to bottom, always expanded
- Mobile: all groups always expanded with labels visible

### Spotlight Search
- Moved from per-dashboard to a global overlay in `index.php`
- Works from any tab, not just dashboard
- `Ctrl+F` / `Cmd+F` triggers globally (skips if focused on input/textarea)

### SSL/TLS Backend Details
- Chain validation uses `openssl_x509_verify` with PEM strings (pure PHP, no exec)
- CA bundle lookup has a three-tier fallback: `/etc/ssl/certs/ca-certificates.crt` → `/etc/pki/tls/certs/ca-bundle.crt` → `/home/admin/tmp/ca-bundle.crt` (copy inside `open_basedir`)
- The fallback copy is kept in sync via a monthly cron job
- TLS version probing uses `stream_socket_client` with per-version `crypto_method` flags

### DNS Two-Column Layout
- Main card (left): DNS records, email auth, security, delegation, propagation, protocols, export
- Sidebar (right): WHOIS, SSL certificates, dig tool
- Responsive: stacks to single column below 1100px

### Frontend Caching
- Static assets use `?v=N` cache busters in `index.php` — bump the version number when modifying JS or CSS
- When behind Cloudflare, query-string cache busters are essential for busting the CDN cache

### Frontend Security Notes
- All user-supplied content is rendered through `escHtml()` before insertion into HTML templates
- Never embed dynamic text in HTML `data-*` attributes for later retrieval — `escHtml()` does not escape double quotes, so values containing quotes break the attribute and get truncated. Instead, tag elements with an ID and look the value up from JS state

## Adding a Tool

1. Add a database table in `database/schema.sql` (if needed)
2. Add an API endpoint in `api/`
3. Register the route in `api/index.php`
4. Add the tool config in the `tools` array in `assets/js/app.js`
5. Add the render function — either in `assets/js/app.js` (like `renderDnsLookup`) or a dedicated file like `assets/js/text-toolkit.js` exposing `renderXxx()` (load it via `<script>` in `index.php` before `app.js`)
6. Add the tool card to the dashboard tools grid and to the Spotlight index (`spMount` in `assets/js/app.js`)
7. Add the sidebar pill in `index.php` (inside the appropriate collapsible nav group)
8. Add a `viewMeta` entry in `assets/js/app.js` with title, tabLabel, subtitle, and icon
9. Add CSS styles in `assets/css/style.css`, prefixed with your tool's abbreviation (e.g. `tt-`, `ssl-`, `edt-`, `rt-`)
10. Bump the `?v=N` cache buster for every modified JS/CSS file in `index.php`

## Version History

### v1.2.2 (2026-09-04)
- **New: Review Tracker** — Full CRUD tool for tracking customer review requests across hosting brands and platforms. Monthly stats bar with requested/received/bonus counters, inline status toggle, star ratings, search, multi-column filtering
- **Sidebar redesign** — Collapsible nav groups replacing flat link list. Groups: Email Tools, Text & Content, Network & Security, Utility, Sales, Administration. Persistent state, desktop collapsed mode, admin pinned to bottom
- **DNS two-column layout** — WHOIS, SSL, and Dig moved to a right sidebar. Responsive: stacks below 1100px
- **Spotlight Search globalized** — Moved from dashboard-only to a global overlay. Works from any tab with `Ctrl+F`/`Cmd+F`
- **Tab limit raised** — From 5 to 10 concurrent tabs
- **Cache busters bumped** — All JS and CSS versions updated

### v1.2.1
- Email Deliverability Tester with professional-grade scoring (0-100)
- Email parser and analyzer overhaul
- Exim pipe script with DNS-based auth checks, PTR, TLS, HELO, blocklist
- Frontend redesign with auth detail panels, recommendations, network cards

### v1.2.0
- SSL/TLS Toolkit: cert check, chain validator, TLS tester, HSTS checker, CSR decoder, CSR generator
- IP Reputation Checker with AbuseIPDB and VirusTotal integration
- Dashboard CRM and external tool links

### v1.1.0
- DNS Lookup Suite with comprehensive record analysis
- Email Anonymizer and Header Visualizer
- Text Editor with templates

### v1.0.0
- Initial release: Authentication, Command Hub, Snippets, Password Generator, Dashboard
