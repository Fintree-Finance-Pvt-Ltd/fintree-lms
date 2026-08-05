# Fintree PL Partner API — Lender-Side Express/MySQL Module

This folder implements the first lender APIs required by the Fintree Personal Loan Platform:

1. `POST /api/partner/v1/applications`
2. `POST /api/partner/v1/applications/:partnerApplicationId/consents`
3. `PUT /api/partner/v1/applications/:partnerApplicationId/details`
4. `POST /api/partner/v1/applications/:partnerApplicationId/documents`

Only these four APIs are included. Approval, bank details, mandate, eSign and disbursement are intentionally not added.

## Expected project location

Copy the folder to:

```text
Backend/routes/fintreePlPartnerApi/
```

The module uses your existing MySQL connection:

```js
require("../../config/db")
```

Nested service and middleware files resolve it with:

```js
require("../../../config/db")
```

## Database setup

Run the reviewed SQL file against the intended lender UAT database:

```text
sql/create_pl_partner_api_tables.sql
```

It creates:

- `pl_partner_api_clients`
- `pl_partner_idempotency_records`
- `pl_partner_applications`
- `pl_partner_application_consents`
- `pl_partner_application_detail_versions`
- `pl_partner_application_documents`
- `pl_partner_api_audit_logs`

Do not run the SQL directly in production before reviewing table names, collation and existing objects.

## API-key setup

Generate a random key of at least 32 characters. Put the same value in:

### Lender system

```env
PLP_PARTNER_API_KEY=<random-uat-key>
PLP_PARTNER_CLIENT_CODE=FINTREE_PLP
PLP_PARTNER_CLIENT_NAME=Fintree Personal Loan Platform
```

### Personal Loan Platform

```env
FINTREE_API_KEY=<same-random-uat-key>
```

Create the lender-side client record:

```bash
node routes/fintreePlPartnerApi/scripts/createPartnerApiClient.js
```

The script stores only the SHA-256 hash and leaves the client `INACTIVE`.
After contract testing, activate it manually:

```sql
UPDATE pl_partner_api_clients
SET status = 'ACTIVE'
WHERE client_code = 'FINTREE_PLP';
```

## Route mounting

Use the code in `APP_INTEGRATION_SNIPPET.js`.

The route must be mounted before a smaller global JSON parser because the document endpoint receives Base64 JSON:

```js
const express = require("express");
const fintreePlPartnerApiRoutes = require("./routes/fintreePlPartnerApi");

app.use(
  "/api/partner/v1",
  express.json({ limit: process.env.PL_PARTNER_JSON_LIMIT || "6mb" }),
  fintreePlPartnerApiRoutes,
);
```

## Required headers

Every request requires:

```http
x-api-key: <secret>
X-Correlation-Id: <uuid>
Idempotency-Key: <stable-key>
Content-Type: application/json
```

## Idempotency

Stable keys expected from PLP:

```text
<applicationReference>:LENDER_CREATE_APPLICATION:V1
<applicationReference>:LENDER_SUBMIT_CONSENT:V1
<applicationReference>:LENDER_UPDATE_APPLICATION:<detailsVersion>:V1
<applicationReference>:LENDER_DOCUMENT:<documentType>:<sourceDocumentId>:V1
```

The module stores the request hash and exact response body. A valid retry returns the stored response without repeating business logic. Reuse with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.

## Document storage

Set an explicit lender storage root:

```env
PL_PARTNER_DOCUMENT_ROOT=D:\secure-uploads\pl-partner-documents
```

or on Linux:

```env
PL_PARTNER_DOCUMENT_ROOT=/var/lib/fintree/pl-partner-documents
```

Supported types:

- `AADHAAR_PDF` with `application/pdf`
- `AADHAAR_XML` with `application/xml` or `text/xml`

Checks performed:

- strict Base64 decoding
- decoded size equals `fileSize`
- maximum decoded size `3,670,016` bytes
- SHA-256 equals `fileSha256`
- PDF starts with `%PDF-`
- XML has an XML-style beginning

The Base64 content is not stored in database or audit logs.

## API response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload is invalid.",
    "details": {
      "field": "customer.fatherName"
    }
  },
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Important implementation boundaries

- CREATE does not approve the loan.
- CONSENT records immutable evidence.
- DETAILS stores a versioned snapshot.
- DOCUMENT accepts one file per request.
- No route is added for approval, status, bank details, mandate, eSign or disbursement.
- Do not log API keys, PAN, Aadhaar content or Base64.
