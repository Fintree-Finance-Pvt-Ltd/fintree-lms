const partnerLimitService = require("./partnerLimitService");
const partnerFldgService = require("./partnerFldgService");


function getMonthYear(date = new Date()) {

  return {
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };

}


/*
--------------------------------------------------
VALIDATE BEFORE LOAN INSERT
--------------------------------------------------
Checks:

✔ partner exists
✔ monthly limit
✔ fldg_status
✔ fldg_percent
✔ FLDG availability

Returns:

partnerId
limitId
requiredFldg
--------------------------------------------------
*/

async function validateBookingOrThrow(
  conn,
  partnerName,
  loanAmount
) {

  if (!loanAmount || loanAmount <= 0) {
    throw new Error("INVALID_LOAN_AMOUNT");
  }

  // 1️⃣ get partner
  const partner =
    await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName
    );


  // 2️⃣ check monthly limit
  const { month, year } = getMonthYear();

  const limitCheck =
    await partnerLimitService.validatePartnerLimit(
      conn,
      partner.partner_id,
      loanAmount,
      month,
      year
    );

  if (!limitCheck.valid) {

    const err = new Error("LIMIT_EXCEEDED");

    err.meta = {
      partnerName,
      remaining: limitCheck.remaining,
      required: loanAmount
    };

    throw err;
  }


  // 3️⃣ fetch FLDG config
  const [[config]] = await conn.query(
    `
      SELECT fldg_percent, fldg_status
      FROM partner_master
      WHERE partner_id = ?
    `,
    [partner.partner_id]
  );


  let requiredFldg = 0;


  // 4️⃣ apply FLDG only if enabled
  if (config?.fldg_status === 1) {

    const percent =
      Number(config.fldg_percent || 0);

    requiredFldg =
      Number(((loanAmount * percent) / 100).toFixed(2));

  }


  // 5️⃣ check FLDG availability
  if (requiredFldg > 0) {

    const fldgCheck =
      await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg
      );

    if (!fldgCheck.valid) {

      const err = new Error("FLDG_INSUFFICIENT");

      err.meta = {
        partnerName,
        available: fldgCheck.available,
        required: requiredFldg
      };

      throw err;

    }

  }


  return {

    partnerId: partner.partner_id,
    limitId: limitCheck.limitId,
    requiredFldg

  };

}


/*
--------------------------------------------------
FINALIZE AFTER LOAN INSERT
--------------------------------------------------
Updates:

✔ used limit
✔ reserve FLDG
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

  await partnerLimitService.updateUsedLimit(
    conn,
    limitId,
    loanAmount,
    "BOOKED",
    lan
  );


  if (requiredFldg > 0) {

    await partnerFldgService.reserveFldg(
      conn,
      partnerId,
      lan,
      requiredFldg,
      remarks
    );

  }

}


module.exports = {

  validateBookingOrThrow,
  finalizeBooking

};