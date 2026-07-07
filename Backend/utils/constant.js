const CAREPAY_HOSPITAL_REQUIRED_FIELDS = [
  "partner_loan_id",
  "hospital_legal_name",
  "registered_address",
  "registered_city",
  "registered_district",
  "registered_state",
  "registered_pincode",
  "hospital_phone",
  "contact_person_name",
  "contact_person_phone",
  "ifsc_code",
  "bank_name",
  "branch_name",
  "account_holder_name",
  "account_number",
];

const CAREPAY_REQUIRED_FIELDS = [
  "login_date",
  "partner_loan_id",
  "hospital_lan",
  "first_name",
  "last_name",
  "gender",
  "dob",
  "mobile_number",
  "pan_number",
  "aadhar_number",
  "current_address",
  "current_village_city",
  "current_district",
  "current_state",
  "current_pincode",
  "subvention_percentage",
  "request_amount",
  "loan_tenure",
  "employment",
  "annual_income",
  "customer_type",
];

const STERLION_REQUIRED_FIELDS = [
  "login_date",
  "partner_loan_id",
  "first_name",
  "last_name",
  "dob",
  "mobile_number",
  "pan_number",
  "current_address",
  "current_state",
  "current_pincode",
  "business_name",
  "business_type",
  "business_vintage_months",
  "business_address",
  "business_state",
  "business_pincode",
  "request_amount",
  "loan_tenure",
  "annual_income",
];


const CarepayLoanTypes = [
  "No-Cost EMI",
  "Low-Cost EMI",
  "Standard EMI",
  "Short-Term Personal Loan",
];


const WCTL_ALLOWED_PRODUCTS = {
  MONTHLY_360: "MONTHLY",
  QUARTERLY_360: "QUARTERLY",
  HALF_YEARLY_360: "HALF_YEARLY",
  YEARLY_360: "YEARLY",

  MONTHLY_365: "MONTHLY",
  QUARTERLY_365: "QUARTERLY",
  HALF_YEARLY_365: "HALF_YEARLY",
  YEARLY_365: "YEARLY"
};

const normalizeCarepayProduct = (value) =>
  String(value || "")
    .trim()
    .replace(/^["']+|["',]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

const CarepayLoanTypeSet = new Set(
  CarepayLoanTypes.map((type) => normalizeCarepayProduct(type)),
);

const isCarepayLoanType = (value) =>
  CarepayLoanTypeSet.has(normalizeCarepayProduct(value));

module.exports = {
  CAREPAY_HOSPITAL_REQUIRED_FIELDS,
  CAREPAY_REQUIRED_FIELDS,
  STERLION_REQUIRED_FIELDS,
  CarepayLoanTypes,
  CarepayLoanTypeSet,
  isCarepayLoanType,
  normalizeCarepayProduct,
  WCTL_ALLOWED_PRODUCTS
};
