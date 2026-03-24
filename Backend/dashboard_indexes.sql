-- ============================================================
-- Dashboard Performance Indexes Migration (v2)
-- Adds missing indexes on RPS .lan columns and key join/filter
-- columns causing max_statement_time on shared Hostinger MySQL.
--
-- Apply during low-traffic window.
-- MySQL 5.7+ / 8.0: ALGORITHM=INPLACE, LOCK=NONE for online DDL.
-- IF NOT EXISTS requires MySQL 8.0.1+. On 5.7: remove it and check
-- manually: SHOW INDEX FROM <table> WHERE Key_name = '<name>';
-- ============================================================

-- ============================================================
-- SECTION 1: RPS TABLE LAN INDEXES
-- These fix the most critical issue: each UNION ALL branch does a
-- full table scan on the RPS table when joining on lan without an index.
-- Adding a simple index on lan gives MySQL a lookup vs. full scan.
-- ============================================================

ALTER TABLE `manual_rps_bl_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_bl_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_ev_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_ev_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_adikosh`
  ADD INDEX IF NOT EXISTS `idx_rps_adik_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_gq_non_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqn_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_gq_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqf_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_embifi_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_embifi_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_wctl`
  ADD INDEX IF NOT EXISTS `idx_rps_wctl_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_emiclub`
  ADD INDEX IF NOT EXISTS `idx_rps_emiclub_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_finso_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_finso_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_hey_ev`
  ADD INDEX IF NOT EXISTS `idx_rps_heyev_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_circlepe`
  ADD INDEX IF NOT EXISTS `idx_rps_circlepe_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_helium`
  ADD INDEX IF NOT EXISTS `idx_rps_helium_lan` (`lan`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- SECTION 2: BOOKING TABLE LAN + STATUS INDEXES
-- Used by: WHERE b.status = 'Disbursed' JOIN ON b.lan = rps.lan
-- Composite (lan, status) is the most efficient for this pattern.
-- ============================================================

ALTER TABLE `loan_bookings`
  ADD INDEX IF NOT EXISTS `idx_lb_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_ev`
  ADD INDEX IF NOT EXISTS `idx_lbev_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_adikosh`
  ADD INDEX IF NOT EXISTS `idx_lbadk_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_gq_non_fsf`
  ADD INDEX IF NOT EXISTS `idx_lbgqn_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_gq_fsf`
  ADD INDEX IF NOT EXISTS `idx_lbgqf_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_embifi`
  ADD INDEX IF NOT EXISTS `idx_lbembifi_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_bookings_wctl`
  ADD INDEX IF NOT EXISTS `idx_lbwctl_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_emiclub`
  ADD INDEX IF NOT EXISTS `idx_lbemiclub_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_finso`
  ADD INDEX IF NOT EXISTS `idx_lbfinso_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_hey_ev`
  ADD INDEX IF NOT EXISTS `idx_lbheyev_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_circle_pe`
  ADD INDEX IF NOT EXISTS `idx_lbcirclepe_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_helium`
  ADD INDEX IF NOT EXISTS `idx_lbhelium_lan_status` (`lan`, `status`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- SECTION 3: ev_disbursement_utr — ageing JOIN
-- buildDpdList does: MIN(Disbursement_Date) GROUP BY lan
-- An index on (lan, Disbursement_Date) allows covering index lookup.
-- ============================================================

ALTER TABLE `ev_disbursement_utr`
  ADD INDEX IF NOT EXISTS `idx_utr_lan_disbdate` (`lan`, `Disbursement_Date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- SECTION 4: COMBINED STATUS + AGREEMENT_DATE INDEXES
-- Used by metric-cards disbursement filter (WHERE status='Disbursed'
-- AND agreement_date BETWEEN ...).
-- ============================================================

ALTER TABLE `loan_bookings`
  ADD INDEX IF NOT EXISTS `idx_lb_status_agr_date` (`status`, `agreement_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `loan_booking_ev`
  ADD INDEX IF NOT EXISTS `idx_lbev_status_agr_date` (`status`, `agreement_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- SECTION 5: RPS LOAN DUE_DATE + STATUS
-- Used by dpd-buckets and dpd-list aggregations:
-- WHERE rps.status <> 'Paid' AND rps.due_date < CURDATE()
-- ============================================================

ALTER TABLE `manual_rps_bl_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_bl_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_ev_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_ev_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_adikosh`
  ADD INDEX IF NOT EXISTS `idx_rps_adik_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_gq_non_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqn_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_gq_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqf_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_embifi_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_embifi_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_wctl`
  ADD INDEX IF NOT EXISTS `idx_rps_wctl_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_emiclub`
  ADD INDEX IF NOT EXISTS `idx_rps_emiclub_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_finso_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_finso_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_hey_ev`
  ADD INDEX IF NOT EXISTS `idx_rps_heyev_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_circlepe`
  ADD INDEX IF NOT EXISTS `idx_rps_circlepe_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `manual_rps_helium`
  ADD INDEX IF NOT EXISTS `idx_rps_helium_status_due` (`status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- SECTION 6: repayments_upload + allocation (metric-cards)
-- ============================================================

ALTER TABLE `repayments_upload`
  ADD INDEX IF NOT EXISTS `idx_ru_lan_payment_date` (`lan`, `payment_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `allocation`
  ADD INDEX IF NOT EXISTS `idx_alloc_lan_date_type` (`lan`, `allocation_date`, `charge_type`),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `allocation_adikosh`
  ADD INDEX IF NOT EXISTS `idx_alloc_adk_lan_date_type` (`lan`, `allocation_date`, `charge_type`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- EXPECTED IMPROVEMENT (Hostinger shared MySQL, no max_statement_time breach):
--
--  dpd-list  cold (ALL products, 100 rows) : 3-8s  → 0.5-2s
--  dpd-list  warm (Redis cached)           : any   → <100ms
--  dpd-buckets cold                        : 2-5s  → 0.5-1.5s
--  metric-cards cold                       : 2-5s  → 0.5-1.5s
--
-- Prioritize Section 1 (RPS lan) and Section 2 (booking lan+status)
-- for maximum immediate impact on the timeout error.
-- ============================================================
