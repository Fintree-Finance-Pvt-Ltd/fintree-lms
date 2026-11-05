const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");
const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");


const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,

  processEntities: {
    enabled: true,
    maxTotalExpansions: 200000,
    maxExpandedLength: 20000000,
    maxEntityCount: 200000,
    maxEntitySize: 200000,
  },
});


const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};


const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") {
    return fallback;
  }

  const n = Number(v);

  return Number.isFinite(n) ? n : fallback;
};


const parseDateYYYYMMDD = (s) => {
  if (!s || String(s).length !== 8) {
    return null;
  }

  const str = String(s);

  const y = Number(str.slice(0, 4));
  const m = Number(str.slice(4, 6)) - 1;
  const d = Number(str.slice(6, 8));

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


const calculateAge = (dob) => {
  if (!dob) return null;

  const birthDate = new Date(dob);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age =
    today.getFullYear() -
    birthDate.getFullYear();

  const m =
    today.getMonth() -
    birthDate.getMonth();


  if (
    m < 0 ||
    (m === 0 &&
      today.getDate() < birthDate.getDate())
  ) {
    age--;
  }


  return age;
};


/**
 * ===========================================================
 * OMRAJPAY BUREAU XML EXTRACTION
 * ===========================================================
 */


const extractOmRajPayBureauFacts = (reportXml) => {

  if (!reportXml) {

    return {
      score: null,
      enquiries30d: 0,
      hasDpd3M: false,
      hasDpd6M: false,
      hasOverdue12M: false,
      hasWrittenOff3Y: false,
      has60Plus24M: false,
      has90Plus36M: false,
      emiOverdueAmount: 0,
      ccOverdueAmount: 0,
      bureauPans: [],
    };

  }


  const json = parser.parse(reportXml);


  const profile =
    json?.INProfileResponse || {};


  const score =
    toNumber(
      profile?.SCORE?.BureauScore,
      null
    ) ??
    toNumber(
      profile?.Score?.BureauScore,
      null
    ) ??
    toNumber(
      profile?.Score?.Value,
      null
    );


  const enquiries30d =
    toNumber(
      profile?.CAPS?.CAPS_Summary?.CAPSLast30Days,
      0
    );


  const accounts =
    toArray(
      profile?.CAIS_Account
        ?.CAIS_Account_DETAILS
    );


  let hasDpd3M = false;
  let hasDpd6M = false;
  let hasOverdue12M = false;
  let hasWrittenOff5Y = false;
  let has60Plus24M = false;
  let has90Plus36M = false;


  let emiOverdueAmount = 0;
  let ccOverdueAmount = 0;


  const panSet = new Set();


  const appPan = String(
    profile
      ?.Current_Application
      ?.Current_Application_Details
      ?.Current_Applicant_Details
      ?.IncomeTaxPan || ""
  )
    .trim()
    .toUpperCase();


  if (appPan) {
    panSet.add(appPan);
  }


  const now = new Date();


  for (const acc of accounts) {


    const histories =
      toArray(
        acc?.CAIS_Account_History
      );


    const accountType =
      String(
        acc?.Account_Type || ""
      ).trim();



    for (
      const holder of
      toArray(acc?.CAIS_Holder_Details)
    ) {

      const p =
        String(
          holder?.Income_TAX_PAN || ""
        )
        .trim()
        .toUpperCase();


      if (p) {
        panSet.add(p);
      }

    }


    for (
      const idDet of
      toArray(acc?.CAIS_Holder_ID_Details)
    ) {

      const p =
        String(
          idDet?.Income_TAX_PAN || ""
        )
        .trim()
        .toUpperCase();


      if (p) {
        panSet.add(p);
      }

    }



    const woStatus =
      String(
        acc?.Written_off_Settled_Status ?? ""
      ).trim();



    if (
      woStatus &&
      woStatus !== "99"
    ) {

      const woDate =
        parseDateYYYYMMDD(
          acc?.WriteOffStatusDate
        ) ||
        parseDateYYYYMMDD(
          acc?.Date_Reported
        );


      const diffWo =
        monthsDiff(woDate);


      if (
        diffWo === null ||
        diffWo < 60
      ) {
        hasWrittenOff5Y = true;
      }

    }



    const accountStatus =
      String(
        acc?.Account_Status || ""
      ).trim();


    const isClosed =
      [
        "13",
        "14",
        "15",
        "16",
        "17"
      ].includes(accountStatus)
      ||
      !!acc?.Date_Closed;



    const pastDue =
      toNumber(
        acc?.Amount_Past_Due,
        0
      );



    const portfolioType =
      String(
        acc?.Portfolio_Type || ""
      ).trim();


    const isCreditCard =
      accountType === "10" ||
      portfolioType === "R";



    if (
      !isClosed &&
      pastDue > 0
    ) {

      if (isCreditCard) {

        ccOverdueAmount += pastDue;

      } else {

        emiOverdueAmount += pastDue;

      }

    }



    for (const hist of histories) {

      const year =
        toNumber(
          hist?.Year,
          null
        );


      const month =
        toNumber(
          hist?.Month,
          null
        );


      const dpd =
        toNumber(
          hist?.Days_Past_Due,
          0
        );


      if (!year || !month) {
        continue;
      }


      const histDate =
        new Date(
          year,
          month - 1,
          1
        );


      const diff =
        monthsDiff(
          histDate,
          now
        );


      if (
        diff === null ||
        diff < 0
      ) {
        continue;
      }


      if (
        diff < 3 &&
        dpd > 0
      ) {
        hasDpd3M = true;
      }


      if (
        diff < 6 &&
        dpd > 0
      ) {
        hasDpd6M = true;
      }


      if (
        diff < 12 &&
        dpd > 0
      ) {
        hasOverdue12M = true;
      }


      if (
        diff < 24 &&
        dpd >= 60
      ) {
        has60Plus24M = true;
      }


      if (
        diff < 36 &&
        dpd >= 90
      ) {
        has90Plus36M = true;
      }

    }

  }


  return {

    score,

    enquiries30d,

    hasDpd3M,

    hasDpd6M,

    hasOverdue12M,

    hasWrittenOff5Y,

    has60Plus24M,

    has90Plus36M,

    emiOverdueAmount,

    ccOverdueAmount,

    bureauPans:
      [...panSet],

  };

};
/**
 * ===========================================================
 * OMRAJPAY BUREAU SCREENING
 * ===========================================================
 */

const evaluateOmRajPayBureauScreening = ({
  loanPan,
  bureauFacts,
}) => {

  const reasons = [];
  const deviations = [];


  const score =
    toNumber(
      bureauFacts.score,
      null
    );


  const normalizedLoanPan =
    String(loanPan || "")
      .trim()
      .toUpperCase();



  const bureauPans =
    Array.isArray(
      bureauFacts.bureauPans
    )
      ? bureauFacts.bureauPans
      : [];



  /**
   * PAN CHECK
   */

  if (bureauPans.length > 1) {
    reasons.push(
      "MULTIPLE_PAN_IN_BUREAU"
    );
  }


  if (
    normalizedLoanPan &&
    bureauPans.length === 1 &&
    bureauPans[0] !== normalizedLoanPan
  ) {

    reasons.push(
      "BUREAU_PAN_MISMATCH"
    );

  }



  /**
   * SCORE CHECK
   *
   * <300 NTC
   * 300-649 Reject
   * 650-674 Deviation
   * >=675 Pass
   */

  if (
    score === null ||
    score < 300
  ) {

    deviations.push(
      "NTC_BANK_STATEMENT_REQUIRED"
    );

  }
  else if (
    score < 650
  ) {

    reasons.push(
      "CIBIL_BELOW_650"
    );

  }
  else if (
    score <= 674
  ) {

    deviations.push(
      "CIBIL_650_TO_674_APPROVAL_BASIS"
    );

  }




  /**
   * ENQUIRY CHECK
   */

  if (
    bureauFacts.enquiries30d > 5
  ) {

    reasons.push(
      "ENQUIRIES_GT_5_LAST_30D"
    );

  }




  /**
   * OVERDUE
   */

  if (
    bureauFacts.hasOverdue12M
  ) {

    reasons.push(
      "OVERDUE_LAST_12M"
    );

  }




  /**
   * WRITTEN OFF
   */

  if (
    bureauFacts.hasWrittenOff5Y
  ) {

    deviations.push(
      "WRITTEN_OFF_LAST_5Y_DEVIATION"
    );

  }




  /**
   * DPD
   */

  if (
    bureauFacts.hasDpd3M
  ) {

    deviations.push(
      "DPD_LAST_3M_DEVIATION"
    );

  }
  else if (
    bureauFacts.hasDpd6M
  ) {

    deviations.push(
      "DPD_LAST_4_TO_6M_DEVIATION"
    );

  }




  /**
   * 60+ / 90+ DPD
   */

  if (
    bureauFacts.has60Plus24M
  ) {

    deviations.push(
      "60PLUS_DPD_24M_DEVIATION"
    );

  }



  if (
    bureauFacts.has90Plus36M
  ) {

    deviations.push(
      "90PLUS_DPD_36M_DEVIATION"
    );

  }





  /**
   * OVERDUE AMOUNT
   */

  if (
    bureauFacts.emiOverdueAmount > 3000
  ) {

    deviations.push(
      "EMI_OVERDUE_GT_3000"
    );

  }



  if (
    bureauFacts.ccOverdueAmount > 5000
  ) {

    deviations.push(
      "CC_OVERDUE_GT_5000"
    );

  }




  return {

    status:
      reasons.length > 0
        ? "BUREAU REJECTED"
        : "BUREAU APPROVED",

    reasons,

    deviations,

    bureauScore:
      score,

    isNtc:
      score === null ||
      score < 300,

  };

};




/**
 * ===========================================================
 * OMRAJPAY POLICY EVALUATION
 * ===========================================================
 */


// const evaluateOmRajPayPolicy = ({
//   loan,
//   bureauFacts,
//   amlStatus,
// }) => {


//   const reasons = [];
//   const deviations = [];



//   const age =
//     calculateAge(
//       loan.dob
//     );



//   const loanAmount =
//     toNumber(
//       loan.requested_loan_amount,
//       0
//     );



//   const tenure =
//     toNumber(
//       loan.loan_tenure,
//       0
//     );



//   const score =
//     toNumber(
//       bureauFacts.score,
//       null
//     );




//   /**
//    * PAN DUPLICATION
//    */

//   const loanPan =
//     String(
//       loan.pan_card ||
//       loan.pan_number ||
//       ""
//     )
//     .trim()
//     .toUpperCase();



//   const bureauPans =
//     bureauFacts.bureauPans || [];



//   if (
//     bureauPans.length > 1
//   ) {

//     reasons.push(
//       "MULTIPLE_PAN_IN_BUREAU"
//     );

//   }



//   if (
//     loanPan &&
//     bureauPans.length === 1 &&
//     bureauPans[0] !== loanPan
//   ) {

//     reasons.push(
//       "BUREAU_PAN_MISMATCH"
//     );

//   }





//   /**
//    * AGE
//    */

//   if (
//     age === null
//   ) {

//     reasons.push(
//       "AGE_MISSING"
//     );

//   }
//   else {

//     if (
//       age < 18
//     ) {

//       reasons.push(
//         "AGE_BELOW_18"
//       );

//     }


//     if (
//       age > 58
//     ) {

//       reasons.push(
//         "AGE_ABOVE_58"
//       );

//     }

//   }





//   /**
//    * AML
//    */

//   const normalizedAmlStatus =
//     String(
//       amlStatus || ""
//     )
//     .trim()
//     .toUpperCase();



//   if (
//     normalizedAmlStatus === "STOP"
//   ) {

//     reasons.push(
//       "AML_STOP"
//     );

//   }
//   else if (
//     normalizedAmlStatus === "REVIEW"
//   ) {

//     reasons.push(
//       "AML_REVIEW"
//     );

//   }





//   /**
//    * SCORE RULES
//    */

//   if (
//     score === null ||
//     score < 300
//   ) {

//     deviations.push(
//       "NTC_BANK_STATEMENT_REQUIRED"
//     );

//   }
//   else if (
//     score < 650
//   ) {

//     reasons.push(
//       "CIBIL_BELOW_650"
//     );

//   }
//   else if (
//     score <= 674
//   ) {

//     deviations.push(
//       "CIBIL_650_TO_674_APPROVAL_BASIS"
//     );

//   }




//   /**
//    * LOAN AMOUNT
//    */

//   if (
//     loanAmount < 50000
//   ) {

//     reasons.push(
//       "LOAN_AMOUNT_BELOW_50000"
//     );

//   }


//   if (
//     loanAmount > 160000
//   ) {

//     reasons.push(
//       "LOAN_AMOUNT_ABOVE_160000"
//     );

//   }




//   /**
//    * TENURE
//    */

//   if (
//     tenure < 12 ||
//     tenure > 24
//   ) {

//     reasons.push(
//       "TENURE_OUTSIDE_12_TO_24"
//     );

//   }




//   /**
//    * ENQUIRY
//    */

//   if (
//     bureauFacts.enquiries30d > 5
//   ) {

//     reasons.push(
//       "ENQUIRIES_GT_5_LAST_30D"
//     );

//   }




//   /**
//    * DPD
//    */

//   if (
//     bureauFacts.hasDpd3M
//   ) {

//     deviations.push(
//       "DPD_LAST_3M_DEVIATION"
//     );

//   }
//   else if (
//     bureauFacts.hasDpd6M
//   ) {

//     deviations.push(
//       "DPD_LAST_4_TO_6M_DEVIATION"
//     );

//   }




//   /**
//    * OVERDUE
//    */

//   if (
//     bureauFacts.hasOverdue12M
//   ) {

//     reasons.push(
//       "OVERDUE_LAST_12M"
//     );

//   }




//   /**
//    * WRITTEN OFF
//    */

//   if (
//     bureauFacts.hasWrittenOff3Y
//   ) {

//     deviations.push(
//       "WRITTEN_OFF_LAST_3Y_DEVIATION"
//     );

//   }





//   if (
//     bureauFacts.has60Plus24M
//   ) {

//     deviations.push(
//       "60PLUS_DPD_24M_DEVIATION"
//     );

//   }



//   if (
//     bureauFacts.has90Plus36M
//   ) {

//     deviations.push(
//       "90PLUS_DPD_36M_DEVIATION"
//     );

//   }




//   if (
//     bureauFacts.emiOverdueAmount > 3000
//   ) {

//     deviations.push(
//       "EMI_OVERDUE_GT_3000"
//     );

//   }



//   if (
//     bureauFacts.ccOverdueAmount > 5000
//   ) {

//     deviations.push(
//       "CC_OVERDUE_GT_5000"
//     );

//   }





//   let status =
//     "BRE APPROVED";


//   if (
//     reasons.length > 0
//   ) {

//     status =
//       "BRE REJECTED";

//   }
//   else if (
//     deviations.length > 0
//   ) {

//     status =
//       "BRE DEVIATION";

//   }



//   return {

//     status,

//     reasons,

//     deviations,

//     bureauScore:
//       score,

//   };

// };
 
const evaluateOmRajPayPolicy = ({
    loan,
    bureauFacts,
    amlStatus
}) => {

    const rejectReasons = [];
    const deviationReasons = [];



    // ==========================
    // 1. AML CHECK
    // ==========================

    if (
        amlStatus &&
        amlStatus.toUpperCase() !== "CLEAR" &&
        amlStatus.toUpperCase() !== "PROCEED"
    ) {
        rejectReasons.push("AML_NOT_CLEAR");
    }



    // ==========================
    // 2. CUSTOMER TYPE
    // ==========================

    if (
        loan.customer_type &&
        loan.customer_type.toLowerCase() !== "individual"
    ) {
        rejectReasons.push(
            "CUSTOMER_TYPE_NOT_ALLOWED"
        );
    }



    // // ==========================
    // // 3. AGE CHECK
    // // ==========================

    // if (loan.age) {

    //     if (
    //         Number(loan.age) < 21 ||
    //         Number(loan.age) > 58
    //     ) {
    //         rejectReasons.push(
    //             "AGE_NOT_IN_RANGE_21_TO_58"
    //         );
    //     }

    // }

// ==========================
// 3. AGE CHECK
// ==========================

const age = calculateAge(
    loan.dob
);


if (age === null) {

    rejectReasons.push(
        "AGE_MISSING"
    );

}
else {

    if (
        age < 21 ||
        age > 58
    ) {

        rejectReasons.push(
            "AGE_NOT_IN_RANGE_21_TO_58"
        );

    }

}


    // ==========================
    // 4. LOAN AMOUNT
    // ==========================

    const loanAmount =
        Number(
            loan.loan_amount ||
            loan.requested_loan_amount ||
            0
        );


    if (loanAmount < 30000) {

        rejectReasons.push(
            "LOAN_AMOUNT_BELOW_MIN_LIMIT"
        );

    }


    if (loanAmount > 160000) {

        rejectReasons.push(
            "LOAN_AMOUNT_ABOVE_MAX_LIMIT"
        );

    }



    // ==========================
    // 5. TENURE
    // ==========================

    const tenure =
        Number(loan.loan_tenure || 0);


    if (
        tenure < 6 ||
        tenure > 24
    ) {

        rejectReasons.push(
            "TENURE_NOT_ALLOWED_6_TO_24_MONTHS"
        );

    }



    // ==========================
    // 6. CIBIL SCORE
    // ==========================

    const score =
        Number(
            bureauFacts.score ||
            loan.cibil_score ||
            0
        );


    if (!score) {

        rejectReasons.push(
            "CIBIL_SCORE_NOT_AVAILABLE"
        );

    }
    else if(score < 650){

        rejectReasons.push(
            "CIBIL_SCORE_BELOW_650"
        );

    }



    // ==========================
    // 7. BUREAU ENQUIRY
    // ==========================

    if (
        Number(bureauFacts.enquiries30d || 0) > 5
    ) {

        rejectReasons.push(
            "BUREAU_ENQUIRY_MORE_THAN_5_IN_30_DAYS"
        );

    }



    // ==========================
    // 8. DPD CHECK
    // ==========================


    // if (
    //     bureauFacts.hasDpd3M
    // ) {

    //     deviationReasons.push(
    //         "DPD_PRESENT_LAST_3_MONTHS"
    //     );

    // }


    // if (
    //     bureauFacts.hasDpd6M
    // ) {

    //     deviationReasons.push(
    //         "DPD_PRESENT_LAST_6_MONTHS"
    //     );

    // }
if (
    bureauFacts.hasDpd3M ||
    bureauFacts.hasDpd6M
) {

    rejectReasons.push(
        "DPD_PRESENT"
    );

}


    // ==========================
    // 9. OVERDUE
    // ==========================

    if (
        bureauFacts.hasOverdue12M
    ) {

        rejectReasons.push(
            "OVERDUE_PRESENT_LAST_12_MONTHS"
        );

    }



    // ==========================
    // 10. WRITTEN OFF
    // ==========================

    if (
        bureauFacts.hasWrittenOff3Y
    ) {

        rejectReasons.push(
            "WRITTEN_OFF_LAST_5_YEARS"
        );

    }



    // ==========================
    // 11. 60+ DPD
    // ==========================

    if (
        bureauFacts.has60Plus24M
    ) {

        deviationReasons.push(
            "60_PLUS_DPD_LAST_24_MONTHS"
        );

    }



    // ==========================
    // 12. 90+ DPD
    // ==========================

    if (
        bureauFacts.has90Plus36M
    ) {

        rejectReasons.push(
            "90_PLUS_DPD_LAST_36_MONTHS"
        );

    }



    // ==========================
    // 13. GUARANTOR / CO APPLICANT
    // ==========================

    if (
        !loan.guarantor_name &&
        !loan.co_applicant_name
    ) {

        rejectReasons.push(
            "GUARANTOR_OR_CO_APPLICANT_REQUIRED"
        );

    }



    // ==========================
    // 14. VEHICLE / IOT CHECK
    // ==========================

    if (
        !loan.e_rikshaw_model
    ) {

        rejectReasons.push(
            "VEHICLE_DETAILS_REQUIRED"
        );

    }


    if (
        !loan.chassis_no
    ) {

        rejectReasons.push(
            "CHASSIS_NUMBER_REQUIRED"
        );

    }
if (
    !loan.battery_serial_no_1
) {

    rejectReasons.push(
        "BATTERY_DETAILS_REQUIRED"
    );

}


    // ==========================
    // FINAL DECISION
    // ==========================

    let status = "BRE APPROVED";


    if(rejectReasons.length > 0){

        status = "BRE REJECTED";

    }
    else if(deviationReasons.length > 0){

        status = "BRE DEVIATION";

    }



    return {

        status,

        reasons:[
            ...rejectReasons,
            ...deviationReasons
        ],

        rejectReasons,

        deviationReasons,

        score,

        loanAmount,

        tenure

    };

}
/**
  * ===========================================================
  * MAIN OMRAJPAY BRE
  * ===========================================================
  */

const autoApproveOmRajPayIfAllVerified = async (lan) => {

  const pool = db.promise();



  const setPending = async (reason) => {

    await pool.query(
      `
      UPDATE loan_booking_omrajpay
      SET
        omrajpay_bre_status = ?,
        omrajpay_bre_reason = ?,
        omrajpay_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      [
        "Pending",
        reason,
        lan
      ]
    );

  };



  /**
   * LOAN FETCH
   */

  const [
    loanRows
  ] = await pool.query(
    `
    SELECT
      lan,
      dob,
      pan_card,
      requested_loan_amount,
      loan_tenure,
      interest_rate,
      cibil_score,
      guarantor_name,
      guarantor_mobile,
      guarantor_pan,
      co_applicant_name,
      co_applicant_mobile,
      co_applicant_pan
      customer_type,
      e_rikshaw_model,
      chassis_no,
      battery_serial_no_1
  
    FROM loan_booking_omrajpay
    WHERE lan = ?
    LIMIT 1
    `,
    [
      lan
    ]
  );



  if (!loanRows.length) {

    console.log(
      "OmRajPay loan not found:",
      lan
    );

    return;

  }



  const loan =
    loanRows[0];



  const normalizeStatus = (status) =>
    String(status || "")
      .trim()
      .toUpperCase();




  /**
   * BORROWER KYC
   */

  const [
    kycRows
  ] = await pool.query(
    `
    SELECT
      pan_status,
      aadhaar_status,
      bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
      AND UPPER(TRIM(applicant_type)) = 'BORROWER'
      AND party_no = 1
    LIMIT 1
    `,
    [
      lan
    ]
  );



  if (!kycRows.length) {

    await setPending(
      "KYC_STATUS_ROW_MISSING"
    );

    return;

  }



  const kyc =
    kycRows[0];



  const requiredKycStatuses = {

    PAN:
      kyc.pan_status,

    AADHAAR:
      kyc.aadhaar_status,

    BUREAU:
      kyc.bureau_status

  };



  const incompleteKycChecks =
    Object.entries(requiredKycStatuses)
      .filter(
        ([, status]) =>
          normalizeStatus(status)
          !== "VERIFIED"
      )
      .map(
        ([type,status]) =>
        `BORROWER_1_${type}_STATUS=${
          normalizeStatus(status) || "NA"
        }`
      );



  if (
    incompleteKycChecks.length > 0
  ) {

    await setPending(
      incompleteKycChecks.join(", ")
    );

    return;

  }




  /**
   * SECOND PARTY CHECK
   */


  const hasValue = (value) => {

    if (
      value === null ||
      value === undefined
    ) {

      return false;

    }


    if (
      typeof value === "string"
    ) {

      return value.trim() !== "";

    }


    return true;

  };



  const secondParties = [];



  const hasGuarantor =
    [
      loan.guarantor_name,
      loan.guarantor_mobile,
      loan.guarantor_pan
    ]
    .some(hasValue);



  const hasCoApplicant =
    [
      loan.co_applicant_name,
      loan.co_applicant_mobile,
      loan.co_applicant_pan
    ]
    .some(hasValue);




  if (hasGuarantor) {

    secondParties.push(
      "GUARANTOR"
    );

  }



  if (hasCoApplicant) {

    secondParties.push(
      "CO_APPLICANT"
    );

  }




  for (
    const applicantType of secondParties
  ) {


    const [
      partyRows
    ] = await pool.query(
      `
      SELECT
        pan_status,
        aadhaar_status,
        bureau_status
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = 1
      LIMIT 1
      `,
      [
        lan,
        applicantType
      ]
    );



    if (!partyRows.length) {

      await setPending(
        `${applicantType}_KYC_ROW_MISSING`
      );

      return;

    }



    const partyKyc =
      partyRows[0];



    const partyChecks =
      Object.entries({

        PAN:
          partyKyc.pan_status,

        AADHAAR:
          partyKyc.aadhaar_status,

        BUREAU:
          partyKyc.bureau_status

      })
      .filter(
        ([,status]) =>
          normalizeStatus(status)
          !== "VERIFIED"
      )
      .map(
        ([type,status]) =>
        `${applicantType}_1_${type}_STATUS=${
          normalizeStatus(status) || "NA"
        }`
      );



    if (
      partyChecks.length
    ) {

      await setPending(
        partyChecks.join(", ")
      );

      return;

    }

  }




  /**
   * BUREAU FETCH
   */


  const [
    loanCibilRows
  ] = await pool.query(
    `
    SELECT
      score,
      report_xml,
      created_at
    FROM loan_cibil_reports
    WHERE TRIM(lan)=TRIM(?)
      AND UPPER(TRIM(applicant_type))
          ='BORROWER'
    ORDER BY created_at DESC,id DESC
    LIMIT 1
    `,
    [
      lan
    ]
  );



  if (
    !loanCibilRows.length ||
    !loanCibilRows[0].report_xml
  ) {


    await setPending(
      "BUREAU_REPORT_MISSING"
    );


    return;

  }



  const reportXml =
    loanCibilRows[0].report_xml;



  let amlStatus =
    "ERROR";

  let amlReason =
    "";



  try {


    const aml =
      await screenLoanBooking(
        "omrajpay",
        lan
      );



    amlStatus =
      String(
        aml.amlStatus || ""
      )
      .trim()
      .toUpperCase();



    amlReason =
      aml.amlReason || "";



  }
  catch(error){


    await setPending(
      `AML_ERROR:${error.message}`
    );


    return;

  } 
  /**
 * ===========================================================
 * COMPLETE BRE EXECUTION
 * ===========================================================
 */


  let bureauFacts;

  try {

    bureauFacts =
      extractOmRajPayBureauFacts(
        reportXml
      );


  } catch(error) {


    console.error(
      "OmRajPay bureau parsing failed:",
      error.message
    );


    await setPending(
      "BUREAU_REPORT_PARSE_FAILED"
    );


    return;

  }




  /**
   * POLICY DECISION
   */

  const decision =
    evaluateOmRajPayPolicy({

      loan,

      bureauFacts,

      amlStatus

    });



  const reasonParts = [

    ...decision.reasons,

    ...decision.deviations

  ];



  if (
    amlReason &&
    (
      amlStatus === "STOP" ||
      amlStatus === "REVIEW" ||
      amlStatus === "ERROR"
    )
  ) {

    reasonParts.push(
      `AML:${amlReason}`
    );

  }



  const reasonText =
    reasonParts.length
      ? reasonParts.join(", ")
      : "ELIGIBLE";




  /**
   * FINAL STATUS
   */


  let finalStatus =
    "Credit Initiated";


  let finalStage =
    "BRE Approved";



  if (
    decision.status ===
    "BRE REJECTED"
  ) {

    finalStatus =
      "Rejected";


    finalStage =
      "BRE Rejected";

  }



  if (
    decision.status ===
    "BRE DEVIATION"
  ) {

    finalStatus =
      "Credit Initiated";


    finalStage =
      "BRE Deviation";

  }





  /**
   * UPDATE OMRAJPAY LOAN
   */


  await pool.query(
    `
    UPDATE loan_booking_omrajpay
    SET

      omrajpay_bre_status = ?,

      omrajpay_bre_reason = ?,

      omrajpay_bre_checked_at = NOW(),


      fintree_cibil_score = ?,


      omrajpay_enquiries_30d = ?,


      omrajpay_dpd_3m_flag = ?,


      omrajpay_dpd_6m_flag = ?,


      omrajpay_overdue_12m_flag = ?,


      omrajpay_written_off_3y_flag = ?,


      omrajpay_60plus_24m_flag = ?,


      omrajpay_90plus_36m_flag = ?,


      omrajpay_emi_overdue_amount = ?,


      omrajpay_cc_overdue_amount = ?,


      omrajpay_deviation_flag = ?,


      status = ?,


      stage = ?


    WHERE lan = ?

    `,
    [

      decision.status,

      reasonText,


      decision.bureauScore,


      bureauFacts.enquiries30d,


      bureauFacts.hasDpd3M
        ? 1
        : 0,


      bureauFacts.hasDpd6M
        ? 1
        : 0,


      bureauFacts.hasOverdue12M
        ? 1
        : 0,


      bureauFacts.hasWrittenOff5Y
        ? 1
        : 0,


      bureauFacts.has60Plus24M
        ? 1
        : 0,


      bureauFacts.has90Plus36M
        ? 1
        : 0,


      bureauFacts.emiOverdueAmount,


      bureauFacts.ccOverdueAmount,


      decision.deviations.length > 0
        ? 1
        : 0,


      finalStatus,


      finalStage,


      lan

    ]

  );




  console.log(
    `OmRajPay BRE completed for ${lan}: ${decision.status} | ${reasonText}`
  );


};





/**
 * ===========================================================
 * EXPORTS
 * ===========================================================
 */


module.exports = {

  autoApproveOmRajPayIfAllVerified,

  extractOmRajPayBureauFacts,

  evaluateOmRajPayPolicy,

  evaluateOmRajPayBureauScreening

};