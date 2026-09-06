-- ficksie Database Schema
-- MySQL / MariaDB

--CREATE DATABASE IF NOT EXISTS toolhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--USE toolhub;

-- Users table (prepared for future auth)
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tool modules registry
CREATE TABLE IF NOT EXISTS modules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'fas fa-puzzle-piece',
    description TEXT DEFAULT NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Categories for Command Hub (extensible: module_id links categories to a tool)
CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    module_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6c757d',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Commands (Command Hub tool)
CREATE TABLE IF NOT EXISTS commands (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED DEFAULT NULL,
    category_id INT UNSIGNED DEFAULT NULL,
    title VARCHAR(200) NOT NULL,
    command TEXT NOT NULL,
    description TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Indexes for search performance
CREATE INDEX idx_commands_search ON commands(title(100), command(100), description(100));
CREATE INDEX idx_categories_module ON categories(module_id);
CREATE INDEX idx_commands_category ON commands(category_id);

-- Snippets for email responses
CREATE TABLE IF NOT EXISTS snippets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED DEFAULT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Email Deliverability Tester
CREATE TABLE IF NOT EXISTS email_tests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    test_token VARCHAR(32) NOT NULL UNIQUE,
    email_address VARCHAR(255) NOT NULL,
    status ENUM('waiting','received','analyzing','complete','expired','error') NOT NULL DEFAULT 'waiting',
    raw_message LONGTEXT DEFAULT NULL,
    message_size INT UNSIGNED DEFAULT NULL,
    analysis_result JSON DEFAULT NULL,
    score INT UNSIGNED DEFAULT NULL,
    expires_at DATETIME NOT NULL,
    received_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email_tests_token (test_token),
    INDEX idx_email_tests_user (user_id),
    INDEX idx_email_tests_expires (expires_at),
    INDEX idx_email_tests_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Review Tracking
CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED DEFAULT NULL,
    ticket_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    review_date DATE NOT NULL,
    label ENUM('Yourhosting','Versio','Argeweb','Hosting.nl') NOT NULL,
    platform ENUM('Trustpilot','Google','Webhosters') NOT NULL,
    rating TINYINT UNSIGNED DEFAULT NULL,
    review_link VARCHAR(500) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    status ENUM('Review Requested','Review Received') NOT NULL DEFAULT 'Review Requested',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_reviews_ticket (ticket_number),
    INDEX idx_reviews_status (status),
    INDEX idx_reviews_label (label),
    INDEX idx_reviews_platform (platform)
) ENGINE=InnoDB;

-- IP Reputation cache
CREATE TABLE IF NOT EXISTS ip_cache (
    ip VARCHAR(45) NOT NULL,
    source VARCHAR(50) NOT NULL,
    data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ip, source),
    INDEX idx_ip_cache_created (created_at)
) ENGINE=InnoDB;

-- ============================================
-- AI Assistant (NVIDIA NIM)
-- ============================================

-- AI generic key/value cache (used to cache the live NVIDIA model catalog)
CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key VARCHAR(64) PRIMARY KEY,
    data MEDIUMBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- AI conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
    model VARCHAR(150) NOT NULL DEFAULT 'nvidia/nemotron-3-super-120b-a12b',
    system_prompt TEXT DEFAULT NULL,
    last_message_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ai_conv_user (user_id, last_message_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- AI messages
CREATE TABLE IF NOT EXISTS ai_messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    role ENUM('user','assistant') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    reasoning MEDIUMTEXT DEFAULT NULL,
    attachments JSON DEFAULT NULL,
    model VARCHAR(150) DEFAULT NULL,
    is_error TINYINT(1) NOT NULL DEFAULT 0,
    prompt_tokens INT UNSIGNED DEFAULT NULL,
    completion_tokens INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_msg_conv (conversation_id, id),
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- AI file attachments (images and, in the future, other file types)
CREATE TABLE IF NOT EXISTS ai_attachments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    conversation_id INT UNSIGNED DEFAULT NULL,
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    size INT UNSIGNED NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'image',
    data LONGBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_att_conv (conversation_id),
    INDEX idx_ai_att_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB;
