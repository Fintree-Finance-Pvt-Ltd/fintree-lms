// allocateCarePay.js

const db = require("../../config/db");

const round2 = (value) =>
  Number(
    (
      Math.round(
        (Number(value || 0) + Number.EPSILON) * 100
      ) / 100
    ).toFixed(2)
  );


const allocateCarePay = async (
  lan,
  payment
) => {

  const normalizedLan =
    String(lan || "")
      .trim()
      .toUpperCase();


  const paymentId =
    String(payment?.payment_id || "")
      .trim();


  const paymentDate =
    payment?.payment_date ||
    payment?.bank_date ||
    null;


  const transferAmount =
    round2(
      String(
        payment?.transfer_amount ?? ""
      )
      .replace(/,/g, "")
      .replace(/₹/g, "")
      .trim()
    );


  if (!normalizedLan) {
    throw new Error(
      "CarePay LAN is required"
    );
  }


  if (!paymentId) {
    throw new Error(
      "payment_id is required for CarePay allocation"
    );
  }


  if (!paymentDate) {
    throw new Error(
      "payment_date is required for CarePay allocation"
    );
  }


  if (
    !Number.isFinite(transferAmount) ||
    transferAmount <= 0
  ) {
    throw new Error(
      `Invalid transfer amount for CarePay LAN ${normalizedLan}`
    );
  }


  const emiTable =
    "manual_rps_carepay";


  const loanTable =
    "loan_booking_carepay";


  let conn;
  let transactionStarted = false;


  try {

    conn =
      await db.promise()
      .getConnection();


    await conn.beginTransaction();

    transactionStarted = true;


    /*
      Lock CarePay loan
    */

    const [loanRows] =
      await conn.query(
        `
        SELECT
          id,
          lan,
          status
        FROM ${loanTable}
        WHERE UPPER(TRIM(lan)) = ?
        LIMIT 1
        FOR UPDATE
        `,
        [
          normalizedLan
        ]
      );


    if (!loanRows.length) {

      throw new Error(
        `CarePay loan not found for LAN ${normalizedLan}`
      );

    }



    /*
      Duplicate payment check
    */

    const [existingAllocation] =
      await conn.query(
        `
        SELECT id
        FROM allocation
        WHERE lan = ?
        AND payment_id = ?
        LIMIT 1
        `,
        [
          normalizedLan,
          paymentId
        ]
      );


    if(existingAllocation.length){

      await conn.commit();

      transactionStarted=false;


      return {
        success:true,
        skipped:true,
        reason:
          "PAYMENT_ALREADY_ALLOCATED",
        lan:normalizedLan,
        payment_id:paymentId
      };

    }



    let remaining =
      transferAmount;


    let interestAllocatedTotal=0;

    let principalAllocatedTotal=0;

    let excessAllocated=0;


    const allocationDetails=[];



    while(remaining > 0.009){


      const [emiRows] =
        await conn.query(
          `
          SELECT
            id,
            lan,
            due_date,
            emi,
            interest,
            principal,
            remaining_interest,
            remaining_principal,
            remaining_emi,
            remaining_amount,
            status

          FROM ${emiTable}

          WHERE lan=?

          AND (
            remaining_interest > 0.009
            OR remaining_principal > 0.009
          )

          ORDER BY due_date ASC,id ASC

          LIMIT 1

          FOR UPDATE
          `,
          [
            normalizedLan
          ]
        );


      if(!emiRows.length){
        break;
      }



      const emi =
        emiRows[0];


      let interestDue =
        round2(
          emi.remaining_interest
        );


      let principalDue =
        round2(
          emi.remaining_principal
        );


      let interestAllocated=0;

      let principalAllocated=0;



      /*
        Interest first
      */

      if(
        remaining > 0.009 &&
        interestDue > 0.009
      ){

        interestAllocated =
          round2(
            Math.min(
              interestDue,
              remaining
            )
          );


        remaining =
          round2(
            remaining -
            interestAllocated
          );


        interestDue =
          round2(
            interestDue -
            interestAllocated
          );



        await conn.query(
          `
          INSERT INTO allocation
          (
            lan,
            due_date,
            allocation_date,
            allocated_amount,
            charge_type,
            payment_id
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            'Interest',
            ?
          )
          `,
          [
            normalizedLan,
            emi.due_date,
            paymentDate,
            interestAllocated,
            paymentId
          ]
        );


        interestAllocatedTotal =
          round2(
            interestAllocatedTotal +
            interestAllocated
          );


      }



      /*
        Principal after interest cleared
      */

      if(
        remaining > 0.009 &&
        interestDue <=0.009 &&
        principalDue >0.009
      ){


        principalAllocated =
          round2(
            Math.min(
              principalDue,
              remaining
            )
          );


        remaining =
          round2(
            remaining -
            principalAllocated
          );


        principalDue =
          round2(
            principalDue -
            principalAllocated
          );



        await conn.query(
          `
          INSERT INTO allocation
          (
            lan,
            due_date,
            allocation_date,
            allocated_amount,
            charge_type,
            payment_id
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            'Principal',
            ?
          )
          `,
          [
            normalizedLan,
            emi.due_date,
            paymentDate,
            principalAllocated,
            paymentId
          ]
        );


        principalAllocatedTotal =
          round2(
            principalAllocatedTotal +
            principalAllocated
          );

      }



      const remainingDue =
        round2(
          interestDue +
          principalDue
        );


      let status =
        emi.status || "Pending";


      if(remainingDue<=0.009){

        status="Paid";

      }
      else if(
        interestAllocated>0 ||
        principalAllocated>0
      ){

        status="Partially Paid";

      }



      await conn.query(
        `
        UPDATE ${emiTable}

        SET

        remaining_interest=?,

        remaining_principal=?,

        remaining_emi=?,

        remaining_amount=?,

        payment_date=?,

        status=?

        WHERE id=?
        `,
        [
          interestDue,
          principalDue,
          remainingDue,
          remainingDue,
          paymentDate,
          status,
          emi.id
        ]
      );



      if(
        interestDue>0.009 ||
        principalDue>0.009
      ){
        break;
      }


    }



    /*
      Excess payment
    */

    if(remaining>0.009){


      excessAllocated =
        round2(remaining);


      await conn.query(
        `
        INSERT INTO allocation
        (
          lan,
          due_date,
          allocation_date,
          allocated_amount,
          charge_type,
          payment_id
        )

        VALUES
        (?,?,?,?, 'Excess Payment',?)
        `,
        [
          normalizedLan,
          paymentDate,
          paymentDate,
          excessAllocated,
          paymentId
        ]
      );


    }



    const [pendingRows] =
      await conn.query(
        `
        SELECT COUNT(*) count

        FROM ${emiTable}

        WHERE lan=?

        AND
        (
          remaining_interest>0.009
          OR remaining_principal>0.009
        )
        `,
        [
          normalizedLan
        ]
      );


    const pendingCount =
      Number(
        pendingRows[0]?.count || 0
      );



    if(pendingCount===0){

      await conn.query(
        `
        UPDATE ${loanTable}

        SET status='Fully Paid'

        WHERE lan=?
        `,
        [
          normalizedLan
        ]
      );

    }



    await conn.commit();

    transactionStarted=false;



    return {

      success:true,

      lan:normalizedLan,

      payment_id:paymentId,

      transfer_amount:transferAmount,

      interest_allocated:
        interestAllocatedTotal,

      principal_allocated:
        principalAllocatedTotal,

      excess_allocated:
        excessAllocated,

      pending_installments:
        pendingCount

    };



  }
  catch(error){

    if(conn && transactionStarted){

      await conn.rollback();

    }

    throw error;

  }
  finally{

    if(conn){
      conn.release();
    }

  }

};


module.exports = allocateCarePay;
