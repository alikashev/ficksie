/**
 * ficksie - SPA Frontend
 */

const API_BASE = 'api';

// ============================================
// Auth State
// ============================================
let user = null;
let appInited = false;

// ============================================
// State
// ============================================
const state = {
    modules: [],
    commands: [],
    categories: [],
    currentModule: null,
    currentView: 'dashboard',
    currentSubview: null,
    filterCategory: '',
    searchQuery: '',
};

// ============================================
// API Helper
// ============================================
async function api(method, path, body = null) {
    const opts = {
        method,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
    };

    if (body && method !== 'GET') {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const url = `${API_BASE}/${path}`;

    const res = await fetch(url, opts);
    const data = await res.json();

    if (!data.success) {
        throw new Error(data.message || 'API Error');
    }

    return data.data;
}

// ============================================
// Auth API helper (no auth required)
// ============================================
async function authApi(method, path, body = null) {
    const opts = {
        method,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
    };

    if (body && method !== 'GET') {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const url = `${API_BASE}/auth/${path}`;

    const res = await fetch(url, opts);
    const data = await res.json();

    if (!data.success) {
        throw new Error(data.message || 'API Error');
    }

    return data.data;
}

// ============================================
// Auth Functions
// ============================================
async function checkAuth() {
    try {
        user = await authApi('GET', 'me');
        return true;
    } catch {
        return false;
    }
}

async function handleLogin(username, password) {
    user = await authApi('POST', 'login', { username, password });
    return user;
}

async function handleLogout() {
    await authApi('POST', 'logout');
    user = null;
}

async function handleRegister(username, email, password) {
    user = await authApi('POST', 'register', { username, email, password });
    return user;
}

function isAdmin() {
    return user && user.is_admin === true;
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('loginUsername').focus();
}

function hideLoginScreen() {
    document.getElementById('loginScreen').classList.remove('active');
}

// ============================================
// Toast Notifications
// ============================================
function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
    };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span class="toast-text">${message}</span>
    `;

    container.appendChild(el);

    setTimeout(() => {
        el.classList.add('removing');
        setTimeout(() => el.remove(), 250);
    }, duration);
}

// ============================================
// Modal Helpers
// ============================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// Confirm Modal
// ============================================
function showConfirmModal(message, title = 'Confirm') {
    return new Promise(resolve => {
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalMessage').textContent = message;
        const confirmBtn = document.getElementById('confirmDeleteBtn');

        function cleanup() {
            closeModal('confirmModal');
            confirmBtn.removeEventListener('click', onConfirm);
            document.querySelectorAll('[data-modal="confirmModal"]').forEach(el => {
                el.removeEventListener('click', onCancel);
            });
            // Remove backdrop click handler
            const overlay = document.getElementById('confirmModal');
            overlay.removeEventListener('click', onBackdrop);
        }

        function onConfirm() {
            cleanup();
            resolve(true);
        }

        function onCancel() {
            cleanup();
            resolve(false);
        }

        function onBackdrop(e) {
            if (e.target === this) {
                onCancel();
            }
        }

        confirmBtn.addEventListener('click', onConfirm);
        document.querySelectorAll('[data-modal="confirmModal"]').forEach(el => {
            el.addEventListener('click', onCancel);
        });

        const overlay = document.getElementById('confirmModal');
        overlay.addEventListener('click', onBackdrop);

        openModal('confirmModal');
    });
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.remove('active');
    });
    document.body.style.overflow = '';
}

// ============================================
// Tab System
// ============================================
const TAB_MAX = 10;
let tabState = { tabs: [], activeTab: null };

const viewMeta = {
    'dashboard':          { title: 'CMD CTRL',              tabLabel: 'Dashboard',        subtitle: 'Sanctum sanctorum of your digital hegemony',        icon: 'fa-th-large' },
    'commands':           { title: 'Incantation Ledger',     tabLabel: 'Commands',         subtitle: 'Where arcane shell sorcery lives on',     icon: 'fa-terminal' },
    'email-anonymizer':   { title: 'Cryptographic Shroud',   tabLabel: 'Email Anonymizer', subtitle: 'Obscuring digital identities since the invention of shame', icon: 'fa-mask' },
    'email-header-viz':   { title: 'SMTP Archaeology',      tabLabel: 'Header Visualizer',subtitle: 'Exhuming forensic traces from your inbound missives', icon: 'fa-code-branch' },
    'snippets':           { title: 'Copypasta Armory',       tabLabel: 'Snippets',         subtitle: 'Weaponized prose for the diplomatically bankrupt', icon: 'fa-reply' },
    'rte-editor':         { title: 'Semantic Forge',         tabLabel: 'Text Editor',      subtitle: 'Artisanal typesetting for the aesthetically unhinged', icon: 'fa-file-lines' },
    'ip-reputation':      { title: 'Geopolitical Sentinel',  tabLabel: 'IP Reputation',    subtitle: 'Profiling interlocutors by their network pedigree', icon: 'fa-shield-halved' },
    'dns-lookup':         { title: 'Nomenclature Oracle',    tabLabel: 'DNS Lookup',       subtitle: 'Interrogating the hierarchical phonebook of the internet', icon: 'fa-globe' },
    'password-generator': { title: 'Entropy Fabricator',     tabLabel: 'Password Generator',subtitle: 'Concocting unhackable gibberish so you don\'t have to', icon: 'fa-key' },
    'ssl-toolkit':        { title: 'Certificate Autopsy',    tabLabel: 'SSL/TLS',  subtitle: 'Dissecting trust chains and their existential crises', icon: 'fa-shield-halved' },
    'email-deliverability': { title: 'Deliverability Lab',   tabLabel: 'Email Tester',  subtitle: 'Email authentication, content, and deliverability analysis', icon: 'fa-paper-plane' },
    'review-tracker':       { title: 'Review Tracker',       tabLabel: 'Reviews',       subtitle: 'Track and manage customer reviews',                         icon: 'fa-star' },
    'text-toolkit':         { title: 'String Theory',        tabLabel: 'Text Toolkit',  subtitle: 'Thirty-four ways to mangle, massage and mine raw text',      icon: 'fa-font' },
    'users':              { title: 'Fiefdom Registry',       tabLabel: 'Manage Users',     subtitle: 'Administering the plebeian access roster', icon: 'fa-users' },
};

function getActiveBody() {
    return document.querySelector('.tab-panel.active');
}

function saveTabs() {
    localStorage.setItem('toolhub-tabs', JSON.stringify(tabState.tabs));
    localStorage.setItem('toolhub-active-tab', tabState.activeTab || '');
}

function renderTabBar() {
    const bar = document.getElementById('tabBar');
    if (!bar) return;
    bar.style.display = tabState.tabs.length > 0 ? '' : 'none';
    bar.innerHTML = tabState.tabs.map(tab => {
        const meta = viewMeta[tab.view] || { title: tab.view, tabLabel: tab.view, icon: 'fa-cube' };
        const isActive = tab.id === tabState.activeTab;
        const closeBtn = tab.view !== 'dashboard' ? `<span class="tab-close" data-tab-close="${tab.id}" title="Close tab">&times;</span>` : '';
        return `<button class="tab-item ${isActive ? 'active' : ''}" data-tab-id="${tab.id}">
            <i class="fas ${meta.icon}"></i>
            <span>${meta.tabLabel}</span>
            ${closeBtn}
        </button>`;
    }).join('');

    bar.querySelectorAll('.tab-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) return;
            switchTab(el.dataset.tabId);
        });
    });
    bar.querySelectorAll('.tab-close').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(el.dataset.tabClose);
        });
    });
}

function dispatchRender(view) {
    if (view === 'dashboard')          renderDashboard();
    else if (view === 'commands')           renderCommands();
    else if (view === 'email-anonymizer')   renderEmailAnonymizer();
    else if (view === 'email-header-viz')   renderEmailHeaderViz();
    else if (view === 'snippets')           renderSnippets();
    else if (view === 'rte-editor')         renderRichTextEditor();
    else if (view === 'ip-reputation')      renderIpReputation();
    else if (view === 'dns-lookup')         renderDnsLookup();
    else if (view === 'password-generator') renderPasswordGenerator();
    else if (view === 'ssl-toolkit')        renderSslToolkit();
    else if (view === 'email-deliverability') renderEmailDeliverabilityTester();
    else if (view === 'review-tracker')      renderReviewTracker();
    else if (view === 'text-toolkit')       renderTextToolkit();
    else if (view === 'users')              renderUserManagement();
}

function openTab(view) {
    const existingTab = tabState.tabs.find(t => t.view === view);
    if (existingTab) {
        switchTab(existingTab.id);
        return;
    }
    if (tabState.tabs.length >= TAB_MAX) {
        toast('Max 10 tabs. Close one first.', 'error');
        return;
    }
    const id = 'tab_' + Date.now();
    tabState.tabs.push({ id, view });
    tabState.activeTab = id;

    const contentBody = document.getElementById('contentBody');
    const panel = document.createElement('div');
    panel.className = 'tab-panel active';
    panel.dataset.tabId = id;
    contentBody.appendChild(panel);

    document.querySelectorAll('.tab-panel').forEach(p => {
        if (p.dataset.tabId !== id) p.classList.remove('active');
    });

    state.currentView = view;
    renderTabBar();
    saveTabs();
    updateNavActive(view);
    dispatchRender(view);
}

function switchTab(tabId) {
    const tab = tabState.tabs.find(t => t.id === tabId);
    if (!tab) return;
    tabState.activeTab = tabId;
    state.currentView = tab.view;

    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.tabId === tabId);
    });

    const meta = viewMeta[tab.view] || { title: tab.view, subtitle: '' };
    setPageTitle(meta.title, meta.subtitle);
    renderTabBar();
    saveTabs();
    updateNavActive(tab.view);
    closeSidebar();
}

function closeTab(tabId) {
    const tab = tabState.tabs.find(t => t.id === tabId);
    if (!tab || tab.view === 'dashboard') return;
    const idx = tabState.tabs.findIndex(t => t.id === tabId);

    tabState.tabs.splice(idx, 1);
    const panel = document.querySelector(`.tab-panel[data-tab-id="${tabId}"]`);
    if (panel) panel.remove();

    if (tabState.tabs.length === 0) {
        tabState.activeTab = null;
        renderTabBar();
        saveTabs();
        navigate('dashboard');
        return;
    }
    if (tabState.activeTab === tabId) {
        const newIdx = Math.min(idx, tabState.tabs.length - 1);
        switchTab(tabState.tabs[newIdx].id);
    } else {
        renderTabBar();
        saveTabs();
    }
}

function updateNavActive(view) {
    document.querySelectorAll('.nav-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.view === view);
    });
}

function initSidebarNav() {
    document.querySelectorAll('.nav-pill').forEach(pill => {
        if (pill.dataset.view === 'users' && !isAdmin()) {
            pill.style.display = 'none';
            return;
        }
        pill.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(pill.dataset.view);
        });
    });

    // Collapsible sidebar groups
    document.querySelectorAll('.nav-section[data-group]').forEach(btn => {
        const groupKey = btn.dataset.group;
        const isOpen = localStorage.getItem('nav-group-' + groupKey) === '1';

        const group = btn.closest('.nav-group');
        if (isOpen) group.classList.add('open');

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isCollapsed = !group.classList.contains('open');
            group.classList.toggle('open', isCollapsed);
            localStorage.setItem('nav-group-' + groupKey, isCollapsed ? '1' : '0');
        });
    });
}

function loadTabs() {
    try {
        const saved = JSON.parse(localStorage.getItem('toolhub-tabs') || '[]');
        const savedActive = localStorage.getItem('toolhub-active-tab') || '';
        if (saved.length > 0) {
            const contentBody = document.getElementById('contentBody');
            const activeId = saved.find(t => t.id === savedActive) ? savedActive : saved[0].id;

            saved.forEach(tab => {
                const panel = document.createElement('div');
                panel.className = 'tab-panel';
                panel.dataset.tabId = tab.id;
                contentBody.appendChild(panel);
                tabState.tabs.push(tab);
            });

            tabState.activeTab = activeId;
            const activeTab = tabState.tabs.find(t => t.id === activeId);
            if (activeTab) state.currentView = activeTab.view;

            renderTabBar();
            updateNavActive(state.currentView);

            saved.forEach(tab => {
                const panel = document.querySelector(`.tab-panel[data-tab-id="${tab.id}"]`);
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                panel.classList.add('active');
                state.currentView = tab.view;
                dispatchRender(tab.view);
            });

            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const finalPanel = document.querySelector(`.tab-panel[data-tab-id="${activeId}"]`);
            if (finalPanel) finalPanel.classList.add('active');
            if (activeTab) {
                state.currentView = activeTab.view;
                const meta = viewMeta[activeTab.view] || { title: activeTab.view, subtitle: '' };
                setPageTitle(meta.title, meta.subtitle);
            }
            return;
        }
    } catch (e) {}
    navigate('dashboard');
}

// ============================================
// Module / Navigation
// ============================================
async function loadModules() {
    state.modules = await api('GET', 'modules');
}

// ============================================
// Navigation
// ============================================
function navigate(view) {
    closeSidebar();
    openTab(view);
}

// ============================================
// Dashboard
// ============================================
async function renderDashboard() {
    setPageTitle('CMD CTRL', 'Sanctum sanctorum of your digital hegemony');

    const body = getActiveBody();

    try {
        const commands = await api('GET', 'commands');
        const snippets = await api('GET', 'snippets');

        const activeTools = [
            {
                key: 'commands',
                icon: 'fa-terminal',
                name: 'Command Hub',
                desc: 'Store, organize and copy Linux commands',
                color: '#6c63ff',
            },
            {
                key: 'email-anonymizer',
                icon: 'fa-mask',
                name: 'Email Anonymizer',
                desc: 'Anonymize email addresses instantly for privacy',
                color: '#22c55e',
            },
            {
                key: 'email-header-viz',
                icon: 'fa-code-branch',
                name: 'Header Visualizer',
                desc: 'Parse and analyze email headers with color-coded insights',
                color: '#3b82f6',
            },
            {
                key: 'snippets',
                icon: 'fa-reply',
                name: 'Snippets',
                desc: 'Save and copy standard email responses',
                color: '#14b8a6',
            },
            {
                key: 'ip-reputation',
                icon: 'fa-shield-halved',
                name: 'IP Reputation',
                desc: 'Analyze IP addresses for security and abuse history',
                color: '#f59e0b',
            },
            {
                key: 'dns-lookup',
                icon: 'fa-globe',
                name: 'DNS Lookup Suite',
                desc: 'Comprehensive DNS health analysis for any domain',
                color: '#06b6d4',
            },
            {
                key: 'rte-editor',
                icon: 'fa-file-lines',
                name: 'Text Editor',
                desc: 'Create and format rich text documents with templates and variables',
                color: '#ec4899',
            },
            {
                key: 'password-generator',
                icon: 'fa-key',
                name: 'Password Generator',
                desc: 'Create secure, custom passwords with advanced options',
                color: '#8b5cf6',
            },
            {
                key: 'ssl-toolkit',
                icon: 'fa-shield-halved',
                name: 'SSL/TLS',
                desc: 'Check certificates, chains, TLS versions & HSTS',
                color: '#34d399',
            },
            {
                key: 'email-deliverability',
                icon: 'fa-paper-plane',
                name: 'Email Tester',
                desc: 'Test email authentication, headers, content, and deliverability signals',
                color: '#f97316',
            },
            {
                key: 'text-toolkit',
                icon: 'fa-font',
                name: 'Text Toolkit',
                desc: 'Transform, clean, extract, format, encode, and analyze text.',
                color: '#eab308',
            },
            {
                key: 'review-tracker',
                icon: 'fa-star',
                name: 'Review Tracker',
                desc: 'Track and manage customer reviews across platforms',
                color: '#f59e0b',
            },
        ];

        const crmLinks = [
            { name: 'Argeweb', url: 'https://adminarge.argewebhosting.nl/index.php?pag=zoek_klant', color: '#e53935', initials: 'AW' },
            { name: 'De Heeg', url: 'https://admin.deheeg.nl/', color: '#1565c0', initials: 'DH' },
            {
                name: 'Flexwebhosting', url: 'https://core2.fxwregistratie.nl/', color: '#f7931e', initials: 'FX',
                children: [
                    { name: 'FXW Panel', url: 'https://www.fxwpanel.nl/index.php?function=login', icon: 'fa-gauge' },
                    { name: 'FXW DNS Panel', url: 'https://fxw.dnspaneel.nl/', icon: 'fa-globe' },
                    { name: 'Excasso', url: 'https://yourholding.sharepoint.com/:x:/r/sites/KS/_layouts/15/doc2.aspx?sourcedoc=%7B9683EFF7-337D-4AB0-8DA6-6DC9DC742A96%7D&file=Flex%20Excasso%202023.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&ct=1723111290515&wdOrigin=OFFICECOM-WEB.MAIN.REC&cid=513c6af7-aa2c-4065-9d4f-f8067122d432&wdPreviousSessionSrc=HarmonyWeb&wdPreviousSession=2d02fdf5-486d-4c56-93fb-ac0169795fe1', icon: 'fa-file-excel' },
                    { name: 'Rundeck', url: 'https://rundeck.fxw.nl/user/login', icon: 'fa-cogs' },
                ],
            },
            {
                name: 'Neostrada', url: 'https://am.qwh.nl/admin/manage-hosting', color: '#e8530e', initials: 'NE',
                children: [
                    { name: 'Klantenpaneel', url: 'https://www.neostrada.nl/mijn-account/overzicht.html', icon: 'fa-user' },
                    { name: 'Domeinsysteem', url: 'https://www.domeinsysteem.nl/overzicht.html', icon: 'fa-globe' },
                    { name: 'Neostrada old', url: 'https://am.neostrada.nl/', icon: 'fa-clock-rotate-left' },
                ],
            },
            {
                name: 'Pcextreme', url: 'https://cp.pcextreme.nl/', color: '#d32f2f', initials: 'PC',
                children: [
                    { name: 'Payments', url: 'https://payments.dev.pcextreme.nl/invoices', icon: 'fa-credit-card' },
                    { name: 'Admin', url: 'https://admin.pcextreme.nl/?page=search&mode=advanced', icon: 'fa-search' },
                    { name: 'Admin Dev', url: 'https://admin.dev.pcextreme.nl/', icon: 'fa-code' },
                ],
            },
            { name: 'Real Hosting', url: 'https://admin.realcloud.nl/', color: '#0097a7', initials: 'RH' },
            { name: 'SoHosted', url: 'https://beheer.hq.sohosted.org/beheer?ho5rj3q2qt4nkr4zwnvafl5i6m=jle1obau8muopflyxfTvt0fSCk7SxD2xzpRM0rvuRPLJKusYd67bsZl3okrhAoMeQ15GlHM9', color: '#1a73e8', initials: 'SH' },
            { name: 'Vevida', url: 'https://our.vevida.net/account.xhtml', color: '#4caf50', initials: 'VE' },
            { name: 'Versio 1.0', url: 'https://www.versio.nl/employee_povavi/', color: '#00a19a', initials: 'V1' },
            { name: 'Versio 2.0', url: 'https://admin.mijn.versio.nl/nova/dashboards/main', color: '#00a19a', initials: 'V2' },
            { name: 'VIP', url: 'https://hostfact.provider.nl/Pro/index.php', color: '#2e7d9c', icon: 'fa-crown' },
            { name: 'Yourhosting 1.0', url: 'https://crm.yhkantoor.nl/', color: '#ff6b35', initials: 'Y1' },
            { name: 'Yourhosting 2.0', url: 'https://admin.account.yourhosting.nl/nova/dashboards/main', color: '#ff6b35', initials: 'Y2' },
        ];

        const externalTools = [
            { name: 'BaseKit CP', url: 'http://control.bk-partners1.co.uk/login', initials: 'BK', color: '#2d9cdb' },
            { name: 'Blacklist', url: 'https://blacklist.bulkje.nl/', icon: 'fa-ban', color: '#e74c3c' },
            { name: 'CNR', url: 'https://account.centralnicreseller.com/domain/configure/params/domain/', initials: 'CN', color: '#2c3e50' },
            { name: 'Daywize', url: 'https://daywize.mendixcloud.com/index.html', initials: 'DW', color: '#0595db' },
            { name: 'Email', url: 'https://outlook.office.com/mail/?login_hint=ali.kashev%40yourhosting.nl', icon: 'fa-envelope', color: '#0078d4' },
            { name: 'GoSkills', url: 'https://yourhosting.goskills.com/login', initials: 'GS', color: '#9b59b6' },
            { name: 'Intranet', url: 'https://yourholding.sharepoint.com/sites/Intranet', icon: 'fa-building', color: '#0078d4' },
            { name: 'MS Partner', url: 'https://partner.microsoft.com/dashboard/v2/customers/list', icon: 'fa-microsoft', color: '#00a4ef' },
            { name: 'Openprovider', url: 'https://cp.openprovider.eu/account/twofactor.php', initials: 'OP', color: '#6c63ff' },
            { name: 'Payt', url: 'https://app.paytsoftware.com/', initials: 'PA', color: '#3498db' },
            { name: 'Puzzel', url: 'https://app.puzzel.com/agent/', icon: 'fa-phone', color: '#1abc9c' },
            { name: 'Realtime Register', url: 'https://dm.realtimeregister.com/app/login', initials: 'RR', color: '#00b4d8' },
            { name: 'SIDN', url: 'https://authentication.sidn.nl/idp/SSO.saml2', icon: 'fa-id-badge', color: '#003580' },
            { name: 'ScoreBuddy', url: 'https://yourhosting.scorebuddylms.com/dashboard', initials: 'SB', color: '#4a90d9' },
            { name: 'Systeembeheer', url: 'https://yh-jira.atlassian.net/servicedesk/customer/portal/2', icon: 'fa-headset', color: '#0052cc' },
            { name: 'WFM Agent', url: 'https://wfmagent.puzzel.com/loggedin', initials: 'WF', color: '#27ae60' },
            { name: 'Wiki 2.0', url: 'https://wiki.bulkje.nl/', icon: 'fa-book', color: '#8e44ad' },
            { name: 'YourAdvice', url: 'https://yoursitehulp.nl/youradvice/#', initials: 'YA', color: '#f39c12' },
            { name: 'YourCredify', url: 'https://yourcredify.nl/', initials: 'YC', color: '#2ecc71' },
        ];

        function renderCrmLink(c) {
            const iconHtml = c.icon
                ? `<i class="fas ${c.icon}"></i>`
                : `<span style="font-size:1.3rem;font-weight:800;letter-spacing:-0.5px">${escHtml(c.initials)}</span>`;
            if (c.children && c.children.length) {
                return `
                    <div class="dash-crm-group" style="border-left:3px solid ${c.color}">
                        <a class="dash-crm-link" href="${c.url}" target="_blank" rel="noopener noreferrer">
                            <div class="dash-crm-icon" style="background:${c.color};color:#fff">
                                ${iconHtml}
                            </div>
                            <span class="dash-crm-name">${c.name}</span>
                            <i class="fas fa-external-link-alt dash-crm-arrow"></i>
                        </a>
                        <div class="dash-crm-sub">
                            ${c.children.map(ch => `
                                <a class="dash-crm-sublink" href="${ch.url}" target="_blank" rel="noopener noreferrer">
                                    <i class="fas ${ch.icon}"></i>
                                    <span>${ch.name}</span>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            return `
                <a class="dash-crm-link" href="${c.url}" target="_blank" rel="noopener noreferrer">
                    <div class="dash-crm-icon" style="background:${c.color};color:#fff">
                        ${iconHtml}
                    </div>
                    <span class="dash-crm-name">${c.name}</span>
                    <i class="fas fa-external-link-alt dash-crm-arrow"></i>
                </a>
            `;
        }

        body.innerHTML = `
            <div class="dashboard">
                <div class="dash-section-label">CRM & Provider Links</div>
                <div class="dash-crm-grid">
                    ${crmLinks.map(c => renderCrmLink(c)).join('')}
                </div>

                <div class="dash-section-label" style="margin-top:32px;">External Tools</div>
                <div class="dash-crm-grid">
                    ${externalTools.map(c => `
                        <a class="dash-crm-link" href="${c.url}" target="_blank" rel="noopener noreferrer">
                            <div class="dash-crm-icon" style="background:${c.color};color:#fff">
                                ${c.icon ? `<i class="fas ${c.icon}"></i>` : `<span style="font-size:1.3rem;font-weight:800;letter-spacing:-0.5px">${escHtml(c.initials)}</span>`}
                            </div>
                            <span class="dash-crm-name">${c.name}</span>
                            <i class="fas fa-external-link-alt dash-crm-arrow"></i>
                        </a>
                    `).join('')}
                </div>

                <div class="dash-stats">
                    <div class="dash-stat">
                        <div class="dash-stat-icon blue"><i class="fas fa-terminal"></i></div>
                        <div class="dash-stat-info">
                            <span class="dash-stat-value">${commands.length}</span>
                            <span class="dash-stat-label">Saved Commands</span>
                        </div>
                    </div>
                    <div class="dash-stat-divider"></div>
                    <div class="dash-stat">
                        <div class="dash-stat-icon purple"><i class="fas fa-reply"></i></div>
                        <div class="dash-stat-info">
                            <span class="dash-stat-value">${snippets.length}</span>
                            <span class="dash-stat-label">Saved Snippets</span>
                        </div>
                    </div>
                    <div class="dash-stat-divider"></div>
                    <div class="dash-stat">
                        <div class="dash-stat-icon green"><i class="fas fa-tools"></i></div>
                        <div class="dash-stat-info">
                            <span class="dash-stat-value">${activeTools.length}</span>
                            <span class="dash-stat-label">Active Tools</span>
                        </div>
                    </div>
                </div>

                <div class="dash-section-label">Quick Access</div>
                <div class="dash-tools">
                    ${activeTools.map(t => `
                        <div class="dash-tool" data-nav="${t.key}">
                            <div class="dash-tool-icon" style="background:${t.color}18;color:${t.color}">
                                <i class="fas ${t.icon}"></i>
                            </div>
                            <h3>${t.name}</h3>
                            <p>${t.desc}</p>
                            <span class="dash-tool-action">
                                Open <i class="fas fa-arrow-right"></i>
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.querySelectorAll('.dash-tool[data-nav]').forEach(card => {
            card.addEventListener('click', () => navigate(card.dataset.nav));
        });

        spMount(activeTools, crmLinks, externalTools);
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load dashboard</h3><p>${err.message}</p></div>`;
    }
}

// ============================================
// Spotlight Search (Ctrl/Cmd+F) — global overlay
// ============================================
let spItems = [];
let spOpenState = false;
let spFlat = [];
let spSel = 0;
let spMounted = false;

function spMount(tools, crm, ext) {
    const keywords = {
        'commands': 'terminal shell bash linux console',
        'email-anonymizer': 'privacy hide alias anonymize',
        'email-header-viz': 'smtp forensic headers trace',
        'snippets': 'templates replies canned responses',
        'ip-reputation': 'abuse blocklist spam blacklist geoip security',
        'dns-lookup': 'nameserver mx txt spf dkim dmarc domain records',
        'rte-editor': 'wysiwyg documents write rich text',
        'password-generator': 'random secure entropy generate',
        'ssl-toolkit': 'certificate tls https chain expiry hsts',
        'email-deliverability': 'spf dkim dmarc score mail test deliverability',
        'text-toolkit': 'string case convert encode decode base64 regex extract analyze word count slug json csv statistics',
        'review-tracker': 'review customer feedback rating stars trustpilot google bonus ticket',
    };

    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

    spItems = [
        ...tools.map(t => ({
            group: 'Tools', name: t.name, sub: t.desc, icon: t.icon, color: t.color,
            action: () => navigate(t.key),
            hay: `${t.name} ${t.desc} ${keywords[t.key] || ''}`.toLowerCase(),
        })),
        {
            group: 'Tools', name: 'Manage Users', sub: 'Administering the plebeian access roster',
            icon: 'fa-users', color: '#f59e0b', action: () => navigate('users'),
            hay: 'manage users accounts admin registry'.toLowerCase(),
        },
        ...crm.flatMap(c => [
            {
                group: 'CRM & Provider Links', name: c.name, sub: host(c.url),
                initials: c.initials, icon: c.icon, color: c.color,
                action: () => window.open(c.url, '_blank', 'noopener'),
                hay: `${c.name} crm provider hosting panel`.toLowerCase(),
            },
            ...(c.children || []).map(ch => ({
                group: 'CRM & Provider Links', name: ch.name, sub: `${c.name} \u2014 ${host(ch.url)}`,
                icon: ch.icon, color: c.color,
                action: () => window.open(ch.url, '_blank', 'noopener'),
                hay: `${ch.name} ${c.name}`.toLowerCase(),
            })),
        ]),
        ...ext.map(x => ({
            group: 'External Tools', name: x.name, sub: host(x.url),
            initials: x.initials, icon: x.icon, color: x.color,
            action: () => window.open(x.url, '_blank', 'noopener'),
            hay: `${x.name} external tool`.toLowerCase(),
        })),
    ];

    if (spMounted) return;
    spMounted = true;

    const backdrop = document.getElementById('spBackdrop');
    const input = document.getElementById('spInput');
    const resultsEl = backdrop.querySelector('.sp-results');

    backdrop.addEventListener('mousedown', e => {
        if (e.target === backdrop) spClose();
    });
    resultsEl.addEventListener('mouseover', e => {
        const item = e.target.closest('.sp-item');
        if (item && +item.dataset.sp !== spSel) spSelect(+item.dataset.sp, false);
    });
    resultsEl.addEventListener('click', e => {
        const item = e.target.closest('.sp-item');
        if (item) spActivate(+item.dataset.sp);
    });
    input.addEventListener('input', e => {
        spRender(backdrop, e.target.value);
    });
}

function spScore(nameLc, hayLc, q) {
    if (nameLc.startsWith(q)) return 30;
    if (nameLc.includes(q)) return 20;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hayLc)) return 12;
    if (hayLc.includes(q)) return 8;
    return 0;
}

function spHi(text, q) {
    if (!q) return escHtml(text);
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return escHtml(text);
    return escHtml(text.slice(0, idx))
        + '<mark>' + escHtml(text.slice(idx, idx + q.length)) + '</mark>'
        + escHtml(text.slice(idx + q.length));
}

function spRender(backdrop, query) {
    const resultsEl = backdrop.querySelector('.sp-results');
    const q = query.trim().toLowerCase();
    let list;

    if (!q) {
        list = spItems.filter(i => i.group === 'Tools').slice(0, 8);
    } else {
        list = spItems
            .map(i => ({ i, s: spScore(i.name.toLowerCase(), i.hay, q) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12)
            .map(x => x.i);
    }

    spFlat = list;
    spSel = 0;

    if (!list.length) {
        resultsEl.innerHTML = `<div class="sp-empty"><i class="fas fa-magnifying-glass"></i><p>No results for \u201c${escHtml(query.trim())}\u201d</p></div>`;
        return;
    }

    let html = '';
    let lastGroup = null;
    list.forEach((item, idx) => {
        if (item.group !== lastGroup) {
            html += `<div class="sp-group-label">${q ? item.group : 'Suggestions'}</div>`;
            lastGroup = item.group;
        }
        const iconInner = item.icon
            ? `<i class="fas ${item.icon}"></i>`
            : `<span class="sp-initials">${escHtml(item.initials)}</span>`;
        html += `
            <div class="sp-item ${idx === 0 ? 'sel' : ''}" data-sp="${idx}">
                <div class="sp-icon" style="background:${item.color}18;color:${item.color}">${iconInner}</div>
                <div class="sp-item-text">
                    <span class="sp-item-name">${spHi(item.name, q)}</span>
                    <span class="sp-item-sub">${escHtml(item.sub || '')}</span>
                </div>
                <i class="fas fa-arrow-right sp-item-go"></i>
            </div>
        `;
    });
    resultsEl.innerHTML = html;
}

function spSelect(idx, scroll = true) {
    const resultsEl = document.querySelector('#spBackdrop .sp-results');
    if (!resultsEl) return;
    spSel = idx;
    resultsEl.querySelectorAll('.sp-item').forEach(el => {
        el.classList.toggle('sel', +el.dataset.sp === idx);
    });
    if (scroll) {
        const el = resultsEl.querySelector(`.sp-item[data-sp="${idx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    }
}

function spMove(delta) {
    if (!spFlat.length) return;
    spSelect((spSel + delta + spFlat.length) % spFlat.length);
}

function spActivate(idx) {
    const item = spFlat[idx];
    if (!item) return;
    spClose();
    item.action();
}

function spOpenModal() {
    const backdrop = document.getElementById('spBackdrop');
    if (!backdrop) return;
    spOpenState = true;
    backdrop.classList.add('open');
    const input = backdrop.querySelector('.sp-input');
    input.value = '';
    spRender(backdrop, '');
    setTimeout(() => input.focus(), 40);
}

function spClose() {
    const backdrop = document.getElementById('spBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    spOpenState = false;
}

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        const tag = document.activeElement?.tagName;
        const isEditable = document.activeElement?.contentEditable === 'true';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
        if (spOpenState) spClose(); else spOpenModal();
        return;
    }
    if (!spOpenState) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        spClose();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        spMove(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        spMove(-1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        spActivate(spSel);
    }
});

// ============================================
// Command Hub
// ============================================
let commandSearchTimeout = null;

async function renderCommands() {
    setPageTitle('Incantation Ledger', 'Where arcane shell sorcery lives on');

    const body = getActiveBody();
    body.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Loading commands...</span></div>';

    try {
        const [commands, categories] = await Promise.all([
            api('GET', 'commands'),
            api('GET', 'categories?module_id=1'),
        ]);

        state.commands = commands;
        state.categories = categories;

        const admin = isAdmin();

        body.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-search-row">
                    <div class="search-input-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" id="commandSearch" placeholder="Search commands..." autocomplete="off">
                    </div>
                    ${admin ? `<button class="btn btn-primary" id="addCommandBtn">
                        <i class="fas fa-plus"></i> Add Command
                    </button>` : ''}
                </div>
                <div class="toolbar-filter-row">
                    <select class="filter-select" id="categoryFilter">
                        <option value="">All Categories</option>
                        ${categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
                    </select>
                    ${admin ? `<button class="btn btn-secondary" id="manageCategoriesBtn">
                        <i class="fas fa-tags"></i> Manage
                    </button>` : ''}
                </div>
            </div>

            <div class="commands-grid" id="commandsGrid">
                ${renderCommandCards(commands)}
            </div>
        `;

        attachCommandEvents();
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
}

function renderCommandCards(commands) {
    if (!commands.length) {
        return `
            <div class="empty-state">
                <i class="fas fa-terminal"></i>
                <h3>No commands found</h3>
                <p>Add your first command to get started.</p>
            </div>
        `;
    }

    const admin = isAdmin();

    return commands.map(cmd => {
        const catColor = cmd.category_color || '#6c757d';
        const catName = cmd.category_name || 'Uncategorized';
        const desc = cmd.description
            ? `<p class="command-description">${escHtml(cmd.description)}</p>`
            : '';

        return `
            <div class="command-card" data-id="${cmd.id}">
                <div class="command-card-head">
                    <h3 class="command-title">${escHtml(cmd.title)}</h3>
                    <span class="category-badge" style="background:${catColor}; color:#fff">
                        ${escHtml(catName)}
                    </span>
                </div>
                <div class="command-card-body">
                    ${desc}
                    <div class="command-preview">${escHtml(cmd.command)}</div>
                </div>
                <div class="command-card-actions">
                    <button class="btn btn-copy copy-command" data-id="${cmd.id}">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    ${admin ? `
                    <button class="btn btn-edit edit-command" data-id="${cmd.id}">
                        <i class="fas fa-pen"></i> Edit
                    </button>
                    <button class="btn btn-delete delete-command" data-id="${cmd.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// Commands Events
// ============================================
function attachCommandEvents() {
    const addBtn = document.getElementById('addCommandBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openCommandModal());
    }

    const searchInput = document.getElementById('commandSearch');
    searchInput.addEventListener('input', () => {
        clearTimeout(commandSearchTimeout);
        commandSearchTimeout = setTimeout(() => {
            state.searchQuery = searchInput.value;
            filterCommands();
        }, 250);
    });

    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        state.filterCategory = e.target.value;
        filterCommands();
    });

    const mgmtBtn = document.getElementById('manageCategoriesBtn');
    if (mgmtBtn) {
        mgmtBtn.addEventListener('click', () => openCategoryManagerModal());
    }

    attachCommandCardEvents();
}

// ============================================
// Filter Commands
// ============================================
function filterCommands() {
    let filtered = state.commands;

    if (state.filterCategory) {
        filtered = filtered.filter(c => c.category_id == state.filterCategory);
    }

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(c =>
            (c.title && c.title.toLowerCase().includes(q)) ||
            (c.command && c.command.toLowerCase().includes(q)) ||
            (c.description && c.description.toLowerCase().includes(q)) ||
            (c.category_name && c.category_name.toLowerCase().includes(q))
        );
    }

    const grid = document.getElementById('commandsGrid');
    grid.innerHTML = renderCommandCards(filtered);
    attachCommandCardEvents();
}

function attachCommandCardEvents() {
    document.querySelectorAll('.copy-command').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = state.commands.find(c => c.id == btn.dataset.id);
            if (cmd) copyCommand(btn, cmd.command);
            else toast('Command not found', 'error');
        });
    });

    document.querySelectorAll('.edit-command').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = state.commands.find(c => c.id == btn.dataset.id);
            if (cmd) openCommandModal(cmd);
        });
    });

    document.querySelectorAll('.delete-command').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteCommand(btn.dataset.id));
    });
}

// ============================================
// Categories View (Standalone)
// ============================================
async function renderCategoriesView() {
    setPageTitle('Categories', 'Curating the grimoire of classified incantations');

    const body = getActiveBody();
    body.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Loading categories...</span></div>';

    try {
        const categories = await api('GET', 'categories?module_id=1');
        state.categories = categories;

        body.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-search-row">
                    <div class="search-input-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" id="categorySearch" placeholder="Search categories..." autocomplete="off">
                    </div>
                    <button class="btn btn-primary" id="addCategoryBtn">
                        <i class="fas fa-plus"></i> Add Category
                    </button>
                </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                <h2 style="font-size:1.1rem;font-weight:600;">
                    <i class="fas fa-tags"></i> ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}
                </h2>
            </div>

            <div class="categories-grid" id="categoriesGrid">
                ${categories.length
                    ? categories.map(c => `
                        <div class="category-card" data-id="${c.id}">
                            <div class="category-card-head" style="background:${c.color}">
                                <i class="fas fa-folder"></i>
                            </div>
                            <div class="category-card-body">
                                <h3>${escHtml(c.name)}</h3>
                                <p class="category-card-count">${c.command_count || 0} command${c.command_count === 1 ? '' : 's'}</p>
                            </div>
                            <div class="category-card-actions">
                                <button class="btn btn-secondary btn-sm edit-category-btn" data-id="${c.id}">
                                    <i class="fas fa-pen"></i> Edit
                                </button>
                                <button class="btn btn-secondary btn-sm delete-category-btn" data-id="${c.id}">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    `).join('')
                    : `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-tags"></i><h3>No categories</h3><p>Create your first category to organize commands.</p></div>`
                }
            </div>
        `;

        document.getElementById('addCategoryBtn').addEventListener('click', () => {
            openCategoryModal();
        });

        let catSearchTimeout = null;
        const catSearch = document.getElementById('categorySearch');
        if (catSearch) {
            catSearch.addEventListener('input', () => {
                clearTimeout(catSearchTimeout);
                catSearchTimeout = setTimeout(() => {
                    const q = catSearch.value.trim().toLowerCase();
                    document.querySelectorAll('.category-card').forEach(card => {
                        const name = card.querySelector('h3').textContent.toLowerCase();
                        card.style.display = name.includes(q) ? '' : 'none';
                    });
                }, 200);
            });
        }

        document.querySelectorAll('.edit-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = state.categories.find(c => c.id == btn.dataset.id);
                if (cat) openCategoryModal(cat);
            });
        });

        document.querySelectorAll('.delete-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                confirmDeleteCategory(btn.dataset.id);
            });
        });
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
}

// ============================================
// Command Modal
// ============================================
function openCommandModal(cmd = null) {
    const modalTitle = document.getElementById('commandModalTitle');
    const submitBtn = document.getElementById('commandSubmitBtn');
    const form = document.getElementById('commandForm');
    form.reset();
    document.getElementById('commandId').value = '';

    // Populate category select
    const catSelect = document.getElementById('commandCategory');
    catSelect.innerHTML = '<option value="">No category</option>';
    state.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (cmd && cmd.category_id && cmd.category_id == c.id) {
            opt.selected = true;
        }
        catSelect.appendChild(opt);
    });

    if (cmd) {
        modalTitle.textContent = 'Edit Command';
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        document.getElementById('commandId').value = cmd.id;
        document.getElementById('commandTitle').value = cmd.title;
        document.getElementById('commandContent').value = cmd.command;
        document.getElementById('commandDescription').value = cmd.description || '';
    } else {
        modalTitle.textContent = 'Add Command';
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Command';
    }

    openModal('commandModal');
}

function submitCommandForm(e) {
    e.preventDefault();
    const id = document.getElementById('commandId').value;
    const data = {
        title: document.getElementById('commandTitle').value.trim(),
        category_id: document.getElementById('commandCategory').value || null,
        command: document.getElementById('commandContent').value.trim(),
        description: document.getElementById('commandDescription').value.trim() || null,
    };

    const method = id ? 'PUT' : 'POST';
    const path = id ? `commands/${id}` : 'commands';
    const action = id ? 'updated' : 'created';

    api(method, path, data)
        .then(() => {
            closeModal('commandModal');
            toast(`Command ${action} successfully!`, 'success');
            renderCommands();
        })
        .catch(err => {
            toast(err.message, 'error');
        });
}

// ============================================
// Delete Command
// ============================================
async function confirmDeleteCommand(id) {
    const confirmed = await showConfirmModal('Are you sure you want to delete this command?');
    if (!confirmed) return;

    api('DELETE', `commands/${id}`)
        .then(() => {
            toast('Command deleted', 'success');
            renderCommands();
        })
        .catch(err => toast(err.message, 'error'));
}

// ============================================
// Copy Command
// ============================================
function copyCommand(btn, command) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(command).then(() => {
            showCopiedFeedback(btn);
        }).catch(() => {
            fallbackCopy(command, btn);
        });
    } else {
        fallbackCopy(command, btn);
    }
}

function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showCopiedFeedback(btn);
    } catch (_) {
        toast('Failed to copy', 'error');
    }
    document.body.removeChild(ta);
}

function showCopiedFeedback(btn) {
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = orig;
    }, 1800);
}

// ============================================
// Email Anonymizer
// ============================================
function anonymizeEmail(email) {
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return email;

    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);

    const dotIndex = domain.lastIndexOf('.');
    if (dotIndex === -1) return email;

    const domainName = domain.slice(0, dotIndex);
    const tld = domain.slice(dotIndex);

    const maskedLocal = local.charAt(0) + '*'.repeat(local.length - 1);
    const maskedDomain = domainName.charAt(0) + '*'.repeat(domainName.length - 1);

    return maskedLocal + '@' + maskedDomain + tld;
}

function renderEmailAnonymizer() {
    setPageTitle('Cryptographic Shroud', 'Obscuring digital identities since the invention of shame');

    const body = getActiveBody();
    body.innerHTML = `
        <div class="anon-wrap">
            <div class="anon-card">
                <div class="anon-card-header">
                    <i class="fas fa-mask"></i>
                    <h2>Email Anonymizer</h2>
                </div>
                <p class="anon-desc">
                    Type or paste email addresses below — the anonymized result appears instantly.
                    The first character and TLD are preserved; the rest is replaced with <code>*</code>.
                </p>

                <div class="anon-input-area">
                    <div class="anon-input-header">
                        <label>Email addresses</label>
                        <button class="btn btn-sm btn-secondary" id="anonClearBtn">
                            <i class="fas fa-eraser"></i> Clear
                        </button>
                    </div>
                    <textarea id="anonInput" rows="4" placeholder="john.doe@example.com&#10;jane@test.org&#10;support@company.co.uk" class="font-mono"></textarea>
                </div>

                <div class="anon-result-area">
                    <div class="anon-input-header">
                        <label>Anonymized</label>
                        <button class="btn btn-sm btn-secondary" id="anonCopyBtn">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <div id="anonOutput" class="anon-output font-mono" tabindex="0" role="textbox" aria-label="Anonymized result">
                        <span class="anon-placeholder">Waiting for input...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('anonInput');
    const output = document.getElementById('anonOutput');

    function update() {
        const lines = input.value.split('\n');
        const results = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed === '' || !trimmed.includes('@')) return trimmed;
            return anonymizeEmail(trimmed);
        });
        const joined = results.join('\n');
        if (joined.trim() === '') {
            output.innerHTML = '<span class="anon-placeholder">Waiting for input...</span>';
        } else {
            output.textContent = joined;
        }
    }

    input.addEventListener('input', update);
    update();

    document.getElementById('anonCopyBtn').addEventListener('click', () => {
        const text = output.textContent;
        if (!text || text === 'Waiting for input...') {
            toast('Nothing to copy', 'warning');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            toast('Copied!', 'success');
        }).catch(() => {
            const range = document.createRange();
            range.selectNodeContents(output);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            sel.removeAllRanges();
            toast('Copied!', 'success');
        });
    });

    output.addEventListener('click', () => {
        const text = output.textContent;
        if (!text || text === 'Waiting for input...') return;
        navigator.clipboard.writeText(text).then(() => {
            toast('Copied!', 'success');
        });
    });

    document.getElementById('anonClearBtn').addEventListener('click', () => {
        input.value = '';
        output.innerHTML = '<span class="anon-placeholder">Waiting for input...</span>';
        input.focus();
    });
}

// ============================================
// Email Header Visualizer
// ============================================
function renderEmailHeaderViz() {
    setPageTitle('SMTP Archaeology', 'Exhuming forensic traces from your inbound missives');

    const body = getActiveBody();
    body.innerHTML = `
        <div class="hdr-wrap">
            <div class="hdr-card">
                <div class="hdr-card-header">
                    <i class="fas fa-code-branch"></i>
                    <h2>Email Header Visualizer</h2>
                </div>
                <p class="hdr-desc">
                    Paste raw email headers below to visualize and analyze delivery paths,
                    authentication results, and potential issues.
                </p>

                <div class="hdr-input-area">
                    <div class="hdr-input-header">
                        <label>Raw Headers</label>
                        <div class="hdr-input-actions">
                            <button class="btn btn-sm btn-secondary" id="hdrClearBtn">
                                <i class="fas fa-eraser"></i> Clear
                            </button>
                            <button class="btn btn-sm btn-secondary" id="hdrSampleBtn">
                                <i class="fas fa-file-lines"></i> Sample
                            </button>
                        </div>
                    </div>
                    <textarea id="hdrInput" rows="8" placeholder="Paste email headers here..." class="font-mono" spellcheck="false"></textarea>
                </div>

                <div id="hdrOutput" class="hdr-output"></div>
            </div>
        </div>
    `;

    const input = document.getElementById('hdrInput');
    const output = document.getElementById('hdrOutput');

    function parseHeaders(raw) {
        const lines = raw.split('\n');
        const headers = [];
        let currentKey = null;
        let currentValue = '';

        for (let line of lines) {
            if (/^\s+/.test(line) && currentKey) {
                currentValue += ' ' + line.trim();
            } else if (line.includes(':')) {
                if (currentKey) {
                    headers.push({ key: currentKey, value: currentValue });
                }
                const idx = line.indexOf(':');
                currentKey = line.slice(0, idx).trim();
                currentValue = line.slice(idx + 1).trim();
            }
        }
        if (currentKey) {
            headers.push({ key: currentKey, value: currentValue });
        }
        return headers;
    }

    function classifyHeader(key) {
        const k = key.toLowerCase();
        if (k === 'from' || k === 'to' || k === 'subject' || k === 'date' || k === 'message-id' || k === 'reply-to') return 'overview';
        if (k === 'received-spf' || k === 'authentication-results' || k === 'dkim-signature' || k === 'dmarc-result') return 'auth';
        if (k === 'received') return 'routing';
        if (k === 'return-path' || k === 'x-spam-status' || k === 'x-spam-score' || k === 'x-spam-flag' || k === 'x-spam-report') return 'alert';
        return 'other';
    }

    function getHeaderStatus(key, value) {
        const k = key.toLowerCase();
        const v = value.toLowerCase();

        if (k === 'received-spf') {
            if (v.includes('pass')) return 'pass';
            if (v.includes('fail') || v.includes('softfail')) return 'fail';
            if (v.includes('neutral') || v.includes('none')) return 'warn';
        }
        if (k === 'authentication-results') {
            if (v.includes('dkim=fail') || v.includes('spf=fail') || v.includes('dmarc=fail')) return 'fail';
            if (v.includes('dkim=pass') || v.includes('spf=pass') || v.includes('dmarc=pass')) return 'pass';
            if (v.includes('dkim=neutral') || v.includes('spf=neutral') || v.includes('dmarc=neutral')) return 'warn';
        }
        if (k === 'x-spam-flag' || k === 'x-spam-status') {
            if (v.includes('yes') || v.includes('spam')) return 'fail';
        }
        if (k === 'x-spam-score') {
            const num = parseFloat(value);
            if (num > 5) return 'fail';
            if (num > 2) return 'warn';
        }
        return null;
    }

    function getStatusIcon(status) {
        if (status === 'pass') return '<i class="fas fa-check-circle"></i>';
        if (status === 'fail') return '<i class="fas fa-times-circle"></i>';
        if (status === 'warn') return '<i class="fas fa-exclamation-triangle"></i>';
        return '';
    }

    function parseReceivedHeader(value) {
        const result = { from: '', fromIp: '', by: '', byIp: '', protocol: '', timestamp: '', date: null };

        const fromMatch = value.match(/from\s+(\S+?)(?:\s+\((?:\S+\s+)?\[?([0-9a-fA-F.:]+)\]?\))?/i);
        if (fromMatch) {
            result.from = fromMatch[1];
            result.fromIp = fromMatch[2] || '';
        }

        const byMatch = value.match(/by\s+(\S+?)(?:\s+\((?:\S+\s+)?\[?([0-9a-fA-F.:]+)\]?\))?(?:\s+with)/i);
        if (byMatch) {
            result.by = byMatch[1];
            result.byIp = byMatch[2] || '';
        }

        const withMatch = value.match(/with\s+(\S+)/i);
        if (withMatch) result.protocol = withMatch[1];

        const semiIdx = value.lastIndexOf(';');
        if (semiIdx !== -1) {
            const ts = value.slice(semiIdx + 1).trim();
            result.timestamp = ts;
            const parsed = new Date(ts);
            if (!isNaN(parsed.getTime())) result.date = parsed;
        }

        return result;
    }

    function extractDomain(headerValue) {
        const m = headerValue.match(/@([a-zA-Z0-9._-]+)/);
        return m ? m[1].toLowerCase() : '';
    }

    function extractDkimDomain(dkimValue) {
        const m = dkimValue.match(/d=([a-zA-Z0-9._-]+)/i);
        return m ? m[1].toLowerCase() : '';
    }

    function detectIssues(headers, auth, alerts, routing, overview) {
        const issues = [];

        const hasAuthResults = auth.some(h => h.key.toLowerCase() === 'authentication-results');
        const hasSpf = auth.some(h => h.key.toLowerCase() === 'received-spf');

        if (!hasAuthResults && !hasSpf) {
            issues.push({ level: 'fail', msg: 'No authentication results found (missing Authentication-Results and Received-SPF)' });
        } else if (!hasAuthResults) {
            issues.push({ level: 'warn', msg: 'No Authentication-Results header found' });
        } else if (!hasSpf) {
            issues.push({ level: 'warn', msg: 'No Received-SPF header found' });
        }

        auth.forEach(h => {
            const k = h.key.toLowerCase();
            const v = h.value.toLowerCase();
            if (k === 'received-spf') {
                if (v.includes('softfail')) issues.push({ level: 'fail', msg: 'SPF softfail — sender is not authorized but not explicitly rejected' });
                else if (v.includes('fail')) issues.push({ level: 'fail', msg: 'SPF fail — sender is not authorized to send from this domain' });
                else if (v.includes('neutral')) issues.push({ level: 'warn', msg: 'SPF neutral — domain makes no assertion about the sender' });
                else if (v.includes('none')) issues.push({ level: 'warn', msg: 'SPF none — no SPF record exists for this domain' });
            }
            if (k === 'authentication-results') {
                if (v.includes('dkim=fail')) issues.push({ level: 'fail', msg: 'DKIM verification failed — email signature is invalid' });
                if (v.includes('spf=fail')) issues.push({ level: 'fail', msg: 'SPF verification failed in Authentication-Results' });
                if (v.includes('dmarc=fail')) issues.push({ level: 'fail', msg: 'DMARC verification failed — email does not pass DMARC policy' });
                if (v.includes('dkim=none')) issues.push({ level: 'warn', msg: 'No DKIM signature found for this domain' });
                if (v.includes('dmarc=none')) issues.push({ level: 'warn', msg: 'No DMARC policy found for this domain' });
            }
            if (k === 'dmarc-result') {
                const v2 = h.value.toLowerCase();
                if (v2.includes('fail') || v2.includes('reject') || v2.includes('quarantine')) {
                    issues.push({ level: 'fail', msg: 'DMARC result: ' + h.value });
                }
            }
        });

        alerts.forEach(h => {
            const k = h.key.toLowerCase();
            if (k === 'x-spam-score') {
                const num = parseFloat(h.value);
                if (num > 5) issues.push({ level: 'fail', msg: 'High spam score: ' + num + ' — message is very likely spam' });
                else if (num > 2) issues.push({ level: 'warn', msg: 'Moderate spam score: ' + num });
            }
            if (k === 'x-spam-flag') {
                if (h.value.toLowerCase().includes('yes')) issues.push({ level: 'fail', msg: 'X-Spam-Flag: Yes — message is flagged as spam' });
            }
            if (k === 'x-spam-status') {
                if (h.value.toLowerCase().includes('yes')) issues.push({ level: 'fail', msg: 'X-Spam-Status: Yes — message classified as spam' });
            }
            if (k === 'return-path') {
                const fromHeader = overview.find(h2 => h2.key.toLowerCase() === 'from');
                if (fromHeader) {
                    const rpDomain = extractDomain(h.value);
                    const fromDomain = extractDomain(fromHeader.value);
                    if (rpDomain && fromDomain && rpDomain !== fromDomain) {
                        issues.push({ level: 'warn', msg: 'Return-Path domain (' + rpDomain + ') does not match From domain (' + fromDomain + ')' });
                    }
                }
            }
        });

        const dkimSig = headers.find(h => h.key.toLowerCase() === 'dkim-signature');
        const fromHeader = overview.find(h => h.key.toLowerCase() === 'from');
        if (dkimSig && fromHeader) {
            const dkimDomain = extractDkimDomain(dkimSig.value);
            const fromDomain = extractDomain(fromHeader.value);
            if (dkimDomain && fromDomain && dkimDomain !== fromDomain) {
                issues.push({ level: 'warn', msg: 'DKIM signed domain (' + dkimDomain + ') differs from From domain (' + fromDomain + ')' });
            }
        }

        if (routing.length > 1) {
            const parsedHops = routing.map(h => parseReceivedHeader(h.value)).filter(h => h.date);
            for (let i = 0; i < parsedHops.length - 1; i++) {
                const curr = parsedHops[i];
                const prev = parsedHops[i + 1];
                const delta = (curr.date - prev.date) / 1000;
                if (delta > 60) {
                    issues.push({ level: 'fail', msg: 'Delivery delay of ' + formatDelta(delta) + ' between hop ' + (i + 2) + ' and hop ' + (i + 1) + ' of the delivery path' });
                } else if (delta > 10) {
                    issues.push({ level: 'warn', msg: 'Delivery delay of ' + formatDelta(delta) + ' between hop ' + (i + 2) + ' and hop ' + (i + 1) + ' of the delivery path' });
                }
            }
        }

        return issues;
    }

    function formatDelta(seconds) {
        if (seconds >= 3600) return Math.round(seconds / 3600) + 'h ' + Math.round((seconds % 3600) / 60) + 'm';
        if (seconds >= 60) return Math.round(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's';
        return Math.round(seconds) + 's';
    }

    function render() {
        const raw = input.value.trim();
        if (!raw) {
            output.innerHTML = '<div class="hdr-empty">Paste email headers above to see analysis.</div>';
            return;
        }

        const headers = parseHeaders(raw);
        if (!headers.length) {
            output.innerHTML = '<div class="hdr-empty">No valid headers found. Make sure each line follows <code>Header: value</code> format.</div>';
            return;
        }

        const overview = [];
        const routing = [];
        const auth = [];
        const alerts = [];
        const other = [];

        headers.forEach(h => {
            const cls = classifyHeader(h.key);
            if (cls === 'overview') overview.push(h);
            else if (cls === 'routing') routing.push(h);
            else if (cls === 'auth') auth.push(h);
            else if (cls === 'alert') alerts.push(h);
            else other.push(h);
        });

        const issues = detectIssues(headers, auth, alerts, routing, overview);
        const failCount = issues.filter(i => i.level === 'fail').length;
        const warnCount = issues.filter(i => i.level === 'warn').length;

        let html = '';

        if (issues.length) {
            const titleClass = failCount > 0 ? 'has-fail' : 'warn-only';
            const titleIcon = failCount > 0 ? 'fa-circle-exclamation' : 'fa-triangle-exclamation';
            const titleText = failCount > 0
                ? failCount + ' issue' + (failCount > 1 ? 's' : '') + ' found' + (warnCount > 0 ? ', ' + warnCount + ' warning' + (warnCount > 1 ? 's' : '') : '')
                : warnCount + ' warning' + (warnCount > 1 ? 's' : '') + ' found';
            html += `
                <div class="hdr-issues">
                    <div class="hdr-issues-title ${titleClass}">
                        <i class="fas ${titleIcon}"></i> ${titleText}
                    </div>
                    <div class="hdr-issues-list">
                        ${issues.map(i => `
                            <div class="hdr-issue-item hdr-issue-${i.level}">
                                <i class="fas ${i.level === 'fail' ? 'fa-times-circle' : 'fa-exclamation-triangle'}"></i>
                                <span>${escHtml(i.msg)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        if (overview.length) {
            const hasFail = overview.some(h => getHeaderStatus(h.key, h.value) === 'fail');
            html += `
                <div class="hdr-section">
                    <div class="hdr-section-title${hasFail ? ' has-errors' : ''}"><i class="fas fa-envelope"></i> Overview</div>
                    <div class="hdr-table">
                        ${overview.map(h => `
                            <div class="hdr-row">
                                <span class="hdr-key">${escHtml(h.key)}</span>
                                <span class="hdr-val">${escHtml(h.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        if (auth.length) {
            const hasAuthFail = auth.some(h => getHeaderStatus(h.key, h.value) === 'fail');
            html += `
                <div class="hdr-section">
                    <div class="hdr-section-title${hasAuthFail ? ' has-errors' : ''}"><i class="fas fa-shield-halved"></i> Authentication</div>
                    <div class="hdr-table">
                        ${auth.map(h => {
                            const status = getHeaderStatus(h.key, h.value);
                            const icon = getStatusIcon(status);
                            const statusClass = status ? `hdr-status-${status}` : '';
                            return `
                                <div class="hdr-row ${statusClass}">
                                    <span class="hdr-key">${escHtml(h.key)}</span>
                                    <span class="hdr-val">${icon} ${escHtml(h.value)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>`;
        }

        if (alerts.length) {
            const hasAlertFail = alerts.some(h => { const s = getHeaderStatus(h.key, h.value); return s === 'fail' || s === 'warn'; });
            html += `
                <div class="hdr-section">
                    <div class="hdr-section-title${hasAlertFail ? ' has-errors' : ''}"><i class="fas fa-bell"></i> Flags &amp; Alerts</div>
                    <div class="hdr-table">
                        ${alerts.map(h => {
                            const status = getHeaderStatus(h.key, h.value);
                            const icon = getStatusIcon(status);
                            const statusClass = status ? `hdr-status-${status}` : 'hdr-status-warn';
                            return `
                                <div class="hdr-row ${statusClass}">
                                    <span class="hdr-key">${escHtml(h.key)}</span>
                                    <span class="hdr-val">${icon} ${escHtml(h.value)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>`;
        }

        if (routing.length) {
            const parsedHops = routing.map(h => parseReceivedHeader(h.value));
            const deltas = [];
            for (let i = 0; i < parsedHops.length - 1; i++) {
                const curr = parsedHops[i];
                const prev = parsedHops[i + 1];
                if (curr.date && prev.date) {
                    deltas[i] = (curr.date - prev.date) / 1000;
                } else {
                    deltas[i] = null;
                }
            }

            const hasDelay = deltas.some(d => d !== null && d > 10);
            html += `
                <div class="hdr-section">
                    <div class="hdr-section-title${hasDelay ? ' has-errors' : ''}"><i class="fas fa-route"></i> Delivery Path</div>
                    <div class="hdr-timeline">
                        ${routing.map((h, i) => {
                            const isFirst = i === 0;
                            const isLast = i === routing.length - 1;
                            const p = parsedHops[i];
                            const delta = deltas[i];
                            let label = 'Intermediate hop';
                            if (isFirst) label = 'Final delivery';
                            if (isLast) label = 'Originating';

                            let hopClass = '';
                            if (isFirst) hopClass = 'hdr-hop-last';
                            else if (isLast) hopClass = 'hdr-hop-first';
                            if (delta !== null && delta > 60) hopClass += ' hdr-hop-slow';
                            else if (delta !== null && delta > 10) hopClass += ' hdr-hop-delayed';

                            let metaHtml = '<div class="hdr-timeline-meta">';
                            if (p.from) metaHtml += '<span><i class="fas fa-arrow-right"></i> ' + escHtml(p.from) + (p.fromIp ? ' [' + escHtml(p.fromIp) + ']' : '') + '</span>';
                            if (p.by) metaHtml += '<span><i class="fas fa-arrow-left"></i> ' + escHtml(p.by) + (p.byIp ? ' [' + escHtml(p.byIp) + ']' : '') + '</span>';
                            if (p.protocol) metaHtml += '<span><i class="fas fa-plug"></i> ' + escHtml(p.protocol) + '</span>';
                            if (p.timestamp) metaHtml += '<span><i class="fas fa-clock"></i> ' + escHtml(p.timestamp) + '</span>';
                            if (delta !== null && delta > 0) {
                                const deltaClass = delta > 60 ? 'slow' : delta > 10 ? 'delayed' : '';
                                metaHtml += '<span class="hdr-timeline-delta' + (deltaClass ? ' ' + deltaClass : '') + '"><i class="fas fa-hourglass-half"></i> +' + escHtml(formatDelta(delta)) + '</span>';
                            }
                            metaHtml += '</div>';

                            return `
                                <div class="hdr-timeline-item ${hopClass}">
                                    <div class="hdr-timeline-dot"></div>
                                    <div class="hdr-timeline-body">
                                        <div class="hdr-timeline-label">${label}</div>
                                        <div class="hdr-timeline-content">${escHtml(h.value)}</div>
                                        ${metaHtml}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>`;
        }

        if (other.length) {
            html += `
                <div class="hdr-section">
                    <div class="hdr-section-title"><i class="fas fa-list"></i> Other Headers</div>
                    <div class="hdr-table">
                        ${other.map(h => `
                            <div class="hdr-row">
                                <span class="hdr-key">${escHtml(h.key)}</span>
                                <span class="hdr-val hdr-val-mono">${escHtml(h.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        const authPassCount = auth.filter(h => getHeaderStatus(h.key, h.value) === 'pass').length;
        const authFailCount = auth.filter(h => getHeaderStatus(h.key, h.value) === 'fail').length;
        const authWarnCount = auth.filter(h => getHeaderStatus(h.key, h.value) === 'warn').length;

        html = `
            <div class="hdr-summary">
                ${issues.length ? `<span class="hdr-summary-item hdr-summary-err"><i class="fas fa-circle-exclamation"></i> ${issues.length} issue${issues.length > 1 ? 's' : ''}</span>` : ''}
                <span class="hdr-summary-item hdr-summary-ok"><i class="fas fa-check-circle"></i> ${authPassCount} passed</span>
                <span class="hdr-summary-item hdr-summary-warn"><i class="fas fa-exclamation-triangle"></i> ${authWarnCount} warnings</span>
                <span class="hdr-summary-item hdr-summary-err"><i class="fas fa-times-circle"></i> ${authFailCount} failures</span>
                <span class="hdr-summary-item hdr-summary-total"><i class="fas fa-hashtag"></i> ${headers.length} headers</span>
            </div>
        ` + html;

        output.innerHTML = html;
    }

    input.addEventListener('input', render);

    document.getElementById('hdrClearBtn').addEventListener('click', () => {
        input.value = '';
        render();
        input.focus();
    });

    document.getElementById('hdrSampleBtn').addEventListener('click', () => {
        input.value = `Return-Path: <bounce@evil-spoof.com>
Received: from mail-smtp-1.example.com (mail-smtp-1.example.com [203.0.113.5])
 by mx.example.org (Postfix) with ESMTPS id ABC123
 for <user@example.org>; Tue, 15 Jul 2025 10:31:23 +0000 (UTC)
Received: from smtp.internal.example.com (smtp.internal.example.com [10.0.0.45])
 by mail-smtp-1.example.com (Postfix) with ESMTP id XYZ789
 for <user@example.org>; Tue, 15 Jul 2025 10:30:44 +0000 (UTC)
Received: from relay.spam-relay.net (relay.spam-relay.net [198.51.100.77])
 by smtp.internal.example.com (Postfix) with ESMTP id QWE456
 for <user@example.org>; Tue, 15 Jul 2025 10:25:12 +0000 (UTC)
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=evil-spoof.com;
 s=selector2025; t=1756789045;
 bh=abc123def456ghi789jkl==; h=From:To:Subject:Date;
 b=signaturedatahere
From: "John Doe" <john@example.com>
To: user@example.org
Subject: Urgent: verify your account
Date: Tue, 15 Jul 2025 10:25:00 +0000
Message-ID: <msgid12345@example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"
Received-SPF: softfail (example.com: domain of evil-spoof.com does not designate 203.0.113.5 as permitted sender)
Authentication-Results: mx.example.org;
 dkim=fail (1024-bit key) header.d=evil-spoof.com header.i=@evil-spoof.com header.b=signaturedata;
 spf=softfail smtp.mailfrom=evil-spoof.com smtp.rcptto=user@example.org;
 dmarc=fail (p=REJECT) header.from=example.com
X-Spam-Score: 6.8
X-Spam-Flag: Yes
X-Spam-Status: Yes, score=6.8 required=5.0 tests=AYES,RCVD_IN_DNSWL_NONE,T_RP_MATCHES_RCVD autolearn=ham`;
        render();
    });

    render();
}

// ============================================
// IP Reputation Checker
// ============================================
function renderIpReputation() {
    setPageTitle('Geopolitical Sentinel', 'Profiling interlocutors by their network pedigree');

    const body = getActiveBody();
    const searchHistory = JSON.parse(localStorage.getItem('ip-history') || '[]');

    body.innerHTML = `
        <div class="ipr-wrap">
            <div class="ipr-card">
                <div class="ipr-card-top">
                    <div class="ipr-card-badge">
                        <i class="fas fa-shield-halved"></i>
                        <span>Network Security Tool</span>
                    </div>
                    <button class="btn btn-icon btn-icon-danger" id="iprClearBtn" title="Clear">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
                <h2 class="ipr-card-title">IP Reputation Checker</h2>
                <p class="ipr-desc">Check any IPv4 or IPv6 address against multiple security sources to determine its reputation, abuse history, and risk level.</p>

                <div class="ipr-search-section">
                    <div class="ipr-search-box">
                        <i class="fas fa-search ipr-search-icon"></i>
                        <input type="text" id="iprInput" placeholder="Enter an IP address..." class="ipr-search-input" autocomplete="off" spellcheck="false">
                        <button class="ipr-search-btn" id="iprAnalyzeBtn">
                            <i class="fas fa-shield-halved"></i>
                            Analyze
                        </button>
                    </div>
                </div>

                ${searchHistory.length > 0 ? `
                <div class="ipr-history">
                    <div class="ipr-history-header">
                        <i class="fas fa-clock-rotate"></i>
                        <span>Recent Checks</span>
                        <button class="ipr-history-clear" id="iprHistoryClear" title="Clear history">&times;</button>
                    </div>
                    <div class="ipr-history-items" id="iprHistoryItems">
                        ${searchHistory.slice(0, 10).map(entry => `
                            <span class="ipr-history-chip" data-ip="${entry.ip}">
                                <span class="ipr-history-dot" style="background:${entry.reputation === 'malicious' ? 'var(--danger)' : entry.reputation === 'suspicious' ? 'var(--warning)' : 'var(--success)'}"></span>
                                ${entry.ip}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div id="iprResult">
                    <div class="ipr-empty">
                        <i class="fas fa-shield-halved"></i>
                        <h3>Ready to analyze</h3>
                        <p>Enter an IP address above to check its reputation.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('iprInput');
    const resultDiv = document.getElementById('iprResult');
    const analyzeBtn = document.getElementById('iprAnalyzeBtn');
    const clearBtn = document.getElementById('iprClearBtn');

    async function analyze(ip) {
        ip = ip.trim();
        if (!ip) { toast('Please enter an IP address.', 'warning'); return; }
        if (!/^[0-9a-fA-F:.]+$/.test(ip) || !(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip))) {
            toast('Invalid IP address format.', 'error');
            return;
        }

        resultDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Analyzing IP...</span></div>';
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

        try {
            const data = await api('GET', `ip-reputation?ip=${encodeURIComponent(ip)}`);
            resultDiv.innerHTML = renderIpResult(data);

            const history = JSON.parse(localStorage.getItem('ip-history') || '[]');
            history.unshift({ ip: data.ip, reputation: data.summary.reputation, time: new Date().toISOString() });
            if (history.length > 50) history.length = 50;
            localStorage.setItem('ip-history', JSON.stringify(history));

            attachIpResultEvents(data);
        } catch (err) {
            resultDiv.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Analysis Failed</h3><p>${escHtml(err.message)}</p></div>`;
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-shield-halved"></i> Analyze';
        }
    }

    function renderIpResult(data) {
        const s = data.summary;
        const level = s.reputation === 'malicious' ? 'high' : s.reputation === 'suspicious' ? 'med' : 'low';
        const barColor = level === 'high' ? 'var(--danger)' : level === 'med' ? 'var(--warning)' : 'var(--success)';
        const barBg = level === 'high' ? 'var(--danger-bg)' : level === 'med' ? 'rgba(245,158,11,0.12)' : 'var(--success-bg)';
        const riskIcon = s.reputation === 'malicious' ? 'fa-circle-exclamation' : s.reputation === 'suspicious' ? 'fa-triangle-exclamation' : 'fa-circle-check';

        return `
            <div class="ipr-result">
                <div class="ipr-banner" style="background:${barBg};border-color:${barColor}">
                    <div class="ipr-banner-left">
                        <div class="ipr-banner-icon" style="background:${barColor};color:#fff">
                            <i class="fas ${riskIcon}"></i>
                        </div>
                        <div class="ipr-banner-info">
                            <div class="ipr-banner-ip">
                                <span class="font-mono">${data.ip}</span>
                                <button class="ipr-banner-copy" id="iprCopyBtn" title="Copy IP">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <div class="ipr-banner-tags">
                                <span class="ipr-banner-tag" style="background:${barColor}20;color:${barColor}">
                                    <i class="fas ${riskIcon}"></i> ${s.reputation}
                                </span>
                                <span class="ipr-banner-tag" style="background:var(--info-bg);color:var(--info)">
                                    <i class="fas fa-flag"></i> ${s.country_code || s.country}
                                </span>
                                <span class="ipr-banner-tag" style="background:var(--accent-light);color:var(--accent)">
                                    <i class="fas fa-sitemap"></i> ${escHtml(s.asn)}
                                </span>
                                <span class="ipr-banner-tag" style="background:var(--success-bg);color:var(--success)">
                                    <i class="fas fa-building"></i> ${escHtml(s.provider_type)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="ipr-banner-score">
                        <div class="ipr-banner-score-value" style="color:${barColor}">${s.risk_score}</div>
                        <div class="ipr-banner-score-label">/ 100 risk</div>
                        <div class="ipr-banner-score-track">
                            <div class="ipr-banner-score-fill" style="width:${s.risk_score}%;background:${barColor}"></div>
                        </div>
                    </div>
                </div>

                <div class="ipr-stats-row">
                    <div class="ipr-stat-card" style="background:${barBg}">
                        <span class="ipr-stat-card-value" style="color:${barColor}">${s.risk_score}</span>
                        <span class="ipr-stat-card-label">Risk Score</span>
                    </div>
                    <div class="ipr-stat-card" style="background:var(--info-bg)">
                        <span class="ipr-stat-card-value" style="color:var(--info)">${escHtml(s.country_code || s.country)}</span>
                        <span class="ipr-stat-card-label">Country</span>
                    </div>
                    <div class="ipr-stat-card" style="background:var(--accent-light)">
                        <span class="ipr-stat-card-value" style="color:var(--accent);font-size:0.85rem">${escHtml(s.asn)}</span>
                        <span class="ipr-stat-card-label">${escHtml(s.asname)}</span>
                    </div>
                    <div class="ipr-stat-card" style="background:var(--success-bg)">
                        <span class="ipr-stat-card-value" style="color:var(--success);font-size:0.85rem">${escHtml(s.org)}</span>
                        <span class="ipr-stat-card-label">${s.city ? escHtml(s.city) : 'Organization'}</span>
                    </div>
                </div>

                <div class="ipr-toolbar">
                    <button class="btn btn-sm btn-secondary" id="iprExportJson"><i class="fas fa-download"></i> Export JSON</button>
                    <button class="btn btn-sm btn-secondary" id="iprExportPdf"><i class="fas fa-file-pdf"></i> Export PDF</button>
                </div>

                <div class="ipr-sections">
                    ${renderSection('AbuseIPDB', getLevel(data.abuseipdb?.confidence_score), renderAbuseIpDbBody(data.abuseipdb))}
                    ${renderSection('Spamhaus', data.spamhaus?.listed ? 'high' : 'low', renderSpamhausBody(data.spamhaus))}
                    ${renderSection('VirusTotal', getLevel(data.virustotal?.malicious), renderVirusTotalBody(data.virustotal))}
                    ${renderSection('TOR Exit Node', data.tor?.is_tor ? 'high' : 'low', renderTorBody(data.tor))}
                    ${renderSection('Proxy / VPN', getProxyLevel(data.proxy_vpn), renderProxyVpnBody(data.proxy_vpn))}
                    ${renderSection('ASN Information', 'low', renderAsnBody(data.asn))}
                </div>

                <div class="ipr-quick-actions">
                    <div class="ipr-qa-title"><i class="fas fa-bolt"></i> Quick Actions</div>
                    <div class="ipr-qa-grid">
                        <a href="https://whois.domaintools.com/${data.ip}" target="_blank" rel="noopener" class="ipr-qa-btn">
                            <i class="fas fa-circle-info"></i> Whois Lookup
                        </a>
                        <a href="https://dns.google/resolve?name=${data.ip}" target="_blank" rel="noopener" class="ipr-qa-btn">
                            <i class="fas fa-arrows-spin"></i> Reverse DNS
                        </a>
                        <a href="https://www.ip2location.com/demo/${data.ip}" target="_blank" rel="noopener" class="ipr-qa-btn">
                            <i class="fas fa-location-dot"></i> GeoIP Lookup
                        </a>
                        <a href="https://www.abuseipdb.com/check/${data.ip}" target="_blank" rel="noopener" class="ipr-qa-btn">
                            <i class="fas fa-flag"></i> Abuse Report
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    function getLevel(val) {
        if (val == null) return 'warn';
        if (val >= 80) return 'high';
        if (val >= 30) return 'med';
        if (val > 0) return 'med';
        return 'low';
    }

    function getProxyLevel(pv) {
        if (!pv) return 'warn';
        if (pv.is_tor || pv.is_proxy || pv.is_vpn) return 'high';
        if (pv.is_hosting) return 'med';
        return 'low';
    }

    function badge(text, level) {
        const lvl = level === 'high' ? 'high' : level === 'med' ? 'med' : 'low';
        return `<span class="ipr-badge ipr-badge-${lvl}">${escHtml(text)}</span>`;
    }

    function hr(cls, label, value) {
        return `<div class="hdr-row ${cls}"><span class="hdr-key">${label}</span><span class="hdr-val">${value}</span></div>`;
    }

    function renderSection(title, level, body) {
        const lvl = level === 'high' ? 'high' : level === 'med' ? 'med' : 'low';
        const icon = lvl === 'high' ? 'fa-circle-exclamation' : lvl === 'med' ? 'fa-triangle-exclamation' : 'fa-circle-check';
        if (body.startsWith('{error}')) {
            return `<div class="hdr-section"><div class="hdr-section-title"><i class="fas fa-triangle-exclamation"></i> ${title}</div><div class="hdr-table"><div class="hdr-row"><span class="hdr-key">Status</span><span class="hdr-val" style="color:var(--text-muted)">${escHtml(body.replace('{error}',''))}</span></div></div></div>`;
        }
        if (body.startsWith('{disabled}')) {
            return `<div class="hdr-section"><div class="hdr-section-title"><i class="fas fa-key"></i> ${title}</div><div class="hdr-table"><div class="hdr-row"><span class="hdr-key">Status</span><span class="hdr-val" style="color:var(--warning)">${escHtml(body.replace('{disabled}',''))}</span></div></div></div>`;
        }
        return `
            <div class="hdr-section">
                <div class="hdr-section-title"><i class="fas ${icon}"></i> ${title}</div>
                <div class="hdr-table">${body}</div>
            </div>
        `;
    }

    function renderAbuseIpDbBody(abuse) {
        if (!abuse) return '{error}No data available.';
        if (!abuse.enabled) return '{disabled}API key not configured. Add ABUSEIPDB_KEY to config.php.';
        if (abuse.error) return '{error}' + abuse.error;
        const lvl = abuse.confidence_score >= 80 ? 'high' : abuse.confidence_score >= 30 ? 'med' : 'low';
        const cls = lvl === 'high' ? 'hdr-status-fail' : lvl === 'med' ? 'hdr-status-warn' : 'hdr-status-pass';
        let h = hr(cls, 'Confidence Score', badge(abuse.confidence_score + '%', lvl));
        h += hr('', 'Total Reports', String(abuse.total_reports));
        h += hr('', 'Last Reported', abuse.last_reported_at ? new Date(abuse.last_reported_at).toLocaleString() : 'Never');
        h += hr(cls, 'Status', badge(abuse.reputation_status, lvl));
        if (abuse.is_whitelisted) h += hr('hdr-status-pass', 'Whitelisted', '<i class="fas fa-check-circle" style="color:var(--success)"></i> Yes');
        return h;
    }

    function renderSpamhausBody(bl) {
        if (!bl) return '{error}Check failed.';
        if (bl.note) return '{error}' + bl.note;
        if (!bl.listed) {
            return hr('hdr-status-pass', 'Listed', '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> <strong>Not Listed</strong></span>');
        }
        let h = hr('hdr-status-fail', 'Listed', '<span style="color:var(--danger)"><i class="fas fa-times-circle"></i> <strong>BLACKLISTED</strong></span>');
        if (bl.lists) bl.lists.forEach(l => { h += hr('', l.list, escHtml(l.description)); });
        return h;
    }

    function renderVirusTotalBody(vt) {
        if (!vt) return '{error}No data available.';
        if (!vt.enabled) return '{disabled}API key not configured. Add VIRUSTOTAL_KEY to config.php.';
        if (vt.error) return '{error}' + vt.error;
        const lvl = vt.malicious > 0 ? 'high' : vt.suspicious > 0 ? 'med' : 'low';
        const cls = lvl === 'high' ? 'hdr-status-fail' : lvl === 'med' ? 'hdr-status-warn' : 'hdr-status-pass';
        let h = hr('', 'Reputation Score', String(vt.reputation_score));
        h += hr(cls, 'Detection Ratio', badge(vt.detection_ratio, lvl));
        h += hr('', 'Malicious', `<span style="color:${vt.malicious > 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:700">${vt.malicious}</span> / ${vt.total_engines} engines`);
        h += hr('', 'Suspicious', `<span style="color:${vt.suspicious > 0 ? 'var(--warning)' : 'var(--text-muted)'};font-weight:700">${vt.suspicious}</span>`);
        h += hr('', 'Harmless', `<span style="color:var(--success);font-weight:700">${vt.harmless}</span>`);
        if (vt.tags && vt.tags.length) {
            h += hr('', 'Tags', vt.tags.map(t => `<span class="ipr-tag">${escHtml(t)}</span>`).join(' '));
        }
        return h;
    }

    function renderTorBody(tor) {
        if (!tor) return '{error}Check failed.';
        const isTor = tor.is_tor;
        const cls = isTor ? 'hdr-status-fail' : 'hdr-status-pass';
        const val = isTor
            ? '<span style="color:var(--danger)"><i class="fas fa-times-circle"></i> <strong>Yes — TOR Exit Node</strong></span>'
            : '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> <strong>No</strong></span>';
        let h = hr(cls, 'TOR Exit Node', val);
        h += hr('', 'Data Source', escHtml(tor.source || 'dan.me.uk'));
        return h;
    }

    function renderProxyVpnBody(pv) {
        if (!pv) return '{error}No data.';
        const indicators = [];
        if (pv.is_tor) indicators.push({ label: 'TOR Exit Node', level: 'high' });
        if (pv.is_proxy) indicators.push({ label: 'Proxy', level: 'high' });
        if (pv.is_vpn) indicators.push({ label: 'VPN', level: 'high' });
        if (pv.is_hosting) indicators.push({ label: 'Hosting', level: 'med' });
        if (pv.is_mobile) indicators.push({ label: 'Mobile', level: 'low' });
        if (!indicators.length) indicators.push({ label: 'Residential ISP', level: 'low' });
        const badges = indicators.map(i => badge(i.label, i.level)).join(' ');
        const anyHigh = indicators.some(i => i.level === 'high');
        const cls = anyHigh ? 'hdr-status-fail' : indicators.some(i => i.level === 'med') ? 'hdr-status-warn' : 'hdr-status-pass';
        let h = hr(cls, 'Connection Type', badges);
        h += hr('', 'Provider', escHtml(pv.provider));
        h += hr('', 'Confidence', badge(pv.confidence, pv.confidence === 'high' ? 'high' : 'med'));
        return h;
    }

    function renderAsnBody(asn) {
        if (!asn || asn.error) return '{error}Could not resolve ASN information.';
        let h = hr('', 'ASN', `<span class="font-mono" style="font-weight:700">${escHtml(asn.asn)}</span>`);
        h += hr('', 'Organization', escHtml(asn.org));
        h += hr('', 'ISP', escHtml(asn.isp));
        h += hr('', 'Country', escHtml(asn.country));
        h += hr('', 'City', escHtml(asn.city));
        h += hr('', 'Provider Type', escHtml(asn.provider_type || 'N/A'));
        if (asn.lat && asn.lon) h += hr('', 'Coordinates', escHtml(asn.lat + ', ' + asn.lon));
        return h;
    }

    function attachIpResultEvents(data) {
        document.getElementById('iprCopyBtn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(data.ip).then(() => {
                toast('IP copied to clipboard!', 'success');
            }).catch(() => toast('Failed to copy.', 'error'));
        });

        document.getElementById('iprExportJson')?.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ip-reputation-' + data.ip + '.json';
            a.click();
            URL.revokeObjectURL(url);
            toast('JSON exported!', 'success');
        });

        document.getElementById('iprExportPdf')?.addEventListener('click', () => {
            window.print();
        });
    }

    analyzeBtn.addEventListener('click', () => analyze(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(input.value); });
    clearBtn.addEventListener('click', () => { input.value = ''; resultDiv.innerHTML = ''; input.focus(); });

    document.querySelectorAll('.ipr-history-chip').forEach(chip => {
        chip.addEventListener('click', () => { input.value = chip.dataset.ip; analyze(input.value); });
    });
    document.getElementById('iprHistoryClear')?.addEventListener('click', () => {
        localStorage.removeItem('ip-history');
        document.querySelector('.ipr-history')?.remove();
        toast('History cleared.', 'info');
    });
}

// ============================================
// User Management (Admin only)
// ============================================
async function renderUserManagement() {
    setPageTitle('Fiefdom Registry', 'Administering the plebeian access roster');

    const body = getActiveBody();
    body.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Loading users...</span></div>';

    try {
        const users = await api('GET', 'auth/users');

        body.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-search-row">
                    <div class="search-input-wrap" style="max-width:320px">
                        <i class="fas fa-search"></i>
                        <input type="text" id="userSearch" placeholder="Search users..." autocomplete="off">
                    </div>
                    <button class="btn btn-primary" id="addUserBtn">
                        <i class="fas fa-plus"></i> Add User
                    </button>
                </div>
            </div>

            <div class="users-grid" id="usersGrid">
                ${renderUserCards(users)}
            </div>

            <!-- User Modal -->
            <div class="modal-overlay" id="userModal">
                <div class="modal modal-sm">
                    <div class="modal-header">
                        <h2 id="userModalTitle">Add User</h2>
                        <button class="modal-close" data-modal="userModal">&times;</button>
                    </div>
                    <form id="userForm">
                        <input type="hidden" name="id" id="userId">
                        <div class="modal-body">
                            <div class="form-group">
                                <label for="userUsername">Username</label>
                                <input type="text" id="userUsername" name="username" required placeholder="Choose a username">
                            </div>
                            <div class="form-group">
                                <label for="userEmail">Email</label>
                                <input type="email" id="userEmail" name="email" required placeholder="user@example.com">
                            </div>
                            <div class="form-group">
                                <label for="userPassword">Password <span class="text-muted">(leave blank to keep current)</span></label>
                                <input type="password" id="userPassword" name="password" placeholder="At least 6 characters" autocomplete="new-password">
                            </div>
                            <div class="form-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="userIsAdmin" name="is_admin">
                                    <span>Administrator</span>
                                </label>
                            </div>
                            <div class="form-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="userIsActive" name="is_active" checked>
                                    <span>Active</span>
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-modal="userModal">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="userSubmitBtn">
                                <i class="fas fa-plus"></i> Add User
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        const searchInput = document.getElementById('userSearch');
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            document.querySelectorAll('.user-card').forEach(card => {
                const match = card.dataset.search && card.dataset.search.includes(q);
                card.style.display = match ? '' : 'none';
            });
        });

        document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());

        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const u = users.find(u => u.id == btn.dataset.id);
                if (u) openUserModal(u);
            });
        });

        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.id, btn.dataset.username));
        });

        document.getElementById('userForm').addEventListener('submit', submitUserForm);

        // Close modal events
        initUserModalEvents();
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load users</h3><p>${err.message}</p></div>`;
    }
}

function renderUserCards(users) {
    if (!users.length) {
        return `<div class="empty-state"><i class="fas fa-users"></i><h3>No users found</h3></div>`;
    }

    return users.map(u => `
        <div class="user-card" data-id="${u.id}" data-search="${(u.username + ' ' + u.email).toLowerCase()}">
            <div class="user-card-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="user-card-body">
                <h3 class="user-card-name">${escHtml(u.display_name || u.username)}</h3>
                <span class="user-card-username">@${escHtml(u.username)}</span>
                <span class="user-card-email">${escHtml(u.email)}</span>
            </div>
            <div class="user-card-badges">
                ${u.is_admin ? '<span class="user-badge admin-badge"><i class="fas fa-shield-halved"></i> Admin</span>' : '<span class="user-badge user-badge-user">User</span>'}
                ${u.is_active ? '<span class="user-badge active-badge"><i class="fas fa-check-circle"></i> Active</span>' : '<span class="user-badge inactive-badge"><i class="fas fa-times-circle"></i> Inactive</span>'}
            </div>
            <div class="user-card-meta">
                Joined ${new Date(u.created_at).toLocaleDateString()}
            </div>
            <div class="user-card-actions">
                <button class="btn btn-edit edit-user-btn" data-id="${u.id}">
                    <i class="fas fa-pen"></i> Edit
                </button>
                ${u.id !== user.id ? `<button class="btn btn-delete delete-user-btn" data-id="${u.id}" data-username="${escHtml(u.username)}">
                    <i class="fas fa-trash"></i> Delete
                </button>` : ''}
            </div>
        </div>
    `).join('');
}

function openUserModal(u = null) {
    const modalTitle = document.getElementById('userModalTitle');
    const submitBtn = document.getElementById('userSubmitBtn');
    const form = document.getElementById('userForm');
    form.reset();

    document.getElementById('userId').value = '';
    document.getElementById('userIsActive').checked = true;
    document.getElementById('userIsAdmin').checked = false;
    document.getElementById('userPassword').required = true;
    document.getElementById('userPassword').placeholder = 'At least 6 characters';

    document.querySelectorAll('[data-modal="userModal"]').forEach(el => {
        el.removeEventListener('click', onUserModalClose);
        el.addEventListener('click', onUserModalClose);
    });

    if (u) {
        modalTitle.textContent = 'Edit User';
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        document.getElementById('userId').value = u.id;
        document.getElementById('userUsername').value = u.username;
        document.getElementById('userEmail').value = u.email;
        document.getElementById('userIsAdmin').checked = u.is_admin;
        document.getElementById('userIsActive').checked = u.is_active;
        document.getElementById('userPassword').required = false;
        document.getElementById('userPassword').placeholder = 'Leave blank to keep current';
    } else {
        modalTitle.textContent = 'Add User';
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add User';
    }

    openModal('userModal');
}

function onUserModalClose() {
    closeModal('userModal');
}

function initUserModalEvents() {
    const overlay = document.getElementById('userModal');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal('userModal');
    });
}

async function submitUserForm(e) {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('userUsername').value.trim(),
        email: document.getElementById('userEmail').value.trim(),
        is_admin: document.getElementById('userIsAdmin').checked,
        is_active: document.getElementById('userIsActive').checked,
    };

    const password = document.getElementById('userPassword').value;
    if (password) data.password = password;

    const method = id ? 'PUT' : 'POST';
    const path = id ? `auth/users/${id}` : 'auth/users';
    const action = id ? 'updated' : 'created';

    try {
        await api(method, path, data);
        closeModal('userModal');
        toast(`User ${action} successfully!`, 'success');
        renderUserManagement();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function confirmDeleteUser(id, username) {
    const confirmed = await showConfirmModal(
        `Delete user "${username}"? This action cannot be undone.`,
        'Delete User'
    );
    if (!confirmed) return;

    try {
        await api('DELETE', `auth/users/${id}`);
        toast('User deleted', 'success');
        renderUserManagement();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ============================================
// Snippets
// ============================================
async function renderSnippets() {
    setPageTitle('Copypasta Armory', 'Weaponized prose for the diplomatically bankrupt');

    const body = getActiveBody();

    try {
        const snippets = await api('GET', 'snippets');
        const admin = isAdmin();

        body.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-search-row">
                    <div class="search-input-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" id="snippetSearch" placeholder="Search snippets..." autocomplete="off">
                    </div>
                    ${admin ? `<button class="btn btn-primary" id="addSnippetBtn">
                        <i class="fas fa-plus"></i> Add Snippet
                    </button>` : ''}
                </div>
            </div>

            <div class="snippets-grid" id="snippetsGrid">
                ${renderSnippetCards(snippets)}
            </div>
        `;

        document.getElementById('snippetSearch').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.snippet-card');
            cards.forEach(card => {
                const s = snippets.find(x => x.id == card.dataset.id);
                const match = s && (
                    (s.title || '').toLowerCase().includes(q) ||
                    (s.content || '').toLowerCase().includes(q)
                );
                card.style.display = match ? '' : 'none';
            });
        });

        const addBtn = document.getElementById('addSnippetBtn');
        if (addBtn) addBtn.addEventListener('click', () => openSnippetModal());

        document.querySelectorAll('.edit-snippet').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const snippet = snippets.find(s => s.id == id);
                if (snippet) openSnippetModal(snippet);
            });
        });

        document.querySelectorAll('.delete-snippet').forEach(btn => {
            btn.addEventListener('click', () => {
                confirmDeleteSnippet(btn.dataset.id);
            });
        });

        document.querySelectorAll('.copy-snippet').forEach(btn => {
            btn.addEventListener('click', () => copySnippet(btn));
        });
    } catch (err) {
        body.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading snippets</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
}

function renderSnippetCards(snippets) {
    if (!snippets.length) {
        return `
            <div class="empty-state">
                <i class="fas fa-reply"></i>
                <h3>No snippets yet</h3>
                <p>Add your first email response snippet to get started.</p>
            </div>
        `;
    }

    const admin = isAdmin();

    return snippets.map(s => `
        <div class="snippet-card" data-id="${s.id}">
            <div class="snippet-card-head">
                <h3 class="snippet-title">${escHtml(s.title)}</h3>
                <span class="snippet-date">${new Date(s.updated_at).toLocaleDateString()}</span>
            </div>
            <div class="snippet-preview">${escHtml(s.content)}</div>
            <div class="snippet-card-actions">
                <button class="btn btn-copy copy-snippet" data-id="${s.id}">
                    <i class="fas fa-copy"></i> Copy
                </button>
                ${admin ? `
                <button class="btn btn-edit edit-snippet" data-id="${s.id}">
                    <i class="fas fa-pen"></i> Edit
                </button>
                <button class="btn btn-delete delete-snippet" data-id="${s.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>` : ''}
            </div>
        </div>
    `).join('');
}

function copySnippet(btn) {
    const card = btn.closest('.snippet-card');
    const preview = card.querySelector('.snippet-preview');
    let text = preview.textContent;

    // Normalize line endings and trim trailing blank lines
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopiedFeedback(btn);
            toast('Copied!', 'success');
        }).catch(() => {
            fallbackCopy(text, btn);
        });
    } else {
        fallbackCopy(text, btn);
    }
}

function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopiedFeedback(btn);
    toast('Copied!', 'success');
}

// ============================================
// Snippet Modal
// ============================================
function openSnippetModal(snippet = null) {
    const form = document.getElementById('snippetForm');
    form.reset();

    if (snippet) {
        document.getElementById('snippetModalTitle').textContent = 'Edit Snippet';
        document.getElementById('snippetSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Changes';
        document.getElementById('snippetId').value = snippet.id;
        document.getElementById('snippetTitle').value = snippet.title;
        document.getElementById('snippetContent').value = snippet.content;
    } else {
        document.getElementById('snippetModalTitle').textContent = 'Add Snippet';
        document.getElementById('snippetSubmitBtn').innerHTML = '<i class="fas fa-plus"></i> Add Snippet';
    }

    openModal('snippetModal');
}

async function saveSnippet(data) {
    const id = document.getElementById('snippetId').value;
    const method = id ? 'PUT' : 'POST';
    const path = id ? `snippets/${id}` : 'snippets';

    await api(method, path, data);
}

document.getElementById('snippetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('snippetSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const data = {
            title: document.getElementById('snippetTitle').value.trim(),
            content: document.getElementById('snippetContent').value.trim(),
        };

        await saveSnippet(data);
        closeModal('snippetModal');
        toast('Snippet saved!', 'success');
        renderSnippets();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        const isEdit = document.getElementById('snippetId').value;
        submitBtn.innerHTML = isEdit
            ? '<i class="fas fa-save"></i> Save Changes'
            : '<i class="fas fa-plus"></i> Add Snippet';
    }
});

async function confirmDeleteSnippet(id) {
    const snippet = await api('GET', `snippets/${id}`);
    const confirmed = await showConfirmModal(`Delete snippet "${snippet.title}"?`);
    if (!confirmed) return;

    try {
        await api('DELETE', `snippets/${id}`);
        toast('Snippet deleted', 'success');
        renderSnippets();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ============================================
// Category Modal
// ============================================
function openCategoryModal(cat = null) {
    const form = document.getElementById('categoryForm');
    form.reset();

    // Close manager modal first so it doesn't overlap
    closeModal('categoryManagerModal');

    if (cat) {
        document.getElementById('categoryModalTitle').textContent = 'Edit Category';
        document.getElementById('categorySubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Changes';
        document.getElementById('categoryId').value = cat.id;
        document.getElementById('categoryName').value = cat.name;
        document.getElementById('categoryColor').value = cat.color;
        document.getElementById('categoryColorHex').value = cat.color;
    } else {
        document.getElementById('categoryModalTitle').textContent = 'Add Category';
        document.getElementById('categorySubmitBtn').innerHTML = '<i class="fas fa-plus"></i> Add Category';
        document.getElementById('categoryId').value = '';
        document.getElementById('categoryColor').value = '#6c63ff';
        document.getElementById('categoryColorHex').value = '#6c63ff';
    }

    openModal('categoryModal');
}

function submitCategoryForm(e) {
    e.preventDefault();
    const id = document.getElementById('categoryId').value;
    const data = {
        name: document.getElementById('categoryName').value.trim(),
        color: document.getElementById('categoryColor').value,
        module_id: 1,
        sort_order: 0,
    };

    const method = id ? 'PUT' : 'POST';
    const path = id ? `categories/${id}` : 'categories';
    const action = id ? 'updated' : 'created';

    api(method, path, data)
        .then(() => {
            closeModal('categoryModal');
            toast(`Category ${action} successfully!`, 'success');
            refreshCategoryManager();
            openModal('categoryManagerModal');
        })
        .catch(err => toast(err.message, 'error'));
}

// ============================================
// Delete Category
// ============================================
async function confirmDeleteCategory(id) {
    const cat = state.categories.find(c => c.id == id);
    const name = cat ? cat.name : 'this category';
    const confirmed = await showConfirmModal(`Delete category "${name}"? Commands in this category will be uncategorized.`);
    if (!confirmed) return;

    api('DELETE', `categories/${id}`)
        .then(() => {
            toast('Category deleted', 'success');
            refreshCategoryManager();
        })
        .catch(err => toast(err.message, 'error'));
}

// ============================================
// Category Manager Modal
// ============================================
async function openCategoryManagerModal() {
    openModal('categoryManagerModal');

    try {
        const categories = await api('GET', 'categories?module_id=1');
        state.categories = categories;
        renderCatManagerGrid(categories);

        document.getElementById('catManagerAddBtn').addEventListener('click', () => {
            openCategoryModal();
        });

        const searchInput = document.getElementById('catManagerSearch');
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            const filtered = state.categories.filter(c =>
                c.name.toLowerCase().includes(q)
            );
            renderCatManagerGrid(filtered);
        });

        attachCatManagerEvents();
    } catch (err) {
        document.getElementById('catManagerGrid').innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load categories</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
}

function renderCatManagerGrid(categories) {
    const grid = document.getElementById('catManagerGrid');

    if (!categories.length) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <i class="fas fa-tags"></i>
                <h3>No categories yet</h3>
                <p>Create your first category to organize commands.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = categories.map(c => `
        <div class="category-card" data-id="${c.id}">
            <div class="category-card-head" style="background:${c.color}">
                <i class="fas fa-folder"></i>
            </div>
            <div class="category-card-body">
                <h3>${escHtml(c.name)}</h3>
                <p class="category-card-count">${c.command_count || 0} command${c.command_count === 1 ? '' : 's'}</p>
            </div>
            <div class="category-card-actions">
                <button class="btn btn-secondary btn-sm edit-cat-mgr-btn" data-id="${c.id}">
                    <i class="fas fa-pen"></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm delete-cat-mgr-btn" data-id="${c.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');

    attachCatManagerEvents();
}

function attachCatManagerEvents() {
    document.querySelectorAll('#catManagerGrid .edit-cat-mgr-btn').forEach(btn => {
        btn.removeEventListener('click', btn._clickHandler);
        btn._clickHandler = () => {
            const cat = state.categories.find(c => c.id == btn.dataset.id);
            if (cat) openCategoryModal(cat);
        };
        btn.addEventListener('click', btn._clickHandler);
    });

    document.querySelectorAll('#catManagerGrid .delete-cat-mgr-btn').forEach(btn => {
        btn.removeEventListener('click', btn._clickHandler);
        btn._clickHandler = () => {
            confirmDeleteCategory(btn.dataset.id);
        };
        btn.addEventListener('click', btn._clickHandler);
    });
}

async function refreshCategoryManager() {
    try {
        const categories = await api('GET', 'categories?module_id=1');
        state.categories = categories;
        renderCatManagerGrid(categories);

        const filter = document.getElementById('categoryFilter');
        if (filter) {
            const currentVal = filter.value;
            filter.innerHTML = `<option value="">All Categories</option>
                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}`;
            filter.value = currentVal;
        }

        const searchInput = document.getElementById('catManagerSearch');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            const filtered = state.categories.filter(c =>
                c.name.toLowerCase().includes(q)
            );
            renderCatManagerGrid(filtered);
        }
    } catch (err) {
        toast('Failed to refresh categories', 'error');
    }
}

// ============================================
// Page Title Helper
// ============================================
function setPageTitle(title, subtitle) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle;
}

// ============================================
// Theme
// ============================================
function initTheme() {
    const saved = localStorage.getItem('toolhub-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    const btn = document.getElementById('themeToggle');
    const icon = btn.querySelector('i');
    icon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('toolhub-theme', next);

    const icon = document.querySelector('#themeToggle i');
    icon.className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// ============================================
// Sidebar (Mobile)
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    let overlay = document.querySelector('.mobile-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active', sidebar.classList.contains('open'));
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.mobile-overlay');
    if (overlay) overlay.classList.remove('active');
}

function initSidebar() {
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

    window.addEventListener('resize', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('open');
        const overlay = document.querySelector('.mobile-overlay');
        if (overlay) overlay.classList.remove('active');
    });
}

// ============================================
// Modal Event Setup
// ============================================
function initModals() {
    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && overlay.id !== 'confirmModal') {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Cancel buttons
    document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.dataset.modal);
        });
    });

    // Command form submit
    document.getElementById('commandForm').addEventListener('submit', submitCommandForm);

    // Category form submit
    document.getElementById('categoryForm').addEventListener('submit', submitCategoryForm);

    // Color sync
    const colorInput = document.getElementById('categoryColor');
    const colorHex = document.getElementById('categoryColorHex');
    if (colorInput && colorHex) {
        colorInput.addEventListener('input', () => { colorHex.value = colorInput.value; });
        colorHex.addEventListener('input', () => {
            if (/^#[0-9a-f]{6}$/i.test(colorHex.value)) {
                colorInput.value = colorHex.value;
            }
        });
    }
}

// ============================================
// Keyboard Shortcuts
// ============================================
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
            closeSidebar();
        }
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            const search = document.getElementById('commandSearch');
            if (search) search.focus();
        }
    });
}

// ============================================
// Login Form
// ============================================
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.classList.add('loading');

        try {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            await handleLogin(username, password);
            hideLoginScreen();
            initApp();
        } catch (err) {
            loginError.textContent = err.message;
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        registerBtn.disabled = true;
        registerBtn.classList.add('loading');

        try {
            const username = document.getElementById('regUsername').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            await handleRegister(username, email, password);
            hideLoginScreen();
            initApp();
        } catch (err) {
            registerError.textContent = err.message;
            registerBtn.disabled = false;
            registerBtn.classList.remove('loading');
        }
    });

    document.getElementById('showRegisterLink').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        document.getElementById('registerLinkWrap').style.display = 'none';
        loginError.textContent = '';
    });

    document.getElementById('backToLoginBtn').addEventListener('click', () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        document.getElementById('registerLinkWrap').style.display = '';
        registerError.textContent = '';
    });

    // Enter key on password field submits login
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit'));
    });
}

async function initApp() {
    if (appInited) return;
    appInited = true;

    initModals();
    initKeyboard();
    initSidebar();
    initSidebarNav();
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await handleLogout();
        appInited = false;
        document.getElementById('contentBody').innerHTML = '';
        tabState.tabs = [];
        tabState.activeTab = null;
        renderTabBar();
        showLoginScreen();
    });

    try {
        await loadModules();
        loadTabs();
    } catch (err) {
        const body = getActiveBody();
        body.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Connection Error</h3>
                <p>Could not connect to the API. Please check your database connection and try again.</p>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">${err.message}</p>
            </div>
        `;
    }
}

// ============================================
// Text Editor
// ============================================

const rteColors = ['#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6','#3b82f6','#6c63ff','#a855f7','#ec4899','#64748b'];
const rteHighlights = ['#fef08a','#fde68a','#a7f3d0','#bfdbfe','#c4b5fd','#fbcfe8','#fecaca','#fed7aa','#e2e8f0'];
const rteEmojis = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😜','🤔','🤗','😩','😢','😭','😤','😡','🥺','😱','🤯','🥳','😴','👍','👎','👏','🙌','💪','🤝','✨','🔥','⭐','💡','📝','📌','🎯','🚀','✅','❌','❓','❗','💬','📧','🔗','🎉','💻','🖥️','📁','📂','📄','📅','⏰','🔒','🔓','💎','🌐','⚡','🎈','🏆','💯'];
const rteFontSizes = ['8','10','12','14','16','18','20','24','28','32','36','48','64'];
const rteFontFamilies = ['Arial','Georgia','Impact','Tahoma','Times New Roman','Trebuchet MS','Verdana','Courier New','Segoe UI','Inter'];

let rteState = {
    editor: null,
    isFullscreen: false,
    autoSaveTimer: null,
    searchOpen: false,
    templates: [],
};

function renderRichTextEditor() {
    setPageTitle('Semantic Forge', 'Artisanal typesetting for the aesthetically unhinged');

    const body = getActiveBody();
    rteState.templates = JSON.parse(localStorage.getItem('rte-templates') || '[]');

    body.innerHTML = `
        <div class="rte-wrap" id="rteWrap">
            <div class="rte-toolbar" id="rteToolbar">
                <div class="rte-toolbar-group">
                    <button class="rte-btn" data-cmd="bold" title="Bold (Ctrl+B)"><i class="fas fa-bold"></i></button>
                    <button class="rte-btn" data-cmd="italic" title="Italic (Ctrl+I)"><i class="fas fa-italic"></i></button>
                    <button class="rte-btn" data-cmd="underline" title="Underline (Ctrl+U)"><i class="fas fa-underline"></i></button>
                    <button class="rte-btn" data-cmd="strikeThrough" title="Strikethrough"><i class="fas fa-strikethrough"></i></button>
                    <button class="rte-btn" data-cmd="code" title="Inline Code"><i class="fas fa-code"></i></button>
                </div>
                <div class="rte-toolbar-group">
                    <select class="rte-select" id="rteHeadingSelect" title="Heading style">
                        <option value="p">Paragraph</option>
                        <option value="h1">H1</option>
                        <option value="h2">H2</option>
                        <option value="h3">H3</option>
                        <option value="h4">H4</option>
                        <option value="h5">H5</option>
                        <option value="h6">H6</option>
                    </select>
                </div>
                <div class="rte-toolbar-group">
                    <select class="rte-select" id="rteFontSize" title="Font size">
                        ${rteFontSizes.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                    <select class="rte-select" id="rteFontFamily" title="Font family">
                        ${rteFontFamilies.map(f => `<option value="${f}">${f}</option>`).join('')}
                    </select>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn" data-cmd="insertUnorderedList" title="Bullet list"><i class="fas fa-list-ul"></i></button>
                    <button class="rte-btn" data-cmd="insertOrderedList" title="Numbered list"><i class="fas fa-list-ol"></i></button>
                    <button class="rte-btn" data-cmd="checklist" title="Checklist"><i class="fas fa-check-square"></i></button>
                    <button class="rte-btn" data-cmd="blockquote" title="Blockquote"><i class="fas fa-quote-right"></i></button>
                    <button class="rte-btn" data-cmd="codeblock" title="Code block"><i class="fas fa-terminal"></i></button>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn" data-cmd="justifyLeft" title="Align left"><i class="fas fa-align-left"></i></button>
                    <button class="rte-btn" data-cmd="justifyCenter" title="Align center"><i class="fas fa-align-center"></i></button>
                    <button class="rte-btn" data-cmd="justifyRight" title="Align right"><i class="fas fa-align-right"></i></button>
                    <button class="rte-btn" data-cmd="justifyFull" title="Justify"><i class="fas fa-align-justify"></i></button>
                </div>
                <div class="rte-toolbar-group">
                    <div style="position:relative">
                        <button class="rte-btn" id="rteTextColorBtn" title="Text color"><i class="fas fa-palette"></i></button>
                        <div class="rte-color-popup" id="rteTextColorPopup" style="display:none">
                            <div class="rte-color-row">
                                ${rteColors.map(c => `<div class="rte-color-swatch" data-color="${c}" style="background:${c}"></div>`).join('')}
                            </div>
                            <div class="rte-color-row">
                                <input type="color" class="rte-color-input" id="rteTextColorInput" value="#e2e4f0">
                                <button class="rte-color-clear" id="rteTextColorClear"><i class="fas fa-undo"></i> Clear</button>
                            </div>
                        </div>
                    </div>
                    <div style="position:relative">
                        <button class="rte-btn" id="rteHighlightBtn" title="Highlight color"><i class="fas fa-highlighter"></i></button>
                        <div class="rte-color-popup" id="rteHighlightPopup" style="display:none">
                            <div class="rte-color-row">
                                ${rteHighlights.map(c => `<div class="rte-color-swatch" data-hl="${c}" style="background:${c}"></div>`).join('')}
                            </div>
                            <div class="rte-color-row">
                                <input type="color" class="rte-color-input" id="rteHighlightInput" value="#fef08a">
                                <button class="rte-color-clear" id="rteHighlightClear"><i class="fas fa-undo"></i> Clear</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn" data-cmd="link" title="Insert link"><i class="fas fa-link"></i></button>
                    <div style="position:relative">
                        <button class="rte-btn" id="rteTableBtn" title="Insert table"><i class="fas fa-table"></i></button>
                        <div class="rte-table-picker" id="rteTablePicker" style="display:none">
                            <div class="rte-table-grid" id="rteTableGrid"></div>
                            <div class="rte-table-label" id="rteTableLabel">1 x 1</div>
                        </div>
                    </div>
                    <button class="rte-btn" data-cmd="image" title="Insert image"><i class="fas fa-image"></i></button>
                    <button class="rte-btn" data-cmd="hr" title="Horizontal rule"><i class="fas fa-minus"></i></button>
                    <div style="position:relative">
                        <button class="rte-btn" id="rteEmojiBtn" title="Insert emoji"><i class="fas fa-smile"></i></button>
                        <div class="rte-emojis-popup" id="rteEmojiPopup" style="display:none">
                            ${rteEmojis.map(e => `<button class="rte-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn" data-cmd="undo" title="Undo (Ctrl+Z)"><i class="fas fa-undo"></i></button>
                    <button class="rte-btn" data-cmd="redo" title="Redo (Ctrl+Shift+Z)"><i class="fas fa-redo"></i></button>
                    <button class="rte-btn" data-cmd="clearFormatting" title="Clear formatting"><i class="fas fa-eraser"></i></button>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn rte-btn-wide" data-cmd="fullscreen" title="Fullscreen"><i class="fas fa-expand"></i> <span class="rte-btn-label">Full</span></button>
                </div>
                <div class="rte-toolbar-group">
                    <button class="rte-btn rte-btn-wide" data-cmd="search" title="Search & Replace"><i class="fas fa-search"></i></button>
                </div>
            </div>

            <div class="rte-templates-bar" id="rteTemplatesBar">
                <span class="rte-variables-label"><i class="fas fa-reply"></i> Templates:</span>
                <button class="rte-template-btn" id="rteSaveTemplateBtn"><i class="fas fa-floppy-disk"></i> Save as template</button>
                <span id="rteTemplateList"></span>
            </div>

            <div class="rte-search-bar" id="rteSearchBar" style="display:none">
                <input type="text" class="rte-search-input" id="rteSearchInput" placeholder="Search...">
                <input type="text" class="rte-search-input" id="rteReplaceInput" placeholder="Replace with...">
                <button class="rte-search-btn" id="rteSearchPrev" title="Previous"><i class="fas fa-chevron-up"></i></button>
                <button class="rte-search-btn" id="rteSearchNext" title="Next"><i class="fas fa-chevron-down"></i></button>
                <button class="rte-search-btn" id="rteSearchReplaceOne" title="Replace"><i class="fas fa-exchange-alt"></i></button>
                <button class="rte-search-btn" id="rteSearchReplaceAll" title="Replace all"><i class="fas fa-forward"></i></button>
                <span class="rte-search-count" id="rteSearchCount"></span>
                <button class="rte-search-close" id="rteSearchClose">&times;</button>
            </div>

            <div class="rte-editor-wrapper">
                <div class="rte-editor" id="rteEditor" contenteditable="true" data-placeholder="Start typing or paste your content here..."></div>
                <div class="rte-status-bar">
                    <div class="rte-status-left">
                        <span class="rte-status-item" id="rteWordCount"><i class="fas fa-pen"></i> 0 words</span>
                        <span class="rte-status-item" id="rteCharCount"><i class="fas fa-text-height"></i> 0 chars</span>
                    </div>
                    <div class="rte-status-right">
                        <span class="rte-status-item" id="rteLineCount"><i class="fas fa-bars"></i> 0 lines</span>
                        <span class="rte-saved-indicator" id="rteSavedIndicator"><i class="fas fa-check-circle"></i> Saved</span>
                    </div>
                </div>
            </div>

            <div class="rte-action-bar">
                <span class="rte-action-label"><i class="fas fa-copy"></i> Copy:</span>
                <button class="rte-btn-copy-all" id="rteCopyAllBtn">
                    <i class="fas fa-copy"></i> Copy All
                </button>
                <button class="rte-btn-copy-plain" id="rteCopyPlainBtn">
                    <i class="fas fa-file-lines"></i> Plain Text
                </button>
                <div class="rte-export-group">
                    <button class="rte-export-btn" id="rteExportHtmlBtn"><i class="fas fa-code"></i> HTML</button>
                    <button class="rte-export-btn" id="rteExportMdBtn"><i class="fas fa-markdown"></i> MD</button>
                    <button class="rte-export-btn" id="rteExportTxtBtn"><i class="fas fa-file-export"></i> TXT</button>
                </div>
                <div class="rte-quicknote-sep"></div>
                <button class="rte-quicknote-btn" id="rteQuickNoteBtn">
                    <span class="rte-quicknote-icon"><i class="fas fa-bolt"></i></span>
                    <span class="rte-quicknote-text">Quick Note</span>
                    <span class="rte-qn-badge" id="rteQnBadge"></span>
                </button>
            </div>
        </div>
    `;

    // Quick Note Modal
    const noteModal = document.createElement('div');
    noteModal.id = 'rteQuickNoteModal';
    noteModal.className = 'rte-qn-modal-overlay';
    noteModal.innerHTML = `
        <div class="rte-qn-modal">
            <div class="rte-qn-header">
                <div class="rte-qn-title"><i class="fas fa-bolt"></i> Quick Notes</div>
                <button class="rte-qn-close" id="rteQnClose"><i class="fas fa-times"></i></button>
            </div>
            <div class="rte-qn-body">
                <div class="rte-qn-input-area">
                    <textarea class="rte-qn-textarea" id="rteQnInput" placeholder="Type a note..." rows="3"></textarea>
                    <button class="rte-qn-add-btn" id="rteQnAdd"><i class="fas fa-plus"></i> Save</button>
                </div>
                <div class="rte-qn-list" id="rteQnList"></div>
            </div>
        </div>
    `;
    document.body.appendChild(noteModal);

    rteInit();
}

function rteInit() {
    rteState.editor = document.getElementById('rteEditor');

    rteLoadContent();
    rteAutoLink();
    rteInitToolbar();
    rteInitEditorEvents();
    rteInitImageObserver();
    rteRenderTemplates();
    rteUpdateStats();
    rteInitQuickNotes();
}

function rteInitToolbar() {
    // Toolbar command buttons
    document.querySelectorAll('.rte-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cmd = btn.dataset.cmd;
            rteHandleCommand(cmd);
        });
    });

    // Heading select
    document.getElementById('rteHeadingSelect').addEventListener('change', function() {
        const val = this.value;
        if (val === 'p') {
            document.execCommand('formatBlock', false, 'p');
        } else {
            document.execCommand('formatBlock', false, `<${val}>`);
        }
        rteState.editor.focus();
        rteScheduleAutoSave();
    });

    // Font size
    document.getElementById('rteFontSize').addEventListener('change', function() {
        document.execCommand('fontSize', false, this.value);
        rteState.editor.focus();
        rteScheduleAutoSave();
    });

    // Font family
    document.getElementById('rteFontFamily').addEventListener('change', function() {
        document.execCommand('fontName', false, this.value);
        rteState.editor.focus();
        rteScheduleAutoSave();
    });

    // Text color
    const textColorBtn = document.getElementById('rteTextColorBtn');
    const textColorPopup = document.getElementById('rteTextColorPopup');

    textColorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rteCloseAllPopups(textColorPopup);
        textColorPopup.style.display = textColorPopup.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('#rteTextColorPopup .rte-color-swatch').forEach(el => {
        el.addEventListener('click', () => {
            document.execCommand('foreColor', false, el.dataset.color);
            textColorPopup.style.display = 'none';
            rteState.editor.focus();
        });
    });

    document.getElementById('rteTextColorInput').addEventListener('input', function() {
        document.execCommand('foreColor', false, this.value);
    });

    document.getElementById('rteTextColorClear').addEventListener('click', () => {
        document.execCommand('foreColor', false, '#e2e4f0');
        textColorPopup.style.display = 'none';
        rteState.editor.focus();
    });

    // Highlight color
    const hlBtn = document.getElementById('rteHighlightBtn');
    const hlPopup = document.getElementById('rteHighlightPopup');

    hlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rteCloseAllPopups(hlPopup);
        hlPopup.style.display = hlPopup.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('#rteHighlightPopup .rte-color-swatch').forEach(el => {
        el.addEventListener('click', () => {
            document.execCommand('backColor', false, el.dataset.hl);
            hlPopup.style.display = 'none';
            rteState.editor.focus();
        });
    });

    document.getElementById('rteHighlightInput').addEventListener('input', function() {
        document.execCommand('backColor', false, this.value);
    });

    document.getElementById('rteHighlightClear').addEventListener('click', () => {
        document.execCommand('backColor', false, 'transparent');
        hlPopup.style.display = 'none';
        rteState.editor.focus();
    });

    // Link
    document.querySelector('[data-cmd="link"]')?.addEventListener('click', rteInsertLink);

    // Image
    document.querySelector('[data-cmd="image"]')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => rteInsertImage(ev.target.result, file.name);
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });

    // HR
    document.querySelector('[data-cmd="hr"]')?.addEventListener('click', () => {
        document.execCommand('insertHorizontalRule', false, null);
        rteScheduleAutoSave();
    });

    // Emoji picker
    const emojiBtn = document.getElementById('rteEmojiBtn');
    const emojiPopup = document.getElementById('rteEmojiPopup');

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rteCloseAllPopups(emojiPopup);
        emojiPopup.style.display = emojiPopup.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('.rte-emoji-btn').forEach(el => {
        el.addEventListener('click', () => {
            document.execCommand('insertText', false, el.dataset.emoji);
            emojiPopup.style.display = 'none';
            rteState.editor.focus();
        });
    });

    // Table picker
    const tableBtn = document.getElementById('rteTableBtn');
    const tablePicker = document.getElementById('rteTablePicker');
    const tableGrid = document.getElementById('rteTableGrid');
    const tableLabel = document.getElementById('rteTableLabel');

    tableBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rteCloseAllPopups(tablePicker);
        tablePicker.style.display = tablePicker.style.display === 'none' ? 'block' : 'none';
    });

    let tableRows = 1, tableCols = 1;
    function renderTableGrid() {
        tableGrid.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                cell.className = `rte-table-cell ${r < tableRows && c < tableCols ? 'active' : ''}`;
                cell.dataset.row = r + 1;
                cell.dataset.col = c + 1;
                cell.addEventListener('click', () => {
                    rteInsertTable(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
                    tablePicker.style.display = 'none';
                });
                cell.addEventListener('mouseenter', () => {
                    tableRows = parseInt(cell.dataset.row);
                    tableCols = parseInt(cell.dataset.col);
                    tableLabel.textContent = `${tableRows} x ${tableCols}`;
                    renderTableGrid();
                });
                tableGrid.appendChild(cell);
            }
        }
    }
    renderTableGrid();

    // Copy All (with formatting) — the big button
    document.getElementById('rteCopyAllBtn').addEventListener('click', rteCopyFormatted);

    // Copy plain text
    document.getElementById('rteCopyPlainBtn').addEventListener('click', rteCopyPlainText);

    // Export HTML
    document.getElementById('rteExportHtmlBtn').addEventListener('click', rteExportHTML);

    // Export Markdown
    document.getElementById('rteExportMdBtn').addEventListener('click', rteExportMarkdown);

    // Export Plain Text
    document.getElementById('rteExportTxtBtn').addEventListener('click', rteExportPlainText);

    // Save template
    document.getElementById('rteSaveTemplateBtn').addEventListener('click', rteSaveTemplate);

    // Search & Replace
    const searchBtn = document.querySelector('[data-cmd="search"]');
    const searchBar = document.getElementById('rteSearchBar');
    searchBtn.addEventListener('click', () => {
        rteSearchOpen();
    });

    document.getElementById('rteSearchClose').addEventListener('click', rteSearchClose);
    document.getElementById('rteSearchInput').addEventListener('input', rteSearchDo);
    document.getElementById('rteSearchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); rteSearchNext(); }
    });
    document.getElementById('rteReplaceInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); rteSearchReplace(); }
    });
    document.getElementById('rteSearchNext').addEventListener('click', rteSearchNext);
    document.getElementById('rteSearchPrev').addEventListener('click', rteSearchPrev);
    document.getElementById('rteSearchReplaceOne').addEventListener('click', rteSearchReplace);
    document.getElementById('rteSearchReplaceAll').addEventListener('click', rteSearchReplaceAll);

    // Click outside to close popups
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.rte-color-popup') && !e.target.closest('.rte-emojis-popup') && !e.target.closest('.rte-table-picker')) {
            document.querySelectorAll('.rte-color-popup, .rte-emojis-popup, .rte-table-picker, .rte-link-popup').forEach(p => p.style.display = 'none');
        }
    });
}

function rteCloseAllPopups(except) {
    document.querySelectorAll('.rte-color-popup, .rte-emojis-popup, .rte-table-picker').forEach(p => {
        if (p !== except) p.style.display = 'none';
    });
}

function rteHandleCommand(cmd) {
    const ed = rteState.editor;
    ed.focus();

    switch (cmd) {
        case 'bold':
        case 'italic':
        case 'underline':
        case 'strikeThrough':
            document.execCommand(cmd, false, null);
            break;
        case 'code':
            document.execCommand('insertHTML', false, '<code>\u200B</code>');
            break;
        case 'insertUnorderedList':
        case 'insertOrderedList':
            document.execCommand(cmd, false, null);
            break;
        case 'checklist':
            rteInsertChecklist();
            break;
        case 'blockquote':
            document.execCommand('formatBlock', false, 'blockquote');
            break;
        case 'codeblock':
            document.execCommand('insertHTML', false, '<pre><code>\n\n</code></pre>');
            break;
        case 'justifyLeft':
        case 'justifyCenter':
        case 'justifyRight':
        case 'justifyFull':
            document.execCommand(cmd, false, null);
            break;
        case 'undo':
            document.execCommand('undo', false, null);
            break;
        case 'redo':
            document.execCommand('redo', false, null);
            break;
        case 'clearFormatting':
            rteClearFormatting();
            break;
        case 'fullscreen':
            rteToggleFullscreen();
            return;
        case 'search':
            rteSearchOpen();
            return;
        case 'link':
            rteInsertLink();
            return;
        default:
            return;
    }

    rteScheduleAutoSave();
    rteUpdateStats();
}

function rteAutoLink() {
    const ed = rteState.editor;
    if (!ed) return;
    const urlRe = /(?<!["\'>])(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+\.[^\s<>"')\]]+)/gi;
    const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walk.nextNode()) textNodes.push(walk.currentNode);

    for (const node of textNodes) {
        if (node.parentNode && node.parentNode.closest && node.parentNode.closest('a[href]')) continue;
        const text = node.textContent;
        if (!urlRe.test(text)) { urlRe.lastIndex = 0; continue; }
        urlRe.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        let match;
        while ((match = urlRe.exec(text)) !== null) {
            if (match.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
            const url = match[0].startsWith('http') ? match[0] : 'https://' + match[0];
            const a = document.createElement('a');
            a.href = url;
            a.textContent = match[0];
            a.target = '_blank';
            frag.appendChild(a);
            lastIdx = match.index + match[0].length;
        }
        if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        node.parentNode.replaceChild(frag, node);
    }
}

function rteInitEditorEvents() {
    const ed = rteState.editor;

    ed.addEventListener('input', () => {
        rteAutoLink();
        rteUpdateStats();
        rteScheduleAutoSave();
    });

    ed.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertHTML', false, '    ');
        }
    });

    // Selection change for toolbar state
    document.addEventListener('selectionchange', rteUpdateToolbarState);

    // Paste handling
    ed.addEventListener('paste', rteHandlePaste);

    // Drag & drop for images
    ed.addEventListener('dragover', (e) => e.preventDefault());
    ed.addEventListener('drop', rteHandleDrop);

    // Keyboard shortcuts
    ed.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'b') { e.preventDefault(); rteHandleCommand('bold'); }
        if (e.ctrlKey && e.key === 'i') { e.preventDefault(); rteHandleCommand('italic'); }
        if (e.ctrlKey && e.key === 'u') { e.preventDefault(); rteHandleCommand('underline'); }
        if (e.ctrlKey && e.key === 'z') {
            if (e.shiftKey) { e.preventDefault(); rteHandleCommand('redo'); }
            else { e.preventDefault(); rteHandleCommand('undo'); }
        }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); rteHandleCommand('redo'); }
        if (e.ctrlKey && e.key === 'k') { e.preventDefault(); rteInsertLink(); }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); rteSearchOpen(); }
    });

    // Auto-save on blur
    ed.addEventListener('blur', () => rteSaveNow());

    rteUpdateStats();
}

// ── Image resize ──

let rteImgObserver = null;
let rteSelectedBox = null;
let rteHandleEl = null;
let rteBadgeEl = null;
let rteResizeActive = false;

function rteInitImageObserver() {
    if (rteImgObserver) rteImgObserver.disconnect();
    rteImgObserver = new MutationObserver(() => rteWrapImages());
    rteImgObserver.observe(rteState.editor, { childList: true, subtree: true });
    rteWrapImages();
}

function rteWrapImages() {
    if (!rteState.editor) return;
    rteState.editor.querySelectorAll('img:not(.rte-wrapped)').forEach(img => {
        if (img.closest('.rte-img-box')) return;
        const box = document.createElement('span');
        box.className = 'rte-img-box';
        img.classList.add('rte-wrapped');
        img.parentNode.insertBefore(box, img);
        box.appendChild(img);
    });
}

// Click on img-box to select, click elsewhere to deselect
document.addEventListener('mousedown', function(e) {
    if (!rteState.editor) return;
    const box = e.target.closest('.rte-img-box');
    if (box && rteState.editor.contains(box)) {
        rteSelectBox(box);
        e.preventDefault();
        return;
    }
    if (rteSelectedBox) rteDeselectBox();
});

function rteSelectBox(box) {
    if (rteSelectedBox === box) return;
    rteDeselectBox();
    rteSelectedBox = box;
    box.classList.add('selected');

    rteHandleEl = document.createElement('div');
    rteHandleEl.className = 'rte-img-resize-handle';
    rteHandleEl.addEventListener('mousedown', rteStartResize);
    document.body.appendChild(rteHandleEl);

    rteBadgeEl = document.createElement('div');
    rteBadgeEl.className = 'rte-img-size-badge';
    document.body.appendChild(rteBadgeEl);

    rteUpdateOverlay();
}

function rteDeselectBox() {
    if (rteSelectedBox) {
        rteSelectedBox.classList.remove('selected');
        rteSelectedBox = null;
    }
    if (rteHandleEl) {
        rteHandleEl.removeEventListener('mousedown', rteStartResize);
        rteHandleEl.remove();
        rteHandleEl = null;
    }
    if (rteBadgeEl) {
        rteBadgeEl.remove();
        rteBadgeEl = null;
    }
    rteResizeActive = false;
}

function rteUpdateOverlay() {
    if (!rteSelectedBox) return;
    const img = rteSelectedBox.querySelector('img');
    if (!img) return;
    const ir = img.getBoundingClientRect();
    if (rteHandleEl) {
        rteHandleEl.style.left = (ir.right - 9) + 'px';
        rteHandleEl.style.top = (ir.bottom - 9) + 'px';
    }
    if (rteBadgeEl) {
        rteBadgeEl.textContent = img.width + ' × ' + img.height + ' px';
        rteBadgeEl.style.left = (ir.left + ir.width / 2) + 'px';
        rteBadgeEl.style.top = (ir.bottom + 10) + 'px';
    }
}

document.addEventListener('scroll', rteUpdateOverlay, true);
window.addEventListener('resize', rteUpdateOverlay);

function rteStartResize(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!rteSelectedBox) return;
    rteResizeActive = true;
    const box = rteSelectedBox;
    const img = box.querySelector('img');
    if (!img) return;
    const startX = e.clientX;
    const startW = box.offsetWidth;
    const aspect = img.naturalHeight / img.naturalWidth || 1;
    img.style.height = 'auto';

    function onMove(ev) {
        if (!rteResizeActive || !rteSelectedBox) return;
        const dx = ev.clientX - startX;
        let newW = Math.max(60, startW + dx);
        box.style.width = newW + 'px';
        rteUpdateOverlay();
    }

    function onUp() {
        rteResizeActive = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function rteUpdateToolbarState() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    // Update heading select
    const headingSelect = document.getElementById('rteHeadingSelect');
    let node = sel.focusNode;
    if (node) {
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== rteState.editor) {
            const tag = node.tagName ? node.tagName.toLowerCase() : '';
            if (['h1','h2','h3','h4','h5','h6','p','blockquote','pre'].includes(tag)) {
                headingSelect.value = tag;
                break;
            }
            node = node.parentElement;
        }
        if (node === rteState.editor) headingSelect.value = 'p';
    }

    // Update active states for formatting buttons
    const cmds = ['bold','italic','underline','strikeThrough'];
    cmds.forEach(cmd => {
        const active = document.queryCommandState(cmd);
        document.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
            btn.classList.toggle('active', active);
        });
    });

    // Check alignment
    const alignCmds = ['justifyLeft','justifyCenter','justifyRight','justifyFull'];
    alignCmds.forEach(cmd => {
        const active = document.queryCommandState(cmd);
        document.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
            btn.classList.toggle('active', active);
        });
    });

    // Check lists
    const listCmds = ['insertUnorderedList','insertOrderedList'];
    listCmds.forEach(cmd => {
        const active = document.queryCommandState(cmd);
        document.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
            btn.classList.toggle('active', active);
        });
    });
}

function rteClearFormatting() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    if (range.collapsed) return;

    // Remove inline styles from selected content
    const ancestor = range.commonAncestorContainer;
    const ed = rteState.editor;
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: (n) => {
                return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        }
    );

    // Remove inline styles from selected nodes
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) {
            n.removeAttribute('style');
            if (['B','I','U','S','STRONG','EM'].includes(n.tagName)) {
                const parent = n.parentNode;
                while (n.firstChild) parent.insertBefore(n.firstChild, n);
                parent.removeChild(n);
            }
        }
    });

    document.execCommand('removeFormat', false, null);
    rteScheduleAutoSave();
    rteUpdateStats();
}

function rteInsertLink() {
    const sel = window.getSelection();
    const selectedText = sel.toString().trim() || '';

    // Create a popup
    const existingPopup = document.querySelector('.rte-link-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'rte-link-popup';
    popup.style.display = 'block';
    popup.innerHTML = `
        <div class="rte-link-input-group">
            <input type="text" class="rte-link-input" id="rteLinkUrl" placeholder="https://..." value="https://">
        </div>
        <div class="rte-link-input-group">
            <input type="text" class="rte-link-input" id="rteLinkText" placeholder="Display text (optional)" value="${escHtml(selectedText)}">
            <button class="rte-link-btn" id="rteLinkApply">Apply</button>
        </div>
    `;

    const linkBtn = document.querySelector('[data-cmd="link"]');
    linkBtn.parentElement.appendChild(popup);

    const urlInput = popup.querySelector('#rteLinkUrl');
    const textInput = popup.querySelector('#rteLinkText');
    const applyBtn = popup.querySelector('#rteLinkApply');

    urlInput.focus();
    urlInput.select();

    function insertLink() {
        let url = urlInput.value.trim();
        let text = textInput.value.trim();

        if (!url) { popup.remove(); return; }
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
            url = 'https://' + url;
        }

        if (selectedText) {
            // Replace selection with link
            document.execCommand('insertHTML', false, `<a href="${escHtml(url)}" target="_blank">${escHtml(text || url)}</a>`);
        } else {
            // Insert a new link
            document.execCommand('insertHTML', false, `<a href="${escHtml(url)}" target="_blank">${escHtml(text || url)}</a>`);
        }

        popup.remove();
        rteState.editor.focus();
        rteScheduleAutoSave();
    }

    applyBtn.addEventListener('click', insertLink);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } });
    textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } });

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function linkPopupClose(e) {
            if (!e.target.closest('.rte-link-popup') && !e.target.closest('[data-cmd="link"]')) {
                popup.remove();
                document.removeEventListener('click', linkPopupClose);
            }
        });
    }, 0);
}

function rteInsertTable(rows, cols) {
    let html = '<table><tbody>';
    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            const tag = r === 0 ? 'th' : 'td';
            html += `<${tag}><br></${tag}>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
    rteState.editor.focus();
    rteScheduleAutoSave();
}

function rteInsertChecklist() {
    const html = '<ul data-type="checklist"><li><input class="rte-checkbox" type="checkbox"> Task item</li></ul>';
    document.execCommand('insertHTML', false, html);
    rteState.editor.focus();
    rteScheduleAutoSave();
}

function rteInsertImage(src, alt) {
    const html = `<img src="${escHtml(src)}" alt="${escHtml(alt || '')}" loading="lazy">`;
    document.execCommand('insertHTML', false, html);
    rteState.editor.focus();
    rteScheduleAutoSave();
}

function rteHandlePaste(e) {
    e.preventDefault();
    const items = e.clipboardData.items;
    let hasImage = false;

    // Check for image paste
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
            hasImage = true;
            const file = items[i].getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => rteInsertImage(ev.target.result, file.name);
                reader.readAsDataURL(file);
            }
            return;
        }
    }

    // Paste as plain text by default
    const text = e.clipboardData.getData('text/plain');
    if (text) {
        document.execCommand('insertText', false, text);
        rteAutoLink();
    }
    rteScheduleAutoSave();
}

function rteHandleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => rteInsertImage(ev.target.result, files[i].name);
                reader.readAsDataURL(files[i]);
            }
        }
    }
}

function rteUpdateStats() {
    const ed = rteState.editor;
    const text = ed.textContent || '';

    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const charCount = text.length;
    const lineCount = Math.max(1, ed.innerHTML.split('<br>').length + ed.innerHTML.split('</p>').length - 1);

    document.getElementById('rteWordCount').innerHTML = `<i class="fas fa-pen"></i> ${wordCount} word${wordCount !== 1 ? 's' : ''}`;
    document.getElementById('rteCharCount').innerHTML = `<i class="fas fa-text-height"></i> ${charCount} char${charCount !== 1 ? 's' : ''}`;
    document.getElementById('rteLineCount').innerHTML = `<i class="fas fa-bars"></i> ${lineCount} line${lineCount !== 1 ? 's' : ''}`;
}

function rteScheduleAutoSave() {
    clearTimeout(rteState.autoSaveTimer);
    rteState.autoSaveTimer = setTimeout(rteSaveNow, 1500);
}

function rteSaveNow() {
    const ed = rteState.editor;
    if (!ed) return;
    localStorage.setItem('rte-content', ed.innerHTML);
    const indicator = document.getElementById('rteSavedIndicator');
    if (indicator) {
        indicator.innerHTML = '<i class="fas fa-check-circle" style="color:var(--success)"></i> Saved';
        clearTimeout(indicator._resetTimer);
        indicator._resetTimer = setTimeout(() => {
            indicator.innerHTML = '<i class="fas fa-check-circle"></i> Saved';
        }, 3000);
    }
}

function rteLoadContent() {
    const ed = rteState.editor;
    const saved = localStorage.getItem('rte-content');
    if (saved && saved.trim()) {
        ed.innerHTML = saved;
    } else {
        ed.innerHTML = '<p>Start typing or paste your content here...</p>';
    }
}

function rteSaveContent() {
    localStorage.setItem('rte-content', rteState.editor.innerHTML);
}

function rteToggleFullscreen() {
    rteState.isFullscreen = !rteState.isFullscreen;
    document.body.classList.toggle('rte-fullscreen', rteState.isFullscreen);
    const icon = document.querySelector('[data-cmd="fullscreen"] i');
    if (rteState.isFullscreen) {
        icon.className = 'fas fa-compress';
        setTimeout(() => rteState.editor.focus(), 100);
    } else {
        icon.className = 'fas fa-expand';
    }
}

// ============================================
// Search & Replace
// ============================================

let rteSearchMatches = [];
let rteSearchCurrentIdx = -1;

function rteSearchOpen() {
    const bar = document.getElementById('rteSearchBar');
    bar.style.display = 'flex';
    document.getElementById('rteSearchInput').value = '';
    document.getElementById('rteReplaceInput').value = '';
    document.getElementById('rteSearchCount').textContent = '';
    rteSearchMatches = [];
    rteSearchCurrentIdx = -1;
    document.getElementById('rteSearchInput').focus();
}

function rteSearchClose() {
    document.getElementById('rteSearchBar').style.display = 'none';
    rteClearHighlights();
    rteState.editor.focus();
}

function rteSearchDo() {
    rteClearHighlights();
    const q = document.getElementById('rteSearchInput').value;
    if (!q) {
        document.getElementById('rteSearchCount').textContent = '';
        rteSearchMatches = [];
        return;
    }

    const ed = rteState.editor;
    const html = ed.innerHTML;
    const lowerHtml = html.toLowerCase();
    const lowerQ = q.toLowerCase();

    rteSearchMatches = [];
    let idx = 0;
    while ((idx = lowerHtml.indexOf(lowerQ, idx)) !== -1) {
        rteSearchMatches.push(idx);
        idx += lowerQ.length;
    }

    rteSearchCurrentIdx = -1;

    if (rteSearchMatches.length === 0) {
        document.getElementById('rteSearchCount').textContent = 'No matches';
        return;
    }

    document.getElementById('rteSearchCount').textContent = `${rteSearchMatches.length} match${rteSearchMatches.length !== 1 ? 'es' : ''}`;

    // Highlight all matches in the content
    rteHighlightMatches(lowerQ);
    rteSearchGoTo(0);
}

function rteHighlightMatches(lowerQ) {
    const ed = rteState.editor;
    // We need to walk text nodes and wrap matches
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        let idx = 0;
        let result = [];
        let lastIdx = 0;

        while ((idx = lowerText.indexOf(lowerQ, idx)) !== -1) {
            if (idx > lastIdx) result.push(document.createTextNode(text.slice(lastIdx, idx)));
            const mark = document.createElement('mark');
            mark.className = 'rte-highlight';
            mark.textContent = text.slice(idx, idx + lowerQ.length);
            result.push(mark);
            idx += lowerQ.length;
            lastIdx = idx;
        }
        if (lastIdx < text.length) result.push(document.createTextNode(text.slice(lastIdx)));

        if (result.length > 0) {
            const parent = node.parentNode;
            result.forEach(n => parent.insertBefore(n, node));
            parent.removeChild(node);
        }
    });
}

function rteClearHighlights() {
    const ed = rteState.editor;
    ed.querySelectorAll('.rte-highlight').forEach(mark => {
        const parent = mark.parentNode;
        const text = document.createTextNode(mark.textContent);
        parent.insertBefore(text, mark);
        parent.removeChild(mark);
        parent.normalize();
    });
}

function rteSearchGoTo(idx) {
    if (rteSearchMatches.length === 0) return;
    rteSearchCurrentIdx = (idx + rteSearchMatches.length) % rteSearchMatches.length;

    const ed = rteState.editor;
    const marks = ed.querySelectorAll('.rte-highlight');
    marks.forEach((m, i) => {
        m.classList.toggle('rte-selected-text', i === rteSearchCurrentIdx);
        if (i === rteSearchCurrentIdx) {
            m.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Select the text
            const range = document.createRange();
            range.selectNodeContents(m);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    });

    document.getElementById('rteSearchCount').textContent =
        `${rteSearchCurrentIdx + 1} / ${rteSearchMatches.length}`;
}

function rteSearchNext() { rteSearchGoTo(rteSearchCurrentIdx + 1); }
function rteSearchPrev() { rteSearchGoTo(rteSearchCurrentIdx - 1); }

function rteSearchReplace() {
    const q = document.getElementById('rteSearchInput').value;
    const replaceWith = document.getElementById('rteReplaceInput').value;
    if (!q) return;

    // Replace current selection if it's a highlighted match
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const node = sel.focusNode;
        const mark = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (mark && mark.classList && mark.classList.contains('rte-highlight')) {
            mark.textContent = replaceWith;
            mark.classList.remove('rte-highlight', 'rte-selected-text');
            rteScheduleAutoSave();
            rteSearchDo();
            rteSearchGoTo(rteSearchCurrentIdx);
            return;
        }
    }

    // Fallback: find and replace first match
    const ed = rteState.editor;
    const html = ed.innerHTML;
    const lowerHtml = html.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerHtml.indexOf(lowerQ);
    if (idx !== -1) {
        ed.innerHTML = html.slice(0, idx) + escHtml(replaceWith) + html.slice(idx + q.length);
        rteScheduleAutoSave();
        rteSearchDo();
        rteSearchGoTo(rteSearchCurrentIdx);
    }
}

function rteSearchReplaceAll() {
    const q = document.getElementById('rteSearchInput').value;
    const replaceWith = document.getElementById('rteReplaceInput').value;
    if (!q) return;

    const ed = rteState.editor;
    const html = ed.innerHTML;
    const lowerHtml = html.toLowerCase();
    const lowerQ = q.toLowerCase();

    let result = '';
    let lastIdx = 0;
    let idx = 0;
    let count = 0;
    while ((idx = lowerHtml.indexOf(lowerQ, idx)) !== -1) {
        result += html.slice(lastIdx, idx) + escHtml(replaceWith);
        idx += lowerQ.length;
        lastIdx = idx;
        count++;
    }
    result += html.slice(lastIdx);

    if (count > 0) {
        ed.innerHTML = result;
        rteScheduleAutoSave();
        rteSearchDo();
        toast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
    }
}

// ============================================
// Copy & Export Functions
// ============================================

function rteCopyPlainText() {
    const text = rteConvertToPlainText();
    const btn = document.getElementById('rteCopyPlainBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
    rteCopyToClipboard(text, 'Plain text copied to clipboard!');
}

function rteCopyFormatted() {
    const rawHtml = rteState.editor.innerHTML;

    const tmp = document.createElement('div');
    tmp.innerHTML = rawHtml;
    tmp.querySelectorAll('.rte-img-box').forEach(box => {
        const img = box.querySelector('img');
        if (img) {
            const w = box.offsetWidth || img.naturalWidth;
            if (w) {
                img.setAttribute('width', w);
                img.style.width = w + 'px';
                img.style.height = 'auto';
            }
            box.parentNode.replaceChild(img, box);
        }
    });
    tmp.querySelectorAll('[class]').forEach(el => {
        el.removeAttribute('class');
    });
    const html = tmp.innerHTML;
    const plainText = rteConvertToPlainText();

    function showCopied() {
        const btn = document.getElementById('rteCopyAllBtn');
        if (btn) {
            const orig = btn.innerHTML;
            btn.classList.add('copied');
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = orig;
            }, 2500);
        }
    }

    if (navigator.clipboard && navigator.clipboard.write) {
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText,
        });
        navigator.clipboard.write([clipboardItem]).then(() => {
            showCopied();
            toast('Content copied!', 'success');
        }).catch(() => {
            navigator.clipboard.writeText(html).then(() => {
                showCopied();
                toast('Content copied!', 'success');
            }).catch(() => toast('Failed to copy', 'error'));
        });
    } else {
        navigator.clipboard.writeText(html).then(() => {
            showCopied();
            toast('Content copied!', 'success');
        }).catch(() => toast('Failed to copy', 'error'));
    }
}

function rteExportHTML() {
    const rawHtml = rteState.editor.innerHTML;
    const tmp = document.createElement('div');
    tmp.innerHTML = rawHtml;
    tmp.querySelectorAll('.rte-img-box').forEach(box => {
        const img = box.querySelector('img');
        if (img) {
            const w = box.offsetWidth || img.naturalWidth;
            if (w) {
                img.setAttribute('width', w);
                img.style.width = w + 'px';
                img.style.height = 'auto';
            }
            box.parentNode.replaceChild(img, box);
        }
    });
    tmp.querySelectorAll('[class]').forEach(el => {
        el.removeAttribute('class');
    });
    const html = tmp.innerHTML;
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Document</title></head>
<body>
${html}
</body>
</html>`;
    rteDownloadFile(fullHtml, 'document.html', 'text/html');
    toast('HTML exported!', 'success');
}

function rteExportMarkdown() {
    const md = rteConvertToMarkdown();
    rteDownloadFile(md, 'document.md', 'text/markdown');
    toast('Markdown exported!', 'success');
}

function rteExportPlainText() {
    const text = rteConvertToPlainText();
    rteDownloadFile(text, 'document.txt', 'text/plain');
    toast('Plain text exported!', 'success');
}

function rteDownloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function rteCopyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            toast(successMsg, 'success');
        }).catch(() => {
            rteFallbackCopy(text);
        });
    } else {
        rteFallbackCopy(text);
    }
}

function rteFallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        toast('Copied!', 'success');
    } catch (_) {
        toast('Failed to copy', 'error');
    }
    document.body.removeChild(ta);
}

// ============================================
// Plain Text Conversion with Structure Preservation
// ============================================

function rteConvertToPlainText() {
    const ed = rteState.editor;
    const clone = ed.cloneNode(true);
    return rteNodeToPlainText(clone, 0);
}

function rteNodeToPlainText(node, depth) {
    let text = '';

    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            const inner = rteNodeToPlainText(child, depth + 1);

            switch (tag) {
                case 'br':
                    text += '\n';
                    break;
                case 'p':
                case 'div':
                    text += inner;
                    if (!inner.endsWith('\n')) text += '\n\n';
                    else if (!inner.endsWith('\n\n')) text += '\n';
                    break;
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                    text += inner + '\n\n';
                    break;
                case 'blockquote':
                    text += inner.split('\n').map(l => l.trim() ? `> ${l}` : l).join('\n') + '\n\n';
                    break;
                case 'pre':
                    text += inner + '\n\n';
                    break;
                case 'li': {
                    const parent = child.parentElement;
                    const parentTag = parent ? parent.tagName.toLowerCase() : '';
                    const isOl = parentTag === 'ol';
                    const isChecklist = parent && parent.dataset.type === 'checklist';

                    // Compute depth for nested lists
                    let listDepth = -1;
                    let p = child.parentElement;
                    while (p) {
                        if (p.tagName && (p.tagName.toLowerCase() === 'ul' || p.tagName.toLowerCase() === 'ol')) listDepth++;
                        if (p === node) break;
                        p = p.parentElement;
                    }

                    const indent = '  '.repeat(Math.max(0, listDepth));

                    if (isChecklist) {
                        const checkbox = child.querySelector('.rte-checkbox');
                        const checked = checkbox ? checkbox.checked : false;
                        text += `${indent}${checked ? '[x]' : '[ ]'} ${inner}\n`;
                    } else if (isOl) {
                        const items = parent ? Array.from(parent.children) : [];
                        const index = items.indexOf(child) + 1;
                        text += `${indent}${index}. ${inner}\n`;
                    } else {
                        text += `${indent}• ${inner}\n`;
                    }
                    break;
                }
                case 'ul':
                case 'ol':
                    text += inner;
                    if (!inner.endsWith('\n')) text += '\n';
                    break;
                case 'hr':
                    text += '\n---\n\n';
                    break;
                case 'table':
                    text += rteTableToPlainText(child) + '\n\n';
                    break;
                case 'th':
                case 'td':
                    text += inner + '\t';
                    break;
                case 'tr':
                    text += inner.trimEnd() + '\n';
                    break;
                case 'tbody':
                case 'thead':
                case 'tfoot':
                    text += inner;
                    break;
                case 'a':
                    text += inner;
                    break;
                case 'img':
                    text += child.getAttribute('alt') || '[Image]';
                    break;
                case 'input':
                    if (child.type === 'checkbox') {
                        text += child.checked ? '[x] ' : '[ ] ';
                    }
                    break;
                default:
                    text += inner;
                    break;
            }
        }
    }

    return text;
}

function rteTableToPlainText(table) {
    let text = '';
    const rows = table.querySelectorAll('tr');
    let maxCols = 0;
    const cellTexts = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        const rowTexts = [];
        cells.forEach(cell => rowTexts.push(rteNodeToPlainText(cell, 0).trim()));
        cellTexts.push(rowTexts);
        maxCols = Math.max(maxCols, rowTexts.length);
    });

    // Calculate column widths
    const colWidths = [];
    for (let c = 0; c < maxCols; c++) {
        let maxW = 0;
        cellTexts.forEach(row => {
            if (row[c]) maxW = Math.max(maxW, row[c].length);
        });
        colWidths.push(Math.max(maxW, 3));
    }

    // Build separator
    const sep = colWidths.map(w => '-'.repeat(w + 2)).join('+') + '\n';

    cellTexts.forEach((row, ri) => {
        text += '| ';
        for (let c = 0; c < maxCols; c++) {
            text += (row[c] || '').padEnd(colWidths[c]) + ' | ';
        }
        text = text.trimEnd() + '\n';
        if (ri === 0) text += sep;
    });

    return text;
}

// ============================================
// Markdown Conversion
// ============================================

function rteConvertToMarkdown() {
    const ed = rteState.editor;
    const clone = ed.cloneNode(true);
    return rteNodeToMarkdown(clone, 0).trim();
}

function rteNodeToMarkdown(node, depth) {
    let md = '';

    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
            md += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            const inner = rteNodeToMarkdown(child, depth + 1);

            switch (tag) {
                case 'br':
                    md += '\n';
                    break;
                case 'p':
                    md += inner + '\n\n';
                    break;
                case 'h1': md += '# ' + inner + '\n\n'; break;
                case 'h2': md += '## ' + inner + '\n\n'; break;
                case 'h3': md += '### ' + inner + '\n\n'; break;
                case 'h4': md += '#### ' + inner + '\n\n'; break;
                case 'h5': md += '##### ' + inner + '\n\n'; break;
                case 'h6': md += '###### ' + inner + '\n\n'; break;
                case 'strong':
                case 'b':
                    md += '**' + inner + '**';
                    break;
                case 'em':
                case 'i':
                    md += '*' + inner + '*';
                    break;
                case 'u':
                    md += '<u>' + inner + '</u>';
                    break;
                case 's':
                case 'strike':
                    md += '~~' + inner + '~~';
                    break;
                case 'code':
                    md += '`' + inner + '`';
                    break;
                case 'pre':
                    md += '```\n' + inner.trim() + '\n```\n\n';
                    break;
                case 'blockquote':
                    md += inner.split('\n').map(l => l.trim() ? '> ' + l : l).join('\n') + '\n\n';
                    break;
                case 'a':
                    md += '[' + inner + '](' + (child.getAttribute('href') || '') + ')';
                    break;
                case 'img':
                    md += '![' + (child.getAttribute('alt') || '') + '](' + (child.getAttribute('src') || '') + ')';
                    break;
                case 'hr':
                    md += '---\n\n';
                    break;
                case 'ul':
                case 'ol': {
                    const items = child.querySelectorAll(':scope > li');
                    items.forEach((li, i) => {
                        const liInner = rteNodeToMarkdown(li, depth + 1);
                        const prefix = tag === 'ol' ? `${i + 1}.` : '-';
                        md += '  '.repeat(depth) + prefix + ' ' + liInner + '\n';
                    });
                    md += '\n';
                    break;
                }
                case 'li':
                    md += inner;
                    break;
                case 'table':
                    md += rteTableToMarkdown(child) + '\n\n';
                    break;
                case 'th':
                case 'td':
                    md += inner + ' | ';
                    break;
                case 'tr':
                    md += '| ' + inner.trimEnd() + '\n';
                    break;
                case 'tbody':
                case 'thead':
                case 'tfoot':
                    md += inner;
                    break;
                default:
                    md += inner;
                    break;
            }
        }
    }

    return md;
}

function rteTableToMarkdown(table) {
    let md = '';
    const rows = table.querySelectorAll('tr');
    let maxCols = 0;

    rows.forEach((row, ri) => {
        const cells = row.querySelectorAll('td, th');
        const texts = [];
        cells.forEach(cell => texts.push(rteNodeToMarkdown(cell, 0).trim()));
        maxCols = Math.max(maxCols, texts.length);

        md += '| ' + texts.join(' | ') + ' |\n';
        if (ri === 0) {
            md += '| ' + texts.map(() => '---').join(' | ') + ' |\n';
        }
    });

    return md;
}

// ============================================
// Templates
// ============================================

function rteSaveTemplate() {
    const content = rteState.editor.innerHTML;
    if (!content || content === '<p>Start typing or paste your content here...</p>') {
        toast('Editor is empty', 'warning');
        return;
    }

    const name = prompt('Template name:');
    if (!name || !name.trim()) return;

    const templates = JSON.parse(localStorage.getItem('rte-templates') || '[]');
    templates.push({ name: name.trim(), content, created: new Date().toISOString() });
    localStorage.setItem('rte-templates', JSON.stringify(templates));
    rteState.templates = templates;

    rteRenderTemplates();
    toast(`Template "${name}" saved!`, 'success');
}

function rteInsertTemplate(name) {
    const templates = JSON.parse(localStorage.getItem('rte-templates') || '[]');
    const tpl = templates.find(t => t.name === name);
    if (!tpl) return;

    rteState.editor.innerHTML = tpl.content;
    rteScheduleAutoSave();
    rteUpdateStats();
    toast(`Template "${name}" loaded`, 'info');
}

function rteDeleteTemplate(name) {
    let templates = JSON.parse(localStorage.getItem('rte-templates') || '[]');
    templates = templates.filter(t => t.name !== name);
    localStorage.setItem('rte-templates', JSON.stringify(templates));
    rteState.templates = templates;
    rteRenderTemplates();
    toast(`Template "${name}" deleted`, 'info');
}

function rteRenderTemplates() {
    const container = document.getElementById('rteTemplateList');
    if (!container) return;

    const templates = JSON.parse(localStorage.getItem('rte-templates') || '[]');
    if (!templates.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = templates.map((t, i) => `
        <button class="rte-template-btn" data-idx="${i}">
            <i class="fas fa-reply"></i> ${escHtml(t.name)}
        </button>
    `).join('');

    container.querySelectorAll('.rte-template-btn').forEach(btn => {
        const tpl = templates[parseInt(btn.dataset.idx, 10)];
        if (!tpl) return;
        btn.addEventListener('click', () => rteInsertTemplate(tpl.name));
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm(`Delete template "${tpl.name}"?`)) {
                rteDeleteTemplate(tpl.name);
            }
        });
    });
}

// ============================================
// Quick Notes
// ============================================
function rteInitQuickNotes() {
    const btn = document.getElementById('rteQuickNoteBtn');
    const modal = document.getElementById('rteQuickNoteModal');
    const closeBtn = document.getElementById('rteQnClose');
    const addBtn = document.getElementById('rteQnAdd');
    const input = document.getElementById('rteQnInput');
    const list = document.getElementById('rteQnList');

    btn.addEventListener('click', () => {
        modal.classList.add('rte-qn-open');
        input.focus();
        rteRenderNotes();
    });
    closeBtn.addEventListener('click', () => modal.classList.remove('rte-qn-open'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('rte-qn-open');
    });

    addBtn.addEventListener('click', rteAddQuickNote);
    input.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') rteAddQuickNote();
    });

    rteRenderNotes();
}

function rteAddQuickNote() {
    const input = document.getElementById('rteQnInput');
    const text = input.value.trim();
    if (!text) return;
    const notes = JSON.parse(localStorage.getItem('rte-quicknotes') || '[]');
    notes.unshift({ text, created: new Date().toISOString() });
    if (notes.length > 100) notes.length = 100;
    localStorage.setItem('rte-quicknotes', JSON.stringify(notes));
    input.value = '';
    rteRenderNotes();
    toast('Note saved!', 'success');
}

function rteDeleteQuickNote(idx) {
    const notes = JSON.parse(localStorage.getItem('rte-quicknotes') || '[]');
    notes.splice(idx, 1);
    localStorage.setItem('rte-quicknotes', JSON.stringify(notes));
    rteRenderNotes();
}

function rteUpdateNoteCounter() {
    const badge = document.getElementById('rteQnBadge');
    if (!badge) return;
    const notes = JSON.parse(localStorage.getItem('rte-quicknotes') || '[]');
    badge.textContent = notes.length;
    badge.style.display = notes.length > 0 ? '' : 'none';
}

function rteRenderNotes() {
    const list = document.getElementById('rteQnList');
    if (!list) return;
    const notes = JSON.parse(localStorage.getItem('rte-quicknotes') || '[]');
    rteUpdateNoteCounter();
    if (!notes.length) {
        list.innerHTML = '<div class="rte-qn-empty"><i class="fas fa-clipboard"></i> No notes yet</div>';
        return;
    }
    list.innerHTML = notes.map((n, i) => {
        const t = new Date(n.created);
        const time = t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
                     t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `<div class="rte-qn-item">
            <div class="rte-qn-item-text">${escHtml(n.text)}</div>
            <div class="rte-qn-item-footer">
                <span class="rte-qn-item-time"><i class="fas fa-clock"></i> ${time}</span>
                <button class="rte-qn-item-del" data-idx="${i}" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.rte-qn-item-del').forEach(btn => {
        btn.addEventListener('click', () => rteDeleteQuickNote(parseInt(btn.dataset.idx)));
    });
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initLoginForm();

    const authenticated = await checkAuth();
    if (authenticated) {
        hideLoginScreen();
        initApp();
    } else {
        showLoginScreen();
        // Check if registration is available (no users exist)
        try {
            // Try to hit me to see if we get a specific error about registration
            // If we get 401, just show login
        } catch {}
    }
});
