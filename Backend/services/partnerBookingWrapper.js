// const partnerLimitService = require("./partnerLimitService");
// const partnerFldgService = require("./partnerFldgService");


// function getMonthYear(date = new Date()) {

//   return {
//     month: date.getMonth() + 1,
//     year: date.getFullYear()
//   };

// }


// /*
// --------------------------------------------------
// VALIDATE BEFORE LOAN INSERT
// --------------------------------------------------
// Checks:

// ✔ partner exists
// ✔ monthly limit
// ✔ fldg_status
// ✔ fldg_percent
// ✔ FLDG availability

// Returns:

// partnerId
// limitId
// requiredFldg
// --------------------------------------------------
// */

// async function validateBookingOrThrow(
//   conn,
//   partnerName,
//   loanAmount
// ) {

//   if (!loanAmount || loanAmount <= 0) {
//     throw new Error("INVALID_LOAN_AMOUNT");
//   }

//   // 1️⃣ get partner
//   const partner =
//     await partnerLimitService.getOrCreatePartner(
//       conn,
//       partnerName
//     );


//   // 2️⃣ check monthly limit
//   const { month, year } = getMonthYear();

//   const limitCheck =
//     await partnerLimitService.validatePartnerLimit(
//       conn,
//       partner.partner_id,
//       loanAmount,
//       month,
//       year
//     );

//   if (!limitCheck.valid) {

//     const err = new Error("LIMIT_EXCEEDED");

//     err.meta = {
//       partnerName,
//       remaining: limitCheck.remaining,
//       required: loanAmount
//     };

//     throw err;
//   }


//   // 3️⃣ fetch FLDG config
//   const [[config]] = await conn.query(
//     `
//       SELECT fldg_percent, fldg_status
//       FROM partner_master
//       WHERE partner_id = ?
//     `,
//     [partner.partner_id]
//   );


//   let requiredFldg = 0;


//   // 4️⃣ apply FLDG only if enabled
//   if (config?.fldg_status === 1) {

//     const percent =
//       Number(config.fldg_percent || 0);

//     requiredFldg =
//       Number(((loanAmount * percent) / 100).toFixed(2));

//   }


//   // 5️⃣ check FLDG availability
//   if (requiredFldg > 0) {

//     const fldgCheck =
//       await partnerFldgService.validateFldgAvailability(
//         conn,
//         partner.partner_id,
//         requiredFldg
//       );

//     if (!fldgCheck.valid) {

//       const err = new Error("FLDG_INSUFFICIENT");

//       err.meta = {
//         partnerName,
//         available: fldgCheck.available,
//         required: requiredFldg
//       };

//       throw err;

//     }

//   }


//   return {

//     partnerId: partner.partner_id,
//     limitId: limitCheck.limitId,
//     requiredFldg

//   };

// }


// /*
// --------------------------------------------------
// FINALIZE AFTER LOAN INSERT
// --------------------------------------------------
// Updates:

// ✔ used limit
// ✔ reserve FLDG
// --------------------------------------------------
// */

// async function finalizeBooking(
//   conn,
//   partnerId,
//   limitId,
//   lan,
//   loanAmount,
//   requiredFldg,
//   remarks = ""
// ) {

//   await partnerLimitService.updateUsedLimit(
//     conn,
//     limitId,
//     loanAmount,
//     "BOOKED",
//     lan
//   );


//   if (requiredFldg > 0) {

//     await partnerFldgService.reserveFldg(
//       conn,
//       partnerId,
//       lan,
//       requiredFldg,
//       remarks
//     );

//   }

// }


// module.exports = {

//   validateBookingOrThrow,
//   finalizeBooking

// };


const partnerLimitService = require("./partnerLimitService");
const partnerFldgService = require("./partnerFldgService");

function getMonthYear(date = new Date()) {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function normalizeDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();

  if (isNaN(date.getTime())) {
    throw new Error("INVALID_BOOKING_DATE");
  }

  return date;
}

/*
--------------------------------------------------
VALIDATE BEFORE LOAN INSERT
--------------------------------------------------
Checks:

partner exists
booking monthly limit
fldg_status
fldg_percent
FLDG availability

Returns:

partnerId
limitId
requiredFldg
month
year
--------------------------------------------------
*/

async function validateBookingOrThrow(
  conn,
  partnerName,
  loanAmount,
  bookingDate = new Date()
) {
  const amount = Number(loanAmount || 0);

  if (!amount || amount <= 0) {
    throw new Error("INVALID_LOAN_AMOUNT");
  }

  const finalBookingDate = normalizeDate(bookingDate);

  const { month, year } = getMonthYear(finalBookingDate);

  // 1. Get partner
  const partner = await partnerLimitService.getOrCreatePartner(
    conn,
    partnerName
  );

  // 2. Check booking monthly limit
  // This checks: assigned_limit - booked_limit
  const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
    conn,
    partner.partner_id,
    amount,
    month,
    year
  );

  if (!limitCheck.valid) {
    const err = new Error("LIMIT_EXCEEDED");

    err.meta = {
      partnerName,
      remaining: limitCheck.remaining,
      required: amount,
      month,
      year,
    };

    throw err;
  }

  // 3. Fetch FLDG config
  const [[config]] = await conn.query(
    `
    SELECT 
      fldg_percent,
      fldg_status
    FROM partner_master
    WHERE partner_id = ?
    `,
    [partner.partner_id]
  );

  if (!config) {
    throw new Error("Partner configuration not found");
  }

  let requiredFldg = 0;

  // 4. Apply FLDG only if enabled
  if (config?.fldg_status === 1) {
    const percent = Number(config.fldg_percent || 0);
    requiredFldg = Number(((amount * percent) / 100).toFixed(2));
  }

  // 5. Check FLDG availability
  if (requiredFldg > 0) {
    const fldgCheck = await partnerFldgService.validateFldgAvailability(
      conn,
      partner.partner_id,
      requiredFldg
    );

    if (!fldgCheck.valid) {
      const err = new Error("FLDG_INSUFFICIENT");

      err.meta = {
        partnerName,
        available: fldgCheck.available,
        required: requiredFldg,
      };

      throw err;
    }
  }

  return {
    partnerId: partner.partner_id,
    limitId: limitCheck.limitId,
    requiredFldg,
    month,
    year,
  };
}

/*
--------------------------------------------------
FINALIZE AFTER LOAN INSERT
--------------------------------------------------
Updates:

booked_limit
reserve FLDG
--------------------------------------------------
*/

async function finalizeBooking(
  conn,
  partnerId,
  limitId,
  lan,
  loanAmount,
  requiredFldg,
  remarks = ""
) {
  const amount = Number(loanAmount || 0);

  if (!amount || amount <= 0) {
    throw new Error("INVALID_LOAN_AMOUNT");
  }

  // 1. Update booked/login pipeline only
  await partnerLimitService.updateBookedLimit(
    conn,
    limitId,
    amount,
    lan
  );

  // 2. Reserve FLDG only once per LAN
  if (requiredFldg > 0) {
    const [[alreadyReserved]] = await conn.query(
      `
      SELECT id
      FROM partner_fldg_utilization
      WHERE partner_id = ?
        AND booking_lan = ?
        AND utilization_type = 'RESERVED'
      LIMIT 1
      `,
      [partnerId, lan]
    );

    if (!alreadyReserved) {
      await partnerFldgService.reserveFldg(
        conn,
        partnerId,
        lan,
        requiredFldg,
        remarks
      );
    }
  }
}

module.exports = {
  validateBookingOrThrow,
  finalizeBooking,
};