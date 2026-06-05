 const ACCOUNT_TYPE = {
  "01": "AUTO LOAN ",
  "02": "HOUSING LOAN",
  "03": "PROPERTY LOAN ",
  "04": "LOAN AGAINST SHARES/SECURITIES",
  "05": "PERSONAL LOAN",
  "06": "CONSUMER LOAN",  
  "07": "GOLD LOAN",
  "08": "EDUCATIONAL LOAN",
  "09": "LOAN TO PROFESSIONAL",
  "10": "CREDIT CARD",
  "11": "LEASING",
  "12": "OVERDRAFT",
  "13": "TWO-WHEELER LOAN",
  "14": "NON-FUNDED CREDIT FACILITY",
  "15": "LOAN AGAINST BANK DEPOSITS",
  "16": "FLEET CARD",
  "17": "Commercial Vehicle Loan",
  "18": "Telco – Wireless",
  "19": "Telco – Broadband",
  "20": "Telco – Landline",
  "23": "GECL Secured",
  "24": "GECL Unsecured",
  "31": "Secured Credit Card",
  "32": "Used Car Loan",
  "33": "Construction Equipment Loan",
  "34": "Tractor Loan",
  "35": "Corporate Credit Card",
  "36": "Kisan Credit Card",
  "37": "Loan on Credit Card",
  "38": "Prime Minister Jaan Dhan Yojana - Overdraft",

  "39": "Mudra Loans – Shishu / Kishor / Tarun",

  "40": "Microfinance – Business Loan",
  "41": "Microfinance – Personal Loan",
  "42": "Microfinance – Housing Loan",
  "43": "Microfinance – Others",
  "44": "Pradhan Mantri Awas Yojana - Credit Link Subsidy Scheme MAY CLSS",
  "45": "P2P Personal Loan",
  "46": "P2P Auto Loan",
  "47": "P2P Education Loan",
  "51": "BUSINESS LOAN – GENERAL",
  "52": "BUSINESS LOAN –PRIORITY SECTOR – SMALL BUSINESS",
  "53": "BUSINESS LOAN –PRIORITY SECTOR – AGRICULTURE",
  "54": "BUSINESS LOAN –PRIORITY SECTOR – OTHERS",
  "55": "BUSINESS NON-FUNDED CREDIT FACILITY – GENERAL",
  "56": "BUSINESS NON-FUNDED CREDIT FACILITY – PRIORITY SECTOR – SMALL BUSINESS",
  "57": "BUSINESS NON-FUNDED CREDIT FACILITY – PRIORITY SECTOR – AGRICULTURE",
  "58": "BUSINESS NON-FUNDED CREDIT FACILITY – PRIORITY SECTOR – OTHERS",
  "59": "BUSINESS LOANS AGAINST BANK DEPOSITS",

  "60": "Staff Loan",
  "61": "Business Loan - Unsecured",
  "00": "Others",
  "50": "Business Loan - Secured",
  "69": "Short Term Personal Loan [Unsecured]",
  "70": "Priority Sector Gold Loan [Secured]",
  "71": "Temporary Overdraft [Unsecured]"

};

 const ACCOUNT_STATUS = {
  "00": "No Suit Filed",
  "89": "Wilful default",
  "93": "Suit Filed(Wilful default)",
  "97": "Suit Filed(Wilful Default) and Written-off",
  "30": "Restructured",
  "31": "Restructured Loan (Govt. Mandated)",
  "32": "Settled",
  "33": "Post (WO) Settled",
  "34": "Account Sold",
  "35": "Written Off and Account Sold",
  "36": "Account Purchased",
  "37": "Account Purchased and Written Off",
  "38": "Account Purchased and Settled",
  "39": "Account Purchased and Restructured",
  "40": "Status Cleared",
  "41": "Restructured Loan",
  "42": "Restructured Loan (Govt. Mandated)",
  "43": "Written-off",
  "44": "Settled",
  "45": "Post (WO) Settled",
  "46": "Account Sold",
  "47": "Written Off and Account Sold",
  "48": "Account Purchased",
  "49": "Account Purchased and Written Off",
  "50": "Account Purchased and Settled",
  "51": "Account Purchased and Restructured",
  "52": "Status Cleared",
  "53": "Suit Filed",
  "54": "Suit Filed and Written-off",
  "55": "Suit Filed and Settled",
  "56": "Suit Filed and Post (WO) Settled",
  "57": "Suit Filed and Account Sold",
  "58": "Suit Filed and Written Off and Account Sold",
  "59": "Suit Filed and Account Purchased",
  "60": "Suit Filed and Account Purchased and Written Off",
  "61": "Suit Filed and Account Purchased and Settled",
  "62": "Suit Filed and Account Purchased and Restructured",
  "63": "Suit Filed and Status Cleared",
  "64": "Wilful Default and Restructured Loan",
  "65": "Wilful Default and Restructured Loan (Govt. Mandated)",
  "66": "Wilful Default and Settled",
  "67": "Wilful Default and Post (WO) Settled",
  "68": "Wilful Default and Account Sold",
  "69": "Wilful Default and Written Off and Account Sold",
  "70": "Wilful Default and Account Purchased",
  "72": "Wilful Default and Account Purchased and Written Off",
  "73": "Wilful Default and Account Purchased and Settled",
  "74": "Wilful Default and Account Purchased and Restructured",
  "75": "Wilful Default and Status Cleared",
  "76": "Suit filed (Wilful default) and Restructured",
  "77": "Suit filed (Wilful default) and Restructured Loan (Govt. Mandated)",
  "79": "Suit filed (Wilful default) and Settled",
  "81": "Suit filed (Wilful default) and Post (WO) Settled",
  "85": "Suit filed (Wilful default) and Account Sold",
  "86": "Suit filed (Wilful default) and Written Off and Account Sold",
  "87": "Suit filed (Wilful default) and Account Purchased",
  "88": "Suit filed (Wilful default) and Account Purchased and Written Off",
  "94": "Suit filed (Wilful default) and Account Purchased and Settled",
  "90": "Suit filed (Wilful default) and Account Purchased and Restructured",
  "91": "Suit filed (Wilful default) and Status Cleared",
  "13": "CLOSED",
  "14": "CLOSED",
  "15": "CLOSED",
  "16": "CLOSED",
  "17": "CLOSED",
  "12": "CLOSED",
  "11": "ACTIVE",
  "71": "ACTIVE",
  "78": "ACTIVE",
  "80": "ACTIVE",
  "82": "ACTIVE",
  "83": "ACTIVE",
  "84": "ACTIVE",
  "21": "ACTIVE",
  "22": "ACTIVE",
  "23": "ACTIVE",
  "24": "ACTIVE",
  "25": "ACTIVE",
  "131": "Restructured due to natural calamity",
  "130": "Restructured due to COVID-19",
  "132": "Post Write Off Closed",
  "133": "Restructured & Closed",
  "134": "Auctioned & Settled",
  "135": "Repossessed & Settled",
  "136": "Guarantee Invoked",
  "137": "Entity ceased while account was open",
  "138": "Entity ceased while account was closed"

};

 const ACCOUNT_HOLDER_TYPE = {
  "1": "Individual",
  "2": "Joint",
  "3": "Authorized User",
  "4": "Guarantor",
  "5": "Deceased",
};

 const PAYMENT_HISTORY_PROFILE= {
" N/? ": "Value not available " ,
"0": " 0–29 days past the due date " ,
"1": " 30-59 days past the due date " ,
"2": " 60-89 days past the due date " ,
"3": " 90-119 days past the due date " ,
"4": " 120-149 days past the due date " ,
"5": " 150-179 days past the due date " ,
"6": " 180 or more days past the due date " ,
"S": " Asset Classification is Standard",
"B":  "Asset Classification is Substandard  ",
"D": " Asset Classification is Doubtful " ,
"M":  "Asset Classification is Special Mention Account " ,
"L":  "Asset Classification is  Loss"
};

 const TYPE_OF_COLLATERAL = {
  "0": "Standard",
  "1": "30 Days Past Due",
  "2": "60 Days Past Due",
  "3": "90 Days Past Due",
  "4": "120 Days Past Due",
  "99": "No Collateral",
  "11": "Property",
  "12": "Gold",
  "13": "Shares",
  "14": "Saving Account and Fixed Deposit",
  "15"  :"Multiple Securities ",
   "16" :"Others"
};

 const PORTFOLIO_TYPE = {
  "0": "Standard",
 "F": "Microfinance" ,
  "I" :"Instalment Loans " ,
  "M": "Mortgage Loan" ,
  "L": "Open Lines of Credit" ,
  "R": "Revolving Credit" ,
  "S": "Single Payment  Loans",   
  "B" : "Banking" ,  
  "X" : "Leasing" 
};

 const SUTI_FILLED_WILL_FULL_DEFAULT_WRITTEN_OFF_STATUS = {
  "0": "Standard",
  "00": "Restructured",
  "01": "Suit Filed",
  "02": "Wilful Default",
  "03": "Suit Filed (Wilful Default)",
  "04": "Written Off",
  "05": "Suit Filed & Written Off",
  "06": "Wilful Default & Written Off",
  "07": "Suit Filed (Wilful Default) & Written Off",
  "08": "Settled",
  "09": "Post (WO) Settled"
};


 const SUTI_FILLED_WILL_FULL_DEFAULT = {
  "00": "No Suit Filed",
  "01": "Suit Filed",
  "02": "Wilful Default",
  "03": "Suit Filed (Wilful Default)"
};

 const WRITTEN_OFF_SETTLED_STATUS = {
  "0": "Standard",
  "00": "Restructured Loan",
  "01": "Restructured Loan (Govt. Mandated)",
  "02": "Written-off",
  "03": "Settled",
  "04": "Post (WO) Settled",
  "05": "Account Sold",

  "06": "Written Off and Account Sold",
  "07": "Account Purchased",
  "08": "Account Purchased and Written Off",
  "09": "Account Purchased and Settled",
  "10": "Account Purchased and Restructured",
  "11": "Restructured due to Natural Calamity",

  "12": "Restructured due to COVID-19",
  "13": "Post Write Off Closed",
  "14": "Restructured & Closed",
  "15": "Auctioned & Settled",
  "16": "Repossessed & Settled",
  "17": "Guarantee Invoked",
  "99": "Clear Existing Status"
};


function getExperianDescription(mapping, code) {
  if (!mapping) return "-";

  if (code === null || code === undefined || code === "") {
    return "-";
  }

  const key = String(code).trim();

  // 1st: exact match
  if (Object.prototype.hasOwnProperty.call(mapping, key)) {
    return mapping[key];
  }

  // 2nd: uppercase match, useful for S/B/D/M/L type codes
  const upperKey = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(mapping, upperKey)) {
    return mapping[upperKey];
  }

  // 3rd: padded match, useful when API sends 1 but mapping has 01
  const paddedTwoDigitKey = key.padStart(2, "0");
  if (Object.prototype.hasOwnProperty.call(mapping, paddedTwoDigitKey)) {
    return mapping[paddedTwoDigitKey];
  }

  return `Unknown code: ${key}`;
}

module.exports = {
  getExperianDescription,

  ACCOUNT_TYPE,
  ACCOUNT_STATUS,
  ACCOUNT_HOLDER_TYPE,
  PAYMENT_HISTORY_PROFILE,
  TYPE_OF_COLLATERAL,
  PORTFOLIO_TYPE,
  SUTI_FILLED_WILL_FULL_DEFAULT_WRITTEN_OFF_STATUS,
  SUTI_FILLED_WILL_FULL_DEFAULT,
  WRITTEN_OFF_SETTLED_STATUS,

  // aliases
  EXPERIAN_ACCOUNT_TYPE: ACCOUNT_TYPE,
  EXPERIAN_ACCOUNT_STATUS: ACCOUNT_STATUS,
};