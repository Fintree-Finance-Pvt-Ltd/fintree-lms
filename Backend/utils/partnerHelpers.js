// Partner helper utilities for limit control

// Extract month/year from login_date (Excel date string or YYYY-MM-DD)
function getMonthYear(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Fallback to today
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  return {
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
}

// Extract partner_name from Excel row
// Priority: direct "Partner Name" column → partner_loan_id prefix → lenderType
function extractPartnerName(row, lenderType = '') {
  // Direct column (expected)
  let partnerName = row['Partner Name'] || row['partner_name'] || row['Partner'] || row['partner'];

  if (partnerName && typeof partnerName === 'string') {
    return partnerName.trim().toLowerCase() === '' ? null : partnerName.trim();
  }

  // Fallback: Map from lenderType (partner_loan_id prefix)
  const lenderToPartner = {
    'EV Loan': 'EV Partner',
    'Health Care': 'Health Partner',
    'BL Loan': 'BL Partner',
    'GQ FSF': 'GQ FSF Partner',
    'GQ Non-FSF': 'GQ Non-FSF Partner',
    'Adikosh': 'Adikosh Partner'
  };

  return lenderToPartner[lenderType] || lenderType || 'Unknown Partner';
}

// Validate partner_name
function validatePartnerName(partnerName) {
  return typeof partnerName === 'string' && partnerName.trim().length > 0 && partnerName.trim().length <= 255;
}

// Existing Excel date parser (reuse from loanBookingRoutes)
const excelDateToJSDate = (value) => {
  if (!value) return null;
  if (typeof value === 'number' && !isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000).toISOString().split('T')[0];
  }
  if (typeof value === 'string' && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [d, m, y] = value.split('-');
    const monthMap = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    return new Date(Date.UTC(+('20'+y), monthMap[m], +d)).toISOString().split('T')[0];
  }
  if (value.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [d, m, y] = value.split('-');
    return new Date(`${y}-${m.padStart(2,'0')}-${d}`).toISOString().split('T')[0];
  }
  return null;
};

module.exports = {
  getMonthYear,
  extractPartnerName,
  validatePartnerName,
  excelDateToJSDate
};

