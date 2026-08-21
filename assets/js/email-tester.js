/**
 * Email Deliverability Tester - Frontend
 */

let edtState = {
    currentTest: null,
    pollingTimer: null,
    pollCount: 0,
    maxPolls: 120,
    pollInterval: 3000,
};

function renderEmailDeliverabilityTester() {
    setPageTitle('Deliverability Lab', 'Email authentication, content, and deliverability analysis');

    const body = getActiveBody();

    if (edtState.pollingTimer) {
        clearInterval(edtState.pollingTimer);
        edtState.pollingTimer = null;
    }

    body.innerHTML = `
        <div class="edt-wrap">
            <div class="edt-card">
                <div class="edt-card-top">
                    <div class="edt-card-badge">
                        <i class="fas fa-paper-plane"></i>
                        <span>Email Testing Tool</span>
                    </div>
                </div>
                <h2 class="edt-card-title">Email Deliverability Tester</h2>
                <p class="edt-desc">Generate a unique test email address, send a message to it, and get a detailed deliverability analysis covering authentication (SPF, DKIM, DMARC), MIME structure, content quality, links, and spam signals.</p>

                <div id="edtContent">
                    ${edtState.currentTest ? renderTestView(edtState.currentTest) : renderCreateView()}
                </div>
            </div>
        </div>
    `;

    attachEdtEvents();
}

function renderCreateView() {
    return `
        <div class="edt-create-section">
            <button class="btn btn-primary edt-create-btn" id="edtCreateBtn">
                <i class="fas fa-plus"></i> Generate Test Email Address
            </button>
        </div>
    `;
}

function renderTestView(test) {
    const isWaiting = test.status === 'waiting';
    const isComplete = test.status === 'complete';
    const isError = test.status === 'error';
    const isExpired = test.status === 'expired';
    const isAnalyzing = test.status === 'analyzing';
    const isReceived = test.status === 'received';

    let statusHtml = '';
    if (isWaiting) {
        statusHtml = `
            <div class="edt-status edt-status-waiting">
                <div class="edt-status-icon"><i class="fas fa-hourglass-half fa-spin"></i></div>
                <div class="edt-status-info">
                    <div class="edt-status-text">Waiting for email</div>
                    <div class="edt-status-sub">Send an email to the address above, then check again.</div>
                </div>
            </div>`;
    } else if (isReceived || isAnalyzing) {
        statusHtml = `
            <div class="edt-status edt-status-analyzing">
                <div class="edt-status-icon"><i class="fas fa-spinner fa-spin"></i></div>
                <div class="edt-status-info">
                    <div class="edt-status-text">Email received — analyzing...</div>
                    <div class="edt-status-sub">Processing your email for deliverability analysis.</div>
                </div>
            </div>`;
    } else if (isComplete) {
        statusHtml = '';
    } else if (isExpired) {
        statusHtml = `
            <div class="edt-status edt-status-expired">
                <div class="edt-status-icon"><i class="fas fa-clock"></i></div>
                <div class="edt-status-info">
                    <div class="edt-status-text">Test expired</div>
                    <div class="edt-status-sub">This test address has expired. Generate a new one.</div>
                </div>
            </div>`;
    } else if (isError) {
        statusHtml = `
            <div class="edt-status edt-status-error">
                <div class="edt-status-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="edt-status-info">
                    <div class="edt-status-text">Analysis error — retrying</div>
                    <div class="edt-status-sub">An error occurred during analysis. Retrying automatically...</div>
                </div>
            </div>`;
    }

    const showResults = isComplete && test.analysis;

    return `
        <div class="edt-test-view">
            <div class="edt-address-box">
                <div class="edt-address-label">Send your test email to:</div>
                <div class="edt-address-row">
                    <span class="edt-address font-mono" id="edtAddress">${escHtml(test.email_address)}</span>
                    <button class="btn btn-primary btn-sm" id="edtCopyBtn" title="Copy email address">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
                <div class="edt-address-meta">
                    <span><i class="fas fa-clock"></i> Created: ${new Date(test.created_at).toLocaleString()}</span>
                    <span><i class="fas fa-hourglass-end"></i> Expires: ${new Date(test.expires_at).toLocaleString()}</span>
                </div>
            </div>

            ${statusHtml}

            ${showResults ? renderAnalysisResults(test.analysis) : ''}

            <div class="edt-actions">
                ${isWaiting || isReceived || isAnalyzing || isError ? `<button class="btn btn-secondary" id="edtRefreshBtn"><i class="fas fa-sync-alt"></i> Check for Email</button>` : ''}
                <button class="btn btn-secondary" id="edtNewTestBtn"><i class="fas fa-plus"></i> New Test</button>
            </div>
        </div>
    `;
}

function renderAnalysisResults(analysis) {
    if (!analysis) return '';

    const score = analysis.score || 0;
    const grade = analysis.grade || 'Unknown';
    const passed = analysis.passed || [];
    const warnings = analysis.warnings || [];
    const errors = analysis.errors || [];
    const categories = analysis.categories || {};

    const scoreColor = score >= 90 ? 'var(--success)' : score >= 75 ? 'var(--info)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
    const circumference = 2 * Math.PI * 52;
    const dashOffset = circumference - (circumference * score / 100);

    let html = `<div class="edt-results">`;

    html += `
        <div class="edt-score-center">
            <div class="edt-score-ring">
                <svg viewBox="0 0 120 120" class="edt-ring-svg">
                    <circle cx="60" cy="60" r="52" class="edt-ring-bg"/>
                    <circle cx="60" cy="60" r="52" class="edt-ring-fill" style="stroke:${scoreColor};stroke-dasharray:${circumference};stroke-dashoffset:${dashOffset}"/>
                </svg>
                <div class="edt-ring-inner">
                    <span class="edt-ring-score" style="color:${scoreColor}">${score}</span>
                    <span class="edt-ring-label">/ 100</span>
                </div>
            </div>
            <div class="edt-score-grade" style="color:${scoreColor}">${escHtml(grade)}</div>
            <div class="edt-score-counts">
                <span class="edt-cnt edt-cnt-pass"><i class="fas fa-check-circle"></i> ${passed.length} Passed</span>
                ${warnings.length > 0 ? `<span class="edt-cnt edt-cnt-warn"><i class="fas fa-exclamation-triangle"></i> ${warnings.length}</span>` : ''}
                ${errors.length > 0 ? `<span class="edt-cnt edt-cnt-err"><i class="fas fa-times-circle"></i> ${errors.length}</span>` : ''}
            </div>
        </div>
    `;

    html += renderAuthSummary(categories);

    html += renderCompactChecks(categories);

    const recommendations = generateRecommendations(analysis);
    if (recommendations.length > 0) {
        html += `
            <div class="edt-recs">
                <div class="edt-recs-title"><i class="fas fa-lightbulb"></i> How to improve</div>
                ${recommendations.map(r => renderRecommendation(r)).join('')}
            </div>
        `;
    } else if (score >= 90) {
        html += `
            <div class="edt-recs edt-recs-perfect">
                <div class="edt-recs-title"><i class="fas fa-trophy"></i> Perfect</div>
                <div class="edt-rec-perfect-text">All checks passed. No improvements needed.</div>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function renderAuthSummary(categories) {
    const auth = categories.authentication || {};
    const network = categories.network || {};

    const spf = auth.spf || {};
    const dkim = auth.dkim || {};
    const dmarc = auth.dmarc || {};
    const alignment = auth.alignment || {};

    function statusInfo(result, fallback) {
        const map = {
            pass:  { cls: 'edt-auth-pass', icon: 'fa-check-circle', label: 'Pass' },
            fail:  { cls: 'edt-auth-fail', icon: 'fa-times-circle', label: 'Fail' },
            softfail: { cls: 'edt-auth-warn', icon: 'fa-exclamation-triangle', label: 'Softfail' },
            neutral:  { cls: 'edt-auth-warn', icon: 'fa-minus-circle', label: 'Neutral' },
            none:     { cls: 'edt-auth-warn', icon: 'fa-ban', label: 'Not configured' },
        };
        return map[result] || fallback || { cls: 'edt-auth-unknown', icon: 'fa-question-circle', label: 'Unknown' };
    }

    function authDetailRow(label, value, mono) {
        if (!value) return '';
        return `<div class="edt-auth-row"><span class="edt-auth-key">${escHtml(label)}</span><span class="edt-auth-val${mono ? ' font-mono' : ''}">${escHtml(value)}</span></div>`;
    }

    let html = '<div class="edt-auth-panels">';

    // ── SPF Panel ──
    const spfSt = statusInfo(spf.result, { cls: 'edt-auth-unknown', icon: 'fa-question-circle', label: 'Not checked' });
    let spfPolicy = '';
    if (spf.spf_record) {
        const match = spf.spf_record.match(/\s+((?:\+|-|~|\?)all)$/i);
        spfPolicy = match ? match[0].trim() : '';
    }
    const policyExplain = {
        '+all': 'All senders authorized',
        '-all': 'Unauthorized senders rejected',
        '~all': 'Unauthorized senders tolerated (softfail)',
        '?all': 'Neutral — no policy',
    };

    html += `
        <div class="edt-auth-panel ${spfSt.cls}">
            <div class="edt-auth-panel-head">
                <i class="fas fa-fingerprint edt-auth-panel-icon"></i>
                <span class="edt-auth-panel-title">SPF</span>
                <span class="edt-auth-panel-badge"><i class="fas ${spfSt.icon}"></i> ${escHtml(spfSt.label)}</span>
            </div>
            <div class="edt-auth-panel-body">
                ${authDetailRow('Domain', spf.domain)}
                ${authDetailRow('IP', spf.sender_ip)}
                ${authDetailRow('Envelope', spf.envelope_from)}
                ${spf.spf_record ? `
                    <div class="edt-auth-row edt-auth-row-wide">
                        <span class="edt-auth-key">SPF Record</span>
                        <span class="edt-auth-val font-mono edt-auth-record">${escHtml(spf.spf_record)}</span>
                    </div>
                ` : ''}
                ${spfPolicy ? authDetailRow('Policy', spfPolicy + (policyExplain[spfPolicy] ? ' — ' + policyExplain[spfPolicy] : '')) : ''}
                ${!spf.spf_record && spf.result === 'none' ? '<div class="edt-auth-hint"><i class="fas fa-lightbulb"></i> No SPF record published. Add a TXT record to authorize your sending servers.</div>' : ''}
            </div>
        </div>`;

    // ── DKIM Panel ──
    const dkimSt = dkim.has_signature
        ? (dkim.crypto_verified
            ? { cls: 'edt-auth-pass', icon: 'fa-check-double', label: 'Signed & Verified' }
            : { cls: 'edt-auth-pass', icon: 'fa-check-circle', label: 'Signed' })
        : statusInfo(dkim.result, { cls: 'edt-auth-warn', icon: 'fa-ban', label: 'No signature' });

    const algoNames = { 'rsa-sha256': 'RSA-SHA256', 'rsa-sha1': 'RSA-SHA1', 'ed25519-sha256': 'Ed25519-SHA256' };
    const canonLabels = { 'relaxed': 'Relaxed', 'simple': 'Simple', 'relaxed/relaxed': 'Relaxed / Relaxed', 'simple/simple': 'Simple / Simple', 'relaxed/simple': 'Relaxed / Simple', 'simple/relaxed': 'Simple / Relaxed' };

    html += `
        <div class="edt-auth-panel ${dkimSt.cls}">
            <div class="edt-auth-panel-head">
                <i class="fas fa-key edt-auth-panel-icon"></i>
                <span class="edt-auth-panel-title">DKIM</span>
                <span class="edt-auth-panel-badge"><i class="fas ${dkimSt.icon}"></i> ${escHtml(dkimSt.label)}</span>
            </div>
            <div class="edt-auth-panel-body">
                ${authDetailRow('Domain', dkim.domain)}
                ${authDetailRow('Selector', dkim.selector)}
                ${dkim.algorithm ? authDetailRow('Algo', dkim.algorithm) : ''}
                ${dkim.canonicalization ? authDetailRow('Canon', dkim.canonicalization) : ''}
                ${dkim.has_signature ? authDetailRow('DNS Public Key', dkim.key_found ? 'Found' : 'Missing') : ''}
                ${dkim.crypto_verified ? '<div class="edt-auth-hint edt-auth-hint-ok"><i class="fas fa-shield-halved"></i> Signature cryptographically verified — body hash and header signature match the published DNS key.</div>' : ''}
                ${!dkim.has_signature ? '<div class="edt-auth-hint"><i class="fas fa-lightbulb"></i> No DKIM-Signature header found. Enable DKIM signing in your email provider settings.</div>' : ''}
                ${dkim.has_signature && !dkim.key_found ? '<div class="edt-auth-hint"><i class="fas fa-lightbulb"></i> DKIM-Signature present but the public key was not found in DNS for <b>' + escHtml((dkim.selector || 'default') + '._domainkey.' + (dkim.domain || '')) + '</b>.</div>' : ''}
            </div>
        </div>`;

    // ── DMARC Panel ──
    const dmarcSt = statusInfo(dmarc.result, { cls: 'edt-auth-unknown', icon: 'fa-question-circle', label: 'Not checked' });
    const policyLabels = { reject: 'Reject unauthenticated mail', quarantine: 'Quarantine unauthenticated mail', none: 'Monitor only (no action)' };

    html += `
        <div class="edt-auth-panel ${dmarcSt.cls}">
            <div class="edt-auth-panel-head">
                <i class="fas fa-shield-halved edt-auth-panel-icon"></i>
                <span class="edt-auth-panel-title">DMARC</span>
                <span class="edt-auth-panel-badge"><i class="fas ${dmarcSt.icon}"></i> ${escHtml(dmarcSt.label)}</span>
            </div>
            <div class="edt-auth-panel-body">
                ${authDetailRow('Domain', dmarc.domain)}
                ${dmarc.policy ? authDetailRow('Policy', 'p=' + dmarc.policy + (policyLabels[dmarc.policy] ? ' — ' + policyLabels[dmarc.policy] : '')) : ''}
                ${dmarc.subdomain_policy ? authDetailRow('Subdomain Policy', 'sp=' + dmarc.subdomain_policy) : ''}
                ${dmarc.adkim ? authDetailRow('DKIM Alignment', dmarc.adkim === 's' ? 'Strict' : 'Relaxed') : ''}
                ${dmarc.aspf ? authDetailRow('SPF Alignment', dmarc.aspf === 's' ? 'Strict' : 'Relaxed') : ''}
                ${dmarc.rua ? authDetailRow('Aggregate Reports', dmarc.rua) : ''}
                ${dmarc.ruf ? authDetailRow('Forensic Reports', dmarc.ruf) : ''}
                ${dmarc.dmarc_record ? `
                    <div class="edt-auth-row edt-auth-row-wide">
                        <span class="edt-auth-key">DMARC Record</span>
                        <span class="edt-auth-val font-mono edt-auth-record">${escHtml(dmarc.dmarc_record)}</span>
                    </div>
                ` : ''}
                ${!dmarc.dmarc_record ? '<div class="edt-auth-hint"><i class="fas fa-lightbulb"></i> No DMARC record found at <b>_dmarc.' + escHtml(dmarc.domain || '') + '</b>. Add a TXT record to protect your domain from spoofing.</div>' : ''}
            </div>
        </div>`;

    html += '</div>';

    // ── Alignment + Network Cards in a grid ──
    const netCards = [];

    if (alignment.spf_aligned !== undefined || alignment.dkim_aligned !== undefined) {
        const aligned = alignment.spf_aligned || alignment.dkim_aligned;
        const via = alignment.spf_aligned && alignment.dkim_aligned ? 'SPF + DKIM' : (alignment.spf_aligned ? 'SPF' : 'DKIM');
        const aCls = aligned ? 'edt-auth-pass' : 'edt-auth-warn';
        const aIcon = aligned ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const aLabel = aligned ? `Aligned (${via})` : 'Not aligned';

        netCards.push(`
            <div class="edt-auth-card ${aCls}">
                <div class="edt-auth-icon"><i class="fas fa-link"></i></div>
                <div class="edt-auth-body">
                    <div class="edt-auth-label">DMARC Alignment</div>
                    <div class="edt-auth-domain">${escHtml(alignment.from_domain || 'N/A')}</div>
                    <div class="edt-auth-status"><i class="fas ${aIcon}"></i> ${aLabel}</div>
                    ${alignment.spf_domain ? '<div class="edt-auth-meta">SPF: ' + escHtml(alignment.spf_domain) + (alignment.spf_aligned ? ' ✓' : '') + '</div>' : ''}
                    ${alignment.dkim_domain ? '<div class="edt-auth-meta">DKIM: ' + escHtml(alignment.dkim_domain) + (alignment.dkim_aligned ? ' ✓' : '') + '</div>' : ''}
                </div>
            </div>
        `);
    }

    const ptr = network.ptr;
    if (ptr && ptr !== 'unknown') {
        const ptrCls = ptr === 'pass' ? 'edt-auth-pass' : 'edt-auth-warn';
        const ptrIcon = ptr === 'pass' ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const ptrLabel = ptr === 'pass' ? 'Valid' : 'No PTR';
        netCards.push(`
            <div class="edt-auth-card ${ptrCls}">
                <div class="edt-auth-icon"><i class="fas fa-arrows-left-right"></i></div>
                <div class="edt-auth-body">
                    <div class="edt-auth-label">Reverse DNS</div>
                    <div class="edt-auth-domain">${escHtml((network.sending_ips || [])[0] || 'N/A')}</div>
                    <div class="edt-auth-status"><i class="fas ${ptrIcon}"></i> ${ptrLabel}</div>
                </div>
            </div>
        `);
    }

    const tls = network.tls;
    if (tls && tls !== 'unknown') {
        const tlsCls = tls === 'pass' ? 'edt-auth-pass' : 'edt-auth-warn';
        const tlsIcon = tls === 'pass' ? 'fa-lock' : 'fa-unlock';
        const tlsLabel = tls === 'pass' ? 'Encrypted (STARTTLS)' : 'Not encrypted';
        netCards.push(`
            <div class="edt-auth-card ${tlsCls}">
                <div class="edt-auth-icon"><i class="fas ${tlsIcon}"></i></div>
                <div class="edt-auth-body">
                    <div class="edt-auth-label">TLS</div>
                    <div class="edt-auth-domain">Connection security</div>
                    <div class="edt-auth-status"><i class="fas ${tlsIcon}"></i> ${tlsLabel}</div>
                </div>
            </div>
        `);
    }

    const bl = network.blocklists;
    if (bl && bl !== 'unknown') {
        const blCls = bl === 'clean' ? 'edt-auth-pass' : 'edt-auth-fail';
        const blIcon = bl === 'clean' ? 'fa-check-circle' : 'fa-times-circle';
        const blLabel = bl === 'clean' ? 'Clean' : 'Listed!';
        const blDetail = bl !== 'clean' && network.blocklists_listed ? network.blocklists_listed.join(', ') : 'Not on any blocklists';
        netCards.push(`
            <div class="edt-auth-card ${blCls}">
                <div class="edt-auth-icon"><i class="fas fa-ban"></i></div>
                <div class="edt-auth-body">
                    <div class="edt-auth-label">Blocklists</div>
                    <div class="edt-auth-domain">${escHtml(blDetail)}</div>
                    <div class="edt-auth-status"><i class="fas ${blIcon}"></i> ${blLabel}</div>
                </div>
            </div>
        `);
    }

    const heloMatch = network.helo_ptr_match;
    if (heloMatch && heloMatch !== 'unknown') {
        const hCls = heloMatch === 'pass' ? 'edt-auth-pass' : 'edt-auth-warn';
        const hIcon = heloMatch === 'pass' ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const hLabel = heloMatch === 'pass' ? 'HELO matches rDNS' : 'HELO/rDNS mismatch';
        netCards.push(`
            <div class="edt-auth-card ${hCls}">
                <div class="edt-auth-icon"><i class="fas fa-server"></i></div>
                <div class="edt-auth-body">
                    <div class="edt-auth-label">HELO / rDNS</div>
                    <div class="edt-auth-domain">${escHtml(network.helo || 'N/A')}</div>
                    <div class="edt-auth-status"><i class="fas ${hIcon}"></i> ${hLabel}</div>
                </div>
            </div>
        `);
    }

    if (netCards.length > 0) {
        html += '<div class="edt-auth-grid">' + netCards.join('') + '</div>';
    }

    return html;
}

function generateRecommendations(analysis) {
    const recs = [];
    const cats = analysis.categories || {};
    const auth = cats.authentication || {};
    const spf = auth.spf || {};
    const dkim = auth.dkim || {};
    const dmarc = auth.dmarc || {};
    const alignment = auth.alignment || {};
    const network = cats.network || {};
    const mime = (cats.message || {}).mime || {};

    if (spf.result === 'fail' || spf.result === 'softfail') {
        recs.push({
            priority: 'high', icon: 'fa-fingerprint', title: 'Fix SPF record',
            text: 'Your SPF record is returning ' + spf.result + '.',
            steps: [
                'Log in to your DNS provider and find the TXT record for ' + (spf.domain || 'your domain') + '.',
                'Add the sending server IP or include the correct mail provider.',
                'Use mxtoolbox.com/spf to validate your record after saving.',
            ]
        });
    } else if (spf.result === null && spf.raw === undefined) {
        recs.push({
            priority: 'high', icon: 'fa-fingerprint', title: 'Add SPF record',
            text: 'No SPF record found for ' + (spf.domain || 'your domain') + '.',
            steps: [
                'Create a TXT record at ' + (spf.domain || 'your domain') + ' with value: v=spf1 include:_spf.yourprovider.com ~all',
                'Replace yourprovider.com with your actual email provider.',
                'Verify at mxtoolbox.com/spf after DNS propagation.',
            ]
        });
    }

    if (dkim.result === 'fail') {
        recs.push({
            priority: 'high', icon: 'fa-key', title: 'Fix DKIM signing',
            text: 'DKIM signature from ' + (dkim.domain || 'unknown') + ' failed verification.',
            steps: [
                'Re-publish the DKIM public key for selector ' + (dkim.selector || 'default') + ' in your DNS.',
                'Regenerate the DKIM key pair in your email provider settings if needed.',
                'Verify DNS propagation: dig TXT ' + (dkim.selector || 'default') + '._domainkey.' + (dkim.domain || 'yourdomain.com'),
            ]
        });
    } else if (!dkim.has_signature) {
        recs.push({
            priority: 'high', icon: 'fa-key', title: 'Enable DKIM signing',
            text: 'No DKIM signature found.',
            steps: [
                'Go to your email provider admin console.',
                'Enable DKIM signing for your domain.',
                'Add the CNAME or TXT records they provide to your DNS.',
            ]
        });
    }

    if (dmarc.result === 'fail') {
        recs.push({
            priority: 'high', icon: 'fa-shield-halved', title: 'Fix DMARC policy',
            text: 'DMARC check failed.',
            steps: [
                'Check your _dmarc.' + (dmarc.domain || 'yourdomain.com') + ' TXT record.',
                'Ensure the From: domain aligns with SPF or DKIM.',
                'Start with p=none to monitor, then upgrade to p=quarantine or p=reject.',
            ]
        });
    } else if (dmarc.result === null) {
        recs.push({
            priority: 'medium', icon: 'fa-shield-halved', title: 'Add DMARC record',
            text: 'No DMARC policy found.',
            steps: [
                'Add a TXT record at _dmarc.' + (dmarc.domain || 'yourdomain.com'),
                'Start with: v=DMARC1; p=none; rua=mailto:dmarc@' + (dmarc.domain || 'yourdomain.com'),
                'Monitor reports for 2-4 weeks, then upgrade to p=quarantine or p=reject.',
            ]
        });
    }

    if (alignment.spf_aligned === false && alignment.dkim_aligned === false && dmarc.result !== 'pass') {
        recs.push({
            priority: 'medium', icon: 'fa-link', title: 'Fix DMARC alignment',
            text: 'Neither SPF nor DKIM aligns with the From domain. DMARC requires at least one to pass alignment.',
            steps: [
                'Ensure the From: domain matches the envelope sender (for SPF alignment).',
                'Ensure the DKIM d= domain is the same organizational domain as From.',
            ]
        });
    }

    if (network.ptr === 'fail') {
        recs.push({
            priority: 'medium', icon: 'fa-arrows-left-right', title: 'Add reverse DNS (PTR)',
            text: 'The sending IP does not have a valid reverse DNS record.',
            steps: [
                'Contact your hosting/email provider to set a PTR record for your sending IP.',
                'The PTR record should resolve to a hostname that points back to the same IP.',
            ]
        });
    }

    if (network.tls === 'fail') {
        recs.push({
            priority: 'high', icon: 'fa-lock', title: 'Enable TLS encryption',
            text: 'The email connection was not encrypted with TLS.',
            steps: [
                'Configure your mail server to support and prefer STARTTLS.',
                'Ensure a valid TLS certificate is installed.',
            ]
        });
    }

    if (mime.has_plain_text === false && mime.has_html === true) {
        recs.push({
            priority: 'medium', icon: 'fa-envelope', title: 'Add plain text version',
            text: 'Your email is HTML-only.',
            steps: [
                'Enable multipart/alternative MIME format in your email composition settings.',
                'Most email clients do this automatically. Check your templates.',
            ]
        });
    } else if (mime.has_plain_text === false && mime.has_html === false) {
        recs.push({
            priority: 'high', icon: 'fa-envelope', title: 'Add message content',
            text: 'No text content detected in the email body.',
            steps: [
                'Ensure your email includes at least a text/plain body part.',
            ]
        });
    }

    recs.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] || 2) - (order[b.priority] || 2);
    });

    return recs;
}

function renderRecommendation(rec) {
    const priorityCls = rec.priority === 'high' ? 'edt-rec-high' : rec.priority === 'medium' ? 'edt-rec-medium' : 'edt-rec-low';
    const priorityLabel = rec.priority === 'high' ? 'High' : rec.priority === 'medium' ? 'Medium' : 'Low';

    return `
        <div class="edt-rec ${priorityCls}">
            <div class="edt-rec-header">
                <div class="edt-rec-title"><i class="fas ${rec.icon}"></i> ${escHtml(rec.title)}</div>
                <span class="edt-rec-priority ${priorityCls}">${priorityLabel}</span>
            </div>
            <div class="edt-rec-text">${escHtml(rec.text)}</div>
            ${rec.steps ? `
                <div class="edt-rec-steps">
                    ${rec.steps.map((s, i) => `<div class="edt-rec-step"><span class="edt-rec-step-num">${i + 1}</span><span>${escHtml(s)}</span></div>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function renderCompactChecks(categories) {
    const catDefs = [
        { key: 'message', icon: 'fa-envelope', label: 'Message Structure' },
        { key: 'content', icon: 'fa-file-lines', label: 'Content Quality' },
        { key: 'links', icon: 'fa-link', label: 'Links & URLs' },
    ];

    let groupsHtml = '';

    for (const cat of catDefs) {
        const data = categories[cat.key];
        if (!data || !data.checks || data.checks.length === 0) continue;

        const issues = data.checks.filter(c => c.status !== 'pass');
        if (issues.length === 0) continue;

        groupsHtml += `
            <div class="edt-checks-group">
                <div class="edt-checks-hdr"><i class="fas ${cat.icon}"></i> ${escHtml(data.label)}</div>
                ${issues.map(c => {
                    const icon = c.status === 'warning' ? 'fa-exclamation-triangle' : c.status === 'fail' ? 'fa-times-circle' : 'fa-info-circle';
                    return `<div class="edt-check edt-finding-${c.status}"><i class="fas ${icon}"></i><span>${escHtml(c.title)}</span>${c.message ? `<span class="edt-check-msg">${escHtml(c.message)}</span>` : ''}</div>`;
                }).join('')}
            </div>`;
    }

    if (!groupsHtml) return '';

    return `
        <div class="edt-checks-wrap">
            <div class="edt-checks-title"><i class="fas fa-clipboard-check"></i> Checks needing attention</div>
            ${groupsHtml}
        </div>`;
}

function attachEdtEvents() {
    const createBtn = document.getElementById('edtCreateBtn');
    if (createBtn) {
        createBtn.addEventListener('click', edtCreateTest);
    }

    const copyBtn = document.getElementById('edtCopyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const addr = document.getElementById('edtAddress');
            if (addr) {
                navigator.clipboard.writeText(addr.textContent).then(() => {
                    toast('Email address copied!', 'success');
                    const orig = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => { copyBtn.innerHTML = orig; }, 1800);
                }).catch(() => toast('Failed to copy', 'error'));
            }
        });
    }

    const refreshBtn = document.getElementById('edtRefreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', edtCheckForEmail);
    }

    const newTestBtn = document.getElementById('edtNewTestBtn');
    if (newTestBtn) {
        newTestBtn.addEventListener('click', () => {
            edtState.currentTest = null;
            if (edtState.pollingTimer) {
                clearInterval(edtState.pollingTimer);
                edtState.pollingTimer = null;
            }
            edtState.pollCount = 0;
            renderEmailDeliverabilityTester();
        });
    }

    document.querySelectorAll('.edt-toggle-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const detailEl = btn.closest('.edt-finding-expandable');
            const textEl = detailEl.querySelector('.edt-finding-detail-text');
            const isHidden = textEl.style.display === 'none';
            textEl.style.display = isHidden ? 'block' : 'none';
            btn.innerHTML = isHidden
                ? '<i class="fas fa-chevron-up"></i> Hide details'
                : '<i class="fas fa-chevron-down"></i> Show details';
        });
    });

    if (edtState.currentTest && (edtState.currentTest.status === 'waiting' || edtState.currentTest.status === 'received' || edtState.currentTest.status === 'analyzing' || edtState.currentTest.status === 'error')) {
        edtStartPolling();
    }
}

async function edtCreateTest() {
    const btn = document.getElementById('edtCreateBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const data = await api('POST', 'email-test/create');
        edtState.currentTest = data;
        edtState.pollCount = 0;
        renderEmailDeliverabilityTester();
        toast('Test email address generated!', 'success');
    } catch (err) {
        toast(err.message || 'Failed to create test', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Generate Test Email Address';
        }
    }
}

async function edtCheckForEmail() {
    if (!edtState.currentTest) return;

    const btn = document.getElementById('edtRefreshBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    }

    try {
        const result = await api('POST', 'email-test/check', { test_token: edtState.currentTest.test_token });

        if (result.status === 'complete') {
            const analysis = await api('GET', 'email-test/analysis/' + edtState.currentTest.test_token);
            edtState.currentTest = { ...edtState.currentTest, ...analysis };
            if (edtState.pollingTimer) {
                clearInterval(edtState.pollingTimer);
                edtState.pollingTimer = null;
            }
            renderEmailDeliverabilityTester();
            toast('Email analyzed successfully!', 'success');
        } else if (result.status === 'expired') {
            edtState.currentTest.status = 'expired';
            if (edtState.pollingTimer) {
                clearInterval(edtState.pollingTimer);
                edtState.pollingTimer = null;
            }
            renderEmailDeliverabilityTester();
        } else if (result.status === 'error') {
            edtState.currentTest.status = 'error';
            renderEmailDeliverabilityTester();
            toast('Analysis failed — retrying...', 'warning');
        } else {
            edtState.currentTest.status = result.status;
            toast('Still waiting for email...', 'info');
        }
    } catch (err) {
        toast(err.message || 'Check failed', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Check for Email';
        }
    }
}

function edtStartPolling() {
    if (edtState.pollingTimer) clearInterval(edtState.pollingTimer);
    edtState.pollCount = 0;

    edtState.pollingTimer = setInterval(async () => {
        edtState.pollCount++;
        if (edtState.pollCount > edtState.maxPolls) {
            clearInterval(edtState.pollingTimer);
            edtState.pollingTimer = null;
            toast('Timed out waiting for email.', 'warning');
            return;
        }
        await edtCheckForEmail();
    }, edtState.pollInterval);
}
