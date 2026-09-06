<?php
/**
 * ficksie - Entry Point
 *
 * Serves the main SPA HTML shell.
 * All API routes are handled by api/index.php via .htaccess rewriting.
 */

require_once __DIR__ . '/config.php';

$appName = APP_NAME;
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <title><?= $appName ?></title>
    <link rel="icon" type="image/png" href="ficksie_logo_nt.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css?v=127">
</head>
<body>
    <div id="app">
        <div class="brand-bar" id="brandBar">
            <div class="logo">
                <div class="logo-images">
                    <img src="ficksie_logo_nt.png" alt="<?= $appName ?>" class="logo-img">
                    <div class="logo-text">
                        <img src="ficksie_logo_t.png" alt="<?= $appName ?>" class="logo-text-img">
                        <div class="slogan">Niet moeilijk doen, ficksie het ff</div>
                    </div>
                </div>
            </div>
            <div class="brand-bar-right">
                <div class="brand-tool-info">
                    <h1 id="pageTitle">Dashboard</h1>
                    <p id="pageSubtitle" class="text-muted">Your central workspace</p>
                </div>
                <button class="btn btn-icon" id="themeToggle" title="Toggle theme">
                    <i class="fas fa-moon"></i>
                </button>
            </div>
        </div>
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar" title="Toggle sidebar">
                    <i class="fas fa-chevron-left"></i>
                </button>
            </div>

            <nav class="sidebar-nav" id="sidebarNav">
                <a class="nav-pill active" data-view="dashboard" title="Dashboard">
                    <i class="fas fa-th-large"></i>
                    <span class="nav-pill-label">Dashboard</span>
                </a>

                <div class="nav-group">
                    <button class="nav-section" data-group="email-tools">
                        <span class="nav-section-label">Email Tools</span>
                        <i class="fas fa-chevron-right nav-section-arrow"></i>
                    </button>
                    <div class="nav-group-body" data-group-body="email-tools">
                        <a class="nav-pill" data-view="email-anonymizer" title="Email Anonymizer">
                            <i class="fas fa-mask"></i>
                            <span class="nav-pill-label">Email Anonymizer</span>
                        </a>
                        <a class="nav-pill" data-view="email-header-viz" title="Header Visualizer">
                            <i class="fas fa-code-branch"></i>
                            <span class="nav-pill-label">Header Visualizer</span>
                        </a>
                        <a class="nav-pill" data-view="email-deliverability" title="Email Tester">
                            <i class="fas fa-paper-plane"></i>
                            <span class="nav-pill-label">Email Tester</span>
                        </a>
                        <a class="nav-pill" data-view="snippets" title="Snippets">
                            <i class="fas fa-reply"></i>
                            <span class="nav-pill-label">Snippets</span>
                        </a>
                    </div>
                </div>

                <div class="nav-group">
                    <button class="nav-section" data-group="text-content">
                        <span class="nav-section-label">Text &amp; Content</span>
                        <i class="fas fa-chevron-right nav-section-arrow"></i>
                    </button>
                    <div class="nav-group-body" data-group-body="text-content">
                        <a class="nav-pill" data-view="rte-editor" title="Text Editor">
                            <i class="fas fa-file-lines"></i>
                            <span class="nav-pill-label">Text Editor</span>
                        </a>
                        <a class="nav-pill" data-view="text-toolkit" title="Text Toolkit">
                            <i class="fas fa-font"></i>
                            <span class="nav-pill-label">Text Toolkit</span>
                        </a>
                    </div>
                </div>

                <div class="nav-group">
                    <button class="nav-section" data-group="network-security">
                        <span class="nav-section-label">Network &amp; Security</span>
                        <i class="fas fa-chevron-right nav-section-arrow"></i>
                    </button>
                    <div class="nav-group-body" data-group-body="network-security">
                        <a class="nav-pill" data-view="dns-lookup" title="DNS Lookup">
                            <i class="fas fa-globe"></i>
                            <span class="nav-pill-label">DNS Lookup</span>
                        </a>
                        <a class="nav-pill" data-view="ssl-toolkit" title="SSL/TLS">
                            <i class="fas fa-shield-halved"></i>
                            <span class="nav-pill-label">SSL/TLS</span>
                        </a>
                        <a class="nav-pill" data-view="ip-reputation" title="IP Reputation">
                            <i class="fas fa-shield-halved"></i>
                            <span class="nav-pill-label">IP Reputation</span>
                        </a>
                    </div>
                </div>

                <div class="nav-group">
                    <button class="nav-section" data-group="utility">
                        <span class="nav-section-label">Utility</span>
                        <i class="fas fa-chevron-right nav-section-arrow"></i>
                    </button>
                    <div class="nav-group-body" data-group-body="utility">
                        <a class="nav-pill" data-view="password-generator" title="Password Generator">
                            <i class="fas fa-key"></i>
                            <span class="nav-pill-label">Password Generator</span>
                        </a>
                        <a class="nav-pill" data-view="commands" title="Commands">
                            <i class="fas fa-terminal"></i>
                            <span class="nav-pill-label">Commands</span>
                        </a>
                    </div>
                </div>

                <div class="nav-group">
                    <button class="nav-section" data-group="sales">
                        <span class="nav-section-label">Sales</span>
                        <i class="fas fa-chevron-right nav-section-arrow"></i>
                    </button>
                    <div class="nav-group-body" data-group-body="sales">
                        <a class="nav-pill" data-view="review-tracker" title="Reviews">
                            <i class="fas fa-star"></i>
                            <span class="nav-pill-label">Reviews</span>
                        </a>
                    </div>
                </div>

                <div class="nav-group nav-group-admin-fixed">
                    <button class="nav-section nav-section-admin">
                        <span class="nav-section-label">Administration</span>
                    </button>
                    <div class="nav-group-body" data-group-body="administration">
                        <a class="nav-pill admin-only" data-view="users" title="Manage Users">
                            <i class="fas fa-users"></i>
                            <span class="nav-pill-label">Manage Users</span>
                        </a>
                    </div>
                </div>
            </nav>

            <div class="sidebar-footer">
                <div class="version-badge">v1.1.2</div>
                <button class="btn btn-ghost btn-sm" id="logoutBtn" title="Sign out">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Sign out</span>
                </button>
            </div>
        </aside>

        <main class="main-content" id="mainContent">
            <div class="tab-bar" id="tabBar" style="display:none"></div>

            <div class="content-body" id="contentBody">
                <!-- Dashboard loaded by default -->
            </div>
        </main>
    </div>

    <!-- Spotlight Search -->
    <div class="sp-backdrop" id="spBackdrop">
        <div class="sp-panel" role="dialog" aria-label="Quick search">
            <div class="sp-input-row">
                <i class="fas fa-magnifying-glass"></i>
                <input type="text" class="sp-input" id="spInput" placeholder="Search tools, links, everything\u2026" autocomplete="off" spellcheck="false">
                <kbd class="sp-kbd">esc</kbd>
            </div>
            <div class="sp-results"></div>
            <div class="sp-footer">
                <span><kbd class="sp-kbd">\u2191</kbd><kbd class="sp-kbd">\u2193</kbd> navigate</span>
                <span><kbd class="sp-kbd">\u21b5</kbd> open</span>
                <span><kbd class="sp-kbd">esc</kbd> close</span>
            </div>
        </div>
    </div>

    <!-- Command Modal -->
    <div class="modal-overlay" id="commandModal">
        <div class="modal">
            <div class="modal-header">
                <h2 id="commandModalTitle">Add Command</h2>
                <button class="modal-close" data-modal="commandModal">&times;</button>
            </div>
            <form id="commandForm">
                <input type="hidden" name="id" id="commandId">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="commandTitle">Title</label>
                        <input type="text" id="commandTitle" name="title" required placeholder="e.g. List files with details">
                    </div>
                    <div class="form-group">
                        <label for="commandCategory">Category</label>
                        <select id="commandCategory" name="category_id">
                            <option value="">No category</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="commandContent">Command</label>
                        <textarea id="commandContent" name="command" rows="3" required placeholder="e.g. ls -lah" class="font-mono"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="commandDescription">Description <span class="text-muted">(optional)</span></label>
                        <textarea id="commandDescription" name="description" rows="2" placeholder="What does this command do?"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-modal="commandModal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="commandSubmitBtn">
                        <i class="fas fa-plus"></i> Add Command
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Category Modal -->
    <div class="modal-overlay" id="categoryModal">
        <div class="modal modal-sm">
            <div class="modal-header">
                <h2 id="categoryModalTitle">Add Category</h2>
                <button class="modal-close" data-modal="categoryModal">&times;</button>
            </div>
            <form id="categoryForm">
                <input type="hidden" name="id" id="categoryId">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="categoryName">Category Name</label>
                        <input type="text" id="categoryName" name="name" required placeholder="e.g. File Operations">
                    </div>
                    <div class="form-group">
                        <label for="categoryColor">Color</label>
                        <div class="color-picker-row">
                            <input type="color" id="categoryColor" name="color" value="#0d6efd">
                            <input type="text" id="categoryColorHex" maxlength="7" value="#0d6efd">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-modal="categoryModal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="categorySubmitBtn">
                        <i class="fas fa-plus"></i> Add Category
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Category Manager Modal -->
    <div class="modal-overlay" id="categoryManagerModal">
        <div class="modal modal-lg">
            <div class="modal-header">
                <h2><i class="fas fa-tags"></i> Manage Categories</h2>
                <button class="modal-close" data-modal="categoryManagerModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="cat-manager-toolbar">
                    <div class="search-input-wrap" style="flex:1;max-width:320px">
                        <i class="fas fa-search"></i>
                        <input type="text" id="catManagerSearch" placeholder="Search categories..." autocomplete="off">
                    </div>
                    <button class="btn btn-primary" id="catManagerAddBtn">
                        <i class="fas fa-plus"></i> Add Category
                    </button>
                </div>
                <div class="categories-grid" id="catManagerGrid">
                    <div class="loading-spinner" style="grid-column:1/-1">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading...</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Confirm Modal -->
    <div class="modal-overlay" id="confirmModal">
        <div class="modal modal-sm">
            <div class="modal-header">
                <h2 id="confirmModalTitle">Confirm</h2>
                <button class="modal-close" data-modal="confirmModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="confirm-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <p id="confirmModalMessage" class="confirm-message">Are you sure?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-modal="confirmModal">Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmDeleteBtn">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    </div>

    <!-- Snippet Modal -->
    <div class="modal-overlay" id="snippetModal">
        <div class="modal">
            <div class="modal-header">
                <h2 id="snippetModalTitle">Add Snippet</h2>
                <button class="modal-close" data-modal="snippetModal">&times;</button>
            </div>
            <form id="snippetForm">
                <input type="hidden" name="id" id="snippetId">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="snippetTitle">Title</label>
                        <input type="text" id="snippetTitle" name="title" required placeholder="e.g. Thank you for your inquiry">
                    </div>
                    <div class="form-group">
                        <label for="snippetContent">Content</label>
                        <textarea id="snippetContent" name="content" rows="8" required placeholder="Write your email response here..." class="font-mono" style="white-space:pre-wrap"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-modal="snippetModal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="snippetSubmitBtn">
                        <i class="fas fa-plus"></i> Add Snippet
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Review Modal -->
    <div class="modal-overlay" id="reviewModal">
        <div class="modal">
            <div class="modal-header">
                <h2 id="reviewModalTitle">Add Review</h2>
                <button class="modal-close" data-modal="reviewModal">&times;</button>
            </div>
            <form id="reviewForm">
                <input type="hidden" name="id" id="reviewId">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="reviewTicketNumber">Ticket Number <span class="text-muted">*</span></label>
                        <input type="text" id="reviewTicketNumber" name="ticket_number" required placeholder="e.g. #12345">
                    </div>
                    <div class="form-group">
                        <label for="reviewCustomerName">Customer Name <span class="text-muted">*</span></label>
                        <input type="text" id="reviewCustomerName" name="customer_name" required placeholder="e.g. John Doe">
                    </div>
                    <div class="form-group">
                        <label for="reviewDate">Review Date <span class="text-muted">*</span></label>
                        <input type="date" id="reviewDate" name="review_date" required>
                    </div>
                    <div class="form-group">
                        <label for="reviewLabel">Label <span class="text-muted">*</span></label>
                        <select id="reviewLabel" name="label" required>
                            <option value="">Select label...</option>
                            <option value="Yourhosting">Yourhosting</option>
                            <option value="Versio">Versio</option>
                            <option value="Argeweb">Argeweb</option>
                            <option value="Hosting.nl">Hosting.nl</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="reviewPlatform">Platform <span class="text-muted">*</span></label>
                        <select id="reviewPlatform" name="platform" required>
                            <option value="">Select platform...</option>
                            <option value="Trustpilot">Trustpilot</option>
                            <option value="Google">Google</option>
                            <option value="Webhosters">Webhosters</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="reviewRating">Rating</label>
                        <div class="rt-star-input" id="rtStarInput">
                            <button type="button" class="rt-star-btn" data-star="1">&#9733;</button>
                            <button type="button" class="rt-star-btn" data-star="2">&#9733;</button>
                            <button type="button" class="rt-star-btn" data-star="3">&#9733;</button>
                            <button type="button" class="rt-star-btn" data-star="4">&#9733;</button>
                            <button type="button" class="rt-star-btn" data-star="5">&#9733;</button>
                            <button type="button" class="rt-star-clear" id="rtStarClear" title="Clear rating">&times;</button>
                        </div>
                        <input type="hidden" id="reviewRating" name="rating" value="">
                    </div>
                    <div class="form-group">
                        <label for="reviewLink">Review Link <span class="text-muted">(optional)</span></label>
                        <input type="url" id="reviewLink" name="review_link" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label for="reviewNotes">Notes <span class="text-muted">(optional)</span></label>
                        <textarea id="reviewNotes" name="notes" rows="3" placeholder="Additional notes..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-modal="reviewModal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="reviewSubmitBtn">
                        <i class="fas fa-plus"></i> Add Review
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Login Screen -->
    <div class="login-overlay" id="loginScreen">
        <div class="login-bg"></div>
        <div class="login-card">
            <div class="login-card-inner">
                <div class="login-icon">
                    <img src="ficksie_logo_t.png" alt="<?= $appName ?>" class="login-logo-img">
                </div>
                <h1 class="login-title" style="display:none"><?= $appName ?></h1>
                <p class="login-subtitle">Niet moeilijk doen, ficksie het ff</p>

                <!-- Login Form -->
                <form id="loginForm">
                    <div class="login-field">
                        <label for="loginUsername">Username or Email</label>
                        <input type="text" id="loginUsername" name="username" placeholder="Enter your username" required autocomplete="username" spellcheck="false">
                    </div>
                    <div class="login-field">
                        <label for="loginPassword">Password</label>
                        <input type="password" id="loginPassword" name="password" placeholder="Enter your password" required autocomplete="current-password">
                    </div>
                    <div class="login-error" id="loginError"></div>
                    <button type="submit" class="login-btn login-btn-primary" id="loginBtn">
                        <span class="login-btn-text">Sign In</span>
                        <span class="login-btn-loading"><i class="fas fa-spinner fa-spin"></i></span>
                    </button>
                </form>

                <p class="login-alt-link" id="registerLinkWrap">
                    <a href="#" id="showRegisterLink">Create an admin account</a>
                </p>

                <!-- Register Form -->
                <form id="registerForm" style="display:none">
                    <div class="login-field">
                        <label for="regUsername">Username</label>
                        <input type="text" id="regUsername" name="username" placeholder="Choose a username" required autocomplete="off" spellcheck="false">
                    </div>
                    <div class="login-field">
                        <label for="regEmail">Email</label>
                        <input type="email" id="regEmail" name="email" placeholder="your@email.com" required autocomplete="off">
                    </div>
                    <div class="login-field">
                        <label for="regPassword">Password</label>
                        <input type="password" id="regPassword" name="password" placeholder="At least 6 characters" required autocomplete="new-password">
                    </div>
                    <div class="login-error" id="registerError"></div>
                    <button type="submit" class="login-btn login-btn-primary" id="registerBtn">
                        <span class="login-btn-text">Create Account</span>
                        <span class="login-btn-loading"><i class="fas fa-spinner fa-spin"></i></span>
                    </button>
                    <button type="button" class="login-btn login-btn-secondary" id="backToLoginBtn">
                        <i class="fas fa-arrow-left"></i> Back to Sign In
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Toast container -->
    <div class="toast-container" id="toastContainer"></div>
<script src="assets/js/dns.js?v=45"></script>
<script src="assets/js/password-generator.js?v=22"></script>
<script src="assets/js/ssl-toolkit.js?v=7"></script>
    <script src="assets/js/email-tester.js?v=7"></script>
    <script src="assets/js/text-toolkit.js?v=2"></script>
<script src="assets/js/review-tracker.js?v=3"></script>

    <script src="assets/js/app.js?v=124"></script>
</body>
</html>
