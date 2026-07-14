
/**
 * Adapter: loan_booking_switch_my_loan row  →  lead object for payloadBuilder.
 */
const pool = require('../../config/db');

const GENDER_MAP = {
  male: '01', m: '01',
  female: '02', f: '02',
  transgender: '03', other: '03', t: '03',
};

function mapGender(value) {
  if (!value) return '';
  return GENDER_MAP[String(value).trim().toLowerCase()] || '';
}

/** Map a raw row (already fetched) to the lead shape. */
function mapRowToLead(row) {
  const sameAddress = Number(row.is_current_address) === 1;

  return {
    leadId: row.id,
    customerCode: row.application_id || row.partner_loan_id || `LEAD${row.id}`,
    applicationRefNumber: row.application_id || '',

    fullName: row.customer_name,
    fatherName: row.father_name,
    pan: row.pan_number ? String(row.pan_number).toUpperCase().trim() : '',
    mobile: row.mobile ? String(row.mobile).replace(/\D/g, '').slice(-10) : '',
    email: row.email,
    dob: row.dob,
    gender: mapGender(row.gender),
    createdAt: row.created_at,

    monthlyIncome: row.monthly_income,
    exactIncome: row.monthly_income != null ? Number(row.monthly_income) * 12 : null,

    permanentAddress: {
      line1: row.address_line_1 || '',
      line2: row.address_line_2 || '',
      pincode: row.address_pincode || row.pincode || '',
      city: row.address_city || row.city || '',
      state: row.address_state || row.state || '',
    },
    correspondenceAddress: sameAddress
      ? {
          line1: row.address_line_1 || '',
          line2: row.address_line_2 || '',
          pincode: row.address_pincode || row.pincode || '',
          city: row.address_city || row.city || '',
          state: row.address_state || row.state || '',
        }
      : {
          line1: row.current_address_line_1 || '',
          line2: row.current_address_line_2 || '',
          pincode: row.current_address_pincode || '',
          city: row.current_address_city || '',
          state: row.current_address_state || '',
        },
  };
}

/** Fetch a loan booking row by id and map it. */
async function getLeadFromLoanBooking(loanId) {
  const [rows] = await pool.execute(
    `SELECT id, application_id, partner_loan_id, customer_name, pan_number,
            father_name, dob, gender, mobile, email, pincode, state, city,
            monthly_income, created_at, is_current_address,
            address_line_1, address_line_2, address_pincode, address_city, address_state,
            current_address_line_1, current_address_line_2, current_address_pincode,
            current_address_city, current_address_state
     FROM loan_booking_switch_my_loan WHERE id = ?`,
    [loanId]
  );
  if (!rows.length) throw new Error(`Loan booking ${loanId} not found`);
  return mapRowToLead(rows[0]);
}

module.exports = { getLeadFromLoanBooking, mapRowToLead, mapGender };