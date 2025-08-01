// import React, { useEffect, useState } from 'react';
// import axios from 'axios';
// import { useParams } from 'react-router-dom';

// const SOA = () => {
//     const {lan} = useParams();
//     console.log("lan", lan);

//   const [data, setData] = useState(null);
  

//   useEffect(() => {
//     const fetchData = async () => {
//       const result = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/documents/statements-of-account/${lan}`);
//       setData(result.data);
//       console.log("✅ Data Fetched:", result.data);
//     //   setData(result);
//     };
//     fetchData();
//   }, [lan]);

//   if (!data) return <p>Loading...</p>;

//   const { loanDetails, repaymentSchedule, paymentHistory, extraCharges } = data ;
//  // console.log("✅ Data Fetched:", data);
//   console.log("✅ Repayment Schedule:", loanDetails);

//   return (
//     <div className="p-8">
//       <h1 className="text-2xl font-bold mb-4">Statement Of Account</h1>
//       <p><strong>Customer Name:</strong> {loanDetails.customer_name}</p>
//       <p><strong>Loan Account No:</strong> {loanDetails.loan_account_no}</p>
//       <p><strong>Partner Loan Account:</strong> {loanDetails.partner_loan_id}</p>
//       <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>

//       <h2 className="mt-4 font-semibold">Loan Details</h2>
//       <table className="border w-full">
//         <tbody>
//           <tr><td>Loan Amount</td><td>{loanDetails.loan_amount}</td></tr>
//           <tr><td>Disbursed Amount</td><td>{loanDetails.disbursed_amount}</td></tr>
//           <tr><td>Disbursement Date</td><td>{loanDetails.disbursement_date}</td></tr>
//           <tr><td>Loan Tenure</td><td>{loanDetails.loan_tenure}</td></tr>
//           {/* Add other rows as needed */}
//         </tbody>
//       </table>

//       <h2 className="mt-4 font-semibold">Repayment Schedule</h2>
//       <table className="border w-full">
//         <thead>
//           <tr>
//             <th>Due Date</th><th>EMI Amount</th><th>Principal</th><th>Interest</th><th>Remaining</th><th>EMI Paid Date</th><th>Status</th>
//           </tr>
//         </thead>
//         <tbody>
//           {repaymentSchedule.map((row) => (
//             <tr key={row.id}>
//               <td>{row.due_date}</td>
//               <td>{row.emi_amount}</td>
//               <td>{row.principal_amount}</td>
//               <td>{row.interest_amount}</td>
//               <td>{row.remaining_amount}</td>
//               <td>{row.emi_paid_date || 'None'}</td>
//               <td>{row.status}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>

//       <h2 className="mt-4 font-semibold">Payment History</h2>
//       <table className="border w-full">
//         <thead>
//           <tr>
//             <th>Date</th><th>Mode</th><th>Amount</th><th>ID</th><th>Status</th>
//           </tr>
//         </thead>
//         <tbody>
//           {paymentHistory.map((row) => (
//             <tr key={row.id}>
//               <td>{row.date}</td>
//               <td>{row.payment_mode}</td>
//               <td>{row.payment_amount}</td>
//               <td>{row.payment_id}</td>
//               <td>{row.payment_status}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>

//       <h2 className="mt-4 font-semibold">Extra Charges</h2>
//       <table className="border w-full">
//         <thead>
//           <tr>
//             <th>Charge Date</th><th>Mode</th><th>Amount</th><th>ID</th>
//           </tr>
//         </thead>
//         <tbody>
//           {extraCharges.length === 0 ? (
//             <tr><td colSpan="4">None</td></tr>
//           ) : extraCharges.map((row) => (
//             <tr key={row.id}>
//               <td>{row.charge_date}</td>
//               <td>{row.payment_mode}</td>
//               <td>{row.payment_amount}</td>
//               <td>{row.payment_id}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// };

// export default SOA;



import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import logo from "../assets/fintree_logo.png"

const SOA = () => {
  const { lan } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const result = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/documents/generate-soa/${lan}`
      );
      setData(result.data);
    };
    fetchData();
  }, [lan]);

  if (!data) return <p>Loading...</p>;

  const { loanDetails, repaymentSchedule, paymentHistory, extraCharges } = data;
//   const loan = loanDetails[0] || {};

  return (
    <div style={{ width: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif', color: '#000' }}>
      <div style={{ textAlign: 'center' }}>
        <img src={logo} alt="FintreeLogo" style={{ height: '60px', marginBottom: '20px' }} />
        <h2 style={{ margin: '10px 0' }}>Statement Of Account</h2>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <p><strong>Customer Name :</strong> {loanDetails.customer_name}</p>
          <p><strong>Date :</strong> {new Date().toLocaleDateString()}</p>
        </div>
        <div>
          <p><strong>Loan Account No :</strong> {loanDetails.lan}</p>
          <p><strong>Partner Loan Account :</strong> {loanDetails.partner_loan_id}</p>
        </div>
      </div>

      <h3 style={{ textAlign: 'left', margin: '20px 0 5px' }}>Loan Details</h3>
      <table style={tableStyle}>
        <tbody>
          <Row label="Customer Name" value={loanDetails.customer_name} />
          <Row label="Customer Mobile No." value={loanDetails.mobile_number} />
          <Row label="Loan Account No." value={loanDetails.lan} />
          <Row label="Partner Loan ID" value={loanDetails.partner_loan_id} />
          <Row label="Loan Amount" value={loanDetails.loan_amount} />
          <Row label="Disbursed Amount" value={loanDetails.disbursal_amount} />
          <Row label="Disbursement Date" value={loanDetails.agreement_date?.split('T')[0]} />
          <Row label="Loan Tenure in Months" value={loanDetails.loan_tenure} />
          <Row label="Rate Of Interest" value={`${loanDetails.interest_rate} %`} />
          <Row label="Pre EMI" value={loanDetails.pre_emi} />
          <Row label="Processing Fees" value={loanDetails.processing_fee} />
          <Row label="Other Charges" value="–" />
          <Row label="Frequency" value="Monthly" />
          <Row label="Loan Status" value={loanDetails.status} />
          <Row label="EMI Amount" value={loanDetails.emi_amount} />
        </tbody>
      </table>

      <h3 style={{ marginTop: '20px' }}>Repayment Schedule</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["Due Date", "EMI Amount", "Principal Amount", "Interest Amount", "Remaining Amount", "EMI Paid Date", "Status"].map((head) => (
              <th key={head} style={thStyle}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {repaymentSchedule?.map((row, i) => (
            <tr key={i}>
              <td style={tdStyle}>{row.due_date}</td>
              <td style={tdStyle}>{row.emi}</td>
              <td style={tdStyle}>{row.principal}</td>
              <td style={tdStyle}>{row.interest}</td>
              <td style={tdStyle}>{row.remaining_amount}</td>
              <td style={tdStyle}>{row.payment_date || 'None'}</td>
              <td style={tdStyle}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Payment History</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["Date", "Payment Mode", "Payment Amount", "Payment ID", "Payment Status"].map((head) => (
              <th key={head} style={thStyle}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paymentHistory?.map((row, i) => (
            <tr key={i}>
              <td style={tdStyle}>{row.payment_date}</td>
              <td style={tdStyle}>{row.payment_mode}</td>
              <td style={tdStyle}>{row.transfer_amount}</td>
              <td style={tdStyle}>{row.payment_id}</td>
              <td style={tdStyle}>{'Success'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Extra Charges</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["Charge Date", "Payment Mode", "Payment Amount", "Payment ID"].map((head) => (
              <th key={head} style={thStyle}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {extraCharges?.length === 0 ? (
            <tr><td style={tdStyle} colSpan="4">None</td></tr>
          ) : (
            extraCharges?.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{row.due_date}</td>
                <td style={tdStyle}>{row.charge_type}</td>
                <td style={tdStyle}>{row.amount}</td>
                <td style={tdStyle}>{row.paid_status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p style={{ textAlign: 'center', marginTop: '40px' }}>
        ***This is a system generated letter and does not require a signature***
      </p>
    </div>
  );
};

// ✅ Reusable row
const Row = ({ label, value }) => (
  <tr>
    <td style={tdStyle}>{label}</td>
    <td style={tdStyle}>{value}</td>
  </tr>
);

const tableStyle = {
  borderCollapse: 'collapse',
  width: '100%',
  marginBottom: '20px'
};

const thStyle = {
  border: '1px solid #000',
  padding: '6px',
  textAlign: 'left',
  backgroundColor: '#f9f9f9',
  fontSize: '14px'
};

const tdStyle = {
  border: '1px solid #000',
  padding: '6px',
  fontSize: '14px'
};

export default SOA;
