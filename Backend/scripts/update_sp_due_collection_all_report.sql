-- Migration: Update sp_due_collection_all_report to fix POS and Overdue calculation for Foreclosed/Settled loans
DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_due_collection_all_report`$$

CREATE PROCEDURE `sp_due_collection_all_report`(
  IN `p_start_date` DATE, 
  IN `p_end_date` DATE, 
  IN `p_lender` VARCHAR(100)
)
BEGIN
  SELECT
    lb.lender AS `Product Name`,
    lb.lan AS `Loan Account Number`,
    (SELECT MAX(m.status) FROM manual_rps_ev_loan m WHERE m.lan = lb.lan) AS `EMI Status`,
    lb.status AS `Loan Status`,
    lb.customer_name AS `Customer Name`,
    lb.agreement_date AS `Sanction Date`,
    (SELECT MIN(edu.disbursement_date) FROM ev_disbursement_utr edu WHERE edu.lan = lb.lan) AS `Disbursement Date`,
    (SELECT MIN(due_date) FROM manual_rps_ev_loan WHERE lan = lb.lan) AS `EMI Start Date`,
    (SELECT MAX(due_date) FROM manual_rps_ev_loan WHERE lan = lb.lan) AS `EMI End Date`,
    FORMAT(lb.loan_amount, 2) AS `Loan Amount`,
    FORMAT(lb.loan_amount, 2) AS `Disbursed Amount`,
    lb.loan_tenure AS `Tenure in Months`,
    lb.emi_amount AS `EMI Amount`,
    lb.interest_rate AS `Rate Of Interest`,
    (SELECT IFNULL(SUM(principal), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan) AS `Total Principal Demand`,
    (SELECT IFNULL(SUM(interest), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan) AS `Total Interest Demand`,
    (SELECT IFNULL(SUM(principal), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date BETWEEN p_start_date AND p_end_date) AS `Principal Demand as on Date`,
    (SELECT IFNULL(SUM(interest), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date BETWEEN p_start_date AND p_end_date) AS `Interest Demand as on Date`,
    (SELECT IFNULL(SUM(principal + interest), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date BETWEEN p_start_date AND p_end_date) AS `Total Demand as on Date`,
    (SELECT IFNULL(SUM(amount), 0) FROM loan_charges WHERE lan = lb.lan AND charge_type = 'Penal Charge') AS `Penal Charge Demand`,
    (SELECT IFNULL(SUM(amount), 0) FROM loan_charges WHERE lan = lb.lan AND charge_type = 'NACH_Bounce') AS `NACH Bounce Demand`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type = 'Principal') AS `Total Principal Collected`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type = 'Interest') AS `Total Interest Collected`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type = 'Penal Charge') AS `Penal Charge Collected`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type = 'NACH_Bounce') AS `NACH Bounce Collected`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type = 'Excess Payment') AS `Total Excess Payment`,
    (
      (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type IN ('Principal', 'Interest', 'Penal Charge', 'NACH_Bounce'))
      +
      (SELECT IFNULL(SUM(amount), 0) FROM loan_charges WHERE lan = lb.lan AND charge_type = 'Excess Payment')
    ) AS `Total Collected`,
    (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND payment_id LIKE 'Waived & Closed%') AS `Waived & Closed`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0.00
      ELSE GREATEST(
        (
          (SELECT IFNULL(SUM(principal + interest), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date < CURDATE())
          -
          (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type IN ('Principal', 'Interest'))
        ),
        0.00
      )
    END AS `Total Amount Overdue`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0
      WHEN EXISTS (SELECT 1 FROM manual_rps_ev_loan WHERE lan = lb.lan AND status IN ('Part Paid', 'Late') AND dpd > 0)
      THEN (SELECT MAX(dpd) FROM manual_rps_ev_loan WHERE lan = lb.lan AND status IN ('Part Paid', 'Late'))
      ELSE 0
    END AS `DPD in Days`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0
      WHEN EXISTS (
        SELECT 1 FROM manual_rps_ev_loan 
        WHERE lan = lb.lan 
          AND due_date <= p_end_date 
          AND status IN ('Due', 'Late', 'Part Paid') 
          AND (remaining_principal + remaining_interest) > 0
      )
      THEN GREATEST(
        DATEDIFF(
          p_end_date, 
          (SELECT MIN(due_date) FROM manual_rps_ev_loan 
           WHERE lan = lb.lan 
             AND due_date <= p_end_date 
             AND status IN ('Due', 'Late', 'Part Paid') 
             AND (remaining_principal + remaining_interest) > 0
          )
        ), 0)
      ELSE 0
    END AS `DPD Filter Date`,
    lb.processing_fee AS `Processing Fees`,
    (SELECT IFNULL(SUM(amount), 0) FROM loan_charges WHERE lan = lb.lan AND charge_type = 'Advanced_EMI') AS `Advance EMI`,
    (SELECT IFNULL(SUM(amount), 0) FROM loan_charges WHERE lan = lb.lan AND charge_type = 'Pre EMI') AS `Pre-EMI Collected`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0.00
      ELSE (SELECT IFNULL(SUM(remaining_interest), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date > CURDATE())
    END AS `Future Int OS`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0.00
      ELSE (SELECT IFNULL(SUM(remaining_principal), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan AND due_date > CURDATE())
    END AS `Future PR OS`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0
      ELSE (SELECT COUNT(*) FROM manual_rps_ev_loan WHERE lan = lb.lan AND status IN ('Due', 'Late', 'Part Paid'))
    END AS `No OF Due Installments`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN NULL
      ELSE (SELECT MIN(due_date) FROM manual_rps_ev_loan WHERE lan = lb.lan AND status = 'NPA')
    END AS `NPA Since Date`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0.00
      ELSE (SELECT IFNULL(SUM(remaining_principal + remaining_interest), 0)
            FROM manual_rps_ev_loan
            WHERE lan = lb.lan AND status IN ('Due', 'Late', 'Part Paid') AND due_date < CURDATE())
    END AS `Total OverDue till Today`,
    CASE
      WHEN lb.status IN ('Foreclosed', 'Settled', 'Fully Paid', 'Closed', 'Settled & Closed') THEN 0.00
      ELSE GREATEST(
        (
          (SELECT IFNULL(SUM(principal), 0) FROM manual_rps_ev_loan WHERE lan = lb.lan)
          -
          (SELECT IFNULL(SUM(allocated_amount), 0) FROM allocation WHERE lan = lb.lan AND charge_type IN ('Principal', 'Waived - EMI Principal'))
        ),
        0.00
      )
    END AS `POS`,
    (SELECT MAX(payment_date) FROM repayments_upload WHERE lan = lb.lan) AS `Last Payment Date`,
    (SELECT MAX(bank_date) FROM repayments_upload WHERE lan = lb.lan) AS `Last Bank Date`
  FROM loan_booking_ev lb
  WHERE lb.lender LIKE CONCAT('%', p_lender, '%')
    AND lb.agreement_date BETWEEN p_start_date AND p_end_date
  GROUP BY lb.lan;
END$$

DELIMITER ;
