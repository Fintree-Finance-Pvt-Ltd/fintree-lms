const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;

  const n = Number(String(v).replace(/,/g, "").trim());

  return Number.isFinite(n) ? n : fallback;
};

const normalize = (v) => String(v || "").trim().toUpperCase();

const parseDateFlexible = (value) => {
  if (!value) return null;

  const digits = String(value).trim().replace(/[^0-9]/g, "");

  if (digits.length !== 8) return null;

  let y;
  let m;
  let d;

  if (Number(digits.slice(0, 4)) > 1900) {
    y = Number(digits.slice(0, 4));
    m = Number(digits.slice(4, 6)) - 1;
    d = Number(digits.slice(6, 8));
  } else {
    d = Number(digits.slice(0, 2));
    m = Number(digits.slice(2, 4)) - 1;
    y = Number(digits.slice(4, 8));
  }

  const dt = new Date(y, m, d);

  return Number.isNaN(dt.getTime()) ? null : dt;
};

const monthsDiff = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const daysDiff = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;

  const ms = toDate.getTime() - fromDate.getTime();

  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const isUnsecuredLoanType = (loanType) => {
  const value = normalize(loanType);

  const securedKeywords = [
    "AUTO",
    "CAR",
    "TWO WHEELER",
    "TRACTOR",
    "HOUSING",
    "HOME",
    "MORTGAGE",
    "PROPERTY",
    "LAP",
    "GOLD",
    "COMMERCIAL VEHICLE",
  ];

  if (!value) return false;

  return !securedKeywords.some((keyword) => value.includes(keyword));
};

const isActiveAccount = (acc) => {
  const status = normalize(
    acc?.Account_Status ||
      acc?.AccountStatus ||
      acc?.Status ||
      acc?.Open_Or_Closed ||
      "",
  );

  const dateClosed =
    acc?.Date_Closed ||
    acc?.DateClosed ||
    acc?.Date_of_Closure ||
    acc?.DateOfClosure;

  if (dateClosed) return false;

  const closedWords = [
    "CLOSED",
    "CLOSE",
    "SETTLED",
    "WRITTEN",
    "SUIT",
    "POST WRITE OFF",
  ];

  if (closedWords.some((word) => status.includes(word))) return false;

  return true;
};

const getAccountOverdueAmount = (acc) => {
  return toNumber(
    acc?.Amount_Overdue ||
      acc?.AmountOverdue ||
      acc?.Overdue_Amount ||
      acc?.Current_Overdue ||
      0,
    0,
  );
};

const getAccountCurrentBalance = (acc) => {
  return toNumber(
    acc?.Current_Balance || acc?.CurrentBalance || acc?.Balance || 0,
    0,
  );
};

const getHistoryDate = (hist) => {
  const year = toNumber(hist?.Year || hist?.year, null);
  const month = toNumber(hist?.Month || hist?.month, null);

  if (year && month) {
    return new Date(year, month - 1, 1);
  }

  return parseDateFlexible(
    hist?.Date ||
      hist?.date ||
      hist?.Reported_Date ||
      hist?.Payment_History_Date ||
      hist?.Date_Reported,
  );
};

const getHistoryDpd = (hist) => {
  const raw =
    hist?.Days_Past_Due || hist?.DaysPastDue || hist?.DPD || hist?.dpd || 0;

  const value = normalize(raw);

  if (["STD", "XXX", "000", "0"].includes(value)) return 0;

  return toNumber(value, 0);
};

const hasBadAssetClassification = (value) => {
  const status = normalize(value);

  return ["SMA", "SUB", "DBT", "LSS"].some((bad) => status.includes(bad));
};

const hasSettlementOrWriteOff = (value) => {
  const status = normalize(value);

  return (
    status.includes("SETTLED") ||
    status.includes("WRITTEN") ||
    status.includes("WRITE OFF") ||
    status.includes("POST WRITE") ||
    hasBadAssetClassification(status)
  );
};

const hasSuitFiledOrWilfulDefault = (value) => {
  const status = normalize(value);

  return (
    status.includes("SUIT") ||
    status.includes("WILFUL") ||
    status.includes("WILLFUL")
  );
};

const extractEnquiries = (profile) => {
  const now = new Date();

  const capsSummary = profile?.CAPS?.CAPS_Summary || profile?.CAPS_Summary || {};

  let enquiries30d = toNumber(
    capsSummary?.CAPSLast30Days || capsSummary?.CAPS_Last_30_Days,
    0,
  );

  let unsecuredEnquiries30d = 0;

  const rawCaps =
    profile?.CAPS?.CAPS_Application_Details ||
    profile?.CAPS?.CAPS_APPLICATION_DETAILS ||
    profile?.CAPS?.CAPS_Details ||
    profile?.CAPS_Application_Details ||
    [];

  const caps = toArray(rawCaps);

  if (caps.length) {
    let totalFromDetails = 0;

    for (const cap of caps) {
      const enquiryDate = parseDateFlexible(
        cap?.Date_of_Request ||
          cap?.DateOfRequest ||
          cap?.Enquiry_Date ||
          cap?.Inquiry_Date ||
          cap?.Date,
      );

      const diffDays = daysDiff(enquiryDate, now);

      if (diffDays === null || diffDays < 0 || diffDays > 30) continue;

      totalFromDetails += 1;

      const loanType =
        cap?.Type_of_Loan ||
        cap?.Loan_Type ||
        cap?.Purpose ||
        cap?.Account_Type ||
        cap?.Product;

      if (isUnsecuredLoanType(loanType)) {
        unsecuredEnquiries30d += 1;
      }
    }

    enquiries30d = totalFromDetails;
  } else {
    unsecuredEnquiries30d = enquiries30d;
  }

  return {
    enquiries30d,
    unsecuredEnquiries30d,
  };
};

const extractFinsoBureauFacts = (reportXml, fallbackScore = null) => {
  if (!reportXml) {
    return {
      score: fallbackScore,
      enquiries30d: 0,
      unsecuredEnquiries30d: 0,
      activeTradelineCount: 0,
      hasDpd6M: false,
      hasSettlementWriteOffBadAsset36M: false,
      hasSuitFiledOrWilfulDefault3Y: false,
      hasActiveOverdueDpd3M: false,
      activeOverdueAmount: 0,
    };
  }

  const json = parser.parse(reportXml);

  const profile = json?.INProfileResponse || json?.INProfile || json || {};

  const parsedScore =
    toNumber(profile?.SCORE?.BureauScore, null) ??
    toNumber(profile?.Score?.BureauScore, null) ??
    toNumber(profile?.Score?.Value, null) ??
    toNumber(profile?.CREDIT_SCORE?.Score, null);

  const score = parsedScore ?? fallbackScore;

  const { enquiries30d, unsecuredEnquiries30d } = extractEnquiries(profile);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let activeTradelineCount = 0;
  let hasDpd6M = false;
  let hasSettlementWriteOffBadAsset36M = false;
  let hasSuitFiledOrWilfulDefault3Y = false;
  let hasActiveOverdueDpd3M = false;
  let activeOverdueAmount = 0;

  const now = new Date();

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const active = isActiveAccount(acc);

    const overdueAmount = getAccountOverdueAmount(acc);

    const currentBalance = getAccountCurrentBalance(acc);

    if (active && (currentBalance > 0 || overdueAmount > 0)) {
      activeTradelineCount += 1;
      activeOverdueAmount += overdueAmount;
    }

    const accountBadStatus = [
      acc?.Written_Off_Settled_Status,
      acc?.WrittenOffSettledStatus,
      acc?.Account_Status,
      acc?.AccountStatus,
      acc?.Asset_Classification,
      acc?.AssetClassification,
    ]
      .map(normalize)
      .join(" ");

    if (hasSettlementOrWriteOff(accountBadStatus)) {
      const statusDate =
        parseDateFlexible(acc?.Date_Reported || acc?.DateReported) ||
        parseDateFlexible(acc?.Date_Closed || acc?.DateClosed) ||
        parseDateFlexible(acc?.Date_Opened || acc?.DateOpened);

      const diff = monthsDiff(statusDate, now);

      if (diff === null || (diff >= 0 && diff < 36)) {
        hasSettlementWriteOffBadAsset36M = true;
      }
    }

    const suitFiledStatus = [
      acc?.Suit_Filed_Wilful_Default,
      acc?.SuitFiledWillfulDefault,
      acc?.Suit_Filed_Status,
      acc?.Written_Off_Settled_Status,
      acc?.Account_Status,
    ]
      .map(normalize)
      .join(" ");

    if (hasSuitFiledOrWilfulDefault(suitFiledStatus)) {
      const statusDate =
        parseDateFlexible(acc?.Date_Reported || acc?.DateReported) ||
        parseDateFlexible(acc?.Date_Closed || acc?.DateClosed) ||
        parseDateFlexible(acc?.Date_Opened || acc?.DateOpened);

      const diff = monthsDiff(statusDate, now);

      if (diff === null || (diff >= 0 && diff < 36)) {
        hasSuitFiledOrWilfulDefault3Y = true;
      }
    }

    for (const hist of histories) {
      const histDate = getHistoryDate(hist);

      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) continue;

      const dpd = getHistoryDpd(hist);

      const histStatus = [
        hist?.Asset_Classification,
        hist?.AssetClassification,
        hist?.Payment_Status,
        hist?.Status,
      ]
        .map(normalize)
        .join(" ");

      if (diff < 6 && dpd > 0) {
        hasDpd6M = true;
      }

      if (diff < 36 && hasBadAssetClassification(histStatus)) {
        hasSettlementWriteOffBadAsset36M = true;
      }

      if (active && diff < 3 && dpd > 0 && overdueAmount > 500) {
        hasActiveOverdueDpd3M = true;
      }
    }
  }

  return {
    score,
    enquiries30d,
    unsecuredEnquiries30d,
    activeTradelineCount,
    hasDpd6M,
    hasSettlementWriteOffBadAsset36M,
    hasSuitFiledOrWilfulDefault3Y,
    hasActiveOverdueDpd3M,
    activeOverdueAmount,
  };
};

const getCibilOffer = (scoreInput) => {
  const score = toNumber(scoreInput, null);

  /**
   * PDF offer slab:
   * -1          => 20,000 / 60 days
   * 660 - 674   => 20,000 / 60 days
   * 675 - 689   => 25,000 / 70 days
   * 690 - 709   => 36,000 / 90 days
   * 710 - 725   => 50,000 / 100 days
   * Above 725   => 50,000 / 100 days
   */

  if (score === -1) {
    return {
      amount: 20000,
      tenureDays: 60,
      band: "NTC_-1",
    };
  }

  if (score === null || score < 660) {
    return null;
  }

  if (score >= 660 && score <= 674) {
    return {
      amount: 20000,
      tenureDays: 60,
      band: "660_674",
    };
  }

  if (score >= 675 && score <= 689) {
    return {
      amount: 25000,
      tenureDays: 70,
      band: "675_689",
    };
  }

  if (score >= 690 && score <= 709) {
    return {
      amount: 36000,
      tenureDays: 90,
      band: "690_709",
    };
  }

  if (score >= 710 && score <= 725) {
    return {
      amount: 50000,
      tenureDays: 100,
      band: "710_725",
    };
  }

  if (score > 725) {
    return {
      amount: 50000,
      tenureDays: 100,
      band: "ABOVE_725",
    };
  }

  return null;
};

const evaluateFinsoPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];
  const deviations = [];

  const abb = toNumber(loan.abb_value, null);
  const bounceCount6m = toNumber(loan.bounce_count_6m, null);
  const score = toNumber(bureauFacts.score, null);

  let abbOffer = null;
  let cibilOfferAmount = null;
  let finalOffer = null;
  let offerTenureDays = null;
  let cibilBand = null;

  /**
   * AA / Bank rule
   */
  if (abb === null) {
    reasons.push("ABB_MISSING");
  } else if (abb < 400) {
    reasons.push("ABB_BELOW_400");
  } else {
    abbOffer = Math.floor((abb / 4) * 100);
  }

  if (bounceCount6m === null) {
    reasons.push("BOUNCE_COUNT_6M_MISSING");
  } else if (bounceCount6m > 2) {
    reasons.push("BOUNCE_COUNT_GT_2_LAST_6M");
  }

  /**
   * CIBIL score and CIBIL based offer
   */
  const cibilOffer = getCibilOffer(score);

  if (!cibilOffer) {
    reasons.push("CIBIL_BELOW_660_OR_MISSING");
  } else {
    cibilOfferAmount = cibilOffer.amount;
    offerTenureDays = cibilOffer.tenureDays;
    cibilBand = cibilOffer.band;
  }

  /**
   * Bureau rules shared by you
   */
  if (bureauFacts.enquiries30d > 5) {
    reasons.push("CIBIL_ENQUIRIES_GT_5_LAST_30D");
  }

  if (bureauFacts.unsecuredEnquiries30d > 5) {
    reasons.push("UNSECURED_ENQUIRIES_GT_5_LAST_30D");
  }

  if (bureauFacts.activeTradelineCount > 3) {
    deviations.push("ACTIVE_TRADELINES_GT_3_DEVIATION_ALLOWED");
  }

  if (bureauFacts.hasSettlementWriteOffBadAsset36M) {
    reasons.push("SETTLED_WRITTENOFF_SMA_SUB_DBT_LSS_LAST_36M");
  }

  if (bureauFacts.hasSuitFiledOrWilfulDefault3Y) {
    reasons.push("WILFUL_DEFAULT_OR_SUIT_FILED_LAST_3Y");
  }

  if (bureauFacts.hasDpd6M) {
    reasons.push("DPD_SEEN_LAST_6M");
  }

  if (bureauFacts.hasActiveOverdueDpd3M) {
    reasons.push("ACTIVE_OVERDUE_GT_500_AND_DPD_LAST_3M");
  }

  /**
   * Final offer = lower of ABB offer and CIBIL offer
   */
  if (reasons.length === 0 && abbOffer !== null && cibilOfferAmount !== null) {
    finalOffer = Math.min(abbOffer, cibilOfferAmount);
  }

  let breStatus = "BRE APPROVED";

  if (reasons.length > 0) {
    breStatus = "BRE REJECTED";
  } else if (deviations.length > 0) {
    breStatus = "BRE DEVIATION";
  }

  return {
    breStatus,
    reasons,
    deviations,
    bureauScore: score,
    abbOffer,
    cibilOfferAmount,
    finalOffer,
    offerTenureDays,
    cibilBand,
  };
};

const updateFinsoPending = async (pool, lan, reason) => {
  await pool.query(
    `
    UPDATE loan_booking_finso
    SET
      finso_bre_status = ?,
      finso_bre_reason = ?,
      finso_bre_checked_at = NOW()
    WHERE lan = ?
    `,
    ["Pending", reason, lan],
  );
};

const autoRunFinsoBreIfReady = async (lan) => {
  const pool = db.promise();

  /**
   * Step 1: Check bureau status from KYC table
   */
  const [kycRows] = await pool.query(
    `
    SELECT bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
    AND applicant_type = 'BORROWER'
    LIMIT 1
    `,
    [lan],
  );

  if (!kycRows.length) {
    await updateFinsoPending(pool, lan, "KYC_BUREAU_ROW_MISSING");
    return;
  }

  const kyc = kycRows[0];

  if (kyc.bureau_status !== "VERIFIED") {
    await updateFinsoPending(
      pool,
      lan,
      `BUREAU_STATUS=${kyc.bureau_status || "NA"}`,
    );
    return;
  }

  /**
   * Step 2: Pick loan data from loan_booking_finso
   */
  const [loanRows] = await pool.query(
    `
    SELECT
      customer_id,
      lan,
      borrower_dob,
      loan_amount,
      loan_tenure,
      cibil_score,
      cibil_score_fintree,
      abb_value,
      bounce_count_6m
    FROM loan_booking_finso
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("Finso loan not found:", lan);
    return;
  }

  const loan = loanRows[0];

  /**
   * Step 3: Pick latest bureau XML
   */
  const [cibilRows] = await pool.query(
    `
    SELECT score, report_xml, created_at
    FROM loan_cibil_reports
    WHERE lan = ?
    AND applicant_type = 'BORROWER'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [lan],
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await updateFinsoPending(pool, lan, "BUREAU_REPORT_MISSING");
    return;
  }

  const fallbackScore =
    toNumber(cibilRows[0].score, null) ??
    toNumber(loan.cibil_score_fintree, null) ??
    toNumber(loan.cibil_score, null);

  /**
   * Step 4: Extract bureau facts
   */
  const bureauFacts = extractFinsoBureauFacts(
    cibilRows[0].report_xml,
    fallbackScore,
  );

  /**
   * Step 5: Evaluate BRE policy
   */
  const decision = evaluateFinsoPolicy({
    loan,
    bureauFacts,
  });

  const reasonText = [...decision.reasons, ...decision.deviations].length
    ? [...decision.reasons, ...decision.deviations].join(", ")
    : "ELIGIBLE";

  /**
   * Final LMS status
   */
  const finalStatus =
    decision.breStatus === "BRE REJECTED" ? "Rejected" : "Credit Initiated";

  const aaEligible =
    !decision.reasons.includes("ABB_BELOW_400") &&
    !decision.reasons.includes("BOUNCE_COUNT_GT_2_LAST_6M") &&
    !decision.reasons.includes("ABB_MISSING") &&
    !decision.reasons.includes("BOUNCE_COUNT_6M_MISSING")
      ? 1
      : 0;

  /**
   * Step 6: Update loan_booking_finso
   */
  await pool.query(
    `
    UPDATE loan_booking_finso
    SET
      finso_bre_status = ?,
      finso_bre_reason = ?,
      finso_bre_checked_at = NOW(),

      cibil_score_fintree = ?,
      finso_aa_eligible = ?,
      finso_abb_offer = ?,
      finso_cibil_offer = ?,
      finso_final_offer = ?,
      finso_offer_tenure_days = ?,
      finso_cibil_band = ?,

      finso_enquiries_30d = ?,
      finso_unsecured_enquiries_30d = ?,
      finso_active_tradeline_count = ?,
      finso_dpd_6m_flag = ?,
      finso_settled_writtenoff_36m_flag = ?,
      finso_willful_default_suit_filed_3y_flag = ?,
      finso_active_overdue_3m_flag = ?,
      finso_active_overdue_amount = ?,
      finso_deviation_flag = ?,

      status = ?
    WHERE lan = ?
    `,
    [
      decision.breStatus,
      reasonText,

      decision.bureauScore,
      aaEligible,
      decision.abbOffer,
      decision.cibilOfferAmount,
      decision.finalOffer,
      decision.offerTenureDays,
      decision.cibilBand,

      bureauFacts.enquiries30d,
      bureauFacts.unsecuredEnquiries30d,
      bureauFacts.activeTradelineCount,
      bureauFacts.hasDpd6M ? 1 : 0,
      bureauFacts.hasSettlementWriteOffBadAsset36M ? 1 : 0,
      bureauFacts.hasSuitFiledOrWilfulDefault3Y ? 1 : 0,
      bureauFacts.hasActiveOverdueDpd3M ? 1 : 0,
      bureauFacts.activeOverdueAmount,
      decision.deviations.length > 0 ? 1 : 0,

      finalStatus,
      lan,
    ],
  );

  console.log(
    `Finso BRE completed for ${lan}: ${decision.breStatus} | ${reasonText}`,
  );
};

module.exports = {
  autoRunFinsoBreIfReady,
  extractFinsoBureauFacts,
  evaluateFinsoPolicy,
  getCibilOffer,
};