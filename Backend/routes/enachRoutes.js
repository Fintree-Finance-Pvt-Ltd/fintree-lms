// Backend/routes/enachRoutes.js

const express = require("express");
const db = require("../config/db");
const authenticateUser = require("../middleware/verifyToken");

const {
  verifyBankAccount,
  fuzzyMatch,
} = require("../services/bankVerificationService");
const {
  triggerClaimCureBuddyAutoDisbursement,
  isClaimCureBuddyLan,
  isMandateComplete,
} = require("../services/claimCureBuddyAutoDisbursement");

const digio = require("../services/digioClient");

const router = express.Router();

/*
 * Loan tables that currently use the shared eNACH flow.
 */
const LOAN_TABLES = [
  "loan_booking_helium",
  "loan_booking_clayyo",
  "loan_booking_motion_corp",
  "loan_booking_zypay_customer",
];

/*
 * Run the same LAN-based update against every supported
 * loan table.
 *
 * The supplied query must contain __TABLE__.
 */
async function updateLoanTableStatus(query, params) {
  if (!query.includes("__TABLE__")) {
    throw new Error(
      "Loan-table update query must contain __TABLE__ placeholder",
    );
  }

  await Promise.all(
    LOAN_TABLES.map((table) =>
      db
        .promise()
        .query(
          query.replace("__TABLE__", table),
          params,
        ),
    ),
  );
}

/*
 * Save verified bank details in every supported table.
 * Only the table containing the LAN will update a row.
 */
async function updateLoanTables({
  lan,
  bank_name,
  beneficiary_name,
  account_no,
  ifsc,
}) {
  const tableConfigs = [
    {
      table: "loan_booking_helium",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_clayyo",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_zypay_customer",
      fields: {
        bank_name: "bank_name",
        beneficiary_name: "name_in_bank",
        account_no: "account_number",
        ifsc: "ifsc",
      },
    },
    {
      table: "loan_booking_motion_corp",
      fields: {
        bank_name: "customer_bank_name",
        beneficiary_name:
          "customer_name_as_per_bank",
        account_no:
          "customer_account_number",
        ifsc:
          "bank_ifsc_code",
      },
    },
  ];

  await Promise.all(
    tableConfigs.map(({ table, fields }) => {
      const sql = `
        UPDATE ${table}
        SET
          ${fields.bank_name} = ?,
          ${fields.beneficiary_name} = ?,
          ${fields.account_no} = ?,
          ${fields.ifsc} = ?,
          bank_status = 'VERIFIED'
        WHERE lan = ?
      `;

      return db.promise().query(sql, [
        bank_name || null,
        beneficiary_name || null,
        account_no,
        ifsc,
        lan,
      ]);
    }),
  );
}

/*
 * General normalization helpers.
 */
const normalizeText = (value) =>
  String(value ?? "").trim();

const normalizeLan = (value) =>
  normalizeText(value).toUpperCase();

const normalizeIfsc = (value) =>
  normalizeText(value).toUpperCase();

const normalizeAccountType = (value) => {
  const normalized =
    normalizeText(value).toLowerCase();

  return normalized || "savings";
};

const normalizeMandateFrequency = (value) => {
  const normalized =
    normalizeText(value).toLowerCase();

  const frequencyMap = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    halfyearly: "Half Yearly",
    "half-yearly": "Half Yearly",
    yearly: "Yearly",
    annually: "Yearly",
    weekly: "Weekly",
    daily: "Daily",
    asandwhenpresented:
      "As and when presented",
    "as-and-when-presented":
      "As and when presented",
  };

  return (
    frequencyMap[normalized] ||
    normalizeText(value) ||
    "Monthly"
  );
};

/*
 * Validate and normalize an eNACH authentication URL.
 */
const normalizeNachAuthUrl = (value) => {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  try {
    const parsedUrl =
      new URL(value.trim());

    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
};

/*
 * Normalize response-property names so these are treated
 * identically:
 *
 * authentication_url
 * authenticationUrl
 * AuthenticationURL
 */
const normalizeResponseKey = (key) =>
  String(key ?? "")
    .replace(
      /[^a-zA-Z0-9]/g,
      "",
    )
    .toLowerCase();

/*
 * URL fields checked in priority order.
 */
const NACH_AUTH_URL_KEY_PRIORITY = [
  "authenticationurl",
  "mandateauthenticationurl",
  "authurl",
  "redirecturl",
  "mandateurl",
  "paymenturl",
  "shorturl",
  "customerurl",
  "customerlink",
  "authenticationlink",
  "redirectlink",
  "url",
  "link",
];

/*
 * Recursively find the authentication URL from Digio's
 * provider response.
 *
 * Only URLs under known URL/link keys are accepted.
 */
const findNachAuthUrl = (
  value,
  depth = 0,
) => {
  if (
    value === null ||
    value === undefined ||
    depth > 12
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const foundUrl =
        findNachAuthUrl(
          item,
          depth + 1,
        );

      if (foundUrl) {
        return foundUrl;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const entries =
    Object.entries(value);

  /*
   * Check recognized URL fields first.
   */
  for (
    const expectedKey
    of NACH_AUTH_URL_KEY_PRIORITY
  ) {
    for (
      const [key, fieldValue]
      of entries
    ) {
      if (
        normalizeResponseKey(key) !==
        expectedKey
      ) {
        continue;
      }

      const directUrl =
        normalizeNachAuthUrl(
          fieldValue,
        );

      if (directUrl) {
        return directUrl;
      }

      /*
       * Supports responses such as:
       *
       * authentication_url: {
       *   url: "https://..."
       * }
       */
      if (
        fieldValue &&
        typeof fieldValue === "object"
      ) {
        const nestedUrl =
          findNachAuthUrl(
            fieldValue,
            depth + 1,
          );

        if (nestedUrl) {
          return nestedUrl;
        }
      }
    }
  }

  /*
   * Search deeply nested response objects.
   */
  for (
    const [, nestedValue]
    of entries
  ) {
    if (
      nestedValue &&
      typeof nestedValue === "object"
    ) {
      const foundUrl =
        findNachAuthUrl(
          nestedValue,
          depth + 1,
        );

      if (foundUrl) {
        return foundUrl;
      }
    }
  }

  return null;
};

/*
 * Extract Digio mandate document ID from common response
 * structures.
 */
const extractMandateDocumentId = (data) =>
  data?.id ||
  data?.document_id ||
  data?.documentId ||
  data?.data?.id ||
  data?.data?.document_id ||
  data?.data?.documentId ||
  data?.content?.id ||
  data?.content?.document_id ||
  data?.content?.documentId ||
  null;

/*
 * Extract mandate state/status.
 */
const extractMandateState = (data) =>
  data?.state ||
  data?.status ||
  data?.data?.state ||
  data?.data?.status ||
  data?.content?.state ||
  data?.content?.status ||
  "partial";

/*
 * Normalize common Digio webhook structures.
 */
const extractWebhookData = (event) => {
  const eventData =
    event?.data ||
    event?.payload ||
    event?.content ||
    null;

  const mandateData =
    eventData?.api_mandate ||
    eventData?.apiMandate ||
    eventData?.mandate ||
    eventData?.api_mandates ||
    null;

  return {
    status: normalizeText(
      event?.status ||
      event?.event ||
      eventData?.status,
    ),

    documentId:
      eventData?.documentId ||
      eventData?.document_id ||
      eventData?.id ||
      mandateData?.id ||
      mandateData?.documentId ||
      mandateData?.document_id ||
      event?.documentId ||
      event?.document_id ||
      null,

    customerReference:
      eventData?.customer_ref_number ||
      eventData?.customerRefNumber ||
      eventData?.customer_reference ||
      eventData?.customerReference ||
      mandateData?.customer_ref_number ||
      mandateData?.customerRefNumber ||
      mandateData?.customer_reference ||
      mandateData?.customerReference ||
      null,

    registrationStatus:
      eventData?.registrationStatus ||
      eventData?.registration_status ||
      eventData?.state ||
      eventData?.status ||
      mandateData?.registrationStatus ||
      mandateData?.registration_status ||
      mandateData?.current_status ||
      mandateData?.state ||
      mandateData?.status ||
      null,

    umrn:
      eventData?.umrn ||
      eventData?.UMRN ||
      mandateData?.umrn ||
      mandateData?.UMRN ||
      null,

    data: eventData,
  };
};

/*
 * POST /api/enach/verify-bank
 */
router.post(
  "/verify-bank",
  authenticateUser,
  async (req, res) => {
    try {
      const {
        lan,
        account_no,
        ifsc,
        name,
        bank_name,
        account_type,
        mandate_amount,
      } = req.body;

      const normalizedLan =
        normalizeLan(lan);

      const normalizedAccountNo =
        normalizeText(account_no);

      const normalizedIfsc =
        normalizeIfsc(ifsc);

      const normalizedName =
        normalizeText(name);

      if (
        !normalizedLan ||
        !normalizedAccountNo ||
        !normalizedIfsc ||
        !normalizedName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "lan, account_no, ifsc and name are required",
        });
      }

      const pennyAmount = Number(
        process.env
          .DIGIO_PENNY_AMOUNT ||
        "1.00",
      );

      /*
       * Perform penny-drop bank verification.
       */
      const response =
        await verifyBankAccount({
          accountNo:
            normalizedAccountNo,

          ifsc:
            normalizedIfsc,

          name:
            normalizedName,

          amount:
            pennyAmount,
        });

      /*
       * Save verification result.
       */
      await db.promise().query(
        `
        INSERT INTO bank_verification
        (
          lan,
          account_no,
          ifsc,
          verified,
          verified_at,
          bank_name,
          bank_beneficiary_name,
          fuzzy_match_score,
          raw_response,
          account_type,
          mandate_amount
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          account_no =
            VALUES(account_no),

          ifsc =
            VALUES(ifsc),

          verified =
            VALUES(verified),

          verified_at =
            VALUES(verified_at),

          bank_name =
            VALUES(bank_name),

          bank_beneficiary_name =
            VALUES(bank_beneficiary_name),

          fuzzy_match_score =
            VALUES(fuzzy_match_score),

          raw_response =
            VALUES(raw_response),

          account_type =
            VALUES(account_type),

          mandate_amount =
            VALUES(mandate_amount)
        `,
        [
          normalizedLan,
          normalizedAccountNo,
          normalizedIfsc,

          response.verified
            ? 1
            : 0,

          response.verified_at ||
            null,

          normalizeText(
            bank_name,
          ) || null,

          response
            .beneficiary_name_with_bank ||
            normalizedName ||
            null,

          typeof response
            .fuzzy_match_score ===
          "number"
            ? response
                .fuzzy_match_score
            : null,

          JSON.stringify(response),

          normalizeText(
            account_type,
          ) || null,

          mandate_amount ||
            null,
        ],
      );

      /*
       * Stop when bank verification fails.
       */
      if (!response.verified) {
        return res.json({
          success: false,
          lan: normalizedLan,
          verified: false,

          fuzzy_match_score:
            response
              .fuzzy_match_score ??
            null,

          provider_id:
            response.id,

          raw: response,
        });
      }

      /*
       * Save verified details in the applicable
       * loan-booking table.
       */
      await updateLoanTables({
        lan:
          normalizedLan,

        bank_name:
          normalizeText(
            bank_name,
          ) || null,

        beneficiary_name:
          normalizedName ||
          response
            .beneficiary_name_with_bank ||
          null,

        account_no:
          normalizedAccountNo,

        ifsc:
          normalizedIfsc,
      });

      return res.json({
        success: true,
        lan: normalizedLan,
        verified: true,

        fuzzy_match_score:
          response
            .fuzzy_match_score ??
          null,

        provider_id:
          response.id,

        raw: response,
      });
    } catch (err) {
      console.error(
        "❌ Bank verification error:",
        err.response?.data ||
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Bank verification failed",

        error:
          err.response?.data ||
          err.message,
      });
    }
  },
);

/*
 * POST /api/enach/fuzzy-match
 */
router.post(
  "/fuzzy-match",
  authenticateUser,
  async (req, res) => {
    try {
      const {
        lan,
        context,
        sourceText,
        targetText,
        confidence,
      } = req.body;

      if (
        !sourceText ||
        !targetText
      ) {
        return res.status(400).json({
          success: false,
          message:
            "sourceText & targetText are required",
        });
      }

      const response =
        await fuzzyMatch({
          context:
            context ||
            "Name",

          sourceText,
          targetText,
          confidence,
        });

      if (lan) {
        await db.promise().query(
          `
          INSERT INTO fuzzy_match_logs
          (
            lan,
            context,
            matched,
            score,
            source_text,
            target_text,
            raw_response,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          `,
          [
            normalizeLan(lan),

            context ||
              "Name",

            response.matched
              ? 1
              : 0,

            response
              .match_score ??
              null,

            sourceText,
            targetText,

            JSON.stringify(
              response,
            ),
          ],
        );
      }

      return res.json({
        success: true,

        lan:
          lan
            ? normalizeLan(lan)
            : null,

        matched:
          response.matched,

        score:
          response.match_score,

        raw:
          response,
      });
    } catch (err) {
      console.error(
        "❌ Fuzzy match error:",
        err.response?.data ||
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Fuzzy match failed",

        error:
          err.response?.data ||
          err.message,
      });
    }
  },
);

/*
 * POST /api/enach/create-mandate
 */
router.post(
  "/create-mandate",
  authenticateUser,
  async (req, res) => {
    try {
      const {
        lan,
        customer_identifier,
        amount,
        start_date,
        end_date,
        frequency,
        account_no,
        ifsc,
        account_type,

        /*
         * Both field names are supported because the
         * frontend previously sent customer_name.
         */
        name_in_bank,
        customer_name,

        bank_name,
      } = req.body;

      const normalizedLan =
        normalizeLan(lan);

      const normalizedCustomerIdentifier =
        normalizeText(
          customer_identifier,
        );

      const normalizedAccountNo =
        normalizeText(
          account_no,
        );

      const normalizedIfsc =
        normalizeIfsc(ifsc);

      const normalizedBankName =
        normalizeText(
          bank_name,
        );

      const resolvedNameInBank =
        normalizeText(
          name_in_bank ||
          customer_name,
        );

      const mandateAmount =
        Number(amount);

      if (
        !normalizedLan ||
        !normalizedCustomerIdentifier ||
        !normalizedAccountNo ||
        !normalizedIfsc
      ) {
        return res.status(400).json({
          success: false,
          message:
            "LAN, customer identifier, account number and IFSC are required",
        });
      }

      if (
        !Number.isFinite(
          mandateAmount,
        ) ||
        mandateAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid mandate amount greater than zero is required",
        });
      }

      if (!resolvedNameInBank) {
        return res.status(400).json({
          success: false,
          message:
            "Account-holder name is required",
        });
      }

      if (
        !process.env
          .DIGIO_CORPORATE_CONFIG_ID
      ) {
        return res.status(500).json({
          success: false,
          message:
            "DIGIO_CORPORATE_CONFIG_ID is not configured",
        });
      }

      const payload = {
        customer_identifier:
          normalizedCustomerIdentifier,

        auth_mode:
          "api",

        mandate_type:
          "create",

        corporate_config_id:
          process.env
            .DIGIO_CORPORATE_CONFIG_ID,

        notify_customer:
          true,

        include_authentication_url:
          true,

        mandate_data: {
          maximum_amount:
            mandateAmount,

          instrument_type:
            "debit",

          first_collection_date:
            normalizeText(
              start_date,
            ) ||
            new Date()
              .toISOString()
              .slice(0, 10),

          final_collection_date:
            normalizeText(
              end_date,
            ) ||
            undefined,

          is_recurring:
            true,

          frequency:
            normalizeMandateFrequency(
              frequency,
            ),

          management_category:
            "L001",

          name_in_bank:
            resolvedNameInBank,

          customer_account_number:
            normalizedAccountNo,

          customer_account_type:
            normalizeAccountType(
              account_type,
            ),

          destination_bank_id:
            normalizedIfsc,

          destination_bank_name:
            normalizedBankName ||
            undefined,

          customer_ref_number:
            normalizedLan,

          scheme_ref_number:
            normalizedLan,
        },
      };

      /*
       * Remove undefined values before sending the
       * provider request.
       */
      Object.keys(
        payload.mandate_data,
      ).forEach((key) => {
        if (
          payload.mandate_data[key] ===
          undefined
        ) {
          delete payload
            .mandate_data[key];
        }
      });

      const resp =
        await digio.post(
          "/v3/client/mandate/create_form",
          payload,
        );

      const data =
        resp?.data || {};

      const documentId =
        extractMandateDocumentId(
          data,
        );

      const mandateState =
        extractMandateState(
          data,
        );

      /*
       * Search the full response and the HTTP Location
       * header for the authentication URL.
       */
      const authUrl =
        findNachAuthUrl(data) ||
        normalizeNachAuthUrl(
          resp?.headers?.location,
        ) ||
        null;

      if (!documentId) {
        console.error(
          "[ENACH] Digio response missing document ID",
          {
            lan:
              normalizedLan,

            responseKeys:
              data &&
              typeof data ===
                "object"
                ? Object.keys(
                    data,
                  )
                : [],
          },
        );

        return res.status(502).json({
          success: false,
          message:
            "Digio did not return a mandate document ID",
        });
      }

      console.log(
        "[ENACH] Mandate response received",
        {
          lan:
            normalizedLan,

          documentId:
            String(documentId),

          status:
            mandateState,

          authUrlFound:
            Boolean(authUrl),

          responseKeys:
            data &&
            typeof data ===
              "object"
              ? Object.keys(
                  data,
                )
              : [],
        },
      );

      /*
       * Save mandate provider response.
       *
       * COALESCE prevents an existing authentication URL
       * from being overwritten with NULL.
       */
      await db.promise().query(
        `
        INSERT INTO enach_mandates
        (
          lan,
          document_id,
          customer_identifier,
          status,
          mandate_amount,
          account_no,
          ifsc,
          account_type,
          bank_name,
          auth_url,
          raw_response
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          status =
            VALUES(status),

          auth_url =
            COALESCE(
              NULLIF(
                VALUES(auth_url),
                ''
              ),
              auth_url
            ),

          raw_response =
            VALUES(raw_response)
        `,
        [
          normalizedLan,
          String(documentId),
          normalizedCustomerIdentifier,
          mandateState,
          mandateAmount,
          normalizedAccountNo,
          normalizedIfsc,

          normalizeAccountType(
            account_type,
          ),

          normalizedBankName ||
            null,

          authUrl,

          JSON.stringify(
            data,
          ),
        ],
      );

      /*
       * Update the shared bank status.
       */
      await updateLoanTableStatus(
        `
        UPDATE __TABLE__
        SET
          bank_status =
            'MANDATE_INITIATED'
        WHERE lan = ?
        `,
        [
          normalizedLan,
        ],
      );

      /*
       * Clayyo details API reads the NACH link from:
       *
       * loan_booking_clayyo.enach_auth_url
       */
      if (
        normalizedLan
          .startsWith("CLYO")
      ) {
        const [
          clayyoUpdateResult,
        ] = await db
          .promise()
          .query(
            `
            UPDATE loan_booking_clayyo
            SET
              bank_status =
                'MANDATE_INITIATED',

              enach_auth_url =
                COALESCE(
                  NULLIF(?, ''),
                  enach_auth_url
                )

            WHERE lan = ?
            `,
            [
              authUrl,
              normalizedLan,
            ],
          );

        if (
          !clayyoUpdateResult
            .affectedRows
        ) {
          return res.status(404).json({
            success: false,
            message:
              `Clayyo loan not found: ${normalizedLan}`,
          });
        }

        console.log(
          "[ENACH] Clayyo mandate data saved",
          {
            lan:
              normalizedLan,

            documentId:
              String(
                documentId,
              ),

            authUrlFound:
              Boolean(
                authUrl,
              ),
          },
        );
      }

      return res.status(200).json({
        success: true,

        message:
          authUrl
            ? "Mandate initiated successfully"
            : "Mandate initiated, but Digio did not return an authentication URL",

        lan:
          normalizedLan,

        documentId:
          String(documentId),

        status:
          mandateState,

        auth_url:
          authUrl,

        authUrl,

        authentication_url_available:
          Boolean(authUrl),
      });
    } catch (err) {
      console.error(
        "❌ Mandate error:",
        err.response?.data ||
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Mandate creation failed",

        error:
          err.response?.data ||
          err.message,
      });
    }
  },
);

/*
 * POST /api/enach/webhooks/digio-mandate
 */
router.post(
  "/webhooks/digio-mandate",
  async (req, res) => {
    try {
      const event =
        req.body || {};

      const webhook =
        extractWebhookData(
          event,
        );

      const webhookStatus =
        webhook.status
          .toLowerCase();

      const registrationStatus =
        normalizeText(
          webhook
            .registrationStatus,
        )
          .toLowerCase();

      const isSuccess =
        [
          "success",
          "apimndt.authsuccess",
          "apimndt.registersuccess",
          "authsuccess",
          "registersuccess",
        ].includes(webhookStatus) ||
        [
          "success",
          "active",
          "registered",
          "auth_success",
          "authsuccess",
          "completed",
        ].includes(registrationStatus) ||
        Boolean(
          webhook.umrn &&
          webhook.documentId,
        );

      /*
       * Always return 200 to Digio so that invalid or
       * unrelated webhook events are not repeatedly retried.
       */
      if (
        !isSuccess ||
        !webhook.data
      ) {
        return res
          .status(200)
          .json({
            received: true,
          });
      }

      if (
        !webhook.documentId
      ) {
        console.warn(
          "[ENACH WEBHOOK] Missing document ID",
          {
            status:
              webhook.status,
          },
        );

        return res
          .status(200)
          .json({
            received: true,
            ignored: true,
          });
      }

      await db.promise().query(
        `
        UPDATE enach_mandates
        SET
          status = ?,

          umrn =
            COALESCE(
              ?,
              umrn
            ),

          webhook_payload = ?

        WHERE document_id = ?
        `,
        [
          webhook
            .registrationStatus ||
            "SUCCESS",

          webhook.umrn,

          JSON.stringify(
            event,
          ),

          String(
            webhook.documentId,
          ),
        ],
      );

      let customerReference =
        normalizeLan(
          webhook
            .customerReference,
        );

      if (!customerReference) {
        const [[mandateRow]] =
          await db.promise().query(
            `
            SELECT lan
            FROM enach_mandates
            WHERE document_id = ?
            LIMIT 1
            `,
            [
              String(
                webhook.documentId,
              ),
            ],
          );

        customerReference =
          normalizeLan(
            mandateRow?.lan,
          );
      }

      if (customerReference) {
        await updateLoanTableStatus(
          `
          UPDATE __TABLE__
          SET
            bank_status =
              'MANDATE_CREATED'
          WHERE lan = ?
          `,
          [
            customerReference,
          ],
        );

        /*
         * Save the generated UMRN in Clayyo.
         */
        if (
          customerReference
            .startsWith("CLYO")
        ) {
          await db
            .promise()
            .query(
              `
              UPDATE loan_booking_clayyo
              SET
                bank_status =
                  'MANDATE_CREATED',

                enach_umrn =
                  COALESCE(
                    ?,
                    enach_umrn
                  )

              WHERE lan = ?
              `,
              [
                webhook.umrn,
                customerReference,
              ],
              );
        }

        if (
          isClaimCureBuddyLan(
            customerReference,
          ) &&
          isMandateComplete({
            status:
              webhook
                .registrationStatus ||
              "SUCCESS",

            umrn:
              webhook.umrn,
          })
        ) {
          triggerClaimCureBuddyAutoDisbursement({
            lan:
              customerReference,

            source:
              "DIGIO_MANDATE_WEBHOOK",
          }).catch((autoDisbursementError) => {
            console.error(
              "ClaimCureBuddy auto disbursement trigger failed",
              {
                lan:
                  customerReference,

                message:
                  autoDisbursementError.message,

                stack:
                  autoDisbursementError.stack,
              },
            );
          });
        }
      }

      return res
        .status(200)
        .json({
          received: true,
        });
    } catch (err) {
      console.error(
        "❌ Webhook error:",
        err.response?.data ||
        err,
      );

      /*
       * Digio webhook should still receive HTTP 200.
       */
      return res
        .status(200)
        .json({
          received: true,
          error: true,
        });
    }
  },
);

module.exports = router;
