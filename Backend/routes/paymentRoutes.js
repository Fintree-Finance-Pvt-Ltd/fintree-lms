const express = require("express");
const db = require("../config/db");
const axios = require("axios");

const allocateCarePay =
    require("../utils/allocate/allocateCarePay");

const {
    createEasyCollectPaymentLink,
    extractEasebuzzId,
    extractEasebuzzPaymentLink,
    extractEasebuzzWebhookIds,
    generateMerchantTxn,
    generatePaymentRequestId,
    normalizeEasebuzzStatus,
} = require("../services/easebuzz/easebuzzPaymentService");


const {
    getLoanForPayment,
    getPaymentPartnerConfig,
} = require("../services/paymentPartnerResolver");

// IMPORTANT: create router BEFORE router.post / router.get
const router = express.Router();


router.post("/create-link", async (req, res) => {
    try {
        const {
            partnerCode,
            lender,
            lan,
            amount,
            expiryDate,
        } = req.body || {};

        const cleanPartner = String(
            partnerCode || lender || ""
        )
            .trim()
            .toUpperCase();

        const cleanLan = String(lan || "")
            .trim()
            .toUpperCase();

        const paymentAmount = Number(amount);

        if (!cleanPartner) {
            return res.status(400).json({
                success: false,
                message: "partnerCode is required",
            });
        }

        if (!cleanLan) {
            return res.status(400).json({
                success: false,
                message: "LAN is required",
            });
        }

        if (
            !Number.isFinite(paymentAmount) ||
            paymentAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid amount is required",
            });
        }

        const partnerConfig =
            getPaymentPartnerConfig(cleanPartner);



        const loan = await getLoanForPayment(
            partnerConfig,
            cleanLan
        );

        console.log("PAYMENT PARTNER CONFIG:", partnerConfig);
        console.log("PAYMENT LOAN DATA:", loan);
        if (!loan) {
            return res.status(404).json({
                success: false,
                message: `LAN ${cleanLan} not found for ${partnerConfig.lenderName}`,
            });
        }

        const finalCustomerName =
            loan.customerName;

        const finalMobile =
            loan.mobile;

        const finalEmail =
            loan.email ||

            "noemail@fintreefinance.com";

        const purpose = "Payment";

        if (!finalCustomerName) {
            return res.status(400).json({
                success: false,
                message: "Customer name not found in LMS",
            });
        }

        if (!finalMobile) {
            return res.status(400).json({
                success: false,
                message: "Customer mobile not found in LMS",
            });
        }

        const paymentRequestId =
            generatePaymentRequestId();

        const merchantTxn =
            generateMerchantTxn(cleanLan);

        await db.promise().query(
            `
      INSERT INTO payment_transactions
      (
        payment_request_id,
        partner_code,
        lender,
        lan,
        source_table,
        provider,
        amount,
        purpose,
        customer_name,
        mobile,
        email,
        merchant_txn,
        status
      )
      VALUES
      (?, ?, ?, ?, ?, 'EASEBUZZ', ?, ?, ?, ?, ?, ?, 'INITIATED')
      `,
            [
                paymentRequestId,
                partnerConfig.partnerCode,
                partnerConfig.lenderName,
                cleanLan,
                partnerConfig.tableName,
                paymentAmount,
                purpose,
                finalCustomerName,
                finalMobile,
                finalEmail,
                merchantTxn,
            ]
        );

        try {
            const easebuzzResult =

                await createEasyCollectPaymentLink({
                    paymentRequestId,

                    partnerCode:
                        partnerConfig.partnerCode,

                    lender:
                        partnerConfig.lenderName,

                    lan:
                        cleanLan,

                    customerName:
                        finalCustomerName,

                    mobile:
                        finalMobile,

                    email:
                        finalEmail,

                    amount:
                        paymentAmount,

                    purpose,

                    merchantTxn,

                    expiryDate,
                });


            const paymentLink =
                extractEasebuzzPaymentLink(
                    easebuzzResult.response
                );

            const easebuzzId =
                extractEasebuzzId(
                    easebuzzResult.response
                );

            const safeRequestPayload = {
                ...easebuzzResult.requestPayload,
            };

            delete safeRequestPayload.key;
            delete safeRequestPayload.hash;

            await db.promise().query(
                `
        UPDATE payment_transactions
        SET
          easebuzz_id = ?,
          payment_link = ?,
          provider_request = ?,
          provider_response = ?,
          status = ?,
          link_created_at = NOW(),
          error_message = NULL
        WHERE payment_request_id = ?
        `,
                [
                    easebuzzId,
                    paymentLink,
                    JSON.stringify(
                        safeRequestPayload
                    ),
                    JSON.stringify(
                        easebuzzResult.response
                    ),
                    paymentLink
                        ? "LINK_CREATED"
                        : "LINK_RESPONSE_RECEIVED",
                    paymentRequestId,
                ]
            );

            return res.status(200).json({
                success: true,
                message:
                    "Payment link created successfully",

                data: {
                    paymentRequestId,
                    partnerCode:
                        partnerConfig.partnerCode,
                    lender:
                        partnerConfig.lenderName,
                    lan: cleanLan,
                    amount: paymentAmount,
                    purpose,
                    merchantTxn,
                    easebuzzId,
                    paymentLink,
                    status: paymentLink
                        ? "LINK_CREATED"
                        : "LINK_RESPONSE_RECEIVED",
                },
            });
        } catch (easebuzzError) {
            console.error(
                "Easebuzz payment link error:",
                easebuzzError
            );

            await db.promise().query(
                `
        UPDATE payment_transactions
        SET
          status = 'LINK_FAILED',
          error_message = ?
        WHERE payment_request_id = ?
        `,
                [
                    easebuzzError?.message ||
                    "Easebuzz payment link failed",
                    paymentRequestId,
                ]
            );

            return res.status(500).json({
                success: false,
                message:
                    easebuzzError?.message ||
                    "Payment link creation failed",
                paymentRequestId,
            });
        }
    } catch (error) {
        console.error(
            "Create payment link error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Internal server error",
        });
    }
});

async function processPaymentAllocation(
    lan,
    payment
){

    if(lan.startsWith("CARE")){

        return allocateCarePay(
            lan,
            payment
        );

    }


    throw new Error(
       `Unknown LAN prefix: ${lan}`
    );

}


router.post("/easebuzz/webhook", async (req, res) => {
    try {
        const body = req.body || {};

        console.log(
            "EASEBUZZ WEBHOOK RECEIVED:",
            JSON.stringify(body, null, 2)
        );

        const {
            merchantTxn,
            easebuzzId,
        } = extractEasebuzzWebhookIds(body);

        if (!merchantTxn && !easebuzzId) {
            return res.status(400).json({
                success: false,
                message:
                    "merchant transaction ID not received",
            });
        }

        const providerStatus =
            body?.status ||
            body?.unmappedstatus ||
            "";

        const normalizedStatus =
            normalizeEasebuzzStatus(
                providerStatus
            );

        let payment = null;

        // Find using merchant transaction ID
        if (merchantTxn) {
            const [rows] =
                await db.promise().query(
                    `
          SELECT *
          FROM payment_transactions
          WHERE merchant_txn = ?
          LIMIT 1
          `,
                    [merchantTxn]
                );

            payment = rows?.[0] || null;
        }

        // Fallback using Easebuzz ID
        if (!payment && easebuzzId) {
            const [rows] =
                await db.promise().query(
                    `
          SELECT *
          FROM payment_transactions
          WHERE easebuzz_id = ?
          LIMIT 1
          `,
                    [easebuzzId]
                );

            payment = rows?.[0] || null;
        }

        if (!payment) {
            console.log(
                "Payment transaction not found:",
                {
                    merchantTxn,
                    easebuzzId,
                }
            );

            return res.status(200).json({
                success: true,
                received: true,
                matched: false,
            });
        }

        const paidAmount =
            Number(
                body?.amount ||
                body?.paid_amount ||
                0
            ) || null;

        const paymentMode =
            body?.mode ||
            body?.payment_mode ||
            body?.bankcode ||
            body?.method ||
            null;

        const bankReference =
            body?.bank_ref_num ||
            body?.bank_ref_no ||
            body?.bank_reference ||
            body?.bank_ref ||
            null;

        // Don't downgrade SUCCESS
        const finalStatus =
            payment.status === "SUCCESS"
                ? "SUCCESS"
                : normalizedStatus;

        await db.promise().query(
            `
      UPDATE payment_transactions

      SET
        easebuzz_id =
          COALESCE(?, easebuzz_id),

        provider_status = ?,

        status = ?,

        paid_amount =
          COALESCE(?, paid_amount),

        payment_mode =
          COALESCE(?, payment_mode),

        bank_reference =
          COALESCE(?, bank_reference),

        webhook_payload = ?,

        webhook_count =
          webhook_count + 1,

        webhook_received_at =
          NOW(),

        paid_at =
          CASE
            WHEN ? = 'SUCCESS'
            THEN COALESCE(
              paid_at,
              NOW()
            )
            ELSE paid_at
          END

      WHERE id = ?
      `,
            [
                easebuzzId,
                providerStatus,
                finalStatus,
                paidAmount,
                paymentMode,
                bankReference,
                JSON.stringify(body),
                finalStatus,
                payment.id,
            ]
        );

        if (finalStatus === "SUCCESS") {

    const allocationPayment = {

        payment_id:
            body.easepayid ||
            payment.merchant_txn,

        payment_date:
            body.addedon
                ? body.addedon.split(" ")[0]
                : new Date()
                    .toISOString()
                    .split("T")[0],

        bank_date:
            body.addedon
                ? body.addedon.split(" ")[0]
                : new Date()
                    .toISOString()
                    .split("T")[0],

        utr:
            body.bank_ref_num ||
            body.auth_ref_num ||
            payment.easebuzz_id,

        payment_mode:
            body.mode ||
            body.payment_source ||
            "Easebuzz",

        transfer_amount:
            Number(
                body.amount ||
                payment.amount
            )
    };


    const [existingAllocation] =
        await db.promise().query(
            `
            SELECT id
            FROM allocation
            WHERE payment_id = ?
            LIMIT 1
            `,
            [
                allocationPayment.payment_id
            ]
        );


    if (!existingAllocation.length) {

        const allocationResponse =
            await processPaymentAllocation(
                payment.lan,
                allocationPayment
            );
            console.log(
    "ALLOCATING PAYMENT:",
    {
        lan: payment.lan,
        allocationPayment
    }
);

        console.log(
            "CAREPAY ALLOCATION RESPONSE:",
            allocationResponse
        );

    } else {

        console.log(
            "Allocation already completed:",
            allocationPayment.payment_id
        );

    }

}

        return res.status(200).json({
            success: true,
            received: true,
            matched: true,
            status: finalStatus,
        });
    } catch (error) {
        console.error(
            "Easebuzz webhook error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Webhook processing failed",
        });
    }
});




module.exports = router;