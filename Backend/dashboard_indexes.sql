-- ============================================================
-- Dashboard Performance Indexes Migration
-- Apply during a low-traffic window.
-- MySQL 5.7+ / 8.0: uses ALGORITHM=INPLACE, LOCK=NONE for online DDL.
-- Run each statement independently — stop if any fails.
-- ============================================================

-- 1. loan_bookings (BL product)
--    Used by: metric-cards disbursement, collections join, dpd-buckets, dpd-list
--    Filter: status = 'Disbursed', date range on agreement_date
ALTER TABLE `loan_bookings`
  ADD INDEX IF NOT EXISTS `idx_lb_status_agr_date` (`status`, `agreement_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 2. loan_booking_ev (EV product)
ALTER TABLE `loan_booking_ev`
  ADD INDEX IF NOT EXISTS `idx_lbev_status_agr_date` (`status`, `agreement_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 3. manual_rps_bl_loan
--    Used by: dpd-buckets (JOIN on lan, filter on status+due_date), dpd-list, metric-cards
ALTER TABLE `manual_rps_bl_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_bl_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 4. manual_rps_ev_loan
ALTER TABLE `manual_rps_ev_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_ev_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 5. manual_rps_helium
ALTER TABLE `manual_rps_helium`
  ADD INDEX IF NOT EXISTS `idx_rps_helium_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 6. manual_rps_adikosh
ALTER TABLE `manual_rps_adikosh`
  ADD INDEX IF NOT EXISTS `idx_rps_adikosh_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 7. manual_rps_gq_non_fsf
ALTER TABLE `manual_rps_gq_non_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqn_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 8. manual_rps_gq_fsf
ALTER TABLE `manual_rps_gq_fsf`
  ADD INDEX IF NOT EXISTS `idx_rps_gqf_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 9. manual_rps_embifi_loan
ALTER TABLE `manual_rps_embifi_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_embifi_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 10. manual_rps_wctl
ALTER TABLE `manual_rps_wctl`
  ADD INDEX IF NOT EXISTS `idx_rps_wctl_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 11. manual_rps_emiclub
ALTER TABLE `manual_rps_emiclub`
  ADD INDEX IF NOT EXISTS `idx_rps_emiclub_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 12. manual_rps_finso_loan
ALTER TABLE `manual_rps_finso_loan`
  ADD INDEX IF NOT EXISTS `idx_rps_finso_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 13. manual_rps_hey_ev
ALTER TABLE `manual_rps_hey_ev`
  ADD INDEX IF NOT EXISTS `idx_rps_heyev_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 14. manual_rps_circlepe
ALTER TABLE `manual_rps_circlepe`
  ADD INDEX IF NOT EXISTS `idx_rps_circlepe_lan_status_due` (`lan`, `status`, `due_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 15. repayments_upload
--     Used by: metric-cards collections (JOIN and subquery paths), payment_date filter
ALTER TABLE `repayments_upload`
  ADD INDEX IF NOT EXISTS `idx_ru_lan_payment_date` (`lan`, `payment_date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 16. allocation
--     Used by: metric-cards PNI range aggregation with lan LIKE + allocation_date + charge_type
ALTER TABLE `allocation`
  ADD INDEX IF NOT EXISTS `idx_alloc_lan_alloc_date_type` (`lan`, `allocation_date`, `charge_type`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 17. allocation_adikosh (Adikosh uses separate allocation table)
ALTER TABLE `allocation_adikosh`
  ADD INDEX IF NOT EXISTS `idx_alloc_adk_lan_date_type` (`lan`, `allocation_date`, `charge_type`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- 18. ev_disbursement_utr
--     Used by: dpd-list LEFT JOIN to get disbursement date per LAN
ALTER TABLE `ev_disbursement_utr`
  ADD INDEX IF NOT EXISTS `idx_utr_lan_disb_date` (`lan`, `Disbursement_Date`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================================================
-- NOTES:
-- • IF NOT EXISTS is MySQL 8.0.1+ only. On 5.7, remove it and
--   check manually: SHOW INDEX FROM <table> WHERE Key_name = '...';
-- • ALGORITHM=INPLACE LOCK=NONE = Online DDL (no table lock).
-- • Estimated improvement per endpoint:
--     dpd-buckets   : 40-70% faster (index on status+due_date eliminates full-scan)
--     metric-cards  : 30-50% faster (status+agreement_date composite)
--     dpd-list      : 20-40% faster (lan+status+due_date covers WHERE + JOIN)
--     collections   : 20-35% faster (payment_date index on repayments_upload)
-- ============================================================
