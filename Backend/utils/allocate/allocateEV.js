// const db = require("../../config/db");

// const queryDB = (sql, params) =>
//   new Promise((resolve, reject) => {
//     db.query(sql, params, (err, results) => {
//       if (err) reject(err);
//       else resolve(results);
//     });
//   });

// const allocateEV = async (lan, payment) => {
//   let remaining = parseFloat(payment.transfer_amount);
//   const paymentDate = payment.payment_date;
//   const paymentId = payment.payment_id;

//   if (!paymentId) throw new Error("❌ payment_id is required");

//   while (remaining > 0) {
//     const [emi] = await queryDB(
//       `SELECT * FROM manual_rps_ev_loan
//        WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
//        ORDER BY due_date ASC LIMIT 1`,
//       [lan]
//     );

//     if (!emi) break;

//     let interestDue = parseFloat(emi.remaining_interest || 0);
//     let principalDue = parseFloat(emi.remaining_principal || 0);

//     // Allocate Interest
//     if (remaining > 0 && interestDue > 0) {
//       const interestAlloc = Math.min(interestDue, remaining);
//       remaining -= interestAlloc;
//       interestDue -= interestAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Interest', ?)`,
//         [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
//       );
//     }

//     // Allocate Principal (only after interest cleared)
//     if (remaining > 0 && interestDue === 0 && principalDue > 0) {
//       const principalAlloc = Math.min(principalDue, remaining);
//       remaining -= principalAlloc;
//       principalDue -= principalAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Principal', ?)`,
//         [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
//       );
//     }

//     // Update EMI
//     await queryDB(
//       `UPDATE manual_rps_ev_loan
//        SET remaining_interest = ?, remaining_principal = ?,
//            remaining_emi = ?, remaining_amount = ?, payment_date = ?
//        WHERE id = ?`,
//       [
//         interestDue,
//         principalDue,
//         interestDue + principalDue,
//         interestDue + principalDue,
//         paymentDate,
//         emi.id,
//       ]
//     );

//     if (interestDue > 0 || principalDue > 0) break; // Exit if current EMI not fully cleared
//   }

//   // Allocate to NACH_Bounce Charges
//   if (remaining > 0) {
//     const charges = await queryDB(
//       `SELECT id, amount FROM loan_charges
//        WHERE lan = ? AND charge_type = 'NACH_Bounce' AND paid_status = 'Unpaid'
//        ORDER BY due_date ASC`,
//       [lan]
//     );

//     for (const charge of charges) {
//       if (remaining <= 0) break;

//       const alloc = Math.min(charge.amount, remaining);
//       remaining -= alloc;

//       if (alloc === charge.amount) {
//         await queryDB(
//           `UPDATE loan_charges SET paid_amount = ?, paid_status = 'Paid', payment_time = ? WHERE id = ?`,
//           [alloc, paymentDate, charge.id]
//         );
//       } else {
//         await queryDB(
//           `UPDATE loan_charges SET paid_amount = ? WHERE id = ?`,
//           [alloc, charge.id]
//         );
//       }

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'NACH_Bounce', ?)`,
//         [lan, paymentDate, paymentDate, alloc, paymentId]
//       );
//     }
//   }
// };

// module.exports = allocateEV;


////////////////////////////////////////////////////
const db = require("../../config/db");

const queryDB = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// const allocateEV = async (lan, payment) => {
//   let remaining = parseFloat(payment.transfer_amount);
//   const paymentDate = payment.payment_date;
//   const paymentId = payment.payment_id;

//   if (!paymentId) throw new Error("❌ payment_id is required");

//   let rpsTable = '';
// if (lan.startsWith('WCTL')) {
//   rpsTable = 'manual_rps_wctl';
// }else if (lan.startsWith('BL')) {
//   rpsTable = 'manual_rps_ev_loan';
// } else if (lan.startsWith('EV')) {
//   rpsTable = 'manual_rps_ev_loan';
// }  
// else {
//   throw new Error(`❌ Unknown LAN prefix for ${lan}`);
// }

//   // 1️⃣ Knock off EMIs: interest first then principal
//   while (remaining > 0) {
//     const [emi] = await queryDB(
//       `SELECT * FROM ${rpsTable}
//        WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
//        ORDER BY due_date ASC LIMIT 1`,
//       [lan]
//     );

//     if (!emi) break;

//     let interestDue = parseFloat(emi.remaining_interest || 0);
//     let principalDue = parseFloat(emi.remaining_principal || 0);

//     // Interest
//     if (remaining > 0 && interestDue > 0) {
//       const interestAlloc = Math.min(interestDue, remaining);
//       remaining -= interestAlloc;
//       interestDue -= interestAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Interest', ?)`,
//         [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
//       );
//     }

//     // Principal only after interest
//     if (remaining > 0 && interestDue === 0 && principalDue > 0) {
//       const principalAlloc = Math.min(principalDue, remaining);
//       remaining -= principalAlloc;
//       principalDue -= principalAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Principal', ?)`,
//         [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
//       );
//     }

//     // Update EMI record
//     await queryDB(
//       `UPDATE ${rpsTable}
//        SET remaining_interest = ?, remaining_principal = ?,
//            remaining_emi = ?, remaining_amount = ?, payment_date = ?
//        WHERE id = ?`,
//       [
//         interestDue,
//         principalDue,
//         interestDue + principalDue,
//         interestDue + principalDue,
//         paymentDate,
//         emi.id,
//       ]
//     );

//     if (interestDue > 0 || principalDue > 0) break; // Stop loop if this EMI is not fully cleared
//   }

//   // 2️⃣ [Skipped] Allocate to NACH_Bounce if anything left
//   /*
//   if (remaining > 0) {
//     const charges = await queryDB(
//       `SELECT id, amount FROM loan_charges
//        WHERE lan = ? AND charge_type = 'NACH_Bounce' AND paid_status = 'Unpaid'
//        ORDER BY due_date ASC`,
//       [lan]
//     );

//     for (const charge of charges) {
//       if (remaining <= 0) break;

//       const alloc = Math.min(charge.amount, remaining);
//       remaining -= alloc;

//       if (alloc === charge.amount) {
//         await queryDB(
//           `UPDATE loan_charges
//            SET paid_amount = ?, paid_status = 'Paid', payment_time = ?
//            WHERE id = ?`,
//           [alloc, paymentDate, charge.id]
//         );
//       } else {
//         await queryDB(
//           `UPDATE loan_charges
//            SET paid_amount = paid_amount + ?
//            WHERE id = ?`,
//           [alloc, charge.id]
//         );
//       }

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'NACH_Bounce', ?)`,
//         [lan, paymentDate, paymentDate, alloc, paymentId]
//       );
//     }
//   }
//   */

//   // 3️⃣ If still excess, park as Excess Payment
//   if (remaining > 0) {
//     await queryDB(
//       `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//        VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//       [lan, paymentDate, paymentDate, remaining, paymentId]
//     );

//     remaining = 0;

//     console.log(`✅ Excess payment parked for LAN ${lan}`);
//   }

//   // 4️⃣ If no EMIs left, update loan status to Fully Paid
//   const [pending] = await queryDB(
//     `SELECT COUNT(*) AS count
//      FROM ${rpsTable}
//      WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`,
//     [lan]
//   );

//   if (pending.count === 0) {
//     await queryDB(
//       `UPDATE loan_bookings SET status = 'Fully Paid' WHERE lan = ?`,
//       [lan]
//     );
//     console.log(`✅ Loan status updated to Fully Paid for LAN ${lan}`);
//   }
// };

// module.exports = allocateEV;





// const allocateEV = async (lan, payment) => {
//   let remaining = parseFloat(payment.transfer_amount);
//   const paymentDate = payment.payment_date;
//   const paymentId = payment.payment_id;

//   if (!paymentId) throw new Error("❌ payment_id is required");

//   // Determine table names based on LAN prefix
//   const isWCTL = lan.startsWith("WCTL");
//   const emiTable = isWCTL ? "manual_rps_wctl" : "manual_rps_ev_loan";
//   const loanTable = isWCTL ? "loan_bookings_wctl" : "loan_booking_ev";

//   // 1️⃣ Knock off EMIs: interest first then principal
//   while (remaining > 0) {
//     const [emi] = await queryDB(
//       `SELECT * FROM ${emiTable}
//        WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
//        ORDER BY due_date ASC LIMIT 1`,
//       [lan]
//     );

//     if (!emi) break;

//     let interestDue = parseFloat(emi.remaining_interest || 0);
//     let principalDue = parseFloat(emi.remaining_principal || 0);

//     // Interest Allocation
//     if (remaining > 0 && interestDue > 0) {
//       const interestAlloc = Math.min(interestDue, remaining);
//       remaining -= interestAlloc;
//       interestDue -= interestAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Interest', ?)`,
//         [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
//       );
//     }

//     // Principal Allocation
//     if (remaining > 0 && interestDue === 0 && principalDue > 0) {
//       const principalAlloc = Math.min(principalDue, remaining);
//       remaining -= principalAlloc;
//       principalDue -= principalAlloc;

//       await queryDB(
//         `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//          VALUES (?, ?, ?, ?, 'Principal', ?)`,
//         [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
//       );
//     }

//     // Update EMI record
//     await queryDB(
//       `UPDATE ${emiTable}
//        SET remaining_interest = ?, remaining_principal = ?,
//            remaining_emi = ?, remaining_amount = ?, payment_date = ?
//        WHERE id = ?`,
//       [
//         interestDue,
//         principalDue,
//         interestDue + principalDue,
//         interestDue + principalDue,
//         paymentDate,
//         emi.id,
//       ]
//     );

//     if (interestDue > 0 || principalDue > 0) break;
//   }

//   // 2️⃣ Allocate to Excess Payment if amount still remains
//   if (remaining > 0) {
//     await queryDB(
//       `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
//        VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
//       [lan, paymentDate, paymentDate, remaining, paymentId]
//     );

//     remaining = 0;
//     console.log(`✅ Excess payment parked for LAN ${lan}`);
//   }

//   await queryDB(`CALL sp_update_loan_status_dpd()`);

//   // 3️⃣ Check if loan is fully paid and update status
//   const [pending] = await queryDB(
//     `SELECT COUNT(*) AS count
//      FROM ${emiTable}
//      WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`,
//     [lan]
//   );

//   if (pending.count === 0) {
//     await queryDB(
//       `UPDATE ${loanTable} SET status = 'Fully Paid' WHERE lan = ?`,
//       [lan]
//     );
//     console.log(`✅ Loan status updated to Fully Paid for LAN ${lan}`);
//   }
// };


// module.exports = allocateEV;


// allocateEV.js
const allocateEV = async (lan, payment) => {
  let remaining = parseFloat(payment.transfer_amount);
  const paymentDate = payment.payment_date;
  const paymentId = payment.payment_id;

  if (!paymentId) throw new Error("❌ payment_id is required");

  // --- Decide tables by LAN prefix (WCTL / BL / default EV) ---
  const lanKey = String(lan || "").trim().toUpperCase();

  let emiTable, loanTable;
  if (lanKey.startsWith("WCTL")) {
    emiTable = "manual_rps_wctl";
    loanTable = "loan_bookings_wctl";
  } else if (lanKey.startsWith("BL")) {
    // 🔹 New: BL loans
    emiTable = "manual_rps_bl_loan";
    loanTable = "loan_bookings";
  } else {
    // default EV loans
    emiTable = "manual_rps_ev_loan";
    loanTable = "loan_booking_ev";
  }

  // 1️⃣ Knock off EMIs: interest first, then principal (oldest due first)
  while (remaining > 0) {
    const [emi] = await queryDB(
      `SELECT * FROM ${emiTable}
       WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)
       ORDER BY due_date ASC
       LIMIT 1`,
      [lan]
    );

    if (!emi) break;

    let interestDue = Math.max(0, parseFloat(emi.remaining_interest || 0));
    let principalDue = Math.max(0, parseFloat(emi.remaining_principal || 0));

    // Interest Allocation
    if (remaining > 0 && interestDue > 0) {
      const interestAlloc = Math.min(interestDue, remaining);
      remaining -= interestAlloc;
      interestDue -= interestAlloc;

      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Interest', ?)`,
        [lan, emi.due_date, paymentDate, interestAlloc, paymentId]
      );
    }

    // Principal Allocation
    if (remaining > 0 && interestDue === 0 && principalDue > 0) {
      const principalAlloc = Math.min(principalDue, remaining);
      remaining -= principalAlloc;
      principalDue -= principalAlloc;

      await queryDB(
        `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
         VALUES (?, ?, ?, ?, 'Principal', ?)`,
        [lan, emi.due_date, paymentDate, principalAlloc, paymentId]
      );
    }

    // Update EMI record for this installment
    const newRemaining = interestDue + principalDue;
    await queryDB(
      `UPDATE ${emiTable}
       SET remaining_interest = ?,
           remaining_principal = ?,
           remaining_emi = ?,
           remaining_amount = ?,
           payment_date = ?
       WHERE id = ?`,
      [interestDue, principalDue, newRemaining, newRemaining, paymentDate, emi.id]
    );

    // If this EMI still has dues, stop here so next call continues on same EMI
    if (interestDue > 0 || principalDue > 0) break;
  }

  // 2️⃣ Allocate to Excess Payment if amount still remains
  if (remaining > 0) {
    await queryDB(
      `INSERT INTO allocation (lan, due_date, allocation_date, allocated_amount, charge_type, payment_id)
       VALUES (?, ?, ?, ?, 'Excess Payment', ?)`,
      [lan, paymentDate, paymentDate, remaining, paymentId]
    );
    remaining = 0;
    console.log(`✅ Excess payment parked for LAN ${lan}`);
  }

  // Update DPD/loan status via SP (shared across products)
  await queryDB(`CALL sp_update_loan_status_dpd()`);

  // 3️⃣ If fully paid, mark loan closed in the right loan table
  const [pending] = await queryDB(
    `SELECT COUNT(*) AS count
     FROM ${emiTable}
     WHERE lan = ? AND (remaining_interest > 0 OR remaining_principal > 0)`,
    [lan]
  );

  if (pending.count === 0) {
    await queryDB(
      `UPDATE ${loanTable}
       SET status = 'Fully Paid'
       WHERE lan = ?`,
      [lan]
    );
    console.log(`✅ Loan status updated to Fully Paid for LAN ${lan}`);
  }
};

module.exports = allocateEV;
