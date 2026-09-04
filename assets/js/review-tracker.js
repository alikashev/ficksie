/* ─── Review Tracker ──────────────────────────────────────────────── */

const rtState = {
    reviews: [],
    searchQuery: '',
    filterStatus: '',
    filterLabel: '',
    filterPlatform: '',
    filterRating: '',
    editingId: null,
    viewMonth: new Date().getMonth(),
    viewYear: new Date().getFullYear(),
};

const rtMonthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const rtLabels = ['Yourhosting', 'Versio', 'Argeweb', 'Hosting.nl'];
const rtPlatforms = ['Trustpilot', 'Google', 'Webhosters'];

function rtLabelColor(label) {
    const m = {
        'Yourhosting': '#ff6b35',
        'Versio':      '#00a19a',
        'Argeweb':     '#e53935',
        'Hosting.nl':  '#1a73e8',
    };
    return m[label] || '#6c757d';
}

function rtPlatformColor(platform) {
    const m = {
        'Trustpilot':  '#00b67a',
        'Google':      '#4285f4',
        'Webhosters':  '#8b5cf6',
    };
    return m[platform] || '#6c757d';
}

function rtPlatformIcon(platform) {
    const m = {
        'Trustpilot': 'fa-star',
        'Google':     'fa-g',
        'Webhosters': 'fa-server',
    };
    return m[platform] || 'fa-globe';
}

function rtRenderStars(rating) {
    if (!rating) return '<span class="rt-stars-empty">-</span>';
    let html = '<span class="rt-stars">';
    for (let i = 1; i <= 5; i++) {
        html += i <= rating
            ? '<span class="rt-star on">&#9733;</span>'
            : '<span class="rt-star">&#9734;</span>';
    }
    html += '</span>';
    return html;
}

function rtFormatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rtGetFiltered() {
    let filtered = rtState.reviews;

    if (rtState.searchQuery) {
        const q = rtState.searchQuery.toLowerCase();
        filtered = filtered.filter(r =>
            (r.ticket_number || '').toLowerCase().includes(q) ||
            (r.customer_name || '').toLowerCase().includes(q) ||
            (r.label || '').toLowerCase().includes(q) ||
            (r.platform || '').toLowerCase().includes(q)
        );
    }

    if (rtState.filterStatus) {
        filtered = filtered.filter(r => r.status === rtState.filterStatus);
    }
    if (rtState.filterLabel) {
        filtered = filtered.filter(r => r.label === rtState.filterLabel);
    }
    if (rtState.filterPlatform) {
        filtered = filtered.filter(r => r.platform === rtState.filterPlatform);
    }
    if (rtState.filterRating) {
        filtered = filtered.filter(r => String(r.rating) === rtState.filterRating);
    }

    return filtered;
}

function rtRenderTable(reviews) {
    if (!reviews.length) {
        return `
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <h3>No reviews found</h3>
                <p>Add your first review to get started.</p>
            </div>
        `;
    }

    const rows = reviews.map(r => {
        const statusClass = r.status === 'Review Received' ? 'rt-status-received' : 'rt-status-requested';
        const rowClass = r.status === 'Review Received' ? 'rt-row rt-row-received' : 'rt-row';
        const labelColor = rtLabelColor(r.label);
        const platformColor = rtPlatformColor(r.platform);
        const linkHtml = r.review_link
            ? `<a href="${escHtml(r.review_link)}" target="_blank" rel="noopener" class="rt-link" title="Open review"><i class="fas fa-external-link-alt"></i></a>`
            : '<span class="rt-no-link">-</span>';

        return `
            <tr class="${rowClass}" data-id="${r.id}">
                <td class="rt-cell-ticket"><span class="rt-ticket-hash">#</span>${escHtml(r.ticket_number)}</td>
                <td class="rt-cell-name">${escHtml(r.customer_name)}</td>
                <td class="rt-cell-date">${rtFormatDate(r.review_date)}</td>
                <td class="rt-cell-label">
                    <span class="rt-badge rt-badge-label" style="background:${labelColor}18;color:${labelColor}">${escHtml(r.label)}</span>
                </td>
                <td class="rt-cell-platform">
                    <span class="rt-badge rt-badge-platform" style="background:${platformColor}18;color:${platformColor}">
                        <i class="fas ${rtPlatformIcon(r.platform)}"></i> ${escHtml(r.platform)}
                    </span>
                </td>
                <td class="rt-cell-rating">${rtRenderStars(r.rating)}</td>
                <td class="rt-cell-status">
                    <button class="rt-badge rt-badge-status ${statusClass} rt-toggle-status" data-id="${r.id}" title="Click to toggle status">
                        <i class="fas ${r.status === 'Review Received' ? 'fa-check-circle' : 'fa-clock'}"></i> ${escHtml(r.status)}
                    </button>
                </td>
                <td class="rt-cell-link">${linkHtml}</td>
                <td class="rt-cell-actions">
                    <button class="btn btn-sm btn-edit rt-edit-btn" data-id="${r.id}" title="Edit review">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-delete rt-delete-btn" data-id="${r.id}" title="Delete review">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="rt-table-wrap">
            <table class="rt-table">
                <thead>
                    <tr>
                        <th class="rt-th-ticket">Ticket</th>
                        <th class="rt-th-name">Customer</th>
                        <th class="rt-th-date">Date</th>
                        <th class="rt-th-label">Label</th>
                        <th class="rt-th-platform">Platform</th>
                        <th class="rt-th-rating">Rating</th>
                        <th class="rt-th-status">Status</th>
                        <th class="rt-th-link">Link</th>
                        <th class="rt-th-actions"></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

async function renderReviewTracker() {
    setPageTitle('Review Tracker', 'Track and manage customer reviews');

    const body = getActiveBody();
    body.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Loading reviews...</span></div>';

    try {
        const reviews = await api('GET', 'reviews');
        rtState.reviews = reviews;

        const monthLabel = rtMonthNames[rtState.viewMonth] + ' ' + rtState.viewYear;

        body.innerHTML = `
            <div class="toolbar">
                <div class="rt-stats-row">
                    <div class="rt-stats">
                        <div class="rt-month-nav">
                            <button class="rt-month-btn" id="rtPrevMonth" title="Previous month"><i class="fas fa-chevron-left"></i></button>
                            <span class="rt-month-label" id="rtMonthLabel">${monthLabel}</span>
                            <button class="rt-month-btn" id="rtNextMonth" title="Next month"><i class="fas fa-chevron-right"></i></button>
                        </div>
                        <div class="rt-stat-divider"></div>
                        <div class="rt-stat">
                            <span class="rt-stat-value rt-stat-requested" id="rtRequestedCount">0</span>
                            <span class="rt-stat-label">Requested</span>
                        </div>
                        <div class="rt-stat-divider"></div>
                        <div class="rt-stat">
                            <span class="rt-stat-value" id="rtReceivedCount">0</span>
                            <span class="rt-stat-label">Received</span>
                        </div>
                        <div class="rt-stat-divider"></div>
                        <div class="rt-stat">
                            <span class="rt-stat-value rt-stat-bonus" id="rtBonusValue">&euro;0</span>
                            <span class="rt-stat-label">Bonus</span>
                        </div>
                    </div>
                </div>
                <div class="toolbar-search-row">
                    <div class="search-input-wrap" style="max-width:420px">
                        <i class="fas fa-search"></i>
                        <input type="text" id="rtSearch" placeholder="Search by ticket or customer..." autocomplete="off">
                    </div>
                    <button class="btn btn-primary" id="rtAddBtn">
                        <i class="fas fa-plus"></i> Add Review
                    </button>
                </div>
                <div class="toolbar-filter-row rt-filter-row">
                    <select class="filter-select" id="rtFilterLabel">
                        <option value="">All Labels</option>
                        ${rtLabels.map(l => `<option value="${l}">${l}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="rtFilterPlatform">
                        <option value="">All Platforms</option>
                        ${rtPlatforms.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="rtFilterStatus">
                        <option value="">All Statuses</option>
                        <option value="Review Requested">Review Requested</option>
                        <option value="Review Received">Review Received</option>
                    </select>
                    <select class="filter-select" id="rtFilterRating">
                        <option value="">All Ratings</option>
                        <option value="5">&#9733;&#9733;&#9733;&#9733;&#9733; 5</option>
                        <option value="4">&#9733;&#9733;&#9733;&#9733; 4</option>
                        <option value="3">&#9733;&#9733;&#9733; 3</option>
                        <option value="2">&#9733;&#9733; 2</option>
                        <option value="1">&#9733; 1</option>
                    </select>
                </div>
            </div>

            <div id="rtTableContainer">
                ${rtRenderTable(reviews)}
            </div>
        `;

        rtAttachEvents();
        rtRefreshStats();
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load reviews</h3><p>${escHtml(err.message)}</p></div>`;
    }
}

function rtAttachEvents() {
    const searchInput = document.getElementById('rtSearch');
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            rtState.searchQuery = searchInput.value.trim();
            rtRefreshTable();
        }, 250);
    });

    ['rtFilterLabel', 'rtFilterPlatform', 'rtFilterStatus', 'rtFilterRating'].forEach(id => {
        const key = id.replace('rtFilter', 'filter');
        document.getElementById(id).addEventListener('change', (e) => {
            rtState[key] = e.target.value;
            rtRefreshTable();
        });
    });

    document.getElementById('rtAddBtn').addEventListener('click', () => rtOpenModal());

    document.getElementById('rtPrevMonth').addEventListener('click', rtPrevMonth);
    document.getElementById('rtNextMonth').addEventListener('click', rtNextMonth);

    rtAttachRowEvents();

    document.getElementById('reviewForm').addEventListener('submit', rtSubmitForm);

    rtInitStarInput();
}

function rtRefreshStats() {
    const monthReviews = rtState.reviews.filter(r => {
        const d = new Date(r.review_date + 'T00:00:00');
        return d.getMonth() === rtState.viewMonth && d.getFullYear() === rtState.viewYear;
    });
    const requestedCount = monthReviews.filter(r => r.status === 'Review Requested').length;
    const receivedCount = monthReviews.filter(r => r.status === 'Review Received').length;
    const bonus = receivedCount * 20;

    const reqEl = document.getElementById('rtRequestedCount');
    const recEl = document.getElementById('rtReceivedCount');
    const bonusEl = document.getElementById('rtBonusValue');
    if (reqEl) reqEl.textContent = requestedCount;
    if (recEl) recEl.textContent = receivedCount;
    if (bonusEl) bonusEl.innerHTML = '&euro;' + bonus;
}

function rtRefreshMonthLabel() {
    const labelEl = document.getElementById('rtMonthLabel');
    if (labelEl) labelEl.textContent = rtMonthNames[rtState.viewMonth] + ' ' + rtState.viewYear;
}

function rtPrevMonth() {
    rtState.viewMonth--;
    if (rtState.viewMonth < 0) { rtState.viewMonth = 11; rtState.viewYear--; }
    rtRefreshMonthLabel();
    rtRefreshStats();
}

function rtNextMonth() {
    rtState.viewMonth++;
    if (rtState.viewMonth > 11) { rtState.viewMonth = 0; rtState.viewYear++; }
    rtRefreshMonthLabel();
    rtRefreshStats();
}

function rtRefreshTable() {
    const filtered = rtGetFiltered();
    document.getElementById('rtTableContainer').innerHTML = rtRenderTable(filtered);
    rtRefreshStats();
    rtAttachRowEvents();
}

function rtAttachRowEvents() {
    document.querySelectorAll('.rt-toggle-status').forEach(btn => {
        btn.addEventListener('click', () => rtToggleStatus(btn.dataset.id));
    });

    document.querySelectorAll('.rt-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const review = rtState.reviews.find(r => r.id == btn.dataset.id);
            if (review) rtOpenModal(review);
        });
    });

    document.querySelectorAll('.rt-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => rtDeleteReview(btn.dataset.id));
    });
}

function rtInitStarInput() {
    const starBtns = document.querySelectorAll('#rtStarInput .rt-star-btn');
    const ratingInput = document.getElementById('reviewRating');
    const clearBtn = document.getElementById('rtStarClear');

    let currentRating = parseInt(ratingInput.value) || 0;

    function updateStarHighlight(val) {
        starBtns.forEach(btn => {
            const star = parseInt(btn.dataset.star);
            btn.classList.toggle('rt-star-active', star <= val);
        });
    }

    if (currentRating) updateStarHighlight(currentRating);

    starBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            currentRating = parseInt(btn.dataset.star);
            ratingInput.value = currentRating;
            updateStarHighlight(currentRating);
        });

        btn.addEventListener('mouseenter', () => {
            updateStarHighlight(parseInt(btn.dataset.star));
        });
    });

    const starInput = document.getElementById('rtStarInput');
    starInput.addEventListener('mouseleave', () => {
        updateStarHighlight(currentRating);
    });

    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentRating = 0;
        ratingInput.value = '';
        updateStarHighlight(0);
    });
}

function rtOpenModal(review = null) {
    const form = document.getElementById('reviewForm');
    form.reset();

    const ratingInput = document.getElementById('reviewRating');
    ratingInput.value = '';
    document.querySelectorAll('#rtStarInput .rt-star-btn').forEach(b => b.classList.remove('rt-star-active'));

    document.querySelectorAll('[data-modal="reviewModal"]').forEach(el => {
        el.removeEventListener('click', rtModalClose);
        el.addEventListener('click', rtModalClose);
    });

    if (review) {
        document.getElementById('reviewModalTitle').textContent = 'Edit Review';
        document.getElementById('reviewSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Changes';
        document.getElementById('reviewId').value = review.id;
        document.getElementById('reviewTicketNumber').value = review.ticket_number;
        document.getElementById('reviewCustomerName').value = review.customer_name;
        document.getElementById('reviewDate').value = review.review_date;
        document.getElementById('reviewLabel').value = review.label;
        document.getElementById('reviewPlatform').value = review.platform;
        document.getElementById('reviewLink').value = review.review_link || '';
        document.getElementById('reviewNotes').value = review.notes || '';

        if (review.rating) {
            ratingInput.value = review.rating;
            document.querySelectorAll('#rtStarInput .rt-star-btn').forEach(b => {
                b.classList.toggle('rt-star-active', parseInt(b.dataset.star) <= review.rating);
            });
        }
    } else {
        document.getElementById('reviewModalTitle').textContent = 'Add Review';
        document.getElementById('reviewSubmitBtn').innerHTML = '<i class="fas fa-plus"></i> Add Review';
        document.getElementById('reviewId').value = '';
        document.getElementById('reviewDate').value = new Date().toISOString().split('T')[0];
    }

    openModal('reviewModal');
}

function rtModalClose() {
    closeModal('reviewModal');
}

async function rtSubmitForm(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('reviewSubmitBtn');
    submitBtn.disabled = true;

    const id = document.getElementById('reviewId').value;
    const data = {
        ticket_number: document.getElementById('reviewTicketNumber').value.trim(),
        customer_name: document.getElementById('reviewCustomerName').value.trim(),
        review_date:   document.getElementById('reviewDate').value,
        label:         document.getElementById('reviewLabel').value,
        platform:      document.getElementById('reviewPlatform').value,
        rating:        document.getElementById('reviewRating').value || null,
        review_link:   document.getElementById('reviewLink').value.trim() || null,
        notes:         document.getElementById('reviewNotes').value.trim() || null,
    };

    if (data.rating !== null) data.rating = parseInt(data.rating);

    const method = id ? 'PUT' : 'POST';
    const path = id ? `reviews/${id}` : 'reviews';
    const action = id ? 'updated' : 'created';

    try {
        await api(method, path, data);
        closeModal('reviewModal');
        toast(`Review ${action} successfully!`, 'success');
        renderReviewTracker();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        const isEdit = document.getElementById('reviewId').value;
        submitBtn.innerHTML = isEdit
            ? '<i class="fas fa-save"></i> Save Changes'
            : '<i class="fas fa-plus"></i> Add Review';
    }
}

async function rtToggleStatus(id) {
    const review = rtState.reviews.find(r => r.id == id);
    if (!review) return;

    const newStatus = review.status === 'Review Received' ? 'Review Requested' : 'Review Received';

    try {
        await api('PUT', `reviews/${id}`, { status: newStatus });
        toast(`Status changed to "${newStatus}"`, 'success');
        renderReviewTracker();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function rtDeleteReview(id) {
    const review = rtState.reviews.find(r => r.id == id);
    const ticket = review ? review.ticket_number : 'this review';
    const confirmed = await showConfirmModal(`Delete review for ticket ${ticket}?`);
    if (!confirmed) return;

    try {
        await api('DELETE', `reviews/${id}`);
        toast('Review deleted', 'success');
        renderReviewTracker();
    } catch (err) {
        toast(err.message, 'error');
    }
}
