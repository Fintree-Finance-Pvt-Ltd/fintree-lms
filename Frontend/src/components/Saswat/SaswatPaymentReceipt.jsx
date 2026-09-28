// import React, { useState } from "react";
// import PaymentReceiptModal from "./PaymentReceiptModal";

// const SaswatPaymentReceipt = () => {
//   const [open, setOpen] = useState(false);

//   return (
//     <div style={{ padding: "20px" }}>
//       <h2>Saswat Payment Receipt</h2>

//       <button
//         type="button"
//         onClick={() => setOpen(true)}
//         style={{
//           backgroundColor: "#1d4ed8",
//           color: "#ffffff",
//           border: "none",
//           padding: "10px 18px",
//           borderRadius: "6px",
//           cursor: "pointer",
//           fontWeight: "600",
//         }}
//       >
//         Generate Payment Receipt
//       </button>

//       <PaymentReceiptModal
//         open={open}
//         onClose={() => setOpen(false)}
//         partnerCode="SASWAT"
//       />
//     </div>
//   );
// };

// export default SaswatPaymentReceipt;




import React, { useState } from "react";
import PaymentReceiptModal from "./PaymentReceiptModal";

const SaswatPaymentReceipt = () => {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        padding: "24px",
      }}
    >
      <h2
        style={{
          marginBottom: "8px",
        }}
      >
        Saswat Payment Receipt
      </h2>

      <p
        style={{
          color: "#6b7280",
          marginBottom: "20px",
        }}
      >
        Generate payment receipt for Saswat loan customers.
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          backgroundColor: "#1d4ed8",
          color: "#ffffff",
          border: "none",
          padding: "10px 18px",
          borderRadius: "7px",
          cursor: "pointer",
          fontWeight: "600",
        }}
      >
        Generate Payment Receipt
      </button>

      <PaymentReceiptModal
        open={open}
        onClose={() => setOpen(false)}
        partnerCode="SASWAT"
      />
    </div>
  );
};

export default SaswatPaymentReceipt;