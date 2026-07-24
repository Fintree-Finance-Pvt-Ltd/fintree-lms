const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateSrbhBureauPolicy,
  evaluateSrbhKycReadiness,
  evaluateSrbhPolicy,
  extractSrbhBureauFacts,
  isSrbhBureauScreeningComplete,
} = require("../routes/srbh/srbhBRE");

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatExperianDate = (date) =>
  formatLocalDate(date).replaceAll("-", "");

const dobAtAge = (years, dayOffset = 0) => {
  const today = new Date();
  return formatLocalDate(
    new Date(
      today.getFullYear() - years,
      today.getMonth(),
      today.getDate() + dayOffset,
    ),
  );
};

const monthsAgo = (months) => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() - months, 1);
};

const baseLoan = (overrides = {}) => ({
  dob: dobAtAge(35),
  product_type: "L3",
  requested_loan_amount: 180000,
  loan_tenure: 18,
  ...overrides,
});

const baseFacts = (overrides = {}) => ({
  reportParsed: true,
  score: 700,
  enquiries30d: 0,
  hasDpd3M: false,
  hasDpd6M: false,
  hasOverdue3M: false,
  hasWrittenOff3Y: false,
  has60Plus6M: false,
  has90Plus6M: false,
  emiOverdueAmount: 0,
  ccOverdueAmount: 0,
  ...overrides,
});

const evaluate = (loanOverrides = {}, factsOverrides = {}) =>
  evaluateSrbhPolicy({
    loan: baseLoan(loanOverrides),
    bureauFacts: baseFacts(factsOverrides),
  });

test("SRBH age range is inclusive from 18 through 65", () => {
  assert.equal(evaluate({ dob: dobAtAge(18) }).status, "BRE APPROVED");
  assert.equal(evaluate({ dob: dobAtAge(65) }).status, "BRE APPROVED");

  assert.ok(
    evaluate({ dob: dobAtAge(18, 1) }).reasons.includes("AGE_BELOW_18"),
  );
  assert.ok(
    evaluate({ dob: dobAtAge(66) }).reasons.includes("AGE_ABOVE_65"),
  );
});

test("NTC -1 through 250 passes normally without a deviation", () => {
  for (const score of [-1, 0, 1, 250]) {
    const decision = evaluate({}, { score });
    assert.equal(decision.status, "BRE APPROVED", `score ${score}`);
    assert.equal(decision.isNtc, true, `score ${score}`);
    assert.deepEqual(decision.deviations, [], `score ${score}`);
  }
});

test("scores 251 through 649 reject and scores 650+ pass", () => {
  for (const score of [251, 400, 649]) {
    const decision = evaluate({}, { score });
    assert.ok(decision.reasons.includes("CIBIL_BELOW_650"), `score ${score}`);
  }

  for (const score of [650, 750, 900]) {
    assert.equal(evaluate({}, { score }).status, "BRE APPROVED", `score ${score}`);
  }
});

test("Loan Details bureau screening returns an advisory pre-BRE decision", () => {
  const approved = evaluateSrbhBureauPolicy(baseFacts({ score: 700 }));
  assert.equal(approved.status, "BUREAU APPROVED");
  assert.deepEqual(approved.reasons, []);

  const ntc = evaluateSrbhBureauPolicy(baseFacts({ score: -1 }));
  assert.equal(ntc.status, "BUREAU APPROVED");
  assert.equal(ntc.isNtc, true);

  const rejected = evaluateSrbhBureauPolicy(
    baseFacts({
      score: 649,
      enquiries30d: 4,
      hasDpd3M: true,
    }),
  );
  assert.equal(rejected.status, "BUREAU REJECTED");
  assert.ok(rejected.reasons.includes("CIBIL_BELOW_650"));
  assert.ok(rejected.reasons.includes("ENQUIRIES_GT_3_LAST_30D"));
  assert.ok(rejected.reasons.includes("DPD_LAST_3M"));

  assert.equal(isSrbhBureauScreeningComplete(approved.status), true);
  assert.equal(isSrbhBureauScreeningComplete(rejected.status), true);
  assert.equal(isSrbhBureauScreeningComplete("Pending"), false);
});

test("final BRE still applies non-bureau rules after bureau approval", () => {
  const approvedScreening = evaluateSrbhBureauPolicy(baseFacts());
  assert.equal(approvedScreening.status, "BUREAU APPROVED");

  const finalDecision = evaluate(
    {
      product_type: "L5",
      requested_loan_amount: 180000,
      loan_tenure: 37,
    },
    {},
  );

  assert.equal(finalDecision.status, "BRE REJECTED");
  assert.ok(
    finalDecision.reasons.includes(
      "L5_LOAN_AMOUNT_OUTSIDE_220000_TO_450000",
    ),
  );
  assert.ok(
    finalDecision.reasons.includes("L5_TENURE_OUTSIDE_12_TO_36"),
  );
});

const verifiedKycRow = (applicantType, overrides = {}) => ({
  id: 1,
  applicant_type: applicantType,
  party_no: 1,
  pan_number:
    applicantType === "BORROWER"
      ? "ABCDE1234F"
      : applicantType === "GUARANTOR"
        ? "FGHIJ5678K"
        : "LMNOP9012Q",
  pan_status: "VERIFIED",
  aadhaar_status: "VERIFIED",
  bureau_status: "VERIFIED",
  updated_at: "2026-07-22T10:00:00.000Z",
  ...overrides,
});

test("final KYC readiness requires PAN, Aadhaar and bureau for every added applicant", () => {
  const loan = {
    pan_card: "ABCDE1234F",
    guarantor_name: "Guarantor",
    guarantor_pan: "FGHIJ5678K",
    guarantor_mobile: "9999999999",
    co_applicant_name: "Co Applicant",
    co_applicant_pan: "LMNOP9012Q",
    co_applicant_mobile: "8888888888",
  };
  const readiness = evaluateSrbhKycReadiness({
    loan,
    kycRows: [
      verifiedKycRow("BORROWER"),
      verifiedKycRow("GUARANTOR", {
        aadhaar_status: "INITIATED",
        bureau_status: "FAILED",
      }),
    ],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.applicants.length, 3);

  const guarantor = readiness.incompleteApplicants.find(
    (item) => item.applicantType === "GUARANTOR",
  );
  assert.deepEqual(guarantor.incompleteChecks, ["AADHAAR", "BUREAU"]);
  assert.equal(guarantor.aadhaarStatus, "INITIATED");
  assert.equal(guarantor.bureauStatus, "FAILED");

  const coApplicant = readiness.incompleteApplicants.find(
    (item) => item.applicantType === "CO_APPLICANT",
  );
  assert.deepEqual(coApplicant.incompleteChecks, [
    "PAN",
    "AADHAAR",
    "BUREAU",
  ]);
  assert.equal(coApplicant.panStatus, "MISSING");
});

test("final KYC readiness ignores applicants not added to the loan", () => {
  const readiness = evaluateSrbhKycReadiness({
    loan: { pan_card: "ABCDE1234F" },
    kycRows: [verifiedKycRow("BORROWER")],
  });

  assert.equal(readiness.ready, true);
  assert.deepEqual(
    readiness.applicants.map((item) => item.applicantType),
    ["BORROWER"],
  );
});

test("final KYC readiness does not accept the wrong party number", () => {
  const loan = {
    pan_card: "ABCDE1234F",
    guarantor_name: "Guarantor",
    guarantor_pan: "FGHIJ5678K",
  };
  const readiness = evaluateSrbhKycReadiness({
    loan,
    kycRows: [
      verifiedKycRow("BORROWER"),
      verifiedKycRow("GUARANTOR", { party_no: 2 }),
    ],
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.incompleteApplicants[0].incompleteChecks, [
    "PAN",
    "AADHAAR",
    "BUREAU",
  ]);
});

test("missing or invalid bureau data is not treated as NTC", () => {
  assert.ok(
    evaluate({}, { score: null }).reasons.includes(
      "CIBIL_SCORE_MISSING_OR_INVALID",
    ),
  );
  assert.ok(
    evaluate({}, { score: -2 }).reasons.includes(
      "CIBIL_SCORE_MISSING_OR_INVALID",
    ),
  );
  assert.ok(
    evaluate({}, { score: -1, reportParsed: false }).reasons.includes(
      "BUREAU_REPORT_MISSING_OR_INVALID",
    ),
  );
});

test("L3 amount and tenure boundaries are inclusive", () => {
  for (const requested_loan_amount of [140000, 220000]) {
    assert.equal(
      evaluate({ requested_loan_amount }).status,
      "BRE APPROVED",
      `amount ${requested_loan_amount}`,
    );
  }

  for (const requested_loan_amount of [139999, 220001]) {
    assert.ok(
      evaluate({ requested_loan_amount }).reasons.includes(
        "L3_LOAN_AMOUNT_OUTSIDE_140000_TO_220000",
      ),
    );
  }

  for (const loan_tenure of [12, 24]) {
    assert.equal(evaluate({ loan_tenure }).status, "BRE APPROVED");
  }

  for (const loan_tenure of [11, 25]) {
    assert.ok(
      evaluate({ loan_tenure }).reasons.includes(
        "L3_TENURE_OUTSIDE_12_TO_24",
      ),
    );
  }
});

test("L5 amount and tenure boundaries are inclusive", () => {
  const l5Loan = { product_type: "L5", requested_loan_amount: 300000 };

  for (const requested_loan_amount of [220000, 450000]) {
    assert.equal(
      evaluate({ ...l5Loan, requested_loan_amount, loan_tenure: 24 }).status,
      "BRE APPROVED",
    );
  }

  for (const requested_loan_amount of [219999, 450001]) {
    assert.ok(
      evaluate({
        ...l5Loan,
        requested_loan_amount,
        loan_tenure: 24,
      }).reasons.includes("L5_LOAN_AMOUNT_OUTSIDE_220000_TO_450000"),
    );
  }

  for (const loan_tenure of [12, 36]) {
    assert.equal(evaluate({ ...l5Loan, loan_tenure }).status, "BRE APPROVED");
  }

  for (const loan_tenure of [11, 37]) {
    assert.ok(
      evaluate({ ...l5Loan, loan_tenure }).reasons.includes(
        "L5_TENURE_OUTSIDE_12_TO_36",
      ),
    );
  }
});

test("Product Type is required and limited to L3 or L5", () => {
  assert.ok(
    evaluate({ product_type: "" }).reasons.includes(
      "PRODUCT_TYPE_REQUIRED_OR_INVALID",
    ),
  );
  assert.ok(
    evaluate({ product_type: "L4" }).reasons.includes(
      "PRODUCT_TYPE_REQUIRED_OR_INVALID",
    ),
  );
  assert.equal(evaluate({ product_type: "l3" }).status, "BRE APPROVED");
});

test("all SRBH bureau screening rules are hard rejection reasons", () => {
  const cases = [
    [{ enquiries30d: 4 }, "ENQUIRIES_GT_3_LAST_30D"],
    [{ hasDpd3M: true }, "DPD_LAST_3M"],
    [{ hasOverdue3M: true }, "OVERDUE_LAST_3M"],
    [{ hasWrittenOff3Y: true }, "WRITTEN_OFF_LAST_3Y"],
    [{ has60Plus6M: true }, "60PLUS_DPD_LAST_6M"],
    [{ has90Plus6M: true }, "90PLUS_DPD_LAST_6M"],
    [{ emiOverdueAmount: 3001 }, "EMI_OVERDUE_GT_3000"],
    [{ ccOverdueAmount: 5001 }, "CC_OVERDUE_GT_5000"],
  ];

  for (const [facts, reason] of cases) {
    const decision = evaluate({}, facts);
    assert.equal(decision.status, "BRE REJECTED", reason);
    assert.ok(decision.reasons.includes(reason), reason);
  }
});

test("screening thresholds allow exactly 3 enquiries and exact overdue caps", () => {
  const decision = evaluate(
    {},
    {
      enquiries30d: 3,
      emiOverdueAmount: 3000,
      ccOverdueAmount: 5000,
    },
  );

  assert.equal(decision.status, "BRE APPROVED");
});

test("bureau XML extraction uses overdue fields and correct card account codes", () => {
  const current = new Date();
  const currentDate = formatExperianDate(current);
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const xml = `
    <INProfileResponse>
      <SCORE><BureauScore>-1</BureauScore></SCORE>
      <CAPS><CAPS_Summary><CAPSLast30Days>4</CAPSLast30Days></CAPS_Summary></CAPS>
      <CAIS_Account>
        <CAIS_Account_DETAILS>
          <Account_Type>05</Account_Type>
          <Amount_Past_Due>3001</Amount_Past_Due>
          <Current_Balance>999999</Current_Balance>
          <Date_Reported>${currentDate}</Date_Reported>
          <Written_off_Settled_Status>02</Written_off_Settled_Status>
          <CAIS_Account_History>
            <Year>${year}</Year>
            <Month>${month}</Month>
            <Days_Past_Due>90</Days_Past_Due>
          </CAIS_Account_History>
        </CAIS_Account_DETAILS>
        <CAIS_Account_DETAILS>
          <Account_Type>10</Account_Type>
          <Amount_Overdue>5001</Amount_Overdue>
          <Current_Balance>888888</Current_Balance>
          <Date_Reported>${currentDate}</Date_Reported>
        </CAIS_Account_DETAILS>
        <CAIS_Account_DETAILS>
          <Account_Type>05</Account_Type>
          <Current_Balance>777777</Current_Balance>
          <Date_Reported>${currentDate}</Date_Reported>
        </CAIS_Account_DETAILS>
      </CAIS_Account>
    </INProfileResponse>
  `;

  const facts = extractSrbhBureauFacts(xml);

  assert.equal(facts.reportParsed, true);
  assert.equal(facts.score, -1);
  assert.equal(facts.isNtc, true);
  assert.equal(facts.enquiries30d, 4);
  assert.equal(facts.emiOverdueAmount, 3001);
  assert.equal(facts.ccOverdueAmount, 5001);
  assert.equal(facts.hasOverdue3M, true);
  assert.equal(facts.hasDpd3M, true);
  assert.equal(facts.has60Plus6M, true);
  assert.equal(facts.has90Plus6M, true);
  assert.equal(facts.hasWrittenOff3Y, true);
});

test("bureau XML extraction respects 3-year and 6-month windows", () => {
  const oldReportDate = formatExperianDate(monthsAgo(48));
  const oldHistoryDate = monthsAgo(7);
  const xml = `
    <INProfileResponse>
      <SCORE><BureauScore>700</BureauScore></SCORE>
      <CAIS_Account>
        <CAIS_Account_DETAILS>
          <Account_Type>05</Account_Type>
          <Written_off_Settled_Status>02</Written_off_Settled_Status>
          <Date_Reported>${oldReportDate}</Date_Reported>
          <CAIS_Account_History>
            <Year>${oldHistoryDate.getFullYear()}</Year>
            <Month>${oldHistoryDate.getMonth() + 1}</Month>
            <Days_Past_Due>90</Days_Past_Due>
          </CAIS_Account_History>
        </CAIS_Account_DETAILS>
      </CAIS_Account>
    </INProfileResponse>
  `;

  const facts = extractSrbhBureauFacts(xml);

  assert.equal(facts.hasWrittenOff3Y, false);
  assert.equal(facts.hasDpd3M, false);
  assert.equal(facts.has60Plus6M, false);
  assert.equal(facts.has90Plus6M, false);
});

test("KYC bureau payload supports raw, JSON-wrapped, and SOAP-wrapped XML", () => {
  const profileXml =
    "<INProfileResponse><SCORE><BureauScore>700</BureauScore></SCORE></INProfileResponse>";
  const jsonWrapped = JSON.stringify(profileXml);
  const soapWrapped = `
    <SOAP-ENV:Envelope>
      <SOAP-ENV:Body>
        <cbv2:processResponse>
          <cbv2:out>
            &lt;INProfileResponse&gt;
              &lt;SCORE&gt;&lt;BureauScore&gt;700&lt;/BureauScore&gt;&lt;/SCORE&gt;
            &lt;/INProfileResponse&gt;
          </cbv2:out>
        </cbv2:processResponse>
      </SOAP-ENV:Body>
    </SOAP-ENV:Envelope>
  `;

  for (const payload of [profileXml, jsonWrapped, soapWrapped]) {
    const facts = extractSrbhBureauFacts(payload);
    assert.equal(facts.reportParsed, true);
    assert.equal(facts.score, 700);
  }
});

test("an XML declaration without INProfileResponse is not a bureau report", () => {
  const facts = extractSrbhBureauFacts(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n',
  );

  assert.equal(facts.reportParsed, false);
  assert.equal(facts.score, null);
});
