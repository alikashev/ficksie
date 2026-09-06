/**
 * ficksie AI Assistant — Frontend
 *
 * Renders the chat tool (model selector, conversation history, streaming,
 * image attachments, Markdown + code blocks). Loaded before app.js.
 * Uses global helpers from app.js: escHtml, toast, api, showConfirmModal,
 * setPageTitle, getActiveBody.
 */

const aiState = {
    catalog: null,          // { configured, live, source, default_model, models[] }
    models: [],
    selectedModel: null,
    conversations: [],
    activeConv: null,
    messages: [],
    editingMsgId: 0,
    streaming: false,
    abortCtrl: null,
    attachments: [],        // pending attachments for the composer
    attachmentBusy: false,
    modelMenuOpen: false,
    listInited: false,
    composerValue: '',
};

const AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const AI_ATTACHMENT_MAX_FILES = 8;

// ============================================================
// Entry point
// ============================================================
function renderAiChat() {
    setPageTitle('Neural Cohort', 'Consulting the silicon scribe');

    const body = getActiveBody();
    if (!body) return;

    body.innerHTML = `
        <div class="ch-wrap">
            <aside class="ch-sidebar" id="chSidebar">
                <div class="ch-sidebar-head">
                    <button class="btn btn-primary btn-sm ch-new-btn" id="chNewBtn" title="Start a new conversation">
                        <i class="fas fa-plus"></i> New chat
                    </button>
                </div>
                <div class="ch-list" id="chList">
                    <div class="loading-spinner">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading conversations...</span>
                    </div>
                </div>
            </aside>
            <div class="ch-sidebar-overlay" id="chSidebarOverlay"></div>
            <main class="ch-main" id="chMain">
                <header class="ch-header">
                    <div class="ch-header-row">
                        <div class="ch-header-left">
                            <button class="btn btn-icon btn-sm ch-menu-btn" id="chMenuBtn" title="Conversations">
                                <i class="fas fa-bars"></i>
                            </button>
                            <div class="ch-header-title" id="chHeaderTitle">New conversation</div>
                        </div>
                        <div class="ch-header-right" id="chHeaderRight"></div>
                    </div>
                </header>
                <div class="ch-messages" id="chMessages"></div>
                <div class="ch-composer-wrap" id="chComposerWrap">
                    <div class="ch-attach-row" id="chAttachRow"></div>
                    <div class="ch-composer" id="chComposer">
                        <div class="ch-input-row">
                            <textarea id="chInput" rows="1" placeholder="Ask ficksie AI anything…" autocomplete="off" spellcheck="false"></textarea>
                            <div class="ch-input-actions">
                                <button class="ch-attach-btn" id="chAttachBtn" title="Attach an image">
                                    <i class="fas fa-image"></i>
                                </button>
                                <button class="ch-action-btn" id="chSendBtn" title="Send">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="ch-hint">ficksie AI can make mistakes — check important info. <span class="ch-hint-keys">Enter to send</span><span class="ch-hint-keys">Shift + Enter new line</span></div>
                    <input type="file" id="chFileInput" accept="image/*" multiple hidden>
                </div>
            </main>
        </div>
    `;

    chBindComposer(body);
    chBindSidebar(body);
    chBindHeader(body);
    chBindDelegation(body);

    chInit();
}

// ============================================================
// Init / data loading
// ============================================================
async function chInit() {
    if (!aiState.listInited) {
        aiState.listInited = true;
        try {
            const saved = localStorage.getItem('aiDefaultModel');
            aiState.selectedModel = saved || null;
        } catch (e) {}
    }

    await chLoadModels();
    await chLoadConversations();

    if (!aiState.activeConv && aiState.conversations.length) {
        await chOpenConversation(aiState.conversations[0].id);
    } else {
        aiState.activeConv = null;
        aiState.messages = [];
        chRenderAll();
        const msgEl = document.getElementById('chMessages');
        if (msgEl) msgEl.scrollTop = 0;
    }
}

async function chLoadModels() {
    try {
        aiState.catalog = await api('GET', 'ai/models');
        aiState.models = aiState.catalog.models || [];
        if (!aiState.selectedModel) {
            aiState.selectedModel = localStorage.getItem('aiDefaultModel') || aiState.catalog.default_model || (aiState.models[0] && aiState.models[0].id) || null;
        }
    } catch (e) {
        aiState.catalog = { configured: false, live: false, source: 'local', models: [], default_model: null };
    }
    chRenderAll();
}

async function chLoadConversations() {
    try {
        aiState.conversations = await api('GET', 'ai/conversations');
    } catch (e) {
        aiState.conversations = [];
        toast('Could not load conversations.', 'error');
    }
    const listEl = document.getElementById('chList');
    if (listEl) chRenderList(listEl);
}

async function chOpenConversation(id) {
    try {
        const detail = await api('GET', 'ai/conversations/' + id);
        aiState.activeConv = detail.conversation;
        aiState.messages = detail.messages;
        aiState.streaming = false;
        aiState.editingMsgId = 0;
        if (aiState.selectedModel && aiState.activeConv.model && aiState.models.some(m => m.id === aiState.activeConv.model)) {
            // prefer conversation's own model
        }
        if (!aiState.models.some(m => m.id === aiState.activeConv.model)) {
            // keep the conversation model even if not in the current live catalog
        }
    } catch (e) {
        toast('Could not open that conversation.', 'error');
        return;
    }
    chRenderAll();
    chScrollBottom();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) chCloseSidebar();
}

function chActiveModel() {
    if (!aiState.activeConv || !aiState.messagesActive) { }
    const modelId = (aiState.activeConv && aiState.activeConv.model) || aiState.selectedModel;
    return aiState.models.find(m => m.id === modelId) || null;
}

function chCanAttach() {
    const m = chActiveModel();
    return !m || m.vision === true;
}

// ============================================================
// Rendering
// ============================================================
function chRenderAll() {
    chRenderHeader();
    chRenderList(document.getElementById('chList'));
    chRenderMessages();
    chRenderAttachmentState(false);
    chRenderComposerState();
}

function chRenderHeader() {
    const titleEl = document.getElementById('chHeaderTitle');
    if (titleEl) {
        titleEl.textContent = aiState.activeConv ? aiState.activeConv.title : 'New conversation';
        titleEl.title = aiState.activeConv ? aiState.activeConv.title : '';
    }
    const right = document.getElementById('chHeaderRight');
    if (right) {
        right.innerHTML = `
            <div class="ch-model-wrap" id="chModelWrap">${chModelBtnHtml()}</div>
            <button class="btn btn-icon btn-sm ch-head-btn" id="chRenameBtn" title="Rename conversation" ${aiState.activeConv ? '' : 'disabled'}><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon btn-sm btn-icon-danger ch-head-btn" id="chDeleteBtn" title="Delete conversation" ${aiState.activeConv ? '' : 'disabled'}><i class="fas fa-trash"></i></button>
        `;
        const wrap = document.getElementById('chModelWrap');
        if (wrap) {
            const btn = wrap.querySelector('.ch-model-btn');
            if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); chToggleModelMenu(); });
        }
        const renameBtn = document.getElementById('chRenameBtn');
        if (renameBtn) renameBtn.addEventListener('click', () => { if (aiState.activeConv) chPromptRename(); });
        const delBtn = document.getElementById('chDeleteBtn');
        if (delBtn) delBtn.addEventListener('click', () => { if (aiState.activeConv) chConfirmDelete(); });
    }
}

function chModelBtnHtml() {
    const model = chActiveModel();
    const name = model ? model.name : (aiState.selectedModel ? aiState.selectedModel.split('/').pop() : 'Loading…');
    const vision = model && model.vision;
    return `
        <button class="ch-model-btn" id="chModelBtn" title="Choose model">
            <span class="ch-model-name">${escHtml(name)}</span>
            ${vision ? '<i class="fas fa-image ch-vision-badge" title="Supports images"></i>' : ''}
            <i class="fas fa-chevron-down ch-model-caret"></i>
        </button>
    `;
}

function chRenderModelMenu() {
    const wrap = document.getElementById('chModelWrap');
    if (!wrap) return;
    const existing = document.getElementById('chModelMenu');
    if (existing) existing.remove();

    if (aiState.modelMenuOpen) {
        const sel = (aiState.activeConv && aiState.activeConv.model) || aiState.selectedModel;
        const items = aiState.models.map(m => {
            const active = m.id === sel ? ' active' : '';
            return `
                <div class="ch-model-item${active}" data-model="${m.id}">
                    <div class="ch-model-top">
                        <span class="ch-model-name">${escHtml(m.name)}</span>
                        ${active ? '<i class="fas fa-check ch-model-check"></i>' : ''}
                    </div>
                    ${chModelTagsHtml(m)}
                    <div class="ch-model-desc">${escHtml(m.description)}</div>
                </div>
            `;
        }).join('');

        const banner = aiState.catalog && !aiState.catalog.configured
            ? '<div class="ch-model-note"><i class="fas fa-key"></i> Add <code>NVIDIA_API_KEY</code> to config.php to enable AI responses.</div>'
            : '';

        wrap.insertAdjacentHTML('beforeend', `<div class="ch-model-menu" id="chModelMenu">${banner}${items}</div>`);
        wrap.querySelectorAll('.ch-model-item').forEach(it => {
            it.addEventListener('click', () => {
                chPickModel(it.dataset.model);
                chCloseModelMenu();
            });
        });
    }
}

function chModelTagsHtml(m) {
    const labels = {
        reasoning: 'Reasoning',
        coding: 'Coding',
        vision: 'Vision',
        fast: 'Fast',
        general: 'General',
    };
    const tags = (m.tags || []).slice(0, 4);
    return `<div class="ch-model-tags">${tags.map(t => `<span class="ch-tag ch-tag-${t}">${labels[t] || t}</span>`).join('')}</div>`;
}

function chRenderList(el) {
    if (!el) return;
    if (!aiState.conversations.length) {
        el.innerHTML = '<div class="ch-list-empty"><i class="fas fa-comment-slash"></i><p>No conversations yet.</p></div>';
        return;
    }
    el.innerHTML = aiState.conversations.map(c => {
        const active = aiState.activeConv && aiState.activeConv.id === c.id ? ' active' : '';
        return `
            <div class="ch-item${active}" data-cid="${c.id}">
                <button class="ch-item-main" data-cid="${c.id}" title="${escHtml(c.title)}">
                    <i class="fas fa-comment"></i>
                    <span class="ch-item-body">
                        <span class="ch-item-title">${escHtml(c.title)}</span>
                        <span class="ch-item-time">${chRelTime(c.last_message_at || c.created_at)}</span>
                    </span>
                </button>
                <span class="ch-item-actions">
                    <button class="ch-ia-btn ch-ia-rename" data-cid="${c.id}" title="Rename"><i class="fas fa-pen"></i></button>
                    <button class="ch-ia-btn ch-ia-del" data-cid="${c.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </span>
            </div>
        `;
    }).join('');
}

function chRenderMessages() {
    const el = document.getElementById('chMessages');
    if (!el) return;

    if (!aiState.activeConv || !aiState.messages.length) {
        el.innerHTML = chWelcomeHtml();
        return;
    }

    el.innerHTML = aiState.messages.map(m => chMsgHtml(m)).join('');
    chHighlightContainer(el);
}

function chWelcomeHtml() {
    const model = chActiveModel();
    const suggestions = [
        'Explain how SPF alignment affects email deliverability',
        'Write a bash script that backs up a MySQL database daily',
        'Draft a polite reply to a negative Trustpilot review',
        'List useful dig commands for DNS troubleshooting',
    ];
    return `
        <div class="ch-welcome">
            <div class="ch-welcome-avatar"><img src="ficksie_logo_nt.png" alt="ficksie AI"></div>
            <h2>Neural Cohort</h2>
            <p>Ask ficksie AI anything — shell commands, email and DNS troubleshooting, code, drafts or plain advice.${model ? ' Currently on <strong>' + escHtml(model.name) + '</strong>.' : ''}</p>
            <div class="ch-suggests">
                ${suggestions.map(s => `<button class="ch-suggest" data-suggest="${escHtml(s)}"><i class="fas fa-arrow-turn-up"></i>${escHtml(s)}</button>`).join('')}
            </div>
            ${aiState.catalog && !aiState.catalog.configured ? `
                <div class="ch-banner ch-banner-warn">
                    <i class="fas fa-key"></i>
                    <span>AI is not configured yet. Add an <code>NVIDIA_API_KEY</code> to <code>config.php</code> to start chatting. You can still explore the models below.</span>
                </div>` : ''}
        </div>
    `;
}

function chMsgHtml(m) {
    const isUser = m.role === 'user';
    const avatarHtml = isUser
        ? '<div class="ch-avatar ch-avatar-user"><i class="fas fa-user"></i></div>'
        : '<div class="ch-avatar ch-avatar-ai"><img src="ficksie_logo_nt.png" alt="ficksie AI"></div>';

    let bodyHtml = '';
    let actionsHtml = '';

    if (isUser) {
        const atts = chAttThumbsHtml(m.attachments);
        const text = m.content ? `<div class="ch-user-text">${escHtml(m.content)}</div>` : '';
        bodyHtml = atts + text;
    } else if (m.isError) {
        bodyHtml = `
            <div class="ch-err">
                <i class="fas fa-triangle-exclamation"></i>
                <div class="ch-err-msg">${escHtml(m.content || 'The AI request failed.')}</div>
            </div>`;
        actionsHtml = `<div class="ch-msg-actions"><button class="ch-msg-action" data-act="regenerate" data-mid="${m.id}" title="Try again"><i class="fas fa-rotate-right"></i> Try again</button></div>`;
    } else {
        const think = m.reasoning ? chThinkingHtml(m.reasoning) : '';
        const content = m.content
            ? `<div class="ch-md">${chMdBlock(m.content)}</div>`
            : (m.isStreaming ? '' : '<div class="ch-empty-response">(no response)</div>');
        const typing = m.isStreaming ? chTypingHtml() : '';
        bodyHtml = think + content + typing;
        if (!m.isStreaming) {
            actionsHtml = `<div class="ch-msg-actions">
                <button class="ch-msg-action" data-act="copy" data-mid="${m.id}" title="Copy response"><i class="fas fa-copy"></i></button>
                <button class="ch-msg-action" data-act="regenerate" data-mid="${m.id}" title="Regenerate response"><i class="fas fa-rotate-right"></i></button>
            </div>`;
        }
    }

    if (isUser && aiState.messages.length && aiState.messages.find(x => x.id === m.id) && m.isStreaming) {
        // user messages never stream
    }

    const timeHtml = m.created_at ? `<span class="ch-msg-time">${chFormatTime(m.created_at)}</span>` : '';
    const userEdit = isUser ? `<button class="ch-msg-edit" data-act="edit" data-mid="${m.id}" title="Edit and resend"><i class="fas fa-pen"></i></button>` : '';

    return `
        <div class="ch-msg ${isUser ? 'user' : 'ai'}" data-mid="${m.id}">
            ${avatarHtml}
            <div class="ch-msg-col">
                <div class="ch-bubble">${bodyHtml}${actionsHtml}${actionSpacerHtml()}</div>
                <div class="ch-msg-meta">${userEdit}${timeHtml}</div>
            </div>
        </div>
    `;
}

function actionSpacerHtml() {
    return '<span class="ch-actions-spacer"></span>';
}

function chAttThumbsHtml(atts) {
    if (!atts || !atts.length) return '';
    return `<div class="ch-att-list">${atts.map(a => {
        if (a.kind === 'image' || (a.mime && a.mime.indexOf('image/') === 0)) {
            return `<img class="ch-att-preview" src="${API_BASE}/ai/attachments/${a.id}" alt="${escHtml(a.filename || 'attachment')}" loading="lazy">`;
        }
        return '';
    }).join('')}</div>`;
}

function chThinkingHtml(text) {
    const esc = escHtml(text);
    return `
        <details class="ch-think">
            <summary><i class="fas fa-brain"></i> Thinking</summary>
            <div class="ch-think-body">${esc.replace(/\n/g, '<br>')}</div>
        </details>`;
}

function chTypingHtml() {
    return '<div class="ch-typing"><span></span><span></span><span></span></div>';
}

// ============================================================
// Markdown rendering
// ============================================================
const chLangNames = {
    js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
    py: 'Python', python: 'Python', php: 'PHP', rb: 'Ruby', ruby: 'Ruby',
    sh: 'Shell', bash: 'Bash', shell: 'Shell', zsh: 'Shell', console: 'Terminal',
    html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', yaml: 'YAML', yml: 'YAML',
    xml: 'XML', md: 'Markdown', markdown: 'Markdown', go: 'Go', golang: 'Go',
    rs: 'Rust', rust: 'Rust', java: 'Java', c: 'C', 'c++': 'C++', cpp: 'C++',
    csharp: 'C#', cs: 'C#', kt: 'Kotlin', kotlin: 'Kotlin', swift: 'Swift',
    scala: 'Scala', dockerfile: 'Dockerfile', docker: 'Docker', diff: 'Diff',
    ini: 'INI', toml: 'TOML', text: 'Text', plaintext: 'Text', graphql: 'GraphQL',
    perl: 'Perl', lua: 'Lua', r: 'R', dart: 'Dart', nginx: 'Nginx', conf: 'Config',
    env: 'Env', powershell: 'PowerShell', ps1: 'PowerShell', vb: 'VB',
};

function chLangLabel(lang) {
    if (!lang) return 'Code';
    return chLangNames[lang.toLowerCase()] || escHtml(lang);
}

function chMdSafeUrl(u) {
    u = String(u || '').trim();
    if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(u)) return u;
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u)) return u;
    return null;
}

function chCodeBlockHtml(lang, code) {
    const esc = escHtml(code);
    const label = chLangLabel(lang);
    const cls = lang ? ' language-' + lang : '';
    return `
        <div class="ch-pre">
            <div class="ch-code-head">
                <span class="ch-code-lang"><i class="fas fa-code"></i>${label}</span>
                <button class="ch-code-copy" title="Copy code"><i class="fas fa-copy"></i> Copy</button>
            </div>
            <code class="ch-code${cls}">${esc}</code>
        </div>`;
}

function chMdInline(text) {
    let s = escHtml(text);

    // inline code
    s = s.replace(/`([^`\n]+)`/g, (m, code) => '<code class="ch-ci">' + code + '</code>');

    // bold / italic / strike
    s = s.replace(/\*\*(?!\s)([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(?!\s)([^_\n]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*_])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^*_])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');

    // images
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (m, alt, url) => {
        const safe = chMdSafeUrl(url);
        if (!safe) return m;
        return `<img class="ch-mi" src="${escHtml(safe)}" alt="${escHtml(alt)}" loading="lazy">`;
    });

    // links
    s = s.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (m, text, url) => {
        const safe = chMdSafeUrl(url);
        if (!safe) return text;
        return `<a href="${escHtml(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    return s;
}

function chMdBlock(src) {
    src = String(src || '').replace(/\r\n?/g, '\n');
    const codeBlocks = [];

    src = src.replace(/```([^\n]*)\n([\s\S]*?)```/g, (m, lang, code) => {
        code = code.replace(/\n$/, '');
        const cleanLang = (lang || '').trim().replace(/[^\w+#.-]/g, '').slice(0, 24);
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: cleanLang, code });
        return '\n\x00CODE' + idx + '\x00\n';
    });

    const lines = src.split('\n');
    const out = [];
    let para = [];

    const flushPara = () => {
        if (para.length) {
            out.push({ type: 'p', raw: para.join('\n') });
            para = [];
        }
    };

    const listMarker = (line) => {
        const m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) return null;
        return {
            indent: m[1].replace(/\t/g, '    ').length,
            ordered: /\d+[.)]/.test(m[2]),
            text: m[3],
        };
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const cm = trimmed.match(/^\x00CODE(\d+)\x00$/);
        if (cm) { flushPara(); out.push({ type: 'code', idx: +cm[1] }); continue; }
        if (!trimmed) { flushPara(); continue; }

        const hm = line.match(/^\s*(#{1,6})\s+(.*)$/);
        if (hm) { flushPara(); out.push({ type: 'h', level: hm[1].length, raw: hm[2] }); continue; }

        if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { flushPara(); out.push({ type: 'hr' }); continue; }

        if (/^\s*>\s?/.test(line)) {
            flushPara();
            const q = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                q.push(lines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            i--;
            out.push({ type: 'quoteHtml', html: chMdBlock(q.join('\n')) });
            continue;
        }

        if (line.includes('|') && lines[i + 1] && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
            flushPara();
            const splitRow = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
            const header = splitRow(line);
            const aligns = splitRow(lines[i + 1]).map(c =>
                /^:.*:$/.test(c) ? 'center' : /:$/.test(c) ? 'right' : /^:/.test(c) ? 'left' : ''
            );
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
                rows.push(splitRow(lines[i]));
                i++;
            }
            i--;
            out.push({ type: 'table', header, rows, aligns });
            continue;
        }

        const lm = listMarker(line);
        if (lm) {
            flushPara();
            const collected = [{ indent: lm.indent, ordered: lm.ordered, text: lm.text, children: [] }];
            let baseIndent = lm.indent;
            i++;
            while (i < lines.length) {
                const next = listMarker(lines[i]);
                if (!next) {
                    const cont = lines[i];
                    if (cont.trim() && /^\s{2,}/.test(cont)) {
                        const last = collected[collected.length - 1];
                        while (last.children.length) last = last.children[last.children.length - 1];
                        last.text += ' ' + cont.trim();
                        i++;
                        continue;
                    }
                    break;
                }
                if (next.indent < baseIndent) break;
                let item = { indent: next.indent, ordered: next.ordered, text: next.text, children: [] };
                const target = collected[collected.length - 1];
                if (next.indent > target.indent) {
                    let cur = target;
                    while (cur.children.length && cur.children[cur.children.length - 1].indent >= next.indent) {
                        cur = cur.children[cur.children.length - 1];
                    }
                    if (next.indent > cur.indent) {
                        cur.children.push(item);
                    } else {
                        collected.push(item);
                    }
                } else {
                    collected.push(item);
                }
                i++;
            }
            i--;
            out.push({ type: 'list', items: collected, ordered: lm.ordered });
            continue;
        }

        para.push(line);
    }
    flushPara();

    const renderList = (items, ordered) => {
        const tag = ordered ? 'ol' : 'ul';
        let h = '<' + tag + '>';
        items.forEach(item => {
            h += '<li>' + chMdInline(item.text) + (item.children && item.children.length ? renderList(item.children, item.ordered) : '') + '</li>';
        });
        h += '</' + tag + '>';
        return h;
    };

    return out.map(b => {
        switch (b.type) {
            case 'code':
                return chCodeBlockHtml(codeBlocks[b.idx].lang, codeBlocks[b.idx].code);
            case 'h':
                return `<h${b.level}>${chMdInline(b.raw)}</h${b.level}>`;
            case 'hr':
                return '<hr>';
            case 'quoteHtml':
                return `<blockquote>${b.html}</blockquote>`;
            case 'table':
                return chTableHtml(b);
            case 'list':
                return renderList(b.items, b.ordered);
            case 'p':
            default:
                return `<p>${chMdInline(b.raw)}</p>`;
        }
    }).join('\n');
}

function chTableHtml(b) {
    let h = '<div class="ch-tbl-wrap"><table>';
    h += '<thead><tr>' + b.header.map((c, i) => `<th ${b.aligns[i] ? 'style="text-align:' + b.aligns[i] + '"' : ''}>${chMdInline(c)}</th>`).join('') + '</tr></thead>';
    h += '<tbody>';
    b.rows.forEach(row => {
        h += '<tr>' + b.header.map((c, i) => `<td ${b.aligns[i] ? 'style="text-align:' + b.aligns[i] + '"' : ''}>${chMdInline(row[i] || '')}</td>`).join('') + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
}

function chHighlightContainer(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('pre .ch-code').forEach(code => {
        if (code.getAttribute('data-hl') === '1') return;
        if (window.hljs && !code.querySelector('.hljs')) {
            try {
                hljs.highlightElement(code);
            } catch (e) {}
        }
        code.setAttribute('data-hl', '1');
    });
}

// ============================================================
// Conversation actions
// ============================================================
async function chNewConversation() {
    if (aiState.streaming) return;
    const model = aiState.selectedModel || (aiState.catalog && aiState.catalog.default_model) || null;
    try {
        const conv = await api('POST', 'ai/conversations', model ? { model } : {});
        aiState.activeConv = conv;
        aiState.messages = [];
        aiState.editingMsgId = 0;
        aiState.attachments = [];
        await chLoadConversations();
        chRenderAll();
        chScrollBottom();
        const input = document.getElementById('chInput');
        if (input) input.focus();
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) chCloseSidebar();
    } catch (e) {
        toast(e.message || 'Could not create conversation.', 'error');
    }
}

function chPromptRename() {
    const item = document.querySelector(`.ch-item[data-cid="${aiState.activeConv.id}"]`);
    const titleEl = item ? item.querySelector('.ch-item-title') : null;

    if (item) item.classList.add('renaming');
    const commit = async (value) => {
        value = (value || '').trim();
        try {
            if (value) {
                const updated = await api('PATCH', 'ai/conversations/' + aiState.activeConv.id, { title: value });
                aiState.activeConv.title = updated.title;
            }
        } catch (e) {
            toast(e.message || 'Could not rename.', 'error');
        }
        if (item) item.classList.remove('renaming');
        chRenderAll();
    };

    if (titleEl) {
        const current = titleEl.textContent;
        titleEl.innerHTML = '';
        const input = document.createElement('input');
        input.className = 'ch-rename-input';
        input.value = current;
        input.maxLength = 200;
        titleEl.appendChild(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (save) => () => {
            if (done) return;
            done = true;
            commit(save ? input.value : current);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(true)();
            if (e.key === 'Escape') finish(false)();
        });
        input.addEventListener('blur', finish(true));
        input.addEventListener('click', (e) => e.stopPropagation());
    } else {
        chPromptRenameFallback();
    }
}

function chPromptRenameFallback() {
    const current = aiState.activeConv.title;
    const value = window.prompt('Rename conversation', current);
    if (value !== null) {
        api('PATCH', 'ai/conversations/' + aiState.activeConv.id, { title: value.trim() })
            .then(u => { aiState.activeConv.title = u.title || value; chRenderAll(); })
            .catch(e => toast(e.message, 'error'));
    }
}

function chConfirmDelete() {
    showConfirmModal(`Delete "${aiState.activeConv.title}" and all its messages? This cannot be undone.`, 'Delete conversation').then(async (yes) => {
        if (!yes) return;
        const id = aiState.activeConv.id;
        try {
            await api('DELETE', 'ai/conversations/' + id);
        } catch (e) {}
        aiState.conversations = aiState.conversations.filter(c => c.id !== id);
        aiState.activeConv = null;
        aiState.messages = [];
        const next = aiState.conversations[0];
        if (next) {
            await chOpenConversation(next.id);
        } else {
            chRenderAll();
        }
        await chLoadConversations();
    });
}

// ============================================================
// Model selection
// ============================================================
function chToggleModelMenu() {
    aiState.modelMenuOpen = !aiState.modelMenuOpen;
    chRenderModelMenu();
}

function chCloseModelMenu() {
    aiState.modelMenuOpen = false;
    const menu = document.getElementById('chModelMenu');
    if (menu) menu.remove();
}

async function chPickModel(modelId) {
    aiState.selectedModel = modelId;
    try { localStorage.setItem('aiDefaultModel', modelId); } catch (e) {}

    const model = aiState.models.find(m => m.id === modelId);
    if (aiState.activeConv) {
        try {
            const updated = await api('PATCH', 'ai/conversations/' + aiState.activeConv.id, { model: modelId });
            aiState.activeConv.model = (updated && updated.model) || modelId;
        } catch (e) {
            toast(e.message || 'Could not switch model.', 'error');
        }
    }

    if (!model || !model.vision) {
        if (aiState.attachments.length) {
            aiState.attachments = [];
            chRenderAttachRow();
            toast('Removed attached images — this model can\'t read images.', 'warning');
        }
    }

    chRenderHeader();
    chRenderMessages();
}

// ============================================================
// Composer
// ============================================================
function chBindComposer(body) {
    const wrap = document.getElementById('chComposerWrap');
    const input = document.getElementById('chInput');

    input.addEventListener('input', () => {
        chGrowComposer(input);
        aiState.composerValue = input.value;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            if (!aiState.editingMsgId || input.value.trim() || aiState.attachments.length) {
                chSend();
            } else {
                aiState.editingMsgId = 0;
                chRenderComposerState();
            }
        }
    });

    document.getElementById('chSendBtn').addEventListener('click', () => {
        if (aiState.streaming) chStop();
        else chSend();
    });

    const attachBtn = document.getElementById('chAttachBtn');
    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!chCanAttach() && !aiState.streaming) {
            chBadAttachToast();
            return;
        }
        document.getElementById('chFileInput').click();
    });

    const fileInput = document.getElementById('chFileInput');
    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length) chAttachFiles(fileInput.files);
        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(evName => wrap.addEventListener(evName, (e) => {
        e.preventDefault();
        if (chCanAttach()) wrap.classList.add('ch-dragover');
    }));
    ['dragleave', 'drop'].forEach(evName => wrap.addEventListener(evName, (e) => {
        e.preventDefault();
        wrap.classList.remove('ch-dragover');
    }));
    wrap.addEventListener('drop', (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) chAttachFiles(files);
    });

    chGrowComposer(input);
}

function chGrowComposer(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function chRenderComposerState() {
    const sendBtn = document.getElementById('chSendBtn');
    if (!sendBtn) return;
    const attachBtn = document.getElementById('chAttachBtn');
    const attachTitle = attachBtn ? attachBtn.getAttribute('title') : '';
    const canAttach = chCanAttach();

    if (aiState.streaming) {
        sendBtn.className = 'ch-action-btn ch-action-stop';
        sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
        sendBtn.setAttribute('title', 'Stop generating');
        if (attachBtn) {
            attachBtn.classList.add('disabled');
            attachBtn.setAttribute('title', 'Wait for the current response to finish');
        }
    } else {
        sendBtn.className = 'ch-action-btn';
        sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        sendBtn.setAttribute('title', 'Send');
        if (attachBtn) {
            attachBtn.classList.toggle('disabled', !canAttach);
            attachBtn.setAttribute('title', !canAttach ? attachTitle : 'Attach an image');
        }
    }
}

function chBadAttachToast() {
    const model = chActiveModel();
    toast(`This model (${model ? model.name : 'selected model'}) can't read images. Pick a Vision model instead.`, 'warning');
}

// ============================================================
// Sidebar / header / delegation
// ============================================================
function chBindSidebar() {
    const newBtn = document.getElementById('chNewBtn');
    if (newBtn) newBtn.addEventListener('click', chNewConversation);
    const overlay = document.getElementById('chSidebarOverlay');
    if (overlay) overlay.addEventListener('click', chCloseSidebar);
}

function chBindHeader() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ch-model-wrap')) {
            if (aiState.modelMenuOpen) chCloseModelMenu();
        }
    });
}

function chBindDelegation() {
    document.addEventListener('click', async (e) => {
        // conversation items
        const mainBtn = e.target.closest('.ch-item-main');
        if (mainBtn && aiState.activeConv) {
            const cid = +mainBtn.dataset.cid;
            if (cid && aiState.activeConv.id !== cid) await chOpenConversation(cid);
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) chCloseSidebar();
            return;
        }

        const renameBtn = e.target.closest('.ch-ia-rename');
        if (renameBtn) {
            const cid = +renameBtn.dataset.cid;
            if (aiState.activeConv && cid !== aiState.activeConv.id) {
                try {
                    const c = await api('GET', 'ai/conversations/' + cid);
                    aiState.activeConv = c.conversation;
                    aiState.messages = c.messages;
                    chRenderAll();
                    const isMobile = window.matchMedia('(max-width: 768px)').matches;
                    if (isMobile) chCloseSidebar();
                } catch (err) {}
            }
            chPromptRename();
            return;
        }

        const delBtn = e.target.closest('.ch-ia-del');
        if (delBtn) {
            const cid = +delBtn.dataset.cid;
            if (aiState.activeConv && cid !== aiState.activeConv.id) {
                try {
                    const c = await api('GET', 'ai/conversations/' + cid);
                    aiState.activeConv = c.conversation;
                    aiState.messages = c.messages;
                    chRenderAll();
                } catch (err) {}
            }
            chConfirmDelete();
            return;
        }

        // message actions
        const actionBtn = e.target.closest('.ch-msg-action');
        if (actionBtn && !aiState.streaming) {
            const act = actionBtn.dataset.act;
            const mid = +actionBtn.dataset.mid;
            if (act === 'copy') chCopyResponse(mid, actionBtn);
            if (act === 'regenerate') chRegenerate(mid);
            return;
        }

        const editBtn = e.target.closest('.ch-msg-edit');
        if (editBtn && !aiState.streaming) {
            chEditMessage(+editBtn.dataset.mid);
            return;
        }

        // copy code block
        const codeCopy = e.target.closest('.ch-code-copy');
        if (codeCopy) {
            const pre = codeCopy.closest('.ch-pre');
            const code = pre ? pre.querySelector('code.ch-code') : null;
            if (code) {
                const text = code.textContent;
                navigator.clipboard.writeText(text)
                    .then(() => {
                        codeCopy.innerHTML = '<i class="fas fa-check"></i> Copied';
                        setTimeout(() => { codeCopy.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1600);
                    })
                    .catch(() => toast('Could not copy code.', 'error'));
            }
            return;
        }

        // suggestions
        const suggestBtn = e.target.closest('.ch-suggest');
        if (suggestBtn) {
            const input = document.getElementById('chInput');
            if (input) {
                input.value = suggestBtn.dataset.suggest || '';
                aiState.composerValue = input.value;
                chGrowComposer(input);
                input.focus();
            }
            return;
        }

        const menuBtn = e.target.closest('.ch-menu-btn');
        if (menuBtn) {
            chOpenSidebar();
            return;
        }
    });
}

function chOpenSidebar() {
    const sb = document.getElementById('chSidebar');
    const ov = document.getElementById('chSidebarOverlay');
    if (sb) sb.classList.add('open');
    if (ov) ov.classList.add('active');
}

function chCloseSidebar() {
    const sb = document.getElementById('chSidebar');
    const ov = document.getElementById('chSidebarOverlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('active');
}

// ============================================================
// Attachments
// ============================================================
function chAttachFiles(fileList) {
    let files = Array.from(fileList || []).filter(f => f && f.type && f.type.indexOf('image/') === 0 && f.size > 0);
    if (!files.length) {
        toast('Only image files can be attached.', 'warning');
        return;
    }
    const model = chActiveModel();
    if (model && !model.vision) {
        chBadAttachToast();
        return;
    }
    if (aiState.streaming) {
        toast('Wait for the current response to finish.', 'warning');
        return;
    }
    if (aiState.attachmentBusy) return;

    const run = () => {
        const room = AI_ATTACHMENT_MAX_FILES - aiState.attachments.length;
        if (room <= 0) {
            toast('You can attach up to ' + AI_ATTACHMENT_MAX_FILES + ' images per message.', 'warning');
            return;
        }
        if (files.length > room) {
            toast('Too many images — keeping the first ' + room + '.', 'warning');
            files = files.slice(0, room);
        }
        const oversized = files.filter(f => f.size > AI_ATTACHMENT_MAX_BYTES);
        if (oversized.length) {
            toast('One or more images exceed the 5 MB limit and were skipped.', 'warning');
            files = files.filter(f => f.size <= AI_ATTACHMENT_MAX_BYTES);
        }
        if (!files.length) return;

        aiState.attachmentBusy = true;
        chRenderAttachmentState(true);

        const fd = new FormData();
        files.forEach(f => fd.append('files', f, f.name));

        fetch(API_BASE + '/ai/attachments', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        })
            .then(r => r.json())
            .then(data => {
                if (!data.success) {
                    toast(data.message || 'Upload failed.', 'error');
                    return;
                }
                (data.data.attachments || []).forEach(a => aiState.attachments.push(a));
                if (data.data.errors && data.data.errors.length) {
                    toast(data.data.errors[0].error || 'Some files were skipped.', 'warning');
                } else if (data.data.attachments && data.data.attachments.length) {
                    toast(data.data.attachments.length + ' image' + (data.data.attachments.length > 1 ? 's' : '') + ' attached.', 'success');
                }
            })
            .catch(() => toast('Upload failed — check the file and try again.', 'error'))
            .finally(() => {
                aiState.attachmentBusy = false;
                chRenderAttachmentState(false);
                chRenderAttachRow();
            });
    };

    // clear read model check when no conversation: still fine
    run();
}

function chRenderAttachmentState(busy) {
    const row = document.getElementById('chAttachRow');
    if (!row) return;
    if (busy) {
        row.innerHTML = '<div class="ch-uploading"><i class="fas fa-spinner fa-spin"></i> Uploading image…</div>';
    }
}

function chRenderAttachRow() {
    const row = document.getElementById('chAttachRow');
    if (!row) return;
    if (aiState.attachmentBusy) {
        if (!row.querySelector('.ch-uploading')) {
            row.innerHTML = '<div class="ch-uploading"><i class="fas fa-spinner fa-spin"></i> Uploading image…</div>';
        }
        return;
    }
    if (!aiState.attachments.length) {
        row.innerHTML = '';
        return;
    }
    row.innerHTML = `<div class="ch-pending-row">${aiState.attachments.map((a, i) => `
        <div class="ch-pending-att">
            <img src="${API_BASE}/ai/attachments/${a.id}" alt="" class="ch-pending-img">
            <button class="ch-pending-x" data-idx="${i}" title="Remove">&times;</button>
        </div>`).join('')}</div>`;
    row.querySelectorAll('.ch-pending-x').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = +btn.dataset.idx;
            aiState.attachments.splice(idx, 1);
            chRenderAttachRow();
        });
    });
}

// ============================================================
// Sending / streaming
// ============================================================
function chSetStreamUI(on) {
    aiState.streaming = on;
    chRenderComposerState();
    const input = document.getElementById('chInput');
    if (input) input.disabled = on;
}

async function chSend() {
    if (aiState.streaming) return;
    const input = document.getElementById('chInput');
    const content = (input ? input.value : '').trim();
    const attachments = aiState.attachments.slice();
    const editId = aiState.editingMsgId || 0;

    if (!content && !attachments.length && !editId) return;

    if (aiState.activeConv) {
        const model = chActiveModel();
        if (attachments.length && model && !model.vision) {
            chBadAttachToast();
            return;
        }
    }

    if (input) input.value = '';
    aiState.composerValue = '';
    aiState.attachments = [];
    aiState.editingMsgId = 0;
    chRenderAttachRow();
    chGrowComposer(input);

    // ensure a conversation exists
    if (!aiState.activeConv) {
        try {
            aiState.activeConv = await api('POST', 'ai/conversations', { model: aiState.selectedModel || undefined });
            await chLoadConversations();
        } catch (e) {
            toast(e.message || 'Could not create conversation.', 'error');
            return;
        }
    }

    // editing path: drop everything from the edited message onward
    if (editId) {
        const idx = aiState.messages.findIndex(m => m.id === editId);
        if (idx !== -1) aiState.messages.splice(idx);
    }

    const userMsg = { id: 'tmpu' + Date.now(), role: 'user', content: content || '', attachments, isError: false };
    const placeholder = { id: 'tmp' + Date.now(), role: 'assistant', content: '', reasoning: '', isStreaming: true, isError: false };
    aiState.messages.push(userMsg, placeholder);

    chRenderMessages();
    chScrollBottom();
    chSetStreamUI(true);

    const body = { content, attachments: attachments.map(a => a.id) };
    if (editId) body.edit_message_id = editId;

    await chStream('ai/conversations/' + aiState.activeConv.id + '/messages', body, placeholder.id, userMsg.id);
}

async function chStream(path, body, placeholderId) {
    let controller = new AbortController();
    aiState.abortCtrl = controller;
    let res;

    try {
        res = await fetch(API_BASE + '/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') { await chStreamEnd(); return; }
        chStreamFail('Could not reach the AI service. Check your connection and try again.');
        return;
    }

    if (!res.ok) {
        let msg = 'The AI request failed.';
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) {}
        chStreamFail(msg);
        return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    const handleEvent = (ev) => {
        const msg = aiState.messages.find(m => m.id === placeholderId);
        if (!msg) return;
        if (ev.type === 'start' && ev.message_id) {
            msg.id = ev.message_id;
        } else if (ev.type === 'delta') {
            msg.content += ev.text || '';
        } else if (ev.type === 'reason') {
            msg.reasoning = (msg.reasoning || '') + (ev.text || '');
        } else if (ev.type === 'error') {
            msg.isError = true;
            msg.isStreaming = false;
            msg.content = ev.message || 'The AI request failed.';
        }
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                let ev;
                try { ev = JSON.parse(payload); } catch (e) { continue; }
                handleEvent(ev);
            }
            // throttled re-render while streaming
            chStreamTick();
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            // stopped by the user; server saved the partial reply
        } else {
            chStreamFail('The connection to the AI service was interrupted.');
        }
    }

    await chStreamEnd();
}

let chStreamTimer = null;
let chStreamRenderScheduled = false;

function chStreamTick() {
    if (chStreamRenderScheduled) return;
    chStreamRenderScheduled = true;
    clearTimeout(chStreamTimer);
    chStreamTimer = setTimeout(() => {
        chStreamRenderScheduled = false;
        if (aiState.streaming) {
            chRenderMessages();
            chScrollBottom();
        }
    }, 140);
}

function chStreamFail(msg) {
    const last = aiState.messages[aiState.messages.length - 1];
    if (last && last.role === 'assistant' && last.isStreaming) {
        last.isStreaming = false;
        last.isError = true;
        last.content = msg;
    }
    aiState.streaming = false;
    chRenderMessages();
    chScrollBottom();
    chSetStreamUI(false);
    chSyncSilent();
}

async function chStreamEnd() {
    aiState.abortCtrl = null;
    chSetStreamUI(false);
    chRenderMessages();
    chScrollBottom();
    await chSyncAfterStream();
}

async function chSyncAfterStream() {
    // Refresh conversation list + messages so server ids / titles converge.
    if (!aiState.activeConv) {
        await chLoadConversations();
        return;
    }
    const convId = aiState.activeConv.id;
    try {
        const convs = await api('GET', 'ai/conversations');
        aiState.conversations = convs;
        const detail = await api('GET', 'ai/conversations/' + convId);
        aiState.activeConv = detail.conversation;
        aiState.messages = detail.messages;
    } catch (e) {}
    chRenderAll();
    chScrollBottom();
}

async function chSyncSilent() {
    if (!aiState.activeConv) return;
    const convId = aiState.activeConv.id;
    try {
        const detail = await api('GET', 'ai/conversations/' + convId);
        aiState.activeConv = detail.conversation;
        aiState.messages = detail.messages;
    } catch (e) {}
}

// ============================================================
// Regenerate / edit / stop
// ============================================================
async function chRegenerate(messageId) {
    if (aiState.streaming || !aiState.activeConv) return;
    const idx = aiState.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    aiState.messages.splice(idx);
    const placeholder = { id: 'tmp' + Date.now(), role: 'assistant', content: '', reasoning: '', isStreaming: true, isError: false };
    aiState.messages.push(placeholder);

    chRenderMessages();
    chScrollBottom();
    chSetStreamUI(true);

    await chStream('ai/conversations/' + aiState.activeConv.id + '/regenerate', {}, placeholder.id);
}

function chEditMessage(messageId) {
    const msg = aiState.messages.find(m => m.id === messageId);
    if (!msg || msg.role !== 'user' || aiState.streaming || !aiState.activeConv) return;

    aiState.editingMsgId = messageId;
    aiState.composerValue = msg.content || '';
    aiState.attachments = (msg.attachments || []).map(a => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, kind: a.kind }));

    const input = document.getElementById('chInput');
    if (input) {
        input.value = aiState.composerValue;
        chGrowComposer(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
    chRenderAttachRow();
    chRenderMessages();
    chScrollBottom();
}

function chStop() {
    if (aiState.abortCtrl) {
        aiState.abortCtrl.abort();
        aiState.abortCtrl = null;
    }
    aiState.streaming = false;
    chSetStreamUI(false);
}

// ============================================================
// Copy / misc helpers
// ============================================================
function chCopyResponse(messageId, btn) {
    const msg = aiState.messages.find(m => m.id === messageId);
    if (!msg || !msg.content) return;
    navigator.clipboard.writeText(msg.content)
        .then(() => {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1600);
            } else {
                toast('Copied to clipboard.', 'success');
            }
        })
        .catch(() => toast('Could not copy.', 'error'));
}

function chFormatTime(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

function chRelTime(dt) {
    if (!dt) return '';
    try {
        const t = new Date(dt).getTime();
        const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return new Date(dt).toLocaleDateString();
    } catch (e) {
        return '';
    }
}

function chScrollBottom() {
    const el = document.getElementById('chMessages');
    if (el) el.scrollTop = el.scrollHeight;
}