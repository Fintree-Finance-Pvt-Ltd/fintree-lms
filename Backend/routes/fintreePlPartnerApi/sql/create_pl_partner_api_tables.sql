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
  -- client_id foreign key removed (clients table managed separately)
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
  `requested_amount` DECIMAL(18,2) NULL,
  `requested_tenure` INT NULL,
  `tenure_type` VARCHAR(20) NULL,
  -- Annual percentage as sent by the partner, e.g. 24.0000 = 24% p.a.
  `interest_rate` DECIMAL(8,4) NULL,
  -- Percentage as sent by the partner (processingFeePercent), e.g. 2.0000 = 2%.
  -- Converted to a 0-1 fraction only at the point of use in plPartnerBre.js.
  `processing_fee` DECIMAL(8,4) NULL,
  -- Optional repeat-customer signal from the Create payload. When present,
  -- feeds calculateRepeatCreditLimit (plPartnerBre.js) the same way
  -- RapidMoney's total_disbursed_applications/previous_loan_amount do.
  `previous_disbursed_application_count` INT NULL,
  `previous_loan_amount` DECIMAL(18,2) NULL,
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

  -- Employment & business details
  `employment_employment_type` VARCHAR(60) NULL,
  `employment_company_type` VARCHAR(60) NULL,
  `employment_company_name` VARCHAR(150) NULL,
  `employment_designation` VARCHAR(120) NULL,
  `employment_business_name` VARCHAR(150) NULL,
  `employment_business_constitution` VARCHAR(120) NULL,
  `employment_monthly_income` DECIMAL(18,2) NULL,
  `employment_annual_turnover` DECIMAL(18,2) NULL,
  `employment_employment_vintage` INT NULL,
  `employment_business_vintage` INT NULL,
  `employment_salary_mode` VARCHAR(60) NULL,
  `employment_completed_at` DATETIME(3) NULL,

  -- Aadhaar KYC
  `aadhaar_status` VARCHAR(30) NULL,
  `aadhaar_masked` VARCHAR(50) NULL,
  `aadhaar_verified_name` VARCHAR(150) NULL,
  `aadhaar_date_of_birth` DATE NULL,
  `aadhaar_gender` VARCHAR(10) NULL,
  `aadhaar_provider` VARCHAR(100) NULL,
  `aadhaar_provider_reference` VARCHAR(150) NULL,
  `aadhaar_verified_at` DATETIME(3) NULL,

  -- Permanent address
  `perm_address_line1` VARCHAR(255) NULL,
  `perm_address_line2` VARCHAR(255) NULL,
  `perm_landmark` VARCHAR(255) NULL,
  `perm_locality` VARCHAR(255) NULL,
  `perm_district` VARCHAR(120) NULL,
  `perm_city` VARCHAR(120) NULL,
  `perm_state` VARCHAR(120) NULL,
  `perm_country` VARCHAR(80) NULL,
  `perm_pincode` VARCHAR(20) NULL,
  `perm_source` VARCHAR(80) NULL,

  -- Current address
  `curr_same_as_perm` TINYINT(1) NULL,
  `curr_address_line1` VARCHAR(255) NULL,
  `curr_address_line2` VARCHAR(255) NULL,
  `curr_landmark` VARCHAR(255) NULL,
  `curr_locality` VARCHAR(255) NULL,
  `curr_district` VARCHAR(120) NULL,
  `curr_city` VARCHAR(120) NULL,
  `curr_state` VARCHAR(120) NULL,
  `curr_country` VARCHAR(80) NULL,
  `curr_pincode` VARCHAR(20) NULL,
  `curr_source` VARCHAR(80) NULL,

  -- Evidence / liveness
  `evidence_live_photo_document_reference` VARCHAR(150) NULL,
  `liveness_provider` VARCHAR(100) NULL,
  `liveness_reference` VARCHAR(150) NULL,
  `liveness_status` VARCHAR(60) NULL,
  `liveness_score` DECIMAL(6,5) NULL,
  `evidence_reference` VARCHAR(150) NULL,
  `evidence_latitude` DECIMAL(10,7) NULL,
  `evidence_longitude` DECIMAL(10,7) NULL,
  `evidence_captured_at` DATETIME(3) NULL,
  `evidence_verified_at` DATETIME(3) NULL,

  `latest_details_version` INT NULL,
  `details_updated_at` DATETIME(3) NULL,

  -- Selected offer (populated at details V2+)
  `selected_offer_amount` DECIMAL(18,2) NULL,
  `selected_offer_tenure` INT NULL,
  `selected_offer_selected_at` DATETIME(3) NULL,

  -- Bank details (populated at details V3+)
  `bank_account_holder_name` VARCHAR(200) NULL,
  `bank_account_number` VARCHAR(100) NULL,
  `bank_ifsc_code` VARCHAR(11) NULL,
  `bank_name` VARCHAR(150) NULL,
  `bank_account_type` VARCHAR(30) NULL,
  `bank_verified_at` DATETIME(3) NULL,

  -- eNACH mandate (populated at details V4+)
  `mandate_umrn` VARCHAR(100) NULL,
  `mandate_provider` VARCHAR(50) NULL,
  `mandate_type` VARCHAR(50) NULL,
  `mandate_authorized_at` DATETIME(3) NULL,

  -- BRE (approve endpoint) snapshot. See Backend/routes/fintreePlPartnerApi/services/plPartnerBre.js
  `bre_policy_version` VARCHAR(60) NULL,
  `bre_decision_stage` VARCHAR(30) NULL,
  `bre_status` VARCHAR(30) NULL,
  `bre_reason` VARCHAR(100) NULL,
  `bre_credit_limit` DECIMAL(18,2) NULL,
  -- Gross approved amount (pre PF/GST) — the RPS principal, what the customer owes back.
  `bre_gross_approved_amount` DECIMAL(18,2) NULL,
  -- Net disbursal amount (post PF/GST) — what actually gets wired to the customer.
  `bre_approved_loan_amount` DECIMAL(18,2) NULL,
  `bre_checked_at` DATETIME(3) NULL,
  `bre_details_json` LONGTEXT NULL,
  `bre_final_status` VARCHAR(30) NULL,
  `bre_final_reason` VARCHAR(100) NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_partner_application_id` (`partner_application_id`),
  UNIQUE KEY `uk_pl_partner_application_number` (`partner_application_number`),
  UNIQUE KEY `uk_pl_partner_external_reference` (`client_id`,`external_application_reference`),
  UNIQUE KEY `uk_pl_partner_lan` (`client_id`,`lan`),
  KEY `idx_pl_partner_application_status` (`status`,`updated_at`),
  -- client_id foreign key removed (clients table managed separately)
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
  -- client_id foreign key removed (clients table managed separately),
  CONSTRAINT `fk_pl_partner_consent_application`
    FOREIGN KEY (`application_id`) REFERENCES `pl_partner_applications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pl_partner_application_detail_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT UNSIGNED NOT NULL,
  `details_version` INT NOT NULL,
  `request_hash` CHAR(64) NOT NULL,

  -- Flattened detail columns (copied from incoming partner payload)
  `customer_full_name` VARCHAR(150) NULL,
  `customer_first_name` VARCHAR(60) NULL,
  `customer_middle_name` VARCHAR(60) NULL,
  `customer_last_name` VARCHAR(60) NULL,
  `customer_father_name` VARCHAR(150) NULL,
  `customer_pan_number` VARCHAR(20) NULL,
  `customer_date_of_birth` DATE NULL,
  `customer_gender` VARCHAR(10) NULL,
  `customer_mobile_number` VARCHAR(20) NULL,
  `customer_email` VARCHAR(254) NULL,

  `employment_employment_type` VARCHAR(60) NULL,
  `employment_company_type` VARCHAR(60) NULL,
  `employment_company_name` VARCHAR(150) NULL,
  `employment_designation` VARCHAR(120) NULL,
  `employment_business_name` VARCHAR(150) NULL,
  `employment_business_constitution` VARCHAR(120) NULL,
  `employment_monthly_income` DECIMAL(18,2) NULL,
  `employment_annual_turnover` DECIMAL(18,2) NULL,
  `employment_employment_vintage` INT NULL,
  `employment_business_vintage` INT NULL,
  `employment_salary_mode` VARCHAR(60) NULL,
  `employment_completed_at` DATETIME(3) NULL,

  `aadhaar_status` VARCHAR(30) NULL,
  `aadhaar_masked` VARCHAR(50) NULL,
  `aadhaar_verified_name` VARCHAR(150) NULL,
  `aadhaar_date_of_birth` DATE NULL,
  `aadhaar_gender` VARCHAR(10) NULL,
  `aadhaar_provider` VARCHAR(100) NULL,
  `aadhaar_provider_reference` VARCHAR(150) NULL,
  `aadhaar_verified_at` DATETIME(3) NULL,

  `perm_address_line1` VARCHAR(255) NULL,
  `perm_address_line2` VARCHAR(255) NULL,
  `perm_landmark` VARCHAR(255) NULL,
  `perm_locality` VARCHAR(255) NULL,
  `perm_district` VARCHAR(120) NULL,
  `perm_city` VARCHAR(120) NULL,
  `perm_state` VARCHAR(120) NULL,
  `perm_country` VARCHAR(80) NULL,
  `perm_pincode` VARCHAR(20) NULL,
  `perm_source` VARCHAR(80) NULL,

  `curr_same_as_perm` TINYINT(1) NULL,
  `curr_address_line1` VARCHAR(255) NULL,
  `curr_address_line2` VARCHAR(255) NULL,
  `curr_landmark` VARCHAR(255) NULL,
  `curr_locality` VARCHAR(255) NULL,
  `curr_district` VARCHAR(120) NULL,
  `curr_city` VARCHAR(120) NULL,
  `curr_state` VARCHAR(120) NULL,
  `curr_country` VARCHAR(80) NULL,
  `curr_pincode` VARCHAR(20) NULL,
  `curr_source` VARCHAR(80) NULL,

  `evidence_live_photo_document_reference` VARCHAR(150) NULL,
  `liveness_provider` VARCHAR(100) NULL,
  `liveness_reference` VARCHAR(150) NULL,
  `liveness_status` VARCHAR(60) NULL,
  `liveness_score` DECIMAL(6,5) NULL,
  `evidence_reference` VARCHAR(150) NULL,
  `evidence_latitude` DECIMAL(10,7) NULL,
  `evidence_longitude` DECIMAL(10,7) NULL,
  `evidence_captured_at` DATETIME(3) NULL,
  `evidence_verified_at` DATETIME(3) NULL,

  -- Selected offer (populated at V2+)
  `selected_offer_amount` DECIMAL(18,2) NULL,
  `selected_offer_tenure` INT NULL,
  `selected_offer_selected_at` DATETIME(3) NULL,

  -- Bank details (populated at V3+)
  `bank_account_holder_name` VARCHAR(200) NULL,
  `bank_account_number` VARCHAR(100) NULL,
  `bank_ifsc_code` VARCHAR(11) NULL,
  `bank_name` VARCHAR(150) NULL,
  `bank_account_type` VARCHAR(30) NULL,
  `bank_verified_at` DATETIME(3) NULL,

  -- eNACH mandate (populated at V4+)
  `mandate_umrn` VARCHAR(100) NULL,
  `mandate_provider` VARCHAR(50) NULL,
  `mandate_type` VARCHAR(50) NULL,
  `mandate_authorized_at` DATETIME(3) NULL,

  -- Keep full JSON blob for backward compatibility
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
  -- client_id foreign key removed (clients table managed separately)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Repayment schedule (RPS) for disbursed PL Partner loans. Same single-payment
-- short-term-loan shape as switchMyLoan's manual_rps_switch_my_loan, but kept
-- as its own dedicated table so PL Partner data never mixes with RapidMoney's.
-- Populated by generatePlPartnerRepaymentSchedule (see
-- Backend/routes/fintreePlPartnerApi/services/generatePlPartnerRepaymentSchedule.js),
-- called from plPartnerDisbursement.js on disbursement.
CREATE TABLE IF NOT EXISTS `manual_rps_fintree_personal_loan` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lan` VARCHAR(255) NULL,
  `due_date` DATE NOT NULL,
  `status` VARCHAR(50) NULL,
  `emi` DECIMAL(10,2) NULL,
  `interest` DECIMAL(10,2) NULL,
  `principal` DECIMAL(10,2) NULL,
  `opening` DECIMAL(10,2) NULL,
  `closing` DECIMAL(10,2) NULL,
  `remaining_emi` DECIMAL(10,2) NULL,
  `remaining_interest` DECIMAL(10,2) NULL,
  `remaining_principal` DECIMAL(10,2) NULL,
  `payment_date` DATE NULL,
  `dpd` INT NULL DEFAULT 0,
  `remaining_amount` DECIMAL(10,2) NULL,
  `extra_paid` DECIMAL(10,2) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lan_due_date` (`lan`,`due_date`),
  KEY `idx_lan` (`lan`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_status` (`status`),
  KEY `idx_lan_status_due` (`lan`,`status`,`due_date`),
  KEY `idx_lan_dpd` (`lan`,`dpd`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
