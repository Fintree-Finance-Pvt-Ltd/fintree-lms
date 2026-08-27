import { PAYMENT_PARTNER_CONFIG } from "../config/paymentPartnerConfig.js";
import db from "../config/db.js";

//partner send partner code 
function safeIdentifier(value) {
  if (!value) {
    return null;
  }

  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid database identifier: ${value}`);
  }

  return `\`${value}\``;
}


export function getPaymentPartnerConfig(partnerCode) {
  const cleanPartner = String(partnerCode || "")
    .trim()
    .toUpperCase();

  if (!cleanPartner) {
    throw new Error("partnerCode is required");
  }

  const config = PAYMENT_PARTNER_CONFIG[cleanPartner];

  if (!config) {
    throw new Error(
      `Unsupported payment partner: ${cleanPartner}`
    );
  }

  return {
    partnerCode: cleanPartner,
    ...config,
  };
}


export async function getLoanForPayment(
  partnerConfig,
  lan
) {
  const tableName = safeIdentifier(
    partnerConfig.tableName
  );

  const lanColumn = safeIdentifier(
    partnerConfig.lanColumn
  );

  const selectFields = [
    `${lanColumn} AS lan`,
  ];


  if (partnerConfig.customerNameColumn) {
    selectFields.push(
      `${safeIdentifier(
        partnerConfig.customerNameColumn
      )} AS customerName`
    );
  } else {
    selectFields.push(
      `NULL AS customerName`
    );
  }


  if (partnerConfig.mobileColumn) {
    selectFields.push(
      `${safeIdentifier(
        partnerConfig.mobileColumn
      )} AS mobile`
    );
  } else {
    selectFields.push(
      `NULL AS mobile`
    );
  }


  if (partnerConfig.emailColumn) {
    selectFields.push(
      `${safeIdentifier(
        partnerConfig.emailColumn
      )} AS email`
    );
  } else {
    selectFields.push(
      `NULL AS email`
    );
  }


  const query = `
    SELECT
      ${selectFields.join(",\n")}
    FROM ${tableName}
    WHERE ${lanColumn} = ?
    LIMIT 1
  `;


  const [rows] = await db
    .promise()
    .query(
      query,
      [lan]
    );


  if (!rows.length) {
    return null;
  }

  return rows[0];
}