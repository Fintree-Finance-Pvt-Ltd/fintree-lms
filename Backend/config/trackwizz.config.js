/**
 * TrackWizz AS504 configuration.
 * Keep the token in env vars / secrets manager — never commit it.
 *
 * .env example:
 *   TW_AS504_URL=https://fintreefinancepvtltd-sb.trackwizz.app/CustomerInfo/as504
 *   TW_API_TOKEN=<JWT shared by TrackWizz team>
 *   TW_CLUSTER=CL1_User
 *   TW_SOURCE_SYSTEM_NAME=FintreeLMS
 *   TW_TIMEOUT_MS=30000
 *
 * NOTE: the "-sb" in the URL is the SANDBOX tenant. Swap to the production
 * domain that TrackWizz provides at go-live.
 */
module.exports = {
  url:
    process.env.TW_AS504_URL ||
    "https://fintreefinancepvtltd.trackwizz.app/CustomerInfo/as504",

  domain:
    process.env.TW_DOMAIN ||
    "https://fintreefinancepvtltd.trackwizz.app/CustomerInfo/as504", // Domain header (mandatory)

  apiToken: process.env.TW_API_TOKEN, // mandatory (MRV1/MRV2 if wrong)
  cluster: process.env.TW_CLUSTER || "CL1_User", // static per docs

  // Must match the SourceSystemName configured on TrackWizz side (MRV27)
  sourceSystemName: process.env.TW_SOURCE_SYSTEM_NAME || "FintreeLMS",

  timeoutMs: parseInt(process.env.TW_TIMEOUT_MS || "30000", 10),
};
