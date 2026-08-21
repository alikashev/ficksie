/**
 * Text Toolkit — client-side text utilities
 *
 * All operations run 100% in the browser. No user text is ever sent to,
 * or stored on, the server.
 */

const ttState = {
    input: '',
    category: 'analyze',
    op: 'stats',
    outputText: '',
    jsonMode: 'format',
};

// ============================================
// Shared helpers
// ============================================
function ttDebounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function ttLines(text) {
    return text.replace(/\r\n?/g, '\n').split('\n');
}

function ttShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const r = new Uint32Array(1);
        crypto.getRandomValues(r);
        const j = r[0] % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function ttDecodeEntities(s) {
    // Detached <textarea>: entities are decoded by the parser but the
    // result is only ever read back as plain text, never inserted as HTML.
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
}

function ttB64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

function ttB64Decode(str) {
    let s = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function ttDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Domain helpers
// ============================================
const TT_TLDS = new Set([
    // generic
    'com','net','org','gov','edu','mil','int','info','biz','xyz','online','site','store',
    'tech','cloud','app','dev','io','ai','co','me','tv','cc','wiki','blog','shop','forum',
    'agency','digital','studio','design','media','news','email','network','systems','software',
    'expert','support','care','finance','legal','medical','health','travel','tours','estate',
    'properties','house','garden','tips','guru','academy','education','institute','school',
    'training','engineering','construction','services','repair','cleaning','fitness','yoga',
    'kitchen','recipes','coffee','pizza','pub','bar','restaurant','money','capital','fund',
    'cash','gold','insurance','credit','loans','mortgage','bank','market','deals','discount',
    'gift','coupons','shopping','boutique','fashion','clothing','shoes','jewelry','beauty',
    'salon','spa','games','toys','fun','party','wedding','photography','photos','video',
    'films','music','art','club','life','world','today','zone','team','work','works','tools',
    'solutions','company','group','ventures','ventures','partners','consulting','management',
    'technology','directory','center','community','exchange','farm','fish','florist','food',
    'foundation','furniture','gallery','game','graphics','hardware','holdings','industries',
    'land','limo','link','live','maison','marketing','mobility','motorcycles','name','energy',
    'parts','photo','plumbing','press','productions','prof','realty','rentals','research',
    'sexy','shoes','single','social','solar','supply','tax','tattoo','taxi','theater','tienda',
    'town','toys','university','vacations','vision','vodka','voyage','watch','wine','website',
    // country codes with second-level use
    'nl','be','uk','de','fr','es','it','eu','us','ca','au','nz','jp','kr','cn','in','br','mx',
    'za','ch','at','se','no','dk','fi','pt','pl','gr','cz','sk','hu','ro','bg','hr','rs','si',
    'lt','lv','ee','is','lu','li','mt','cy','ie','tr','il','ae','sa','eg','ng','ke','gh','ma',
    'tn','uz','kz','ge','am','by','ua','ru','tm','pk','bd','lk','np','th','vn','ph','sg','hk',
    'tw','my','id','ir','iq','sy','lb','jo','kw','bh','qa','om','ye','ly','dz','et','tz','ug',
    'zw','mw','mz','na','bw','ls','sz','gm','gn','sl','lr','ar','cl','co','pe','ve','bo','py',
    'uy','ec','do','cr','pa','gt','hn','ni','sv','bz','jm','tt','bb','bs','mu','re','yt','sh',
]);

function ttIsValidHostname(host) {
    if (!host || host.length > 253) return false;
    const labels = host.split('.');
    if (labels.length < 2) return false;
    return labels.every(l =>
        /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l)
    );
}

function ttHasKnownTld(host) {
    const last = host.slice(host.lastIndexOf('.') + 1);
    return TT_TLDS.has(last) || /^[a-z]{2}$/.test(last);
}

function ttExtractDomains(text, opts) {
    const found = [];
    const seen = new Set();
    const tokens = text.split(/[\s<>"'`\[\]{}|\\^~\u00A0]+/);

    for (let raw of tokens) {
        let tok = raw.replace(/^[,;:!?.]+|[,;:!?.]+$/g, '');
        if (!tok) continue;

        let host;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(tok) || /^www\./i.test(tok) || tok.includes('/')) {
            host = tok.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
            host = host.split(/[/?#]/)[0];
            const at = host.lastIndexOf('@');
            if (at !== -1) host = host.slice(at + 1);
            host = host.replace(/:\d+$/, '');
        } else if (tok.includes('@')) {
            host = tok.slice(tok.lastIndexOf('@') + 1);
        } else {
            host = tok.replace(/:\d+$/, '');
        }

        host = host.toLowerCase().replace(/\.+$/g, '');
        if (!host || !host.includes('.')) continue;
        if (!ttIsValidHostname(host)) continue;
        if (!ttHasKnownTld(host)) continue;

        if (!opts.keepWww) host = host.replace(/^www\./, '');
        if (!opts.includeSubdomains) {
            const parts = host.split('.');
            if (parts.length > 2) host = parts.slice(-2).join('.');
        }
        if (!host || seen.has(host)) continue;
        seen.add(host);
        found.push(host);
    }
    if (opts.sort) found.sort();
    return found;
}

// ============================================
// IP helpers
// ============================================
const TT_IPV4_RE = /(?<![\w:.])(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?!\.?\d)(?!\w)/g;

const TT_IPV6_OCTET_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function ttIsValidIPv6(s) {
    if (!s.includes(':')) return false;
    const halves = s.split('::');
    if (halves.length > 2) return false;
    const hasEllipsis = halves.length === 2;

    const groupsOf = part => (part === '' ? [] : part.split(':'));
    let groups = hasEllipsis
        ? [...groupsOf(halves[0]), ...groupsOf(halves[1])]
        : groupsOf(s);

    // IPv4-mapped tail (e.g. ::ffff:192.168.0.1) counts as two groups
    let ipv4Tail = false;
    if (groups.length && groups[groups.length - 1].includes('.')) {
        const octets = groups[groups.length - 1].split('.');
        if (octets.length !== 4 || !octets.every(o => TT_IPV6_OCTET_RE.test(o))) return false;
        ipv4Tail = true;
        groups = groups.slice(0, -1);
    }

    if (!groups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;

    const total = groups.length + (ipv4Tail ? 2 : 0);
    return hasEllipsis ? total <= 7 : total === 8;
}

function ttExtractIps(text, includeV6) {
    const results = [];
    const seen = new Set();

    let m;
    TT_IPV4_RE.lastIndex = 0;
    while ((m = TT_IPV4_RE.exec(text)) !== null) {
        // Skip version strings like "version 1.2.3.4" / "v 1.2.3.4"
        if (/(?:\bv\.?|version)\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
        if (!seen.has(m[0])) {
            seen.add(m[0]);
            results.push({ ip: m[0], idx: m.index });
        }
    }

    if (includeV6) {
        const candidates = text.split(/[^0-9A-Fa-f:.]+/);
        let offset = 0;
        for (const cand of candidates) {
            const c = cand.trim();
            if (c.includes(':') && ttIsValidIPv6(c) && !seen.has(c.toLowerCase())) {
                seen.add(c.toLowerCase());
                results.push({ ip: c, idx: text.indexOf(c, offset) });
            }
            offset += cand.length;
        }
    }

    results.sort((a, b) => a.idx - b.idx);
    return results.map(r => r.ip);
}

// ============================================
// Operation registry
// ============================================
const TT_CATEGORIES = [
    { id: 'transform', label: 'Transform',      icon: 'fa-wand-magic-sparkles' },
    { id: 'clean',     label: 'Clean',          icon: 'fa-broom' },
    { id: 'extract',   label: 'Extract',        icon: 'fa-filter' },
    { id: 'encode',    label: 'Encode / Decode', icon: 'fa-code' },
    { id: 'format',    label: 'Format',         icon: 'fa-indent' },
    { id: 'analyze',   label: 'Analyze',        icon: 'fa-chart-bar' },
];

const TT_OPS = {
    // ─── Transform ───────────────────────────────────────────────────────
    uppercase: {
        cat: 'transform', label: 'Uppercase',
        run(t) { return { text: t.toUpperCase(), status: { type: 'ok', msg: 'Converted to uppercase' } }; },
    },
    lowercase: {
        cat: 'transform', label: 'Lowercase',
        run(t) { return { text: t.toLowerCase(), status: { type: 'ok', msg: 'Converted to lowercase' } }; },
    },
    titlecase: {
        cat: 'transform', label: 'Title Case',
        run(t) {
            const out = t.toLowerCase().replace(
                /(^|[\s(\[{"'\u2018\u201C\u2013\u2014-])(\p{L})/gu,
                (m, p1, p2) => p1 + p2.toUpperCase()
            );
            return { text: out, status: { type: 'ok', msg: 'Converted to Title Case' } };
        },
    },
    sentencecase: {
        cat: 'transform', label: 'Sentence Case',
        run(t) {
            const out = t.toLowerCase().replace(
                /(^\s*|[.!?]["')\]]*\s+|\n\s*)(\p{L})/gu,
                (m, p1, p2) => p1 + p2.toUpperCase()
            );
            return { text: out, status: { type: 'ok', msg: 'Converted to sentence case' } };
        },
    },
    slug: {
        cat: 'transform', label: 'Slug Generator',
        run(t) {
            const out = t
                .replace(/\u00DF/g, 'ss').replace(/\u00C6/g, 'Ae').replace(/\u00E6/g, 'ae')
                .replace(/\u00D8/g, 'Oe').replace(/\u00F8/g, 'oe')
                .replace(/\u00C5/g, 'Aa').replace(/\u00E5/g, 'aa')
                .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            return { text: out, status: { type: 'ok', msg: out ? 'Slug generated' : 'Result is empty' } };
        },
    },
    'reverse-text': {
        cat: 'transform', label: 'Reverse Text',
        run(t) { return { text: Array.from(t).reverse().join(''), status: { type: 'ok', msg: 'Text reversed' } }; },
    },
    'reverse-lines': {
        cat: 'transform', label: 'Reverse Lines',
        run(t) {
            const lines = ttLines(t).reverse();
            return { text: lines.join('\n'), status: { type: 'ok', msg: `${lines.length} lines reversed` } };
        },
    },
    'shuffle-lines': {
        cat: 'transform', label: 'Shuffle Lines',
        run(t) {
            const lines = ttShuffle(ttLines(t));
            return { text: lines.join('\n'), status: { type: 'ok', msg: `${lines.length} lines shuffled` } };
        },
    },

    // ─── Clean ───────────────────────────────────────────────────────────
    trim: {
        cat: 'clean', label: 'Whitespace Cleanup',
        options() {
            return `
                ${ttCheck('trimTrim', 'Trim start/end of each line', true)}
                ${ttCheck('trimCollapse', 'Collapse multiple spaces to one', false)}
                ${ttCheck('trimEol', 'Normalize line endings (CRLF \u2192 LF)', true)}
                ${ttCheck('trimEmpty', 'Remove empty lines', false)}
                <button class="btn btn-secondary btn-sm" id="ttTrimAll"><i class="fas fa-check-double"></i> Clean all</button>
            `;
        },
        initOptions(root) {
            root.querySelector('#ttTrimAll')?.addEventListener('click', () => {
                ['trimTrim', 'trimCollapse', 'trimEol', 'trimEmpty'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.checked = true;
                });
                ttRefresh();
            });
        },
        run(t) {
            let s = t;
            let lineCount = 0;
            if (document.getElementById('trimEol')?.checked ?? true) s = s.replace(/\r\n?/g, '\n');
            if (document.getElementById('trimTrim')?.checked ?? true) {
                s = ttLines(s).map(l => l.trim()).join('\n');
                lineCount++;
            }
            if (document.getElementById('trimCollapse')?.checked) s = s.replace(/[ \t]{2,}/g, ' ');
            if (document.getElementById('trimEmpty')?.checked) s = ttLines(s).filter(l => l.trim() !== '').join('\n');
            return { text: s, status: { type: 'ok', msg: 'Whitespace cleaned' } };
        },
    },
    'remove-empty-lines': {
        cat: 'clean', label: 'Remove Empty Lines',
        run(t) {
            const lines = ttLines(t).filter(l => l.trim() !== '');
            return { text: lines.join('\n'), status: { type: 'ok', msg: `${lines.length} non-empty lines kept` } };
        },
    },
    'dedupe-lines': {
        cat: 'clean', label: 'Remove Duplicate Lines',
        options() {
            return `
                ${ttCheck('dedupeCi', 'Case-insensitive comparison', false)}
                ${ttCheck('dedupeSort', 'Sort result A \u2192 Z', false)}
            `;
        },
        run(t) {
            const ci = document.getElementById('dedupeCi')?.checked;
            const sort = document.getElementById('dedupeSort')?.checked;
            const seen = new Set();
            const out = [];
            for (const line of ttLines(t)) {
                const key = ci ? line.toLowerCase() : line;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(line);
            }
            if (sort) out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            return { text: out.join('\n'), status: { type: 'ok', msg: `${out.length} unique lines` } };
        },
    },
    'sort-lines': {
        cat: 'clean', label: 'Sort Lines',
        options() {
            return `
                <div class="tt-field">
                    <label for="ttSortMode">Order</label>
                    <select id="ttSortMode" class="filter-select tt-select-sm">
                        <option value="az">Alphabetical A \u2192 Z</option>
                        <option value="za">Alphabetical Z \u2192 A</option>
                        <option value="num">Numeric</option>
                        <option value="len-asc">By length (shortest first)</option>
                        <option value="len-desc">By length (longest first)</option>
                    </select>
                </div>
                ${ttCheck('ttSortIgnoreEmpty', 'Ignore empty lines', true)}
            `;
        },
        run(t) {
            const mode = document.getElementById('ttSortMode')?.value || 'az';
            const ignoreEmpty = document.getElementById('ttSortIgnoreEmpty')?.checked ?? true;
            let lines = ttLines(t);
            const removedEmpty = ignoreEmpty ? lines.filter(l => l.trim() === '').length : 0;
            if (ignoreEmpty) lines = lines.filter(l => l.trim() !== '');

            const alpha = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            const num = v => {
                const m = /-?\d+(?:[.,]\d+)?/.exec(v);
                return m ? parseFloat(m[0].replace(',', '.')) : NaN;
            };

            switch (mode) {
                case 'za': lines.sort((a, b) => alpha(b, a)); break;
                case 'num': lines.sort((a, b) => { const x = num(a), y = num(b); if (isNaN(x) && isNaN(y)) return alpha(a, b); if (isNaN(x)) return 1; if (isNaN(y)) return -1; return x - y || alpha(a, b); }); break;
                case 'len-asc': lines.sort((a, b) => a.length - b.length || alpha(a, b)); break;
                case 'len-desc': lines.sort((a, b) => b.length - a.length || alpha(a, b)); break;
                default: lines.sort(alpha);
            }
            return { text: lines.join('\n'), status: { type: 'ok', msg: `${lines.length} lines sorted${removedEmpty ? ` \u00b7 ${removedEmpty} empty skipped` : ''}` } };
        },
    },
    'remove-html': {
        cat: 'clean', label: 'Remove HTML Tags',
        run(t) {
            const tagCount = (t.match(/<[^>]+>/g) || []).length;
            let s = t.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
            s = s.replace(/<br\s*\/?>/gi, '\n');
            s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote|pre)>/gi, '\n');
            s = s.replace(/<[^>]+>/g, '');
            s = ttDecodeEntities(s);
            s = ttLines(s).map(l => l.replace(/\s+$/g, '')).join('\n');
            s = s.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
            return { text: s, status: { type: 'ok', msg: `${tagCount} tag${tagCount === 1 ? '' : 's'} removed` } };
        },
    },
    'decode-entities': {
        cat: 'clean', label: 'HTML Entity Decode',
        run(t) {
            const out = ttDecodeEntities(t);
            return { text: out, status: { type: 'ok', msg: out !== t ? 'Entities decoded' : 'No entities found' } };
        },
    },
    'remove-punctuation': {
        cat: 'clean', label: 'Remove Punctuation',
        run(t) {
            const count = (t.match(/[^\p{L}\p{N}\s]/gu) || []).length;
            const out = t
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/[ \t]{2,}/g, ' ');
            return { text: ttLines(out).map(l => l.trim()).join('\n'), status: { type: 'ok', msg: `${count} punctuation character${count === 1 ? '' : 's'} removed` } };
        },
    },
    'tabs-spaces': {
        cat: 'clean', label: 'Tabs \u2194 Spaces',
        options() {
            return `
                <div class="tt-seg" id="ttTsMode">
                    <button class="tt-seg-btn active" data-mode="t2s" type="button">Tabs \u2192 Spaces</button>
                    <button class="tt-seg-btn" data-mode="s2t" type="button">Spaces \u2192 Tabs</button>
                </div>
                <div class="tt-field">
                    <label for="ttTsWidth">Spaces per tab</label>
                    <select id="ttTsWidth" class="filter-select tt-select-sm">
                        <option value="2">2</option>
                        <option value="4" selected>4</option>
                        <option value="8">8</option>
                    </select>
                </div>
            `;
        },
        initOptions(root) {
            root.querySelectorAll('#ttTsMode .tt-seg-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    root.querySelectorAll('#ttTsMode .tt-seg-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ttRefresh();
                });
            });
        },
        run(t) {
            const mode = document.querySelector('#ttTsMode .tt-seg-btn.active')?.dataset.mode || 't2s';
            const width = parseInt(document.getElementById('ttTsWidth')?.value || '4', 10);
            if (mode === 't2s') {
                const out = t.replace(/\t/g, ' '.repeat(width));
                return { text: out, status: { type: 'ok', msg: `Tabs replaced with ${width} space${width === 1 ? '' : 's'}` } };
            }
            const re = new RegExp(`^(?: {${width}})+`, 'g');
            const out = ttLines(t).map(l => l.replace(re, m => '\t'.repeat(m.length / width))).join('\n');
            return { text: out, status: { type: 'ok', msg: `Leading ${width}-space indents converted to tabs` } };
        },
    },
    'prefix-suffix': {
        cat: 'clean', label: 'Prefix / Suffix Lines',
        options() {
            return `
                <div class="tt-field tt-grow">
                    <label for="ttPrefix">Prefix</label>
                    <input type="text" id="ttPrefix" class="tt-input" placeholder="- ">
                </div>
                <div class="tt-field tt-grow">
                    <label for="ttSuffix">Suffix</label>
                    <input type="text" id="ttSuffix" class="tt-input" placeholder=",">
                </div>
                ${ttCheck('ttPsSkipEmpty', 'Skip empty lines', true)}
            `;
        },
        run(t) {
            const prefix = document.getElementById('ttPrefix')?.value ?? '';
            const suffix = document.getElementById('ttSuffix')?.value ?? '';
            const skipEmpty = document.getElementById('ttPsSkipEmpty')?.checked ?? true;
            const out = ttLines(t).map(l => (skipEmpty && l.trim() === '') ? l : prefix + l + suffix);
            return { text: out.join('\n'), status: { type: 'ok', msg: 'Prefix/suffix applied' } };
        },
    },

    // ─── Extract ─────────────────────────────────────────────────────────
    domains: {
        cat: 'extract', label: 'Extract Domains',
        options() {
            return `
                ${ttCheck('domKeepWww', 'Preserve www.', false)}
                ${ttCheck('domSubdomains', 'Include subdomains', true)}
                ${ttCheck('domSort', 'Sort A \u2192 Z', true)}
            `;
        },
        run(t) {
            const opts = {
                keepWww: document.getElementById('domKeepWww')?.checked ?? false,
                includeSubdomains: document.getElementById('domSubdomains')?.checked ?? true,
                sort: document.getElementById('domSort')?.checked ?? true,
            };
            const domains = ttExtractDomains(t, opts);
            return {
                text: domains.join('\n'),
                copyText: domains.join('\n'),
                status: { type: domains.length ? 'ok' : 'warn', msg: `Found ${domains.length} unique domain${domains.length === 1 ? '' : 's'}` },
            };
        },
    },
    urls: {
        cat: 'extract', label: 'Extract URLs',
        run(t) {
            const raw = t.match(/https?:\/\/[^\s"'`<>]+/gi) || [];
            const seen = new Set();
            const urls = [];
            for (let u of raw) {
                u = u.replace(/[.,;:!?"']+$/g, '');
                while (u.endsWith(')') && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) {
                    u = u.slice(0, -1);
                }
                if (seen.has(u)) continue;
                seen.add(u);
                urls.push(u);
            }
            return {
                text: urls.join('\n'),
                copyText: urls.join('\n'),
                status: { type: urls.length ? 'ok' : 'warn', msg: `Found ${urls.length} unique URL${urls.length === 1 ? '' : 's'}` },
            };
        },
    },
    emails: {
        cat: 'extract', label: 'Extract Email Addresses',
        run(t) {
            const raw = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g) || [];
            const emails = [...new Set(raw)];
            return {
                text: emails.join('\n'),
                copyText: emails.join('\n'),
                status: { type: emails.length ? 'ok' : 'warn', msg: `Found ${emails.length} email address${emails.length === 1 ? '' : 'es'}` },
            };
        },
    },
    ips: {
        cat: 'extract', label: 'Extract IP Addresses',
        options() {
            return ttCheck('ipV6', 'Include IPv6 addresses', true);
        },
        run(t) {
            const ips = ttExtractIps(t, document.getElementById('ipV6')?.checked ?? true);
            return {
                text: ips.join('\n'),
                copyText: ips.join('\n'),
                status: { type: ips.length ? 'ok' : 'warn', msg: `Found ${ips.length} valid IP address${ips.length === 1 ? '' : 'es'}` },
            };
        },
    },
    numbers: {
        cat: 'extract', label: 'Extract Numbers',
        run(t) {
            const re = /(?<![\w.])-?\d+(?:[.,]\d+)?(?!\.?\d)/g;
            const nums = [...new Set(t.match(re) || [])];
            return {
                text: nums.join('\n'),
                copyText: nums.join('\n'),
                status: { type: nums.length ? 'ok' : 'warn', msg: `Found ${nums.length} number${nums.length === 1 ? '' : 's'}` },
            };
        },
    },
    hashtags: {
        cat: 'extract', label: 'Hashtags & Mentions',
        options() {
            return `
                <div class="tt-field">
                    <label for="ttHtMode">Extract</label>
                    <select id="ttHtMode" class="filter-select tt-select-sm">
                        <option value="hash">Hashtags (#)</option>
                        <option value="mention">Mentions (@)</option>
                        <option value="both">Both</option>
                    </select>
                </div>
                ${ttCheck('ttHtDedupe', 'Remove duplicates', true)}
            `;
        },
        run(t) {
            const mode = document.getElementById('ttHtMode')?.value || 'hash';
            const dedupe = document.getElementById('ttHtDedupe')?.checked ?? true;
            const re = /([#@])([\p{L}\p{N}_]{1,64})/gu;
            const items = [];
            const seen = new Set();
            let m;
            while ((m = re.exec(t)) !== null) {
                const sym = m[1];
                if (mode === 'hash' && sym === '@') continue;
                if (mode === 'mention' && sym === '#') continue;
                const item = m[0];
                if (dedupe) {
                    const key = sym + m[2].toLowerCase();
                    if (seen.has(key)) continue;
                    seen.add(key);
                }
                items.push(item);
            }
            return {
                text: items.join('\n'),
                copyText: items.join('\n'),
                status: { type: items.length ? 'ok' : 'warn', msg: `Found ${items.length} item${items.length === 1 ? '' : 's'}` },
            };
        },
    },

    // ─── Encode / Decode ─────────────────────────────────────────────────
    'url-encode': {
        cat: 'encode', label: 'URL Encode',
        run(t) {
            return { text: encodeURIComponent(t), status: { type: 'ok', msg: 'URL-encoded' } };
        },
    },
    'url-decode': {
        cat: 'encode', label: 'URL Decode',
        run(t) {
            try {
                return { text: decodeURIComponent(t), status: { type: 'ok', msg: 'URL-decoded' } };
            } catch (e) {
                return { error: { msg: 'Malformed percent-encoding', detail: e.message } };
            }
        },
    },
    'base64-encode': {
        cat: 'encode', label: 'Base64 Encode',
        run(t) {
            try {
                return { text: ttB64Encode(t), status: { type: 'ok', msg: 'Base64-encoded (Unicode-safe)' } };
            } catch (e) {
                return { error: { msg: 'Encoding failed', detail: e.message } };
            }
        },
    },
    'base64-decode': {
        cat: 'encode', label: 'Base64 Decode',
        run(t) {
            try {
                return { text: ttB64Decode(t), status: { type: 'ok', msg: 'Base64-decoded' } };
            } catch (e) {
                return { error: { msg: 'Not valid Base64 (or not valid UTF-8)', detail: e.message } };
            }
        },
    },

    // ─── Format ──────────────────────────────────────────────────────────
    json: {
        cat: 'format', label: 'JSON Formatter',
        options() {
            return `
                <div class="tt-seg" id="ttJsonMode">
                    <button class="tt-seg-btn ${ttState.jsonMode === 'format' ? 'active' : ''}" data-mode="format" type="button"><i class="fas fa-align-left"></i> Format</button>
                    <button class="tt-seg-btn ${ttState.jsonMode === 'minify' ? 'active' : ''}" data-mode="minify" type="button"><i class="fas fa-compress"></i> Minify</button>
                    <button class="tt-seg-btn ${ttState.jsonMode === 'validate' ? 'active' : ''}" data-mode="validate" type="button"><i class="fas fa-circle-check"></i> Validate</button>
                </div>
            `;
        },
        initOptions(root) {
            root.querySelectorAll('#ttJsonMode .tt-seg-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    ttState.jsonMode = btn.dataset.mode;
                    root.querySelectorAll('#ttJsonMode .tt-seg-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ttRefresh();
                });
            });
        },
        run(t) {
            try {
                const obj = JSON.parse(t);
                const pretty = JSON.stringify(obj, null, 2);
                const keys = (() => {
                    let n = 0;
                    const count = v => {
                        if (Array.isArray(v)) v.forEach(count);
                        else if (v && typeof v === 'object') Object.values(v).forEach(count);
                        else n++;
                    };
                    count(obj);
                    return n;
                })();
                return {
                    text: ttState.jsonMode === 'minify' ? JSON.stringify(obj) : pretty,
                    status: { type: 'ok', msg: `Valid JSON \u00b7 ${keys} value${keys === 1 ? '' : 's'}` },
                };
            } catch (e) {
                let loc = '';
                const pm = /position (\d+)/.exec(e.message);
                if (pm) {
                    const pos = parseInt(pm[1], 10);
                    const upto = t.slice(0, pos);
                    const line = (upto.match(/\n/g) || []).length + 1;
                    const col = pos - upto.lastIndexOf('\n');
                    loc = ` (line ${line}, column ${col})`;
                } else {
                    const lm = /line (\d+) column (\d+)/.exec(e.message);
                    if (lm) loc = ` (line ${lm[1]}, column ${lm[2]})`;
                }
                return { error: { msg: `Invalid JSON${loc}`, detail: e.message } };
            }
        },
    },
    csv: {
        cat: 'format', label: 'CSV / List Cleanup',
        options() {
            return `
                <div class="tt-field">
                    <label for="ttCsvSep">Output separator</label>
                    <select id="ttCsvSep" class="filter-select tt-select-sm">
                        <option value="line">One per line</option>
                        <option value=",">Comma ( , )</option>
                        <option value=";">Semicolon ( ; )</option>
                        <option value=", ">Comma + space</option>
                        <option value=" ">Space</option>
                        <option value="tab">Tab</option>
                    </select>
                </div>
                ${ttCheck('ttCsvTrim', 'Trim whitespace', true)}
                ${ttCheck('ttCsvDedupe', 'Remove duplicates', false)}
                ${ttCheck('ttCsvEmpty', 'Remove empty items', true)}
            `;
        },
        run(t) {
            const sepMap = { line: '\n', tab: '\t' };
            const raw = document.getElementById('ttCsvSep')?.value ?? 'line';
            const sep = sepMap.hasOwnProperty(raw) ? sepMap[raw] : raw;
            const doTrim = document.getElementById('ttCsvTrim')?.checked ?? true;
            const doDedupe = document.getElementById('ttCsvDedupe')?.checked;
            const doEmpty = document.getElementById('ttCsvEmpty')?.checked ?? true;

            let items = t.split(/[\r\n\t;,]+/);
            if (doTrim) items = items.map(i => i.trim());
            if (doEmpty) items = items.filter(i => i !== '');
            if (doDedupe) items = [...new Set(items)];

            return {
                text: items.join(sep),
                copyText: items.join(sep),
                status: { type: items.length ? 'ok' : 'warn', msg: `${items.length} item${items.length === 1 ? '' : 's'}` },
            };
        },
    },
    'line-numbers': {
        cat: 'format', label: 'Line Numbering',
        options() {
            return `
                <div class="tt-seg" id="ttLnMode">
                    <button class="tt-seg-btn active" data-mode="add" type="button">Add</button>
                    <button class="tt-seg-btn" data-mode="remove" type="button">Remove</button>
                </div>
                <div class="tt-field">
                    <label for="ttLnStart">Start at</label>
                    <input type="number" id="ttLnStart" class="tt-input tt-input-sm" value="1" min="0">
                </div>
                <div class="tt-field">
                    <label for="ttLnSep">Separator</label>
                    <select id="ttLnSep" class="filter-select tt-select-sm">
                        <option value=". ">Dot ( . )</option>
                        <option value=") ">Paren ( ) )</option>
                        <option value=" - ">Dash ( - )</option>
                        <option value=": ">Colon ( : )</option>
                        <option value="tab">Tab</option>
                    </select>
                </div>
            `;
        },
        initOptions(root) {
            root.querySelectorAll('#ttLnMode .tt-seg-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    root.querySelectorAll('#ttLnMode .tt-seg-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ttRefresh();
                });
            });
        },
        run(t) {
            const mode = document.querySelector('#ttLnMode .tt-seg-btn.active')?.dataset.mode || 'add';
            const lines = ttLines(t);

            if (mode === 'remove') {
                const out = lines.map(l => l.replace(/^\s*\d+\s*([.)\-:]|\t)?\s+/, ''));
                return { text: out.join('\n'), status: { type: 'ok', msg: 'Line numbers removed where found' } };
            }

            const start = parseInt(document.getElementById('ttLnStart')?.value || '1', 10) || 0;
            const rawSep = document.getElementById('ttLnSep')?.value ?? '. ';
            const sep = rawSep === 'tab' ? '\t' : rawSep;
            const out = lines.map((l, i) => `${start + i}${sep}${l}`);
            return { text: out.join('\n'), status: { type: 'ok', msg: `${lines.length} lines numbered` } };
        },
    },

    // ─── Analyze ─────────────────────────────────────────────────────────
    stats: {
        cat: 'analyze', label: 'Text Statistics',
        run(t) {
            const chars = t.length;
            const charsNoSpaces = t.replace(/\s/g, '').length;
            const wordsArr = t.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) || [];
            const words = wordsArr.length;
            const lines = ttLines(t).length;
            const sentences = (t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || []).filter(s => s.trim()).length;
            const paragraphs = t.split(/\n\s*\n+/).filter(p => p.trim()).length;
            const uniqueWords = new Set(wordsArr.map(w => w.toLowerCase())).size;
            const letters = wordsArr.join('').replace(/[^\p{L}\p{N}]/gu, '').length;
            const avgWordLen = words ? (letters / words) : 0;
            const readMin = Math.max(words ? 1 : 0, Math.round(words / 200));

            const stat = (v, l) => `<div class="tt-stat"><span class="tt-stat-value">${v}</span><span class="tt-stat-label">${l}</span></div>`;
            const html = `<div class="tt-stats-grid">
                ${stat(chars.toLocaleString(), 'Characters')}
                ${stat(charsNoSpaces.toLocaleString(), 'Chars w/o spaces')}
                ${stat(words.toLocaleString(), 'Words')}
                ${stat(lines.toLocaleString(), 'Lines')}
                ${stat(sentences.toLocaleString(), 'Sentences')}
                ${stat(paragraphs.toLocaleString(), 'Paragraphs')}
                ${stat(uniqueWords.toLocaleString(), 'Unique words')}
                ${stat(avgWordLen.toFixed(1), 'Avg word length')}
                ${stat(readMin ? `~${readMin} min` : '\u2014', 'Reading time')}
            </div>`;

            return {
                html,
                copyText: [
                    `Characters: ${chars}`,
                    `Characters (no spaces): ${charsNoSpaces}`,
                    `Words: ${words}`,
                    `Lines: ${lines}`,
                    `Sentences: ${sentences}`,
                    `Paragraphs: ${paragraphs}`,
                    `Unique words: ${uniqueWords}`,
                    `Average word length: ${avgWordLen.toFixed(1)}`,
                    `Reading time: ~${readMin} min`,
                ].join('\n'),
                status: { type: 'info', msg: readMin ? `~${readMin} min reading time at 200 wpm` : 'No words yet' },
            };
        },
    },
    'find-replace': {
        cat: 'analyze', label: 'Find & Replace',
        options() {
            return `
                <div class="tt-field tt-grow">
                    <label for="ttFrFind">Find</label>
                    <input type="text" id="ttFrFind" class="tt-input" placeholder="Text to find..." autocomplete="off" spellcheck="false">
                </div>
                <div class="tt-field tt-grow">
                    <label for="ttFrReplace">Replace with</label>
                    <input type="text" id="ttFrReplace" class="tt-input" placeholder="Replacement..." autocomplete="off" spellcheck="false">
                </div>
                ${ttCheck('ttFrCase', 'Case-sensitive', true)}
                ${ttCheck('ttFrWhole', 'Whole word only', false)}
            `;
        },
        run(t) {
            const find = document.getElementById('ttFrFind')?.value ?? '';
            const replace = document.getElementById('ttFrReplace')?.value ?? '';
            const cs = document.getElementById('ttFrCase')?.checked ?? true;
            const whole = document.getElementById('ttFrWhole')?.checked;

            if (!find) {
                return { text: t, status: { type: 'none', msg: 'Enter text to find' } };
            }

            let needle = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (whole) needle = `\\b${needle}\\b`;
            let re;
            try {
                re = new RegExp(needle, 'g' + (cs ? '' : 'i'));
            } catch (e) {
                return { error: { msg: 'Could not build search pattern', detail: e.message } };
            }

            const matches = t.match(re);
            const count = matches ? matches.length : 0;
            return {
                text: t.replace(re, replace),
                status: { type: count ? 'ok' : 'warn', msg: `${count} replacement${count === 1 ? '' : 's'} made` },
            };
        },
    },
    regex: {
        cat: 'analyze', label: 'Regex Tester',
        options() {
            return `
                <div class="tt-field tt-grow">
                    <label for="ttRePattern">Regular expression</label>
                    <input type="text" id="ttRePattern" class="tt-input" placeholder="\\d{3}-\\d{4}" autocomplete="off" spellcheck="false">
                </div>
                <div class="tt-field">
                    <label>Flags</label>
                    <div class="tt-flag-row">
                        ${ttCheck('ttFlagG', 'g', true)}${ttCheck('ttFlagI', 'i', false)}${ttCheck('ttFlagM', 'm', false)}${ttCheck('ttFlagS', 's', false)}
                    </div>
                </div>
                <div class="tt-field">
                    <label>Examples</label>
                    <div class="tt-chips">
                        <button class="tt-chip" type="button" data-re="Email" title="Fill email pattern">Email</button>
                        <button class="tt-chip" type="button" data-re="Url" title="Fill URL pattern">URL</button>
                        <button class="tt-chip" type="button" data-re="Domain" title="Fill domain pattern">Domain</button>
                        <button class="tt-chip" type="button" data-re="Ipv4" title="Fill IPv4 pattern">IPv4</button>
                        <button class="tt-chip" type="button" data-re="Numbers" title="Fill numbers pattern">Numbers</button>
                    </div>
                </div>
            `;
        },
        initOptions(root) {
            const examples = {
                Email: { p: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', f: ['g'] },
                Url: { p: 'https?://[^\\s<>"\']+', f: ['g'] },
                Domain: { p: '(?:[a-z0-9-]+\\.)+[a-z]{2,}', f: ['g', 'i'] },
                Ipv4: { p: '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}', f: ['g'] },
                Numbers: { p: '-?\\d+(?:\\.\\d+)?', f: ['g'] },
            };
            root.querySelectorAll('.tt-chip[data-re]').forEach(chip => {
                chip.addEventListener('click', () => {
                    const ex = examples[chip.dataset.re];
                    if (!ex) return;
                    const p = document.getElementById('ttRePattern');
                    if (p) p.value = ex.p;
                    ['ttFlagG', 'ttFlagI', 'ttFlagM', 'ttFlagS'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.checked = ex.f.includes(id.replace('ttFlag', '').toLowerCase());
                    });
                    ttRefresh();
                });
            });
        },
        run(t) {
            const pattern = document.getElementById('ttRePattern')?.value ?? '';
            const flags = ['ttFlagG', 'ttFlagI', 'ttFlagM', 'ttFlagS']
                .filter(id => document.getElementById(id)?.checked)
                .map(id => id.replace('ttFlag', '').toLowerCase())
                .join('');

            if (!pattern) {
                return { text: '', status: { type: 'none', msg: 'Enter a regular expression above' } };
            }

            let re;
            try {
                re = new RegExp(pattern, flags);
            } catch (e) {
                return { error: { msg: 'Invalid regular expression', detail: e.message } };
            }

            const MAX = 500;
            const matches = [];
            if (flags.includes('g')) {
                let m;
                let guard = 0;
                while ((m = re.exec(t)) !== null) {
                    matches.push(m);
                    if (matches.length >= MAX) break;
                    if (m.index === re.lastIndex) re.lastIndex++;
                    if (++guard > 100000) break;
                }
            } else {
                const m = re.exec(t);
                if (m) matches.push(m);
            }

            if (!matches.length) {
                return { text: '', status: { type: 'warn', msg: 'No matches' } };
            }

            const rows = matches.map((m, i) => {
                const groups = m.slice(1).map((g, gi) =>
                    `<span class="tt-match-group">Group ${gi + 1}: ${g === undefined ? '\u2014' : escHtml(g)}</span>`
                ).join('');
                return `<div class="tt-match">
                    <div class="tt-match-head">
                        <span class="tt-match-index">#${i + 1}</span>
                        <span class="tt-match-value">${escHtml(m[0])}</span>
                        <span class="tt-match-pos">@ ${m.index}</span>
                    </div>
                    ${groups ? `<div class="tt-match-groups">${groups}</div>` : ''}
                </div>`;
            }).join('');

            const more = matches.length >= MAX ? ' (showing first 500)' : '';
            return {
                html: `<div class="tt-matches">${rows}</div>`,
                copyText: matches.map(m => m[0]).join('\n'),
                status: { type: 'ok', msg: `${matches.length} match${matches.length === 1 ? '' : 'es'}${more}` },
            };
        },
    },
    'word-frequency': {
        cat: 'analyze', label: 'Word Frequency',
        options() {
            return `
                <div class="tt-field">
                    <label for="ttWfMin">Min word length</label>
                    <input type="number" id="ttWfMin" class="tt-input tt-input-sm" value="1" min="1" max="20">
                </div>
                <div class="tt-field">
                    <label for="ttWfTop">Show top</label>
                    <input type="number" id="ttWfTop" class="tt-input tt-input-sm" value="25" min="5" max="200">
                </div>
                ${ttCheck('ttWfCi', 'Ignore case', true)}
            `;
        },
        run(t) {
            const minLen = parseInt(document.getElementById('ttWfMin')?.value || '1', 10) || 1;
            const topN = parseInt(document.getElementById('ttWfTop')?.value || '25', 10) || 25;
            const ci = document.getElementById('ttWfCi')?.checked ?? true;

            const words = t.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) || [];
            const freq = new Map();
            for (let w of words) {
                if (ci) w = w.toLowerCase();
                if (w.length < minLen) continue;
                freq.set(w, (freq.get(w) || 0) + 1);
            }
            const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const shown = sorted.slice(0, topN);
            const max = shown.length ? shown[0][1] : 1;

            if (!shown.length) {
                return { text: '', status: { type: 'warn', msg: 'No words found' } };
            }

            const rows = shown.map(([word, count]) => `
                <div class="tt-freq-row">
                    <span class="tt-freq-word">${escHtml(word)}</span>
                    <span class="tt-freq-bar-track"><span class="tt-freq-bar" style="width:${Math.max(2, Math.round(count / max * 100))}%"></span></span>
                    <span class="tt-freq-count">${count.toLocaleString()} \u00d7</span>
                </div>
            `).join('');

            return {
                html: `<div class="tt-freq">${rows}</div>`,
                copyText: shown.map(([w, c]) => `${c}\t${w}`).join('\n'),
                status: { type: 'info', msg: `${freq.size.toLocaleString()} unique words \u00b7 showing top ${shown.length}` },
            };
        },
    },
};

const TT_QUICK_ACTIONS = [
    { label: 'UPPERCASE', op: 'uppercase' },
    { label: 'lowercase', op: 'lowercase' },
    { label: 'Title Case', op: 'titlecase' },
    { label: 'Clean', op: 'trim' },
    { label: 'Remove duplicates', op: 'dedupe-lines' },
    { label: 'Extract domains', op: 'domains' },
    { label: 'Extract URLs', op: 'urls' },
];

// ============================================
// Small HTML builders
// ============================================
function ttCheck(id, label, checked) {
    return `<label class="tt-check"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span>${escHtml(label)}</span></label>`;
}

// ============================================
// Render
// ============================================
function renderTextToolkit() {
    setPageTitle('String Theory', 'Thirty-four ways to mangle, massage and mine raw text');

    const body = getActiveBody();

    body.innerHTML = `
        <div class="tt-wrap">
            <div class="tt-privacy">
                <i class="fas fa-shield-halved"></i>
                <span>100% private \u2014 every operation runs locally in your browser. Your text is never sent or stored.</span>
            </div>

            <div class="tt-quick" id="ttQuick">
                ${TT_QUICK_ACTIONS.map(a => `<button class="tt-quick-btn" data-op="${a.op}" type="button">${escHtml(a.label)}</button>`).join('')}
            </div>

            <div class="tt-panel">
                <div class="tt-panel-head">
                    <span class="tt-panel-label"><i class="fas fa-pen-to-square"></i> Input</span>
                    <div class="tt-head-actions">
                        <span class="tt-counts" id="ttCounts">0 chars \u00b7 0 words</span>
                        <button class="btn btn-secondary btn-sm" id="ttPasteBtn" title="Paste from clipboard"><i class="fas fa-clipboard"></i> Paste</button>
                        <button class="btn btn-secondary btn-sm" id="ttClearBtn" title="Clear input"><i class="fas fa-eraser"></i> Clear</button>
                    </div>
                </div>
                <textarea id="ttInput" class="tt-textarea font-mono" spellcheck="false"
                    placeholder="Paste or type your text here..."></textarea>
            </div>

            <div class="tt-panel">
                <div class="tt-subnav" id="ttSubnav">
                    ${TT_CATEGORIES.map(c => `
                        <button class="tt-subnav-btn ${c.id === ttState.category ? 'active' : ''}" data-cat="${c.id}" type="button">
                            <i class="fas ${c.icon}"></i> ${c.label}
                        </button>
                    `).join('')}
                </div>
                <div class="tt-op-row">
                    <label for="ttOpSelect"><i class="fas fa-sliders"></i> Operation</label>
                    <select id="ttOpSelect" class="filter-select"></select>
                </div>
                <div class="tt-options" id="ttOptions"></div>
            </div>

            <div class="tt-panel">
                <div class="tt-panel-head">
                    <span class="tt-panel-label"><i class="fas fa-square-check"></i> Output</span>
                    <div class="tt-head-actions">
                        <span class="tt-status tt-status-none" id="ttStatus" role="status" aria-live="polite"></span>
                        <button class="btn btn-secondary btn-sm" id="ttSwapBtn" title="Use output as new input"><i class="fas fa-arrow-up-long"></i> To input</button>
                        <button class="btn btn-primary btn-sm" id="ttCopyBtn" title="Copy result"><i class="fas fa-copy"></i> Copy</button>
                        <button class="btn btn-secondary btn-sm" id="ttDownloadBtn" title="Download result"><i class="fas fa-download"></i> Download</button>
                    </div>
                </div>
                <div id="ttOutput" class="tt-output font-mono" tabindex="0" title="Click to select all" aria-label="Operation result"></div>
            </div>
        </div>
    `;

    const input = document.getElementById('ttInput');
    input.value = ttState.input;

    ttRenderOpSelect();
    ttRenderOptions();
    ttAttachEvents();
    ttUpdateCounts();
    ttRefresh();
}

function ttRenderOpSelect() {
    const select = document.getElementById('ttOpSelect');
    if (!select) return;
    const ops = Object.entries(TT_OPS).filter(([, o]) => o.cat === ttState.category);
    if (!ops.some(([id]) => id === ttState.op)) {
        ttState.op = ops[0][0];
    }
    select.innerHTML = ops.map(([id, o]) => `<option value="${id}" ${id === ttState.op ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('');
}

function ttRenderOptions() {
    const container = document.getElementById('ttOptions');
    if (!container) return;
    const op = TT_OPS[ttState.op];
    container.innerHTML = op.options ? op.options() : '';
    if (op.initOptions) op.initOptions(container);
}

function ttSetCategory(catId) {
    ttState.category = catId;
    document.querySelectorAll('#ttSubnav .tt-subnav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === catId);
    });
    ttState.op = Object.keys(TT_OPS).find(id => TT_OPS[id].cat === catId);
    ttRenderOpSelect();
    ttRenderOptions();
    ttRefresh();
}

function ttSetOp(opId) {
    const op = TT_OPS[opId];
    if (!op) return;
    ttState.op = opId;
    ttState.category = op.cat;
    document.querySelectorAll('#ttSubnav .tt-subnav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === op.cat);
    });
    ttRenderOpSelect();
    ttRenderOptions();
    ttRefresh();
}

// ============================================
// Events
// ============================================
function ttAttachEvents() {
    const input = document.getElementById('ttInput');

    input.addEventListener('input', () => {
        ttState.input = input.value;
        ttUpdateCounts();
        ttScheduleRefresh();
    });

    document.getElementById('ttClearBtn').addEventListener('click', () => {
        input.value = '';
        ttState.input = '';
        ttUpdateCounts();
        ttRefresh();
        input.focus();
    });

    document.getElementById('ttPasteBtn').addEventListener('click', async () => {
        try {
            if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('unsupported');
            const text = await navigator.clipboard.readText();
            if (!text) {
                toast('Clipboard is empty', 'warning');
                return;
            }
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.setRangeText(text, start, end, 'end');
            ttState.input = input.value;
            ttUpdateCounts();
            ttRefresh();
        } catch {
            toast('Clipboard access unavailable \u2014 use Ctrl+V instead', 'warning');
        }
    });

    document.getElementById('ttCopyBtn').addEventListener('click', (e) => {
        const text = ttState.outputText;
        if (!text) {
            toast('Nothing to copy yet', 'warning');
            return;
        }
        const btn = e.currentTarget;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => showCopiedFeedback(btn)).catch(() => fallbackCopy(text, btn));
        } else {
            fallbackCopy(text, btn);
        }
    });

    document.getElementById('ttDownloadBtn').addEventListener('click', () => {
        const text = ttState.outputText;
        if (!text) {
            toast('Nothing to download yet', 'warning');
            return;
        }
        const ext = ttState.op === 'json' ? 'json' : 'txt';
        ttDownload(text, `ficksie-${ttState.op}.${ext}`);
        toast('Download started', 'success');
    });

    document.getElementById('ttSwapBtn').addEventListener('click', () => {
        if (!ttState.outputText) {
            toast('No output to move', 'warning');
            return;
        }
        const input = document.getElementById('ttInput');
        input.value = ttState.outputText;
        ttState.input = input.value;
        ttUpdateCounts();
        ttRefresh();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
    });

    document.querySelectorAll('#ttSubnav .tt-subnav-btn').forEach(btn => {
        btn.addEventListener('click', () => ttSetCategory(btn.dataset.cat));
    });

    document.getElementById('ttOpSelect').addEventListener('change', (e) => {
        ttState.op = e.target.value;
        ttRenderOptions();
        ttRefresh();
    });

    document.querySelectorAll('#ttQuick .tt-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => ttSetOp(btn.dataset.op));
    });

    const options = document.getElementById('ttOptions');
    options.addEventListener('change', () => ttRefresh());
    options.addEventListener('input', (e) => {
        if (e.target.matches('input[type="text"], input[type="number"]')) ttScheduleRefresh();
    });

    const output = document.getElementById('ttOutput');
    output.addEventListener('click', () => {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(output);
        sel.removeAllRanges();
        sel.addRange(range);
    });
}

// ============================================
// Run + render output
// ============================================
const ttScheduleRefresh = ttDebounce(() => ttRefresh(), 150);

function ttUpdateCounts() {
    const el = document.getElementById('ttCounts');
    if (!el) return;
    const t = ttState.input;
    const chars = t.length;
    const words = (t.match(/\S+/g) || []).length;
    el.textContent = `${chars.toLocaleString()} chars \u00b7 ${words.toLocaleString()} words`;
}

function ttSetStatus(type, msg) {
    const el = document.getElementById('ttStatus');
    if (!el) return;
    const icons = { ok: 'fa-circle-check', info: 'fa-circle-info', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark', none: 'fa-circle-minus' };
    el.className = `tt-status tt-status-${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.none}"></i> ${escHtml(msg)}`;
}

function ttRefresh() {
    const outEl = document.getElementById('ttOutput');
    if (!outEl) return;

    const text = document.getElementById('ttInput')?.value ?? '';

    if (!text.trim()) {
        ttState.outputText = '';
        outEl.classList.remove('tt-output-html');
        outEl.innerHTML = '<span class="tt-placeholder">Waiting for input\u2026</span>';
        ttSetStatus('none', 'No input yet');
        return;
    }

    const op = TT_OPS[ttState.op];
    let res;
    try {
        res = op.run(text) || {};
    } catch (e) {
        res = { error: { msg: 'Operation failed unexpectedly', detail: e.message } };
    }

    outEl.classList.remove('tt-output-html');

    if (res.error) {
        ttState.outputText = '';
        outEl.innerHTML = `<div class="tt-error-box"><i class="fas fa-circle-exclamation"></i> ${escHtml(res.error.msg)}${res.error.detail ? `<span class="tt-error-detail">${escHtml(res.error.detail)}</span>` : ''}</div>`;
        ttSetStatus('error', res.error.msg);
        return;
    }

    if (res.html) {
        outEl.classList.add('tt-output-html');
        outEl.innerHTML = res.html;
    } else {
        outEl.textContent = res.text ?? '';
    }

    ttState.outputText = res.copyText ?? res.text ?? '';
    const st = res.status || { type: 'ok', msg: 'Done' };
    ttSetStatus(st.type, st.msg);
}
