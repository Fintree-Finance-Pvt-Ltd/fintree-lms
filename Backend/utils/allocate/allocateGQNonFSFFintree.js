// const { queryDB } = require("../helpers");

// module.exports = async function allocateGQNonFSFFintree(lan, payment) {
//   let remaining = parseFloat(payment.transfer_amount);
//   const { payment_date, payment_id } = payment;
//   console.log("🚀 allocateGQNonFSFFintree called with:", { lan, payment });

//   if (!payment_id) throw new Error("❌ payment_id missing");

//   try {
//     // 1️⃣ Allocate to EMIs
//     while (remaining > 0) {
//       const [emi] = await queryDB(
//         `SELECT * FROM manual_rps_gq_non_fsf_fintree WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
//          ORDER BY due_date ASC LIMIT 1`,
//         [lan]
//       );

//       if (!emi) break;

//       let interest = parseFloat(emi.remaining_interest || 0);
//       let principal = parseFloat(emi.remaining_principal || 0);

//       // Interest first
//       if (interest > 0 && remaining > 0) {
//         const alloc = Math.min(interest, remaining);
//         remaining -= alloc;
//         interest -= alloc;

//         const insertRes = await queryDB(
//           `INSERT INTO allocation_fintree (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//            VALUES (?, ?, ?, ?, 'Interest', ?)`,
//           [lan, emi.due_date, payment_date, alloc, payment_id]
//         );
//         console.log("Inserted Interest allocation:", { alloc, insertRes, remaining, emiId: emi.id });
//       }

//       // Then Principal
//       if (interest === 0 && principal > 0 && remaining > 0) {
//         const alloc = Math.min(principal, remaining);
//         remaining -= alloc;
//         principal -= alloc;

//         console.log("🚀 Allocating principal:", { alloc, remaining, principal });

//         const insertRes = await queryDB(
//           `INSERT INTO allocation_fintree (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//            VALUES (?, ?, ?, ?, 'Principal', ?)`,
//           [lan, emi.due_date, payment_date, alloc, payment_id]
//         );
//         console.log("Inserted Principal allocation:", { alloc, insertRes, remaining, emiId: emi.id });
//       }

//       const updateRes = await queryDB(
//         `UPDATE manual_rps_gq_non_fsf_fintree
//          SET remaining_interest = ?, remaining_principal = ?,
//              remaining_emi = ?, remaining_amount = ?, payment_date = ?
//          WHERE id = ?`,
//         [
//           interest,
//           principal,
//           interest + principal,
//           interest + principal,
//           payment_date,
//           emi.id,
//         ]
//       );
//       console.log("Updated manual_rps row:", { emiId: emi.id, updateRes });

//       if (interest > 0 || principal > 0) break; // Stop if still pending
//     }

//     // 3️⃣ Park excess as Excess Payment if still remaining
//     if (remaining > 0) {
//       const insertLoanCharge = await queryDB(
//         `INSERT INTO loan_charges_fintree (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
//          VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
//         [lan, remaining, payment_date, payment_date]
//       );
//       console.log("Inserted loan_charges_fintree:", { insertLoanCharge, remaining });

//       const insertAllocation = await queryDB(
//         `INSERT INTO allocation_fintree (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//         [lan, payment_date, payment_date, remaining, payment_id]
//       );
//       console.log("Inserted Excess Payment allocation:", { insertAllocation, remaining });

//       remaining = 0;
//     }

//     // 4️⃣ Auto-close loan if fully cleared
//     const [pending] = await queryDB(
//       `SELECT SUM(remaining_principal + remaining_interest) AS pending
//        FROM manual_rps_gq_non_fsf_fintree WHERE lan = ?`,
//       [lan]
//     );

//     const hasPending = parseFloat(pending.pending || 0);

//     if (hasPending === 0) {
//       const closeRes = await queryDB(
//         `UPDATE loan_booking_gq_non_fsf SET status = 'Fully Paid' WHERE lan = ?`,
//         [lan]
//       );
//       console.log("Loan closed:", { lan, closeRes });
//     }

//     return { ok: true, remaining };
//   } catch (err) {
//     console.error("❌ allocateGQNonFSFFintree failed:", err);
//     throw err; // rethrow so caller sees the error
//   }
// };



////////////////////

const { queryDB } = require("../helpers");


function roundMoney(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid Amount value: ${value}`);
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

module.exports = async function allocateGQNonFSFFintree(lan, payment) {
  let remaining = roundMoney(payment.transfer_amount);
  const { payment_date, payment_id } = payment;

  console.log("🚀 allocateGQNonFSFFintree called with:", {
    lan,
    payment,
  });

  if (!lan) {
    throw new Error("❌ lan missing");
  }

  if (!payment_id) {
    throw new Error("❌ payment_id missing");
  }

  if (!payment_date) {
    throw new Error("❌ payment_date missing");
  }

  if (remaining <= 0) {
    throw new Error("❌ transfer_amount must be greater than zero");
  }

  try {
    // 1️⃣ Allocate payment to EMIs in due-date order.
    while (remaining > 0) {
      const [emi] = await queryDB(
        `SELECT *
         FROM manual_rps_gq_non_fsf_fintree
         WHERE lan = ?
           AND (
             remaining_interest > 0
             OR remaining_principal > 0
           )
         ORDER BY due_date ASC, id ASC
         LIMIT 1`,
        [lan]
      );

      if (!emi) {
        break;
      }

      let interest = roundMoney(emi.remaining_interest);
      let principal = roundMoney(emi.remaining_principal);
      let allocatedToEmi = 0;

      /*
       * Adjust negative interest against principal.
       *
       * Example:
       * remaining_principal = 6018.35
       * remaining_interest  = -0.02
       * actual amount due   = 6018.33
       */
      if (interest < 0) {
        principal = roundMoney(principal + interest);
        interest = 0;
      }

      // Adjust negative principal against interest, if present.
      if (principal < 0) {
        interest = roundMoney(interest + principal);
        principal = 0;
      }

      interest = Math.max(0, interest);
      principal = Math.max(0, principal);

      // 2️⃣ Allocate interest first.
      if (interest > 0 && remaining > 0) {
        const alloc = roundMoney(Math.min(interest, remaining));

        remaining = roundMoney(remaining - alloc);
        interest = roundMoney(interest - alloc);
        allocatedToEmi = roundMoney(allocatedToEmi + alloc);

        const insertRes = await queryDB(
          `INSERT INTO allocation_fintree
             (
               lan,
               due_date,
               allocation_date,
               allocated_amount,
               charge_type,
               payment_id
             )
           VALUES (?, ?, ?, ?, 'Interest', ?)`,
          [
            lan,
            emi.due_date,
            payment_date,
            alloc,
            payment_id,
          ]
        );

        console.log("Inserted Interest allocation:", {
          alloc,
          insertRes,
          remaining,
          emiId: emi.id,
        });
      }

      // 3️⃣ Allocate principal after interest is cleared.
      if (interest <= 0 && principal > 0 && remaining > 0) {
        const alloc = roundMoney(Math.min(principal, remaining));

        remaining = roundMoney(remaining - alloc);
        principal = roundMoney(principal - alloc);
        allocatedToEmi = roundMoney(allocatedToEmi + alloc);

        const insertRes = await queryDB(
          `INSERT INTO allocation_fintree
             (
               lan,
               due_date,
               allocation_date,
               allocated_amount,
               charge_type,
               payment_id
             )
           VALUES (?, ?, ?, ?, 'Principal', ?)`,
          [
            lan,
            emi.due_date,
            payment_date,
            alloc,
            payment_id,
          ]
        );

        console.log("Inserted Principal allocation:", {
          alloc,
          insertRes,
          remaining,
          principal,
          emiId: emi.id,
        });
      }

      interest = Math.max(0, roundMoney(interest));
      principal = Math.max(0, roundMoney(principal));

      const remainingEmi = roundMoney(interest + principal);

      const updateRes = await queryDB(
        `UPDATE manual_rps_gq_non_fsf_fintree
         SET remaining_interest = ?,
             remaining_principal = ?,
             remaining_emi = ?,
             remaining_amount = ?,
             payment_date = CASE
               WHEN ? > 0 THEN ?
               ELSE payment_date
             END
         WHERE id = ?`,
        [
          interest,
          principal,
          remainingEmi,
          remainingEmi,
          allocatedToEmi,
          payment_date,
          emi.id,
        ]
      );

      console.log("Updated manual_rps row:", {
        emiId: emi.id,
        updateRes,
        remainingInterest: interest,
        remainingPrincipal: principal,
        remainingEmi,
      });

      // Stop when the current EMI is only partially paid.
      if (interest > 0 || principal > 0) {
        break;
      }
    }

    // 4️⃣ Park genuine remaining amount as Excess Payment.
    if (remaining > 0) {
      const insertLoanCharge = await queryDB(
        `INSERT INTO loan_charges_fintree
           (
             lan,
             charge_type,
             amount,
             charge_date,
             due_date,
             paid_status,
             created_at
           )
         VALUES (
           ?,
           'Excess Payment',
           ?,
           ?,
           ?,
           'Not Paid',
           NOW()
         )`,
        [
          lan,
          remaining,
          payment_date,
          payment_date,
        ]
      );

      console.log("Inserted loan_charges_fintree:", {
        insertLoanCharge,
        remaining,
      });

      const insertAllocation = await queryDB(
        `INSERT INTO allocation_fintree
           (
             lan,
             due_date,
             allocation_date,
             allocated_amount,
             charge_type,
             payment_id
           )
         VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
        [
          lan,
          payment_date,
          payment_date,
          remaining,
          payment_id,
        ]
      );

      console.log("Inserted Excess Payment allocation:", {
        insertAllocation,
        remaining,
      });

      remaining = 0;
    }

    // 5️⃣ Auto-close loan when the complete schedule is cleared.
    const [pending] = await queryDB(
      `SELECT COALESCE(
          SUM(
            GREATEST(
              COALESCE(remaining_principal, 0) +
              COALESCE(remaining_interest, 0),
              0
            )
          ),
          0
        ) AS pending
       FROM manual_rps_gq_non_fsf_fintree
       WHERE lan = ?`,
      [lan]
    );

    const hasPending = roundMoney(pending?.pending);

    if (hasPending <= 0) {
      const closeRes = await queryDB(
        `UPDATE loan_booking_gq_non_fsf
         SET status = 'Fully Paid'
         WHERE lan = ?`,
        [lan]
      );

      console.log("Loan closed:", {
        lan,
        closeRes,
      });
    }

    return {
      ok: true,
      remaining,
      pending: hasPending,
    };
  } catch (err) {
    console.error("❌ allocateGQNonFSFFintree failed:", err);
    throw err;
  }
};