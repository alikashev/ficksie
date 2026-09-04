/**
 * DNS Lookup Suite — Split Layout Dashboard
 */

async function renderDnsLookup() {
    setPageTitle('Nomenclature Oracle', 'Interrogating the hierarchical phonebook of the internet');
    const body = getActiveBody();
    const searchHistory = JSON.parse(localStorage.getItem('dns-history') || '[]');
    const favorites = JSON.parse(localStorage.getItem('dns-favorites') || '[]');
    body.innerHTML = `
        <div class="dns-wrap">
            <div class="dns-search-row">
                <div class="dns-search-box">
                    <i class="fas fa-search dns-search-icon"></i>
                    <input type="text" id="dnsInput" placeholder="Enter domain or IP (e.g. example.com, 8.8.8.8)" class="dns-search-input" autocomplete="off" spellcheck="false">
                    <div class="dns-mode-toggle">
                        <span class="dns-mode-label dns-mode-active" id="dnsModeLabelFull" title="Full Scan"><i class="fas fa-layer-group"></i></span>
                        <label class="dns-mode-switch">
                            <input type="checkbox" id="dnsQuickToggle" checked>
                            <span class="dns-mode-slider"></span>
                        </label>
                        <span class="dns-mode-label dns-mode-label-quick" id="dnsModeLabelQuick" title="Quick Scan"><i class="fas fa-bolt"></i></span>
                    </div>
                    <button class="dns-search-btn" id="dnsAnalyzeBtn"><i class="fas fa-globe"></i> Check</button>
                </div>
                <div class="dns-actions">
                    <label class="dns-auto-label" title="Auto refresh every 60s">
                        <input type="checkbox" id="dnsAutoRefresh" ${localStorage.getItem('dns-auto-refresh') === 'true' ? 'checked' : ''}>
                        <span>Auto 60s</span>
                    </label>
                    <button class="dns-action-btn" id="dnsClearBtn" title="Clear"><i class="fas fa-eraser"></i></button>
                    <div class="dns-recent-bar" id="dnsRecentBar"></div>
                </div>
            </div>
            <div id="dnsResult">
                <div class="dns-empty-state">
                    <i class="fas fa-globe"></i>
                    <h3>Ready to Analyze</h3>
                    <p>Enter a domain name or IP address above and click Check to run a health scan.</p>
                </div>
            </div>
        </div>`;
    const input = document.getElementById('dnsInput'), resultDiv = document.getElementById('dnsResult');
    const analyzeBtn = document.getElementById('dnsAnalyzeBtn'), clearBtn = document.getElementById('dnsClearBtn');
    const quickToggle = document.getElementById('dnsQuickToggle');
    const modeLabelFull = document.getElementById('dnsModeLabelFull');
    const modeLabelQuick = document.getElementById('dnsModeLabelQuick');
    let autoTimer = null;
    let lastData = null;
function isQuickMode() { return quickToggle?.checked || false; }
function updateModeLabel() {
    const q = isQuickMode();
    if (modeLabelFull) modeLabelFull.classList.toggle('dns-mode-active', !q);
    if (modeLabelQuick) modeLabelQuick.classList.toggle('dns-mode-active', q);
    if (analyzeBtn) analyzeBtn.classList.toggle('dns-btn-quick', q);
}
    updateModeLabel();
    if (quickToggle) quickToggle.addEventListener('change', updateModeLabel);
    async function analyze(domain, quickMode) {
        domain = domain.trim().toLowerCase();
        if (!domain) return toast('Enter a domain name or IP address.', 'warning');
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || /^[a-f0-9:]+$/i.test(domain);
        if (!isIp && !/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(domain))
            return toast('Invalid domain or IP address.', 'error');
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        if (!quickMode) {
            resultDiv.innerHTML = `<div class="dns-loading"><i class="fas fa-spinner fa-spin"></i> Scanning ${isIp ? 'IP address' : 'domain'}...</div>`;
        }
        analyzeBtn.disabled = true; analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
        try {
            let data;
            if (isIp) {
                data = await api('GET', `dns?ip_scan=1&ip=${encodeURIComponent(domain)}`);
            } else if (quickMode) {
                data = await api('GET', `dns?domain=${encodeURIComponent(domain)}&quick=1`);
            } else {
                data = await api('GET', `dns?domain=${encodeURIComponent(domain)}`);
            }
            lastData = data;
            if (data.is_ip) {
                resultDiv.innerHTML = renderIpScanResult(data);
            } else {
                resultDiv.innerHTML = renderDnsResult(data);
            }
            if (!data.is_ip) {
                const hist = JSON.parse(localStorage.getItem('dns-history') || '[]');
                const idx = hist.findIndex(h => h.domain === data.domain);
                const entry = { domain: data.domain, health: data.health.score, time: new Date().toISOString() };
                if (idx >= 0) hist[idx] = entry; else hist.unshift(entry);
                if (hist.length > 50) hist.length = 50;
                localStorage.setItem('dns-history', JSON.stringify(hist));
                renderRecentBar();
                attachDnsEvents(data);
                if (quickMode) applyQuickScan();
            } else {
                attachIpScanEvents(data);
            }
            if (document.getElementById('dnsAutoRefresh')?.checked)
                autoTimer = setInterval(() => analyze(domain), 60000);
        } catch (err) {
            resultDiv.innerHTML = `<div class="dns-empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>${escHtml(err.message)}</p></div>`;
        } finally {
            analyzeBtn.disabled = false; analyzeBtn.innerHTML = '<i class="fas fa-globe"></i> Check';
        }
    }
    function applyQuickScan() {
        const result = document.querySelector('.dns-result');
        if (!result) return;
        result.querySelectorAll('.dns-section').forEach(sec => {
            const title = sec.querySelector('.dns-section-title');
            if (!title) return;
            const text = title.textContent;
            const isQuick = text.includes('DNS Records') || text.includes('WHOIS') || text.includes('SSL Certificates') || text.includes('Dig Tool');
            sec.style.display = isQuick ? '' : 'none';
        });
        result.querySelectorAll('.dns-rec-sep').forEach(sep => {
            if (sep.textContent.includes('Nameserver Check')) sep.style.display = 'none';
        });
        result.querySelectorAll('.dns-section-body .dns-rec-line').forEach(line => {
            const type = line.querySelector('.dns-rec-type');
            if (type && (type.textContent.includes('NSck') || type.textContent.includes('WARN'))) line.style.display = 'none';
        });
    }
    analyzeBtn.addEventListener('click', () => analyze(input.value, isQuickMode()));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(input.value, isQuickMode()); });
    clearBtn.addEventListener('click', () => {
        input.value = ''; resultDiv.innerHTML = `<div class="dns-empty-state"><i class="fas fa-globe"></i><h3>Ready to Analyze</h3><p>Enter a domain name or IP address above and click Check to run a health scan.</p></div>`;
        input.focus(); if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    });
    document.getElementById('dnsAutoRefresh')?.addEventListener('change', function() { localStorage.setItem('dns-auto-refresh', this.checked); });

    function renderRecentBar() {
        const bar = document.getElementById('dnsRecentBar');
        if (!bar) return;
        const hist = JSON.parse(localStorage.getItem('dns-history') || '[]');
        if (!hist.length) { bar.innerHTML = ''; return; }
        const favs = JSON.parse(localStorage.getItem('dns-favorites') || '[]');
        bar.innerHTML = `
            <button class="dns-recent-btn" id="dnsRecentBtn" title="Recent searches"><i class="fas fa-clock-rotate-left"></i></button>
            <div class="dns-recent-dropdown" id="dnsRecentDropdown" style="display:none">
                <div class="dns-recent-head">
                    <span class="dns-recent-title"><i class="fas fa-clock-rotate-left"></i> Recent</span>
                    <button class="dns-recent-clear" id="dnsHistoryClear" title="Clear all">Clear</button>
                </div>
                <div class="dns-recent-list">
                    ${hist.slice(0, 10).map(entry => {
                        const isFav = favs.includes(entry.domain);
                        const diff = Date.now() - new Date(entry.time).getTime();
                        const mins = Math.floor(diff / 60000);
                        const hrs = Math.floor(diff / 3600000);
                        const days = Math.floor(diff / 86400000);
                        const ago = mins < 1 ? 'now' : mins < 60 ? mins + 'm' : hrs < 24 ? hrs + 'h' : days + 'd';
                        return `<div class="dns-recent-item" data-domain="${entry.domain}">
                            <span class="dns-recent-dot" style="background:${entry.health >= 80 ? '#22c55e' : entry.health >= 50 ? '#f59e0b' : '#ef4444'}"></span>
                            <span class="dns-recent-domain">${entry.domain}</span>
                            <span class="dns-recent-time">${ago}</span>
                            <i class="fas fa-star dns-recent-fav ${isFav ? 'fav' : ''}" data-domain="${entry.domain}"></i>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        const btn = document.getElementById('dnsRecentBtn');
        const dd = document.getElementById('dnsRecentDropdown');
        if (btn && dd) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const open = dd.style.display !== 'none';
                dd.style.display = open ? 'none' : '';
                this.classList.toggle('dns-recent-btn-active', !open);
            });
            dd.querySelectorAll('.dns-recent-item').forEach(item => {
                item.addEventListener('click', e => {
                    if (e.target.closest('.dns-recent-fav')) return;
                    input.value = item.dataset.domain;
                    dd.style.display = 'none';
                    btn.classList.remove('dns-recent-btn-active');
                    analyze(input.value, isQuickMode());
                });
            });
            dd.querySelectorAll('.dns-recent-fav').forEach(star => {
                star.addEventListener('click', function(e) { e.stopPropagation(); toggleFav(this.dataset.domain); this.classList.toggle('fav'); });
            });
            document.getElementById('dnsHistoryClear')?.addEventListener('click', () => {
                localStorage.removeItem('dns-history');
                bar.innerHTML = '';
                toast('History cleared.', 'info');
            });
            document.addEventListener('click', function(e) {
                if (!dd.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                    dd.style.display = 'none';
                    btn.classList.remove('dns-recent-btn-active');
                }
            });
        }
    }
    renderRecentBar();
}

function toggleFav(domain) {
    let f = JSON.parse(localStorage.getItem('dns-favorites') || '[]');
    const idx = f.indexOf(domain);
    if (idx >= 0) f.splice(idx, 1); else f.push(domain);
    localStorage.setItem('dns-favorites', JSON.stringify(f));
}

/* ─── IP Scan Result Renderer ──────────────────────────────────────────── */
function renderIpScanResult(data) {
    if (!data || !data.health) return `<div class="dns-empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>Invalid response.</p></div>`;
    try {
        const h = data.health;
        const barColor = h.score >= 80 ? '#22c55e' : h.score >= 50 ? '#f59e0b' : '#ef4444';
        const tag = (label, v) => {
            const good = v === true || v === 'ok' || v === 'enabled';
            const bad = v === false || v === 'empty' || v === 'error' || v === 'disabled' || v === 'unavailable';
            return `<span class="dns-tag ${good ? 'dns-tag-g' : bad ? 'dns-tag-b' : 'dns-tag-w'}">${escHtml(label)}</span>`;
        };
        const r = data.ripe || {};
        const p = data.ptr || {};

        // PTR section
        let ptrBody = '';
        if (p.status === 'ok') {
            ptrBody = `<div class="dns-rec-line dns-rec-with-ptr"><span class="dns-rec-type">PTR</span><span class="dns-rec-val font-mono">${escHtml(data.ip)}</span><span class="dns-rec-ptr-inline" title="Reverse DNS"><i class="fas fa-arrow-left" style="color:#a3e635;margin-right:3px;font-size:0.7rem"></i>${escHtml(p.hostname)}</span></div>`;
        } else if (p.status === 'error') {
            ptrBody = empty('danger', 'PTR lookup failed: ' + escHtml(p.error || 'Unknown error'));
        } else {
            ptrBody = `<div class="dns-rec-line" style="border-left:3px solid #f59e0b"><span class="dns-rec-type">PTR</span><span class="dns-rec-val font-mono">${escHtml(data.ip)}</span><span class="dns-rec-ttl" style="color:#fbbf24">No PTR record</span></div>`;
        }

        // RIPE section
        let ripeBody = '';
        if (r.status === 'ok') {
            ripeBody = '<div class="dns-whois-col">';
            if (r.network) ripeBody += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-network-wired"></i> Network</span><span class="dns-whois-value">${escHtml(r.network)}</span></div>`;
            if (r.organization) ripeBody += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-building"></i> Organization</span><span class="dns-whois-value">${escHtml(r.organization)}</span></div>`;
            if (r.country) {
                const ccRaw = r.country.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                const cc = ccRaw.toLowerCase();
                ripeBody += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-flag"></i> Country</span><span class="dns-whois-value"><img src="https://flagcdn.com/24x18/${cc}.png" srcset="https://flagcdn.com/48x36/${cc}.png 2x" alt="${escHtml(ccRaw)}" style="height:14px;width:auto;vertical-align:middle;margin-right:6px;border-radius:2px"> ${escHtml(r.country.toUpperCase())}</span></div>`;
            }
            if (r.rir) ripeBody += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-globe"></i> RIR</span><span class="dns-whois-value">${escHtml(r.rir.toUpperCase())}</span></div>`;
            if (r.abuse_email) ripeBody += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-shield-halved"></i> Abuse Contact</span><span class="dns-whois-value">${escHtml(r.abuse_email)}</span></div>`;
            // Show remaining RIPE records
            const shown = ['NetName','OrgName','Organization','Country','OriginAS','NetRange','CIDR','NetHandle','Parent','NetType','Ref','source','RegDate','Comment','OrgId','Address','City','StateProv','PostalCode','OrgAbuseHandle','OrgAbuseName','OrgAbusePhone','OrgAbuseEmail','OrgAbuseRef','OrgTechHandle','OrgTechName','OrgTechPhone','OrgTechEmail','OrgTechRef'];
            const extra = (r.records || []).filter(x => !shown.includes(x.key));
            if (extra.length) {
                ripeBody += '<div class="dns-rec-sep"><i class="fas fa-list"></i> Full WHOIS Data</div>';
                extra.forEach(rec => {
                    ripeBody += `<div class="dns-rec-line"><span class="dns-rec-type">${escHtml(rec.key)}</span><span class="dns-rec-val font-mono" style="font-size:0.78rem">${escHtml(rec.value)}</span></div>`;
                });
            }
            ripeBody += '</div>';
        } else if (r.status === 'error') {
            ripeBody = empty('danger', 'RIPE lookup failed: ' + escHtml(r.error || 'Unknown error'));
        } else {
            ripeBody = empty('muted', 'No RIPE data available');
        }

        return `
<div class="dns-result">
    <div class="dns-banner" style="border-left:4px solid ${barColor}">
        <div class="dns-banner-left">
            <div class="dns-banner-icon" style="background:${barColor}"><i class="fas ${h.score >= 80 ? 'fa-circle-check' : h.score >= 50 ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i></div>
            <div>
                <div class="dns-banner-domain"><span class="font-mono">${escHtml(data.ip)}</span> <button class="dns-banner-copy" id="dnsCopyBtn" title="Copy"><i class="fas fa-copy"></i></button></div>
                <div class="dns-banner-meta">
                    ${tag(data.ip_type, true)}
                    ${tag('PTR ' + (p.status === 'ok' ? 'Set' : 'Missing'), p.status === 'ok')}
                    ${tag('RIPE ' + (r.status === 'ok' ? 'Found' : 'N/A'), r.status === 'ok')}
                    ${r.abuse_email ? tag('Abuse Set', true) : ''}
                </div>
                <div class="dns-banner-qa">
                    ${qa(`https://stat.ripe.net/${data.ip}`, 'fa-database', 'RIPE Stat')}
                </div>
            </div>
        </div>
        <div class="dns-banner-score">
            <div class="dns-score-num" style="color:${barColor}">${h.score}</div>
            <div class="dns-score-label">Health</div>
            <div class="dns-score-track"><div class="dns-score-fill" style="width:${h.score}%;background:${barColor}"></div></div>
        </div>
    </div>
    <div class="dns-card">
        <div class="dns-section">
            <div class="dns-section-title"><i class="fas fa-arrow-left"></i> Reverse DNS (PTR)</div>
            <div class="dns-section-body">${ptrBody}</div>
        </div>
        <div class="dns-section">
            <div class="dns-section-title"><i class="fas fa-database"></i> RIPE Database</div>
            <div class="dns-section-body">${ripeBody}</div>
        </div>
        <div class="dns-section">
            <div class="dns-section-title"><i class="fas fa-download"></i> Export</div>
            <div class="dns-section-body">
                <div class="dns-btn-row">
                    <button class="btn btn-sm btn-secondary" id="dnsExportJson"><i class="fas fa-download"></i> JSON</button>
                    <button class="btn btn-sm btn-secondary" id="dnsCopyAllBtn"><i class="fas fa-copy"></i> Copy All</button>
                </div>
            </div>
        </div>
    </div>
</div>`;
    } catch (e) { return `<div class="dns-empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>${escHtml(e.message)}</p></div>`; }
}

function attachIpScanEvents(data) {
    document.getElementById('dnsCopyBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(data.ip).then(() => toast('Copied!', 'info'));
    });
    document.getElementById('dnsExportJson')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = data.ip + '.json'; a.click();
    });
    document.getElementById('dnsCopyAllBtn')?.addEventListener('click', () => {
        let text = `IP: ${data.ip} (${data.ip_type})\nHealth: ${data.health.score}/100 (${data.health.grade})\n`;
        if (data.ptr?.hostname) text += `PTR: ${data.ptr.hostname}\n`;
        if (data.ripe?.network) text += `Network: ${data.ripe.network}\n`;
        if (data.ripe?.organization) text += `Organization: ${data.ripe.organization}\n`;
        if (data.ripe?.country) text += `Country: ${data.ripe.country}\n`;
        if (data.ripe?.abuse_email) text += `Abuse: ${data.ripe.abuse_email}\n`;
        if (data.ripe?.rir) text += `RIR: ${data.ripe.rir.toUpperCase()}\n`;
        navigator.clipboard.writeText(text).then(() => toast('Copied!', 'info'));
    });
}

/* ─── Available Domain Result ────────────────────────────────────────────── */
function renderAvailableResult(data) {
    const domain = data.domain;
    const tld = domain.split('.').pop();
    const registrars = [
        { name: 'Sidn.nl', url: `https://www.sidn.nl/whois/?domain=${domain}`, icon: 'fa-globe' },
        { name: 'GoDaddy', url: `https://www.godaddy.com/domainsearch/find?domainToCheck=${domain}`, icon: 'fa-cart-shopping' },
        { name: 'Namecheap', url: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`, icon: 'fa-tag' },
    ];
    return `
<div class="dns-result">
    <div class="dns-banner" style="border-left:4px solid #22c55e">
        <div class="dns-banner-left">
            <div class="dns-banner-icon" style="background:#22c55e"><i class="fas fa-circle-check"></i></div>
            <div>
                <div class="dns-banner-domain"><span class="font-mono">${escHtml(domain)}</span> <button class="dns-banner-copy" id="dnsCopyBtn" title="Copy"><i class="fas fa-copy"></i></button></div>
                <div class="dns-banner-meta">
                    <span class="dns-tag dns-tag-g"><i class="fas fa-check"></i> Available</span>
                    <span class="dns-tag dns-tag-g">${escHtml(tld.toUpperCase())} TLD</span>
                </div>
            </div>
        </div>
        <div class="dns-banner-score">
            <div class="dns-score-num" style="color:#22c55e"><i class="fas fa-cart-shopping"></i></div>
            <div class="dns-score-label">Free</div>
        </div>
    </div>
    <div class="dns-card">
        <div class="dns-section">
            <div class="dns-section-title"><i class="fas fa-circle-check" style="color:#22c55e"></i> Domain Available</div>
            <div class="dns-section-body">
                <div class="dns-whois-col">
                    <div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-globe"></i> Domain</span><span class="dns-whois-value font-mono" style="font-size:1.1rem;color:#22c55e">${escHtml(domain)}</span></div>
                    <div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-circle-info"></i> Status</span><span class="dns-whois-value" style="color:#22c55e">This domain is free to register</span></div>
                    <div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-magnifying-glass"></i> Method</span><span class="dns-whois-value">${escHtml(data.method || 'RDAP').toUpperCase()}</span></div>
                    <div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-comment"></i> Details</span><span class="dns-whois-value">${escHtml(data.details || '')}</span></div>
                </div>
            </div>
        </div>
        <div class="dns-section">
            <div class="dns-section-title"><i class="fas fa-cart-shopping"></i> Register This Domain</div>
            <div class="dns-section-body">
                <div class="dns-qa-grid">
                    ${registrars.map(r => `<a href="${r.url}" target="_blank" rel="noopener" class="dns-qa-btn"><i class="fas ${r.icon}"></i><span>${r.name}</span></a>`).join('')}
                </div>
            </div>
        </div>
    </div>
</div>`;
}

function attachAvailableEvents(data) {
    document.getElementById('dnsCopyBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(data.domain).then(() => toast('Copied!', 'info'));
    });
}

/* ─── Result Renderer ─────────────────────────────────────────────────── */
function renderDnsResult(data) {
    if (!data || !data.health) return `<div class="dns-empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>Invalid response.</p></div>`;
    try {
        ['a','aaaa','cname','mx','txt','caa','srv','soa','spf','dkim','dmarc','ns','delegation','reverse_dns','dnssec','edns','doh','dot','propagation','subdomains'].forEach(k => {
            if (!data[k]) data[k] = {};
        });
        data.whois = data.whois || {};
        const h = data.health;
        const barColor = h.score >= 80 ? '#22c55e' : h.score >= 50 ? '#f59e0b' : '#ef4444';

        const whoisReg = data.whois.registrar || '—';

        let ageBadge = '';
        if (data.whois.domain_age_days !== null && data.whois.domain_age_days !== undefined) {
            const days = data.whois.domain_age_days;
            const years = Math.floor(days / 365);
            const rem = days % 365;
            const ageText = years > 0 ? `${years}y ${rem}d` : `${days}d`;
            ageBadge = `<span class="dns-age-badge ${days > 365 ? 'dns-age-old' : 'dns-age-new'}"><i class="fas fa-hourglass-half"></i> ${ageText} old</span>`;
        }
        let expiryBadge = '';
        if (data.whois.days_until_expiry !== null && data.whois.days_until_expiry !== undefined) {
            const d = data.whois.days_until_expiry;
            const expClass = d > 365 ? 'dns-expiry-safe' : d > 90 ? 'dns-expiry-warn' : 'dns-expiry-danger';
            const expText = d > 365 ? `${Math.floor(d/365)}y ${d%365}d left` : d > 0 ? `${d}d left` : 'EXPIRED';
            expiryBadge = `<span class="dns-age-badge ${expClass}"><i class="fas fa-calendar-check"></i> ${expText}</span>`;
        }

        const tag = (label, v) => {
            const good = v === true || v === 'ok' || v === 'enabled';
            const bad = v === false || v === 'empty' || v === 'error' || v === 'disabled' || v === 'unavailable';
            return `<span class="dns-tag ${good ? 'dns-tag-g' : bad ? 'dns-tag-b' : 'dns-tag-w'}">${escHtml(label)}</span>`;
        };

        // Merge NS from both dns query and WHOIS
        const nsList = [...new Set([...(data.ns.nameservers || []), ...(data.whois.name_servers || [])])];
        const nsReachable = data.ns.reachable || [];

        // Build A/AAAA records with inline reverse DNS
        const ptrs = data.reverse_dns.ptr_records || [];
        const fcrdns = data.reverse_dns.fcrdns || [];
        const ptrMap = {};
        ptrs.forEach(ptr => { ptrMap[ptr.ip] = ptr.hostname; });
        const subMap = {};
        ptrs.forEach(ptr => { if (ptr.subdomain) subMap[ptr.ip] = ptr.subdomain; });
        const fcrdnsAllMatch = fcrdns.length > 0 && fcrdns.every(fc => fc.match);
        const fcrdnsAny = fcrdns.length > 0;

        const aRecs = (data.a.records || []).map(ip => {
            const ptrHost = ptrMap[ip] || null;
            const subLabel = subMap[ip] ? `<span class="dns-rec-ttl" style="color:#818cf8">${escHtml(subMap[ip])}</span>` : '';
            const ptrLabel = ptrHost ? `<span class="dns-rec-ptr-inline" title="Reverse DNS"><i class="fas fa-arrow-left" style="color:#a3e635;margin-right:3px;font-size:0.7rem"></i>${escHtml(ptrHost)}</span>` : '';
            let cpBtn = '';
            if (ptrHost) {
                const pl = ptrHost.toLowerCase();
                if (pl.endsWith('.axc.nl')) {
                    cpBtn = `<a class="dns-rec-cp-btn" href="http://${ptrHost}:2222/" target="_blank" rel="noopener noreferrer" title="Login to DirectAdmin"><i class="fas fa-right-to-bracket"></i> DirectAdmin</a>`;
                } else if (pl.endsWith('.versio.nl')) {
                    cpBtn = `<a class="dns-rec-cp-btn" href="https://${ptrHost}:2222/" target="_blank" rel="noopener noreferrer" title="Login to DirectAdmin"><i class="fas fa-right-to-bracket"></i> DirectAdmin</a>`;
                } else if (pl.endsWith('.yourhosting.nl')) {
                    cpBtn = `<a class="dns-rec-cp-btn dns-rec-cp-plesk" href="http://${ptrHost}:8443/" target="_blank" rel="noopener noreferrer" title="Login to Plesk"><i class="fas fa-right-to-bracket"></i> Plesk</a>`;
                }
            }
            return `<div class="dns-rec-line${ptrHost ? ' dns-rec-with-ptr' : ''}"><span class="dns-rec-type">A</span><span class="dns-rec-val font-mono">${escHtml(ip)}</span>${ptrLabel}${subLabel}<span class="dns-rec-ttl">TTL ${data.a.ttl || '?'}s</span>${cpBtn}</div>`;
        }).join('');
        const subRecs = (data.subdomains.records || []).map(r => {
            const subLabel = r.subdomain.split('.')[0] + '.';
            const typeClass = r.type === 'AAAA' ? ' dns-rec-aaaa' : '';
            const ptrLabel = r.ptr ? `<span class="dns-rec-ptr-inline" title="Reverse DNS"><i class="fas fa-arrow-left" style="color:#a3e635;margin-right:3px;font-size:0.7rem"></i>${escHtml(r.ptr)}</span>` : '';
            const subLabelColor = subLabel.startsWith('www') ? '#38bdf8' : (subLabel.startsWith('mail') ? '#fb923c' : '#818cf8');
            return `<div class="dns-rec-line${r.ptr ? ' dns-rec-with-ptr' : ''}"><span class="dns-rec-type${typeClass}" style="background:${subLabelColor}22;color:${subLabelColor};border:1px solid ${subLabelColor}44">${escHtml(subLabel)}</span><span class="dns-rec-val font-mono">${escHtml(r.ip)}</span>${ptrLabel}<span class="dns-rec-ttl">TTL ${r.ttl || '?'}s</span></div>`;
        }).join('');
        const aaaaRecs = (data.aaaa.records || []).map(ip => {
            const ptrHost = ptrMap[ip] || null;
            const ptrLabel = ptrHost ? `<span class="dns-rec-ptr-inline" title="Reverse DNS"><i class="fas fa-arrow-left" style="color:#a3e635;margin-right:3px;font-size:0.7rem"></i>${escHtml(ptrHost)}</span>` : '';
            return `<div class="dns-rec-line${ptrHost ? ' dns-rec-with-ptr' : ''}"><span class="dns-rec-type dns-rec-aaaa">AAAA</span><span class="dns-rec-val font-mono">${escHtml(ip)}</span>${ptrLabel}<span class="dns-rec-ttl">TTL ${data.aaaa.ttl || '?'}s</span></div>`;
        }).join('');

        // FCrDNS badge (shown after A records)
        const fcrdnsBadge = fcrdnsAny
            ? `<div class="dns-rec-fcrdns-badge ${fcrdnsAllMatch ? 'fcrdns-ok' : 'fcrdns-warn'}"><i class="fas ${fcrdnsAllMatch ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> FCrDNS ${fcrdnsAllMatch ? 'Valid — forward matches reverse' : 'Mismatch'}</div>`
            : '';

        const nsRecs = nsList.map((ns, i) => {
            const ok = nsReachable.includes(ns);
            return `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-ns">NS${i+1}</span><span class="dns-rec-val font-mono">${escHtml(ns)}</span><span class="dns-rec-status" style="color:${ok ? '#22c55e' : '#ef4444'}">${ok ? '● up' : '● down'}</span></div>`;
        }).join('');
        const mxRecs = (data.mx.records || []).map(mx => `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-mx">MX</span><span class="dns-rec-val font-mono">${escHtml(mx.host || '?')}</span><span class="dns-rec-ttl">pri ${mx.priority}</span></div>`).join('');
        const soaRec = data.soa.record ? `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-soa">SOA</span><span class="dns-rec-val font-mono">${escHtml(data.soa.record.mname || '?')}</span><span class="dns-rec-ttl">serial ${data.soa.record.serial || '?'}</span></div>` : '';
        const caaRecs = (data.caa.records || []).map(c => `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-caa">CAA</span><span class="dns-rec-val font-mono">${escHtml(c.value || '?')}</span><span class="dns-rec-ttl">${c.flags} ${c.tag}</span></div>`).join('');

        // NS consistency check
        let nsCheck = '';
        if (nsList.length > 0) {
            const d = data.delegation;
            const parentCount = (d.parent_ns || []).length;
            const match = d.match;
            const unreachable = data.ns.unreachable || [];
            const allReachable = nsReachable.length === nsList.length;
            nsCheck = `<div class="dns-rec-line" style="border-left:3px solid ${match ? '#22c55e' : '#f59e0b'}"><span class="dns-rec-type dns-rec-ns">NSck</span><span class="dns-rec-val">Delegation ${match ? 'matches parent zone' : 'mismatch with parent zone'}</span><span class="dns-rec-ttl">${parentCount} parent NS</span></div>`;
            if (d.warnings && d.warnings.length) {
                d.warnings.forEach(w => { nsCheck += `<div class="dns-rec-line" style="border-left:3px solid #f59e0b"><span class="dns-rec-type dns-rec-ns">WARN</span><span class="dns-rec-val" style="color:#fbbf24">${escHtml(w)}</span></div>`; });
            }
            if (unreachable.length) {
                unreachable.forEach(ns => { nsCheck += `<div class="dns-rec-line" style="border-left:3px solid #ef4444"><span class="dns-rec-type dns-rec-ns">DOWN</span><span class="dns-rec-val" style="color:#f87171">${escHtml(ns)} unreachable</span></div>`; });
            }
            if (!data.ns.consistent) {
                nsCheck += `<div class="dns-rec-line" style="border-left:3px solid #f59e0b"><span class="dns-rec-type dns-rec-ns">WARN</span><span class="dns-rec-val" style="color:#fbbf24">Inconsistent responses across nameservers</span></div>`;
            }
            if (allReachable && data.ns.consistent) {
                nsCheck += `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-ns">NSck</span><span class="dns-rec-val" style="color:#4ade80">${nsList.length} nameservers — all reachable & consistent</span></div>`;
            }


        }

        // TXT, SRV for extra records — split auth records from other TXT
        const allTxtRecs = data.txt.records || [];
        const authRecs = allTxtRecs.filter(t => ['spf','dkim','dmarc'].includes(t.type));
        const otherTxtRecs = allTxtRecs.filter(t => !['spf','dkim','dmarc'].includes(t.type));
        const txtRecs = otherTxtRecs.map(t => {
            return `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-txt">TXT</span><span class="dns-rec-val font-mono" style="font-size:0.78rem">${escHtml(t.value)}</span></div>`;
        }).join('');
        const authTxtRecs = authRecs.filter(t => t.type !== 'spf').map(t => {
            const label = t.type === 'dkim' ? 'DKIM' : 'DMARC';
            return `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-txt">${label}</span><span class="dns-rec-val font-mono" style="font-size:0.78rem">${escHtml(t.value)}</span></div>`;
        }).join('');
        const spfRec = allTxtRecs.find(t => t.type === 'spf');
        const spfLine = spfRec ? `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-txt">SPF</span><span class="dns-rec-val font-mono" style="font-size:0.78rem">${escHtml(spfRec.value)}</span></div>` : '';
        const srvRecs = (data.srv.records || []).map(s => `<div class="dns-rec-line"><span class="dns-rec-type dns-rec-srv">SRV</span><span class="dns-rec-val font-mono">${escHtml(s.service)} → ${escHtml(s.target)}</span><span class="dns-rec-ttl">${s.priority}/${s.port}</span></div>`).join('');

        return `
<div class="dns-result">
    <div class="dns-banner" style="border-left:4px solid ${barColor}">
        <div class="dns-banner-left">
            <div class="dns-banner-icon" style="background:${barColor}"><i class="fas ${h.score >= 80 ? 'fa-circle-check' : h.score >= 50 ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i></div>
            <div>
                <div class="dns-banner-domain"><span class="font-mono">${data.domain}</span> <button class="dns-banner-copy" id="dnsCopyBtn" title="Copy"><i class="fas fa-copy"></i></button></div>
                <div class="dns-banner-meta">
                    ${tag('Grade ' + h.grade, h.grade === 'A' || h.grade === 'B')}
                    ${tag('DNSSEC ' + (data.dnssec.enabled ? 'On' : 'Off'), data.dnssec.enabled)}
                    ${tag(whoisReg === '—' ? 'No WHOIS' : whoisReg, whoisReg !== '—')}
                    ${ageBadge}${expiryBadge}
                    <span class="dns-tag dns-tag-w"><i class="fas fa-clock"></i> ${data.duration_ms || '?'}ms</span>
                </div>
                <div class="dns-banner-qa">
                    ${qa(`https://${data.domain}`, 'fa-globe', 'Visit Website')}
                    ${qa(`https://web.archive.org/web/*/${data.domain}`, 'fa-clock-rotate-left', 'Archive')}
                    ${qa(`https://securitytrails.com/domain/${data.domain}/dns`, 'fa-clock-rotate-left', 'SecurityTrails')}
                    ${qa(`https://www.whatsmydns.net/#A/${data.domain}`, 'fa-globe', 'Propagation')}
                    ${qa(`https://dnsviz.net/d/${data.domain}/dnssec/`, 'fa-shield-halved', 'DNSViz')}
                </div>
            </div>
        </div>
        <div class="dns-banner-score">
            <div class="dns-score-num" style="color:${barColor}">${h.score}</div>
            <div class="dns-score-label">Health</div>
            <div class="dns-score-track"><div class="dns-score-fill" style="width:${h.score}%;background:${barColor}"></div></div>
        </div>
    </div>

    <div class="dns-layout">
        <div class="dns-card">
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-list"></i> DNS Records</div>
                <div class="dns-section-body">
                    ${aRecs || '<div class="dns-rec-empty"><i class="fas fa-info-circle"></i> No A records</div>'}
                    ${aaaaRecs || ''}
                    ${subRecs || ''}
                    ${spfLine || ''}
                    ${mxRecs || '<div class="dns-rec-empty"><i class="fas fa-info-circle"></i> No MX records</div>'}
                    ${txtRecs || ''}
                    ${authTxtRecs || ''}
                    ${nsRecs || '<div class="dns-rec-empty"><i class="fas fa-info-circle"></i> No nameservers</div>'}
                    ${soaRec || '<div class="dns-rec-empty"><i class="fas fa-info-circle"></i> No SOA record</div>'}
                    ${caaRecs ? '<div class="dns-rec-sep"><i class="fas fa-shield-halved"></i> CAA</div>' + caaRecs : ''}
                    ${fcrdnsBadge || ''}
                    ${srvRecs ? '<div class="dns-rec-sep"><i class="fas fa-server"></i> SRV</div>' + srvRecs : ''}
                    ${nsCheck ? '<div class="dns-rec-sep"><i class="fas fa-server"></i> Nameserver Check</div>' + nsCheck : ''}
                </div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-shield-halved"></i> Email Authentication</div>
                <div class="dns-section-body">${renderEmailAuthBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-lock"></i> Security</div>
                <div class="dns-section-body">${renderDnsSecBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-sitemap"></i> Delegation</div>
                <div class="dns-section-body">${renderDelegationBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-rss"></i> Propagation</div>
                <div class="dns-section-body">${renderPropagationBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-network-wired"></i> Protocols</div>
                <div class="dns-section-body">${renderProtocolsBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-download"></i> Export</div>
                <div class="dns-section-body">
                    <div class="dns-btn-row">
                        <button class="btn btn-sm btn-secondary" id="dnsExportJson"><i class="fas fa-download"></i> JSON</button>
                        <button class="btn btn-sm btn-secondary" id="dnsExportPdf"><i class="fas fa-file-pdf"></i> PDF</button>
                        <button class="btn btn-sm btn-secondary" id="dnsCopyAllBtn"><i class="fas fa-copy"></i> Copy All</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="dns-sidebar">
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-building"></i> WHOIS</div>
                <div class="dns-section-body">${renderWhoisBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-certificate"></i> SSL Certificates</div>
                <div class="dns-section-body">${renderSslBody(data)}</div>
            </div>
            <div class="dns-section">
                <div class="dns-section-title"><i class="fas fa-terminal"></i> Dig Tool</div>
                <div class="dns-section-body" id="dnsDigBody">
                    <div class="dns-dig-form">
                        <select id="dnsDigType" class="dns-dig-input dns-dig-select">
                            <option value="A">A</option>
                            <option value="AAAA">AAAA</option>
                            <option value="CNAME">CNAME</option>
                            <option value="MX">MX</option>
                            <option value="TXT">TXT</option>
                            <option value="NS">NS</option>
                            <option value="SOA">SOA</option>
                        </select>
                        <input type="text" id="dnsDigName" class="dns-dig-input dns-dig-name" value="${escHtml(data.domain)}" placeholder="name">
                        <select id="dnsDigNs" class="dns-dig-input dns-dig-select">
                            <option value="">System resolver</option>
                            ${(data.ns.nameservers || []).map(ns => '<option value="' + escHtml(ns) + '">' + escHtml(ns) + '</option>').join('')}
                        </select>
                        <button class="btn btn-sm btn-primary" id="dnsDigBtn"><i class="fas fa-play"></i> Dig</button>
                    </div>
                    <div id="dnsDigResult" class="dns-dig-result"></div>
                </div>
            </div>
        </div>
    </div>
</div>`;
    } catch (e) { return `<div class="dns-empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>${escHtml(e.message)}</p></div>`; }
}

/* ─── Section Body Functions ──────────────────────────────────────────── */
function renderEmailAuthBody(data) {
    let h = '';
    const allTxt = data.txt.records || [];
    const spfRec = allTxt.find(t => t.type === 'spf');
    const dkimRecs = allTxt.filter(t => t.type === 'dkim');
    const dmarcRec = allTxt.find(t => t.type === 'dmarc');
    const valStyle = 'font-size:0.78rem;word-break:break-all';
    h += sub('SPF', data.spf.exists ? 'ok' : 'missing', () => {
        if (!data.spf.exists) return empty('danger', 'No SPF record — spoofing not prevented');
        let r = row('Policy', data.spf.pass_fail || '?') + (data.spf.excessive_lookups ? warn('DNS lookups exceed 10!') : '') +
            ((data.spf.warnings || []).map(w => warn(w)).join(''));
        if (spfRec) r += row('Record', `<span style="font-size:0.85rem;word-break:break-all;line-height:1.5;background:var(--bg-tertiary);padding:6px 10px;border-radius:6px;display:block">${escHtml(spfRec.value)}</span>`);
        return r;
    });
    h += sub('DKIM', data.dkim.count > 0 ? 'ok' : 'empty', () => {
        if (!data.dkim.count) return empty('muted', 'No DKIM selectors found');
        let r = (data.dkim.selectors || []).map(s => row('Selector: ' + s.selector, s.valid ? ok('Valid') : err('Invalid'))).join('');
        dkimRecs.forEach(d => { r += row('Record', `<span style="${valStyle}">${escHtml(d.value)}</span>`); });
        return r;
    });
    h += sub('DMARC', data.dmarc.exists ? 'ok' : 'missing', () => {
        if (!data.dmarc.exists) return empty('warning', 'No DMARC record');
        let r = row('Policy', data.dmarc.policy || '?') + (data.dmarc.rua ? row('Reports', data.dmarc.rua) : '') +
            ((data.dmarc.warnings || []).map(w => warn(w)).join(''));
        if (dmarcRec) r += row('Record', `<span style="${valStyle}">${escHtml(dmarcRec.value)}</span>`);
        return r;
    });
    return h;
}

function renderDelegationBody(data) {
    let h = '';
    h += sub('Nameservers', data.ns.status, () => {
        if (!data.ns.nameservers || !data.ns.nameservers.length) return empty('danger', 'No nameservers');
        const reachable = data.ns.reachable || [];
        return (data.ns.nameservers || []).map(ns => {
            const r = reachable.includes(ns);
            return row(ns, r ? ok('Reachable') : err('Unreachable'));
        }).join('') + row('Consistency', data.ns.consistent ? ok('Consistent') : err('Inconsistent')) +
            ((data.ns.warnings || []).map(w => warn(w)).join(''));
    });
    h += sub('Delegation', data.delegation.status, () => {
        const d = data.delegation;
        return (d.match ? row('Match', ok('Yes')) : row('Match', err('No'))) +
            (d.parent_ns && d.parent_ns.length ? row('Parent NS', d.parent_ns.length + ' TLD servers') : '') +
            (d.child_ns && d.child_ns.length ? row('Child NS', d.child_ns.length + ' authoritative ' + d.child_ns.join(', ')) : '') +
            ((d.warnings || []).map(w => warn(w)).join(''));
    });
    return h;
}

function renderDnsSecBody(data) {
    let h = '';
    h += sub('DNSSEC', data.dnssec.enabled ? 'ok' : 'disabled', () => {
        if (!data.dnssec.enabled) return empty('warning', 'DNSSEC disabled — consider enabling');
        return row('DS Records', String((data.dnssec.ds_records || []).length)) +
            row('DNSKEY Records', String((data.dnssec.dnskey_records || []).length)) +
            row('Trust Chain', data.dnssec.trust_chain_valid ? ok('Valid') : err('Invalid'));
    });
    return h;
}

function renderSslBody(data) {
    const ssl = data.ssl;
    if (!ssl || ssl.status === 'error' && !ssl.root && !ssl.www)
        return empty('danger', 'SSL check failed');
    let h = '';
    const rootCert = ssl.root || {};
    const wwwCert = ssl.www || {};
    const rootOk = rootCert.valid;
    const wwwOk = wwwCert.valid;
    const bothOk = rootOk && wwwOk;
    const anyOk = rootOk || wwwOk;
    const best = wwwOk ? wwwCert : rootCert;
    const daysLeft = best.days_left || 0;
    const urgent = daysLeft <= 14;
    const cls = bothOk ? '' : (anyOk ? ' ssl-cert-partial' : ' ssl-cert-invalid');
    h += `<div class="ssl-cert-card${cls}">`;
    h += '<div class="ssl-cert-header"><i class="fas fa-certificate"></i><span class="ssl-cert-host">' + escHtml(data.domain) + '</span>';
    const hosts = [
        { label: data.domain, ok: rootOk },
        { label: 'www.' + data.domain, ok: wwwOk },
    ];
    h += '<span class="ssl-host-badges">' + hosts.map(x =>
        `<span class="ssl-host-badge ${x.ok ? 'ssl-host-ok' : 'ssl-host-err'}"><i class="fas ${x.ok ? 'fa-check-circle' : 'fa-times-circle'}"></i> ${escHtml(x.label)}</span>`
    ).join('') + '</span>';
    if (bothOk) {
        h += '<span class="ssl-badge ssl-ok"><i class="fas fa-check-circle"></i> Valid</span>';
    } else if (anyOk) {
        h += '<span class="ssl-badge ssl-warn"><i class="fas fa-exclamation-triangle"></i> Partial</span>';
    } else {
        h += '<span class="ssl-badge ssl-err"><i class="fas fa-times-circle"></i> Invalid</span>';
    }
    h += '</div>';
    if (anyOk) {
        h += '<div class="ssl-cert-grid">';
        h += '<div class="ssl-field"><span class="ssl-field-label">Issuer</span><span class="ssl-field-value">' + escHtml(best.issuer || '?') + '</span></div>';
        h += '<div class="ssl-field"><span class="ssl-field-label">Subject</span><span class="ssl-field-value">' + escHtml(best.subject || '?') + '</span></div>';
        h += '<div class="ssl-field"><span class="ssl-field-label">Valid From</span><span class="ssl-field-value">' + escHtml(best.valid_from) + '</span></div>';
        h += '<div class="ssl-field"><span class="ssl-field-label">Expires</span><span class="ssl-field-value ssl-expiry' + (urgent ? ' ssl-urgent' : '') + '">' + escHtml(best.valid_to) + ' <span class="ssl-days">(' + daysLeft + 'd)</span></span></div>';
        if (best.sans && best.sans.length) {
            const shown = best.sans.slice(0, 8);
            const more = best.sans.length - shown.length;
            h += '<div class="ssl-field ssl-san"><span class="ssl-field-label">SANs</span><span class="ssl-field-value">' + shown.map(s => '<span class="ssl-san-tag">' + escHtml(s) + '</span>').join('') + (more > 0 ? '<span class="ssl-san-more">+' + more + '</span>' : '') + '</span></div>';
        }
        if (best.signature_type) h += '<div class="ssl-field"><span class="ssl-field-label">Signature</span><span class="ssl-field-value">' + escHtml(best.signature_type) + '</span></div>';
        h += '</div>';
        if (!bothOk) {
            const failed = !rootOk ? rootCert : wwwCert;
            if (failed && failed.error) h += '<div class="ssl-cert-warn"><i class="fas fa-exclamation-triangle"></i> ' + escHtml(failed.error) + '</div>';
        }
    } else {
        const errCert = rootCert.error || wwwCert.error || 'Connection failed';
        h += '<div class="ssl-cert-error">' + escHtml(errCert) + '</div>';
    }
    h += '</div>';
    return h;
}

function renderReverseDnsBody(data) {
    if (!data.reverse_dns.ptr_records || !data.reverse_dns.ptr_records.length) {
        const aCount = (data.reverse_dns.a_records || []).length;
        const aaaaCount = (data.reverse_dns.aaaa_records || []).length;
        const total = aCount + aaaaCount;
        return empty('muted', total + ' record' + (total !== 1 ? 's' : '') + ' — no PTR records');
    }
    let h = '';
    (data.reverse_dns.ptr_records || []).forEach(ptr => {
        h += row('PTR for ' + ptr.ip, ptr.hostname || '?');
    });
    (data.reverse_dns.fcrdns || []).forEach(fc => {
        h += row('FCrDNS', fc.match ? ok('Valid') : err('Mismatch: ' + (fc.forward_ip || '?')));
    });
    return h;
}

function renderWhoisBody(data) {
    const w = data.whois;
    if (!w || w.status === 'error')
        return empty('danger', 'WHOIS lookup failed');
    const hasData = w.registrar || w.creation_date || w.expiration_date || (w.name_servers && w.name_servers.length) || w.raw;
    if (!hasData)
        return empty('muted', 'No WHOIS data available');
    let h = '';

    h += '<div class="dns-whois-col">';

    // Registrar
    if (w.registrar) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-building"></i> Registrar</span><span class="dns-whois-value">${escHtml(w.registrar)}</span></div>`;

    // Reseller
    if (w.reseller) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-store"></i> Reseller</span><span class="dns-whois-value">${escHtml(w.reseller)}${w.reseller_organization ? ' <span class="dns-whois-sub">(' + escHtml(w.reseller_organization) + ')</span>' : ''}</span></div>`;

    // Status (colored badges)
    if (w.domain_status && w.domain_status.length) {
        const statusColors = {
            'active': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'ok': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'serverdeleteprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'servertransferprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'serverupdateprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'clienttransferprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'clientdeleteprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'clientupdateprohibited': { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
            'quarantine': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'pendingdelete': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'pendingtransfer': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'pendingupdate': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'redemptionperiod': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'pendingrestore': { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
            'inactive': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'inactivestatus': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'deleted': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'expired': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'hold': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'clienthold': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'serverhold': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'transferprohibited': { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
            'autorenewperiod': { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
            'addperiod': { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
            'reserved': { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
            'nothirdlevel': { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
        };
        h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-circle-info"></i> Status</span><span class="dns-whois-value dns-whois-status-list">`;
        w.domain_status.forEach(s => {
            const key = s.toLowerCase().replace(/[^a-z]/g, '');
            const sc = statusColors[key] || { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'var(--border-color)' };
            h += `<span class="dns-whois-status" style="background:${sc.bg};color:${sc.color};border-color:${sc.border}">${escHtml(s)}</span>`;
        });
        h += '</span></div>';
    }

    // Dates
    if (w.creation_date) {
        const age = w.domain_age_days !== null && w.domain_age_days !== undefined ? `<span class="dns-whois-sub">(${w.domain_age_days} days)</span>` : '';
        h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-calendar-plus"></i> Created</span><span class="dns-whois-value">${fmtDate(w.creation_date)} ${age}</span></div>`;
    }
    if (w.expiration_date) {
        const left = w.days_until_expiry !== null && w.days_until_expiry !== undefined ? `<span class="dns-whois-sub">(${w.days_until_expiry > 0 ? w.days_until_expiry + ' days left' : 'EXPIRED'})</span>` : '';
        h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-calendar-xmark"></i> Expires</span><span class="dns-whois-value">${fmtDate(w.expiration_date)} ${left}</span></div>`;
    }
    if (w.updated_date) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-pen"></i> Updated</span><span class="dns-whois-value">${fmtDate(w.updated_date)}</span></div>`;

    // Nameservers (multi-row with comparison to DNS NS)
    if (w.name_servers && w.name_servers.length) {
        const dnsNs = data.ns.nameservers || [];
        const whoisNsLower = w.name_servers.map(s => s.toLowerCase().replace(/\.\s*$/, ''));
        const dnsNsLower = dnsNs.map(s => s.toLowerCase().replace(/\.\s*$/, ''));
        const nsMatch = whoisNsLower.length === dnsNsLower.length && whoisNsLower.every(ns => dnsNsLower.includes(ns));
        const matchIcon = nsMatch
            ? '<i class="fas fa-check-circle" style="color:#4ade80;margin-left:6px"></i>'
            : '<i class="fas fa-triangle-exclamation" style="color:#fbbf24;margin-left:6px"></i>';
        h += `<div class="dns-whois-row dns-whois-ns-block"><span class="dns-whois-label"><i class="fas fa-server"></i> Nameservers${matchIcon}</span><span class="dns-whois-value dns-whois-ns-list">`;
        w.name_servers.forEach(ns => { h += `<span class="dns-whois-ns-item font-mono">${escHtml(ns)}</span>`; });
        h += '</span></div>';
        if (!nsMatch && dnsNs.length) {
            const onlyWhois = whoisNsLower.filter(ns => !dnsNsLower.includes(ns));
            const onlyDns = dnsNsLower.filter(ns => !whoisNsLower.includes(ns));
            if (onlyWhois.length || onlyDns.length) {
                h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-arrows-left-right"></i> Mismatch</span><span class="dns-whois-value dns-whois-mismatch">`;
                if (onlyWhois.length) h += `<span>In WHOIS only: </span>${onlyWhois.map(ns => '<span class="font-mono">' + escHtml(ns) + '</span>').join(', ')} `;
                if (onlyDns.length) h += `<span>In DNS only: </span>${onlyDns.map(ns => '<span class="font-mono">' + escHtml(ns) + '</span>').join(', ')}`;
                h += '</span></div>';
            }
        }
    }

    // Registrant
    if (w.registrant_name) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-user"></i> Registrant</span><span class="dns-whois-value">${escHtml(w.registrant_name)}</span></div>`;
    if (w.registrant_organization) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-building"></i> Org</span><span class="dns-whois-value">${escHtml(w.registrant_organization)}</span></div>`;
    const loc = [w.registrant_city, w.registrant_state, w.registrant_country].filter(Boolean).join(', ');
    if (loc) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-location-dot"></i> Location</span><span class="dns-whois-value">${escHtml(loc)}</span></div>`;

    // Tech contact
    if (w.tech_name) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-wrench"></i> Tech Contact</span><span class="dns-whois-value">${escHtml(w.tech_name)}</span></div>`;
    if (w.tech_email) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-envelope"></i> Tech Email</span><span class="dns-whois-value"><a href="mailto:${escHtml(w.tech_email)}">${escHtml(w.tech_email)}</a></span></div>`;

    // Abuse
    if (w.abuse_email) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-flag"></i> Abuse Email</span><span class="dns-whois-value"><a href="mailto:${escHtml(w.abuse_email)}">${escHtml(w.abuse_email)}</a></span></div>`;
    if (w.abuse_phone) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-phone"></i> Abuse Phone</span><span class="dns-whois-value">${escHtml(w.abuse_phone)}</span></div>`;

    // Meta
    if (w.dnssec) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-lock"></i> DNSSEC</span><span class="dns-whois-value">${escHtml(w.dnssec)}</span></div>`;
    if (w.registry_domain_id) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-fingerprint"></i> Registry ID</span><span class="dns-whois-value font-mono">${escHtml(w.registry_domain_id)}</span></div>`;
    if (w.whois_server) h += `<div class="dns-whois-row"><span class="dns-whois-label"><i class="fas fa-database"></i> WHOIS Server</span><span class="dns-whois-value font-mono">${escHtml(w.whois_server)}</span></div>`;

    h += '</div>';

    if (w.raw) h += '<details class="dns-raw-details"><summary>Raw WHOIS</summary><pre class="dns-raw">' + escHtml(w.raw) + '</pre></details>';
    return h;
}

function renderPropagationBody(data) {
    const p = data.propagation;
    if (!p || !p.resolvers || !p.resolvers.length) return empty('muted', 'Propagation data unavailable');
    let h = '<div class="dns-prop-bar">' + (p.consistent ? ok('All resolvers agree') : err('Inconsistent — possible propagation delay')) + '</div>';
    h += '<table class="dns-table"><thead><tr><th>Resolver</th><th>Location</th><th>Time</th></tr></thead><tbody>';
    (p.resolvers || []).forEach(r => {
        const ms = r.response_time || 0;
        let timeColor = '#4ade80';
        if (ms > 300) timeColor = '#f87171';
        else if (ms > 150) timeColor = '#fbbf24';
        const timeStr = r.response_time ? '<span class="dns-prop-time" style="color:' + timeColor + '">' + r.response_time + '<small>ms</small></span>' : '<span class="dns-prop-time dns-prop-time-na">—</span>';
        h += '<tr><td><strong>' + escHtml(r.name) + '</strong></td><td>' + escHtml(r.location) + '</td><td>' + timeStr + '</td></tr>';
    });
    h += '</tbody></table>';
    (p.warnings || []).forEach(w => h += warn(w));
    return h;
}

function renderProtocolsBody(data) {
    let h = '';
    h += sub('EDNS', data.edns.status, () => row('Supported', data.edns.supported ? ok('Yes') : err('No')) + ((data.edns.warnings || []).map(w => warn(w)).join('')));
    h += sub('DoH', data.doh.status, () => row('Google DNS-over-HTTPS', data.doh.supported ? ok('Yes (' + (data.doh.response_time || '?') + 'ms)') : err('No')));
    h += sub('DoT', data.dot.status, () => row('Cloudflare DNS-over-TLS', data.dot.supported ? ok('Yes (' + (data.dot.response_time || '?') + 'ms)') : err('No')));
    return h;
}

function renderExtraBody(data) {
    let h = '';
    h += sub('TXT Records', data.txt.count > 0 ? 'ok' : 'empty', () => {
        if (!data.txt.count) return empty('muted', 'No TXT records');
        return (data.txt.records || []).map(t => {
            const label = t.type === 'spf' ? 'SPF' : t.type === 'dkim' ? 'DKIM' : t.type === 'dmarc' ? 'DMARC' : 'TXT';
            return '<div class="dns-txt-row"><span class="dns-txt-tag">' + label + '</span><span class="font-mono">' + escHtml(t.value) + '</span></div>';
        }).join('');
    });
    h += sub('SRV', data.srv.status, () => {
        if (!data.srv.records || !data.srv.records.length) return empty('muted', 'No SRV records');
        return (data.srv.records || []).map(s => row(s.service + ' → ' + s.target, s.priority + '/' + s.port + ' (' + (s.resolves ? 'OK' : 'Err') + ')')).join('');
    });
    return h;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function sub(title, st, fn) {
    const m = { ok: 'good', empty: 'warn', error: 'bad', missing: 'bad', disabled: 'warn', unknown: 'warn' };
    const cls = m[st] || 'warn';
    const icons = { good: 'fa-check-circle', warn: 'fa-exclamation-triangle', bad: 'fa-times-circle' };
    const colors = { good: '#4ade80', warn: '#fbbf24', bad: '#f87171' };
    let body;
    try { body = fn(); } catch (e) { body = warn('Error: ' + e.message); }
    return `<div class="dns-sub"><div class="dns-sub-hdr"><i class="fas ${icons[cls]}" style="color:${colors[cls]}"></i><span>${escHtml(title)}</span></div><div class="dns-sub-bd">${body}</div></div>`;
}
function row(l, v) { return `<div class="dns-row"><span>${l}</span><span>${v || ''}</span></div>`; }
function ok(t) { return `<span style="color:#4ade80;font-weight:700">${t}</span>`; }
function err(t) { return `<span style="color:#f87171;font-weight:700">${t}</span>`; }
function warn(t) { return `<div class="dns-warn"><i class="fas fa-exclamation-triangle"></i> ${escHtml(t)}</div>`; }
function empty(s, t) { const c = s === 'danger' ? '#f87171' : s === 'warning' ? '#fbbf24' : '#cbd5e1'; return `<div style="color:${c};padding:6px 0;font-weight:500"><i class="fas fa-info-circle"></i> ${t}</div>`; }
function status(o) { return o.status || (o.exists ? 'ok' : 'empty') || 'unknown'; }
function qa(url, icon, label) { return `<a href="${url}" target="_blank" rel="noopener" class="dns-qa-btn"><i class="fas ${icon}"></i> ${label}</a>`; }
function fmtDate(s) { if (!s) return '—'; const d = new Date(s); if (isNaN(d.getTime())) return s; return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
function fmtDur(s) { if (!s && s !== 0) return '?'; if (s >= 86400) return Math.round(s / 8640) / 10 + 'd'; if (s >= 3600) return Math.round(s / 360) / 10 + 'h'; if (s >= 60) return Math.round(s / 6) / 10 + 'm'; return s + 's'; }
function escHtml(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ─── Event Handlers ──────────────────────────────────────────────────── */
function attachDnsEvents(data) {
    document.getElementById('dnsCopyBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(data.domain).then(() => toast('Domain copied!', 'success')).catch(() => toast('Failed.', 'error'));
    });
    document.getElementById('dnsExportJson')?.addEventListener('click', () => {
        const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = 'dns-' + data.domain + '.json'; a.click(); URL.revokeObjectURL(u);
        toast('JSON exported.', 'success');
    });
    document.getElementById('dnsExportPdf')?.addEventListener('click', () => window.print());
    document.getElementById('dnsCopyAllBtn')?.addEventListener('click', () => {
        const s = `DNS Lookup — ${data.domain}\nHealth: ${data.health.score}/100 (${data.health.grade})\nErrors: ${data.health.errors}, Warnings: ${data.health.warnings}\n`;
        navigator.clipboard.writeText(s).then(() => toast('Summary copied!', 'success')).catch(() => toast('Failed.', 'error'));
    });

    // Dig tool
    const digBtn = document.getElementById('dnsDigBtn');
    const digName = document.getElementById('dnsDigName');
    const digType = document.getElementById('dnsDigType');
    const digNs = document.getElementById('dnsDigNs');
    const digResult = document.getElementById('dnsDigResult');
    if (digBtn && digName && digType && digNs && digResult) {
        function doDig() {
            const name = digName.value.trim();
            const type = digType.value;
            const ns = digNs.value;
            if (!name) { digResult.innerHTML = warn('Enter a name to query'); return; }
            digResult.innerHTML = '<span style="color:#94a3b8"><i class="fas fa-spinner fa-spin"></i> Querying...</span>';
            const params = new URLSearchParams({ dig: '1', name, type });
            if (ns) params.set('ns', ns);
            fetch('api/dns?' + params.toString())
                .then(r => r.json())
                .then(j => {
                    const d = j.data?.dig?.result;
                    if (!d) {
                        digResult.innerHTML = warn(j.error || 'No result');
                        return;
                    }
                    const answers = d.answers || [];
                    const error = d.error;
                    if (error) {
                        digResult.innerHTML = err(error);
                        return;
                    }
                    if (answers.length === 0) {
                        digResult.innerHTML = empty('warning', 'No ' + type + ' records found for ' + escHtml(name) + (ns ? ' @ ' + escHtml(ns) : ''));
                        return;
                    }
                    let html = '<div class="dns-rec-line"><span class="dns-rec-val" style="font-weight:600">Name: ' + escHtml(name) + '</span></div>';
                    html += '<div class="dns-rec-line"><span class="dns-rec-val" style="font-weight:600">Type: ' + escHtml(type) + '</span></div>';
                    if (ns) html += '<div class="dns-rec-line"><span class="dns-rec-val" style="font-weight:600">Server: ' + escHtml(ns) + '</span></div>';
                    answers.forEach(a => {
                        html += '<div class="dns-rec-line"><span class="dns-rec-type dns-rec-' + type.toLowerCase() + '">' + escHtml(type) + '</span><span class="dns-rec-val" style="font-family:monospace;font-size:0.85rem;word-break:break-all">' + escHtml(a) + '</span></div>';
                    });
                    digResult.innerHTML = html;
                })
                .catch(e => {
                    digResult.innerHTML = warn('Request failed: ' + e.message);
                });
        }
        digBtn.addEventListener('click', doDig);
        digName.addEventListener('keydown', e => { if (e.key === 'Enter') doDig(); });
        digType.addEventListener('keydown', e => { if (e.key === 'Enter') doDig(); });
        digNs.addEventListener('keydown', e => { if (e.key === 'Enter') doDig(); });
    }

}
