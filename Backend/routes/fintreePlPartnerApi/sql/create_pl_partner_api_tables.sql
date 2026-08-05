-- Fintree PL Partner API - lender-side tables
-- MySQL 8 / MariaDB-compatible InnoDB definitions.
-- Review table names and collation before executing in UAT.

CREATE TABLE IF NOT EXISTS `pl_partner_api_clients` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_code` VARCHAR(50) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `api_key_hash` CHAR(64) NOT NULL,
  `status` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'INACTIVE',
  `allowed_ip_addresses` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_client_code` (`client_code`),
  UNIQUE KEY `uk_pl_partner_api_key_hash` (`api_key_hash`),
  KEY `idx_pl_partner_client_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_idempotency_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `request_method` VARCHAR(10) NOT NULL,
  `endpoint` VARCHAR(255) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `processing_status` ENUM('PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PROCESSING',
  `response_status` INT NULL,
  `response_body` LONGTEXT NULL,
  `lock_token` CHAR(36) NULL,
  `locked_until` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_idempotency` (`client_id`,`idempotency_key`),
  KEY `idx_pl_partner_idempotency_status` (`processing_status`,`locked_until`),
  CONSTRAINT `fk_pl_partner_idempotency_client`
    FOREIGN KEY (`client_id`) REFERENCES `pl_partner_api_clients` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_applications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `partner_application_id` CHAR(36) NOT NULL,
  `partner_application_number` VARCHAR(30) NULL,
  `external_application_reference` VARCHAR(100) NOT NULL,
  `lan` VARCHAR(50) NOT NULL,
  `source_system` VARCHAR(100) NOT NULL,
  `product_code` VARCHAR(60) NOT NULL,
  `create_request_hash` CHAR(64) NOT NULL,
  `status` ENUM(
    'CREATED',
    'CONSENT_RECORDED',
    'DETAILS_ACCEPTED',
    'DOCUMENTS_PARTIALLY_RECEIVED',
    'DOCUMENTS_RECEIVED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'CREATED',

  `customer_full_name` VARCHAR(150) NOT NULL,
  `customer_first_name` VARCHAR(60) NOT NULL,
  `customer_middle_name` VARCHAR(60) NULL,
  `customer_last_name` VARCHAR(60) NOT NULL,
  `customer_father_name` VARCHAR(150) NOT NULL,
  `pan_number` VARCHAR(10) NOT NULL,
  `date_of_birth` DATE NOT NULL,
  `gender` VARCHAR(10) NULL,
  `mobile_number` VARCHAR(20) NULL,
  `email` VARCHAR(254) NULL,
  `pan_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `pan_provider_reference` VARCHAR(150) NULL,
  `pan_verified_at` DATETIME(3) NULL,

  `latest_details_version` INT NULL,
  `details_updated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_application_id` (`partner_application_id`),
  UNIQUE KEY `uk_pl_partner_application_number` (`partner_application_number`),
  UNIQUE KEY `uk_pl_partner_external_reference` (`client_id`,`external_application_reference`),
  UNIQUE KEY `uk_pl_partner_lan` (`client_id`,`lan`),
  KEY `idx_pl_partner_application_status` (`status`,`updated_at`),
  CONSTRAINT `fk_pl_partner_application_client`
    FOREIGN KEY (`client_id`) REFERENCES `pl_partner_api_clients` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_application_consents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `application_id` BIGINT UNSIGNED NOT NULL,
  `consent_id` VARCHAR(150) NOT NULL,
  `consent_reference` VARCHAR(150) NOT NULL,
  `source_consent_reference` VARCHAR(150) NULL,
  `consent_type` VARCHAR(80) NOT NULL,
  `consent_template_id` VARCHAR(100) NOT NULL,
  `consent_version` VARCHAR(50) NOT NULL,
  `consent_text_hash` CHAR(64) NOT NULL,
  `accepted_at` DATETIME(3) NOT NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent_hash` CHAR(64) NULL,
  `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_consent_id` (`client_id`,`consent_id`),
  UNIQUE KEY `uk_pl_partner_consent_reference` (`consent_reference`),
  KEY `idx_pl_partner_consent_application` (`application_id`,`consent_type`),
  CONSTRAINT `fk_pl_partner_consent_client`
    FOREIGN KEY (`client_id`) REFERENCES `pl_partner_api_clients` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pl_partner_consent_application`
    FOREIGN KEY (`application_id`) REFERENCES `pl_partner_applications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_application_detail_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT UNSIGNED NOT NULL,
  `details_version` INT NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `details_json` LONGTEXT NOT NULL,
  `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_details_version` (`application_id`,`details_version`),
  KEY `idx_pl_partner_details_accepted` (`application_id`,`accepted_at`),
  CONSTRAINT `fk_pl_partner_details_application`
    FOREIGN KEY (`application_id`) REFERENCES `pl_partner_applications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_application_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT UNSIGNED NOT NULL,
  `partner_document_id` VARCHAR(150) NOT NULL,
  `source_document_id` VARCHAR(100) NOT NULL,
  `document_type` ENUM('AADHAAR_XML','AADHAAR_PDF') NOT NULL,
  `original_file_name` VARCHAR(255) NOT NULL,
  `stored_file_name` VARCHAR(255) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_size` INT UNSIGNED NOT NULL,
  `file_sha256` CHAR(64) NOT NULL,
  `source` VARCHAR(50) NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `status` ENUM('RECEIVED','REJECTED','INACTIVE') NOT NULL DEFAULT 'RECEIVED',
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_document_id` (`partner_document_id`),
  UNIQUE KEY `uk_pl_partner_source_document` (`application_id`,`source_document_id`,`document_type`),
  KEY `idx_pl_partner_document_status` (`application_id`,`status`),
  KEY `idx_pl_partner_document_hash` (`file_sha256`),
  CONSTRAINT `fk_pl_partner_document_application`
    FOREIGN KEY (`application_id`) REFERENCES `pl_partner_applications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_api_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `partner_application_id` VARCHAR(150) NULL,
  `endpoint` VARCHAR(255) NOT NULL,
  `request_method` VARCHAR(10) NOT NULL,
  `correlation_id` VARCHAR(100) NULL,
  `idempotency_key` VARCHAR(191) NULL,
  `request_hash` CHAR(64) NULL,
  `response_status` INT NOT NULL,
  `duration_ms` INT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_pl_partner_audit_client_created` (`client_id`,`created_at`),
  KEY `idx_pl_partner_audit_correlation` (`correlation_id`),
  KEY `idx_pl_partner_audit_application` (`partner_application_id`,`created_at`),
  CONSTRAINT `fk_pl_partner_audit_client`
    FOREIGN KEY (`client_id`) REFERENCES `pl_partner_api_clients` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
