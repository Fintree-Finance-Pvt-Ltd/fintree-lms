// const { queryDB } = require("../helpers");

// module.exports = async function allocateGQFSFFintree(lan, payment) {
//   let remaining = parseFloat(payment.transfer_amount);
//   const { payment_date, payment_id } = payment;
//   console.log("🚀 allocateGQNonFSFFintree called with:", { lan, payment });

//   if (!payment_id) throw new Error("❌ payment_id missing");

//   try {
//     // 1️⃣ Allocate to EMIs
//     while (remaining > 0) {
//       const [emi] = await queryDB(
//         `SELECT * FROM manual_rps_gq_fsf_fintree WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
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
//           `INSERT INTO allocation_fintree_fsf (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
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
//           `INSERT INTO allocation_fintree_fsf (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//            VALUES (?, ?, ?, ?, 'Principal', ?)`,
//           [lan, emi.due_date, payment_date, alloc, payment_id]
//         );
//         console.log("Inserted Principal allocation:", { alloc, insertRes, remaining, emiId: emi.id });
//       }

//       const updateRes = await queryDB(
//         `UPDATE manual_rps_gq_fsf_fintree
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
//         `INSERT INTO loan_charges_fintree_fsf (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
//          VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
//         [lan, remaining, payment_date, payment_date]
//       );
//       console.log("Inserted loan_charges_fintree_fsf:", { insertLoanCharge, remaining });

//       const insertAllocation = await queryDB(
//         `INSERT INTO allocation_fintree_fsf (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//         [lan, payment_date, payment_date, remaining, payment_id]
//       );
//       console.log("Inserted Excess Payment allocation:", { insertAllocation, remaining });

//       remaining = 0;
//     }

//     // 4️⃣ Auto-close loan if fully cleared
//     const [pending] = await queryDB(
//       `SELECT SUM(remaining_principal + remaining_interest) AS pending
//        FROM manual_rps_gq_fsf_fintree WHERE lan = ?`,
//       [lan]
//     );

//     const hasPending = parseFloat(pending.pending || 0);

//     if (hasPending === 0) {
//       const closeRes = await queryDB(
//         `UPDATE loan_booking_gq_fsf SET status = 'Fully Paid' WHERE lan = ?`,
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


const { queryDB } = require("../helpers");



// module.exports = async function allocateGQFSFFintree(lan, payment) {
//   let remaining = parseFloat(payment.transfer_amount);
//   const { payment_date, payment_id } = payment;

//   console.log("🚀 allocateGQFSFFintree called with:", { lan, payment });

//   if (!payment_id) throw new Error("❌ payment_id missing");

//   try {

//     // 1️⃣ Allocate to EMIs
//     while (remaining > 0) {

//       const [emi] = await queryDB(
//         `SELECT *
//          FROM manual_rps_gq_fsf_fintree
//          WHERE lan = ?
//          AND (remaining_interest != 0 OR remaining_principal != 0)
//          ORDER BY due_date ASC
//          LIMIT 1`,
//         [lan]
//       );

//       if (!emi) break;

//       let interest = parseFloat(emi.remaining_interest || 0);
//       let principal = parseFloat(emi.remaining_principal || 0);

//       console.log("📄 EMI fetched:", {
//         emiId: emi.id,
//         interest,
//         principal,
//         remaining
//       });

//       // --------------------------
//       // Interest Allocation
//       // --------------------------
//       if (interest !== 0 && remaining > 0) {

//         const alloc = Math.min(Math.abs(interest), remaining);

//         const signedAlloc = interest < 0 ? -alloc : alloc;

//         remaining -= alloc;

//         interest -= signedAlloc;

//         const insertRes = await queryDB(
//           `INSERT INTO allocation_fintree_fsf
//           (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//           VALUES (?, ?, ?, ?, 'Interest', ?)`,
//           [lan, emi.due_date, payment_date, signedAlloc, payment_id]
//         );

//         console.log("✅ Interest allocated:", {
//           alloc,
//           signedAlloc,
//           remaining,
//           newInterest: interest,
//           insertRes
//         });
//       }

//       // --------------------------
//       // Principal Allocation
//       // --------------------------
//       if (principal !== 0 && remaining > 0) {

//         const alloc = Math.min(Math.abs(principal), remaining);

//         const signedAlloc = principal < 0 ? -alloc : alloc;

//         remaining -= alloc;

//         principal -= signedAlloc;

//         const insertRes = await queryDB(
//           `INSERT INTO allocation_fintree_fsf
//           (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//           VALUES (?, ?, ?, ?, 'Principal', ?)`,
//           [lan, emi.due_date, payment_date, signedAlloc, payment_id]
//         );

//         console.log("✅ Principal allocated:", {
//           alloc,
//           signedAlloc,
//           remaining,
//           newPrincipal: principal,
//           insertRes
//         });
//       }

//       // --------------------------
//       // Update EMI Row
//       // --------------------------
//       const updateRes = await queryDB(
//         `UPDATE manual_rps_gq_fsf_fintree
//          SET remaining_interest = ?,
//              remaining_principal = ?,
//              remaining_emi = ?,
//              remaining_amount = ?,
//              payment_date = ?
//          WHERE id = ?`,
//         [
//           interest,
//           principal,
//           interest + principal,
//           interest + principal,
//           payment_date,
//           emi.id
//         ]
//       );

//       console.log("📝 EMI updated:", {
//         emiId: emi.id,
//         interest,
//         principal,
//         updateRes
//       });

//       if (remaining <= 0) break;
//     }

//     // --------------------------
//     // 2️⃣ Park Excess Payment
//     // --------------------------
//     if (remaining > 0) {

//       const insertLoanCharge = await queryDB(
//         `INSERT INTO loan_charges_fintree_fsf
//         (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
//         VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
//         [lan, remaining, payment_date, payment_date]
//       );

//       console.log("💰 Excess charge created:", insertLoanCharge);

//       const insertAllocation = await queryDB(
//         `INSERT INTO allocation_fintree_fsf
//         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//         VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//         [lan, payment_date, payment_date, remaining, payment_id]
//       );

//       console.log("💰 Excess allocation inserted:", insertAllocation);

//       remaining = 0;
//     }

//     // --------------------------
//     // 3️⃣ Auto Close Loan
//     // --------------------------
//     const [pending] = await queryDB(
//       `SELECT SUM(remaining_principal + remaining_interest) AS pending
//        FROM manual_rps_gq_fsf_fintree
//        WHERE lan = ?`,
//       [lan]
//     );

//     const hasPending = parseFloat(pending.pending || 0);

//     if (hasPending === 0) {

//       const closeRes = await queryDB(
//         `UPDATE loan_booking_gq_fsf
//          SET status = 'Fully Paid'
//          WHERE lan = ?`,
//         [lan]
//       );

//       console.log("🏁 Loan closed:", closeRes);
//     }

//     return { ok: true, remaining };

//   } catch (err) {

//     console.error("❌ allocateGQFSFFintree failed:", err);
//     throw err;
//   }
// };


//////////////////

module.exports = async function allocateGQFSFFintree(lan, payment) {

  let remaining = parseFloat(payment.transfer_amount);
  const { payment_date, payment_id } = payment;

  console.log("🚀 allocateGQFSFFintree called with:", { lan, payment });

  if (!payment_id) throw new Error("❌ payment_id missing");

  try {

    // --------------------------
    // 1️⃣ Allocate EMI sequentially
    // --------------------------
    while (remaining > 0) {

      const [emi] = await queryDB(
        `SELECT *
         FROM manual_rps_gq_fsf_fintree
         WHERE lan = ?
         AND (remaining_interest != 0 OR remaining_principal != 0)
         ORDER BY due_date ASC
         LIMIT 1`,
        [lan]
      );

      if (!emi) break;

      let interest = parseFloat(emi.remaining_interest || 0);
      let principal = parseFloat(emi.remaining_principal || 0);

      console.log("📄 EMI fetched:", {
        emiId: emi.id,
        interest,
        principal,
        remaining
      });

      // --------------------------
      // 2️⃣ Interest Allocation (fixed logic)
      // --------------------------
      if (interest !== 0 && remaining > 0) {

        const alloc = Math.min(Math.abs(interest), remaining);

        if (interest < 0) {

          // Negative interest adjustment
          interest += alloc;

          await queryDB(
            `INSERT INTO allocation_fintree_fsf
             (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
             VALUES (?, ?, ?, ?, 'Interest', ?)`,
            [lan, emi.due_date, payment_date, -alloc, payment_id]
          );

        } else {

          // Normal interest clearing
          interest -= alloc;

          await queryDB(
            `INSERT INTO allocation_fintree_fsf
             (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
             VALUES (?, ?, ?, ?, 'Interest', ?)`,
            [lan, emi.due_date, payment_date, alloc, payment_id]
          );
        }

        remaining -= alloc;

        console.log("✅ Interest allocated:", {
          alloc,
          remaining,
          newInterest: interest
        });
      }


      // --------------------------
      // 3️⃣ Principal Allocation (fixed logic)
      // --------------------------
      if (principal !== 0 && remaining > 0) {

        const alloc = Math.min(Math.abs(principal), remaining);

        if (principal < 0) {

          // Negative principal adjustment
          principal += alloc;

          await queryDB(
            `INSERT INTO allocation_fintree_fsf
             (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
             VALUES (?, ?, ?, ?, 'Principal', ?)`,
            [lan, emi.due_date, payment_date, -alloc, payment_id]
          );

        } else {

          // Normal principal clearing
          principal -= alloc;

          await queryDB(
            `INSERT INTO allocation_fintree_fsf
             (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
             VALUES (?, ?, ?, ?, 'Principal', ?)`,
            [lan, emi.due_date, payment_date, alloc, payment_id]
          );
        }

        remaining -= alloc;

        console.log("✅ Principal allocated:", {
          alloc,
          remaining,
          newPrincipal: principal
        });
      }


      // --------------------------
      // 4️⃣ Update EMI row
      // --------------------------
      await queryDB(
        `UPDATE manual_rps_gq_fsf_fintree
         SET remaining_interest = ?,
             remaining_principal = ?,
             remaining_emi = ?,
             remaining_amount = ?,
             payment_date = ?
         WHERE id = ?`,
        [
          interest,
          principal,
          interest + principal,
          interest + principal,
          payment_date,
          emi.id
        ]
      );

      console.log("📝 EMI updated:", {
        emiId: emi.id,
        interest,
        principal
      });

      if (remaining <= 0) break;
    }


    // --------------------------
    // 5️⃣ Park Excess Payment
    // --------------------------
    if (remaining > 0) {

      console.log("💰 Excess detected:", remaining);

      await queryDB(
        `INSERT INTO loan_charges_fintree_fsf
         (lan, charge_type, amount, charge_date, due_date, paid_status, created_at)
         VALUES (?, 'Excess Payment', ?, ?, ?, 'Not Paid', NOW())`,
        [lan, remaining, payment_date, payment_date]
      );

      await queryDB(
        `INSERT INTO allocation_fintree_fsf
         (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
        [lan, payment_date, payment_date, remaining, payment_id]
      );

      remaining = 0;
    }

     // --------------------------
    // 6️⃣ Allocate Excess Payment
    // --------------------------
    await queryDB(
      `CALL allocate_excess_payment_lan(?)`,
      [lan]
    );



    // --------------------------
    // 7️⃣ Auto Close Loan
    // --------------------------
    const [pending] = await queryDB(
      `SELECT SUM(remaining_principal + remaining_interest) AS pending
       FROM manual_rps_gq_fsf_fintree
       WHERE lan = ?`,
      [lan]
    );

    const hasPending = parseFloat(pending.pending || 0);

    console.log("📊 Pending balance:", hasPending);

    if (hasPending === 0) {

      await queryDB(
        `UPDATE loan_booking_gq_fsf
         SET status = 'Fully Paid'
         WHERE lan = ?`,
        [lan]
      );

      console.log("🏁 Loan closed");
    }

    return { ok: true, remaining };

  } catch (err) {

    console.error("❌ allocateGQFSFFintree failed:", err);
    throw err;
  }
};
