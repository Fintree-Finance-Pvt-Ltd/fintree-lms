// import React, { useState } from "react";
// import axios from "axios";

// const API_BASE_URL =
//   import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

// function PayUSubscribe() {
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
//   const [upiIntentUrl, setUpiIntentUrl] = useState("");

//   const [formData, setFormData] = useState({
//     user_id: "",
//     plan_id: "",

//     name: "",
//     lastname: "",
//     email: "",
//     phone: "",
//     amount: "",

//     billing_cycle: "MONTHLY",
//     billing_interval: "1",
//     payment_start_date: "",
//     payment_end_date: "",

//     payment_mode: "ENACH",

//     bankcode: "",
//     account_number: "",
//     account_type: "SAVINGS",
//     ifsc_code: "",
//     verification_mode: "AADHAAR",

//     vpa: "",
//   });

//   const handleChange = (e) => {
//     const { name, value } = e.target;

//     setFormData((prev) => ({
//       ...prev,
//       [name]: value,
//     }));
//   };

//  const redirectToPayU = (payuUrl, params) => {
//   if (!payuUrl || !params) {
//     throw new Error("PayU URL or params missing");
//   }

//   const form = document.createElement("form");

//   form.method = "POST";
//   form.action = payuUrl;
//   form.style.display = "none";

//   Object.entries(params).forEach(([key, value]) => {
//     const input = document.createElement("input");

//     input.type = "hidden";
//     input.name = key;
//     input.value = value ?? "";

//     form.appendChild(input);
//   });

//   document.body.appendChild(form);
//   form.submit();
// };

//   const handleSubscribe = async (e) => {
//     e.preventDefault();

//     try {
//       setLoading(true);
//       setError("");

//       const payload = {
//         user_id: Number(formData.user_id),
//         plan_id: formData.plan_id ? Number(formData.plan_id) : null,

//         name: formData.name,
//         lastname: formData.lastname,
//         email: formData.email,
//         phone: formData.phone,
//         amount: formData.amount,

//         billing_cycle: formData.billing_cycle,
//         billing_interval: Number(formData.billing_interval),
//         payment_start_date: formData.payment_start_date,
//         payment_end_date: formData.payment_end_date,

//         payment_mode: formData.payment_mode,
//       };

//       if (formData.payment_mode === "ENACH") {
//         payload.bankcode = formData.bankcode;
//         payload.account_number = formData.account_number;
//         payload.account_type = formData.account_type;
//         payload.ifsc_code = formData.ifsc_code;
//         payload.verification_mode = formData.verification_mode;
//       }

//       if (formData.payment_mode === "UPI_COLLECT") {
//         payload.vpa = formData.vpa;
//       }

//       const response = await axios.post(
//         `${API_BASE_URL}/payu/create-consent`,
//         payload
//       );

//       const data = response.data;

//       if (!data.success) {
//         throw new Error(data.message || "Failed to create PayU request");
//       }

//       console.log("PayU API Response:", data);

// const responseMode = String(data.payment_mode || "").toUpperCase();

// if (responseMode === "UPI_INTENT") {
//   if (!data.intentURIData) {
//     console.log("Full PayU response:", data.payu_response);

//     throw new Error("UPI intent link not received from PayU");
//   }

//   setUpiIntentUrl(data.intentURIData);
//   window.location.href = data.intentURIData;
//   return;
// }

// if (!data.payu_url || !data.params) {
//   throw new Error("PayU URL or params missing from backend response");
// }

// redirectToPayU(data.payu_url, data.params);
//     } catch (err) {
//       console.error(err);

//       setError(
//         err.response?.data?.message ||
//           err.message ||
//           "Something went wrong"
//       );

//       setLoading(false);
//     }
//   };

//   return (
//     <div style={{ padding: "30px", maxWidth: "700px" }}>
//       <h2>PayU Subscription Test</h2>

//       <form onSubmit={handleSubscribe}>
//         <div>
//           <label>User ID</label>
//           <br />
//           <input
//             type="number"
//             name="user_id"
//             value={formData.user_id}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Plan ID</label>
//           <br />
//           <input
//             type="number"
//             name="plan_id"
//             value={formData.plan_id}
//             onChange={handleChange}
//           />
//         </div>

//         <br />

//         <div>
//           <label>First Name</label>
//           <br />
//           <input
//             type="text"
//             name="name"
//             value={formData.name}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Last Name</label>
//           <br />
//           <input
//             type="text"
//             name="lastname"
//             value={formData.lastname}
//             onChange={handleChange}
//           />
//         </div>

//         <br />

//         <div>
//           <label>Email</label>
//           <br />
//           <input
//             type="email"
//             name="email"
//             value={formData.email}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Phone</label>
//           <br />
//           <input
//             type="tel"
//             name="phone"
//             value={formData.phone}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Billing Amount</label>
//           <br />
//           <input
//             type="number"
//             name="amount"
//             value={formData.amount}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Billing Cycle</label>
//           <br />
//           <select
//             name="billing_cycle"
//             value={formData.billing_cycle}
//             onChange={handleChange}
//             required
//           >
//             <option value="DAILY">DAILY</option>
//             <option value="WEEKLY">WEEKLY</option>
//             <option value="MONTHLY">MONTHLY</option>
//             <option value="YEARLY">YEARLY</option>
//           </select>
//         </div>

//         <br />

//         <div>
//           <label>Billing Interval</label>
//           <br />
//           <input
//             type="number"
//             name="billing_interval"
//             min="1"
//             value={formData.billing_interval}
//             onChange={handleChange}
//             required
//           />
//         </div>

//         <br />

//         <div>
//           <label>Payment Start Date</label>
//           <br />
//           <input
//             type="date"
//             name="payment_start_date"
//             value={formData.payment_start_date}
//             onChange={handleChange}
//           />
//         </div>

//         <br />

//         <div>
//           <label>Payment End Date</label>
//           <br />
//           <input
//             type="date"
//             name="payment_end_date"
//             value={formData.payment_end_date}
//             onChange={handleChange}
//           />
//         </div>

//         <br />

//         <div>
//           <label>Payment Mode</label>
//           <br />
//           <select
//             name="payment_mode"
//             value={formData.payment_mode}
//             onChange={handleChange}
//             required
//           >
//             <option value="ENACH">eNACH / NetBanking</option>
//             <option value="UPI_INTENT">UPI Intent</option>
//             <option value="UPI_COLLECT">UPI Collect</option>
//           </select>
//         </div>

//         <br />

//         {formData.payment_mode === "ENACH" && (
//           <>
//             <h3>eNACH Bank Details</h3>

//             <div>
//               <label>PayU Bank Code</label>
//               <br />
//               <input
//                 type="text"
//                 name="bankcode"
//                 placeholder="Example: ICICENCC"
//                 value={formData.bankcode}
//                 onChange={handleChange}
//                 required
//               />
//             </div>

//             <br />

//             <div>
//               <label>Account Number</label>
//               <br />
//               <input
//                 type="text"
//                 name="account_number"
//                 value={formData.account_number}
//                 onChange={handleChange}
//                 required
//               />
//             </div>

//             <br />

//             <div>
//               <label>Account Type</label>
//               <br />
//               <select
//                 name="account_type"
//                 value={formData.account_type}
//                 onChange={handleChange}
//                 required
//               >
//                 <option value="SAVINGS">SAVINGS</option>
//                 <option value="CURRENT">CURRENT</option>
//               </select>
//             </div>

//             <br />

//             <div>
//               <label>IFSC Code</label>
//               <br />
//               <input
//                 type="text"
//                 name="ifsc_code"
//                 value={formData.ifsc_code}
//                 onChange={handleChange}
//                 required
//               />
//             </div>

//             <br />

//             <div>
//               <label>Verification Mode</label>
//               <br />
//               <select
//                 name="verification_mode"
//                 value={formData.verification_mode}
//                 onChange={handleChange}
//                 required
//               >
//                 <option value="AADHAAR">AADHAAR</option>
//                 <option value="DEBIT_CARD">DEBIT_CARD</option>
//               </select>
//             </div>
//           </>
//         )}

//         {formData.payment_mode === "UPI_COLLECT" && (
//           <>
//             <h3>UPI Collect Details</h3>

//             <div>
//               <label>UPI ID / VPA</label>
//               <br />
//               <input
//                 type="text"
//                 name="vpa"
//                 placeholder="example@upi"
//                 value={formData.vpa}
//                 onChange={handleChange}
//                 required
//               />
//             </div>
//           </>
//         )}

//         {formData.payment_mode === "UPI_INTENT" && (
//           <p>
//             UPI Intent does not require bank details or VPA. PayU will open the
//             UPI intent flow.
//           </p>
//         )}

//         <br />

//         <button type="submit" disabled={loading}>
//           {loading ? "Redirecting to PayU..." : "Subscribe Now"}
//         </button>
//       </form>

//       {upiIntentUrl && (
//   <p style={{ marginTop: "15px" }}>
//     UPI app did not open?{" "}
//     <a href={upiIntentUrl}>Click here to open UPI app</a>
//   </p>
// )}

//       {error && (
//         <p style={{ color: "red", marginTop: "15px" }}>
//           {error}
//         </p>
//       )}
//     </div>
//   );
// }

// export default PayUSubscribe;


import React, { useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/$/, "");

// If your backend route is mounted as app.use("/api/payu", payuRoutes)
const PAYU_CREATE_CONSENT_URL =
  import.meta.env.VITE_PAYU_CREATE_CONSENT_URL ||
  `${API_BASE_URL}/payu/create-consent`;

// If your backend route is mounted as app.use("/payu", payuRoutes),
// use this instead:
// const PAYU_CREATE_CONSENT_URL = `${API_BASE_URL}/payu/create-consent`;

const BILLING_CYCLE_OPTIONS = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Yearly", value: "YEARLY" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Ad-hoc", value: "ADHOC" },
];

const PAYMENT_MODE_OPTIONS = [
  { label: "eNACH / NetBanking", value: "ENACH" },
  { label: "UPI Intent", value: "UPI_INTENT" },
  { label: "UPI Collect", value: "UPI_COLLECT" },
];

const ACCOUNT_TYPE_OPTIONS = [
  { label: "Savings", value: "SAVINGS" },
  { label: "Current", value: "CURRENT" },
];

const VERIFICATION_MODE_OPTIONS = [
  { label: "Aadhaar", value: "AADHAAR" },
  { label: "Debit Card", value: "DEBIT_CARD" },
  { label: "NetBanking", value: "NETBANKING" },
];

const initialFormData = {
  user_id: "",
  plan_id: "",

  name: "",
  lastname: "",
  email: "",
  phone: "",
  amount: "",

  billing_cycle: "MONTHLY",
  billing_interval: "1",
  payment_start_date: "",
  payment_end_date: "",

  payment_mode: "ENACH",

  bankcode: "",
  account_number: "",
  account_type: "SAVINGS",
  ifsc_code: "",
  verification_mode: "AADHAAR",

  vpa: "",
};

function PayUSubscribe() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState(initialFormData);

  const isEnach = formData.payment_mode === "ENACH";
  const isUpiCollect = formData.payment_mode === "UPI_COLLECT";
  const isUpiIntent = formData.payment_mode === "UPI_INTENT";
  const isAdhoc = formData.billing_cycle === "ADHOC";

  const today = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      if (name === "billing_cycle") {
        return {
          ...prev,
          billing_cycle: value,
          billing_interval: value === "ADHOC" ? "1" : prev.billing_interval,
        };
      }

      if (name === "payment_mode") {
        return {
          ...prev,
          payment_mode: value,
          vpa: value === "UPI_COLLECT" ? prev.vpa : "",
        };
      }

      if (name === "ifsc_code") {
        return {
          ...prev,
          ifsc_code: value.toUpperCase(),
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  };

  const redirectToPayU = (payuUrl, params) => {
    if (!payuUrl || !params) {
      throw new Error("PayU URL or params missing");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = payuUrl;
    form.style.display = "none";

    Object.entries(params).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value ?? "";
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const validateForm = () => {
    if (!formData.user_id) {
      throw new Error("User ID is required");
    }

    if (!formData.name.trim()) {
      throw new Error("First name is required");
    }

    if (!formData.email.trim()) {
      throw new Error("Email is required");
    }

    if (!formData.phone.trim()) {
      throw new Error("Phone is required");
    }

    if (!formData.amount || Number(formData.amount) <= 0) {
      throw new Error("Billing amount must be greater than 0");
    }

    if (
      ["UPI_INTENT", "UPI_COLLECT"].includes(formData.payment_mode) &&
      Number(formData.amount) > 15000
    ) {
      throw new Error("UPI recurring billing amount cannot be more than 15000");
    }

    if (!formData.billing_cycle) {
      throw new Error("Billing cycle is required");
    }

    if (!formData.billing_interval || Number(formData.billing_interval) < 1) {
      throw new Error("Billing interval must be at least 1");
    }

    if (
      formData.payment_start_date &&
      formData.payment_end_date &&
      formData.payment_end_date <= formData.payment_start_date
    ) {
      throw new Error("Payment end date must be after payment start date");
    }

    if (formData.payment_mode === "ENACH") {
      if (!formData.bankcode.trim()) {
        throw new Error("PayU bank code is required for eNACH");
      }

      if (!formData.account_number.trim()) {
        throw new Error("Account number is required for eNACH");
      }

      if (!formData.account_type.trim()) {
        throw new Error("Account type is required for eNACH");
      }

      if (!formData.ifsc_code.trim()) {
        throw new Error("IFSC code is required for eNACH");
      }

      if (!formData.verification_mode.trim()) {
        throw new Error("Verification mode is required for eNACH");
      }
    }

    if (formData.payment_mode === "UPI_COLLECT") {
      if (!formData.vpa.trim()) {
        throw new Error("UPI ID / VPA is required for UPI Collect");
      }
    }
  };

  const buildPayload = () => {
    const payload = {
      user_id: Number(formData.user_id),

      name: formData.name.trim(),
      lastname: formData.lastname.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      amount: formData.amount,

      billing_cycle: formData.billing_cycle,
      billing_interval: Number(formData.billing_interval),

      payment_mode: formData.payment_mode,
    };

    if (formData.plan_id) {
      payload.plan_id = Number(formData.plan_id);
    }

    if (formData.payment_start_date) {
      payload.payment_start_date = formData.payment_start_date;
    }

    if (formData.payment_end_date) {
      payload.payment_end_date = formData.payment_end_date;
    }

    if (formData.payment_mode === "ENACH") {
      payload.bankcode = formData.bankcode.trim();
      payload.account_number = formData.account_number.trim();
      payload.account_type = formData.account_type;
      payload.ifsc_code = formData.ifsc_code.trim().toUpperCase();
      payload.verification_mode = formData.verification_mode;
    }

    if (formData.payment_mode === "UPI_COLLECT") {
      payload.vpa = formData.vpa.trim();
    }

    return payload;
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      validateForm();

      const payload = buildPayload();

      const response = await axios.post(PAYU_CREATE_CONSENT_URL, payload, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || "Failed to create PayU request");
      }

      console.log("PayU API Response:", data);

      if (!data.payu_url || !data.params) {
        throw new Error("PayU URL or params missing from backend response");
      }

      redirectToPayU(data.payu_url, data.params);
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Something went wrong"
      );

      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "30px", maxWidth: "700px" }}>
      <h2>PayU Subscription Test</h2>

      <form onSubmit={handleSubscribe}>
        <div>
          <label>
            User ID <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="number"
            name="user_id"
            value={formData.user_id}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Plan ID</label>
          <br />
          <input
            type="number"
            name="plan_id"
            value={formData.plan_id}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>
            First Name <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Last Name</label>
          <br />
          <input
            type="text"
            name="lastname"
            value={formData.lastname}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>
            Email <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>
            Phone <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>
            Billing Amount <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="number"
            name="amount"
            min="1"
            step="0.01"
            value={formData.amount}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>
            Billing Cycle <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <select
            name="billing_cycle"
            value={formData.billing_cycle}
            onChange={handleChange}
            required
            style={{
              width: "330px",
              padding: "12px 20px",
              fontSize: "18px",
              borderRadius: "8px",
              border: "2px solid #009879",
              outline: "none",
              backgroundColor: "#ffffff",
            }}
          >
            {BILLING_CYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <br />

        <div>
          <label>
            Billing Interval <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <input
            type="number"
            name="billing_interval"
            min="1"
            value={formData.billing_interval}
            onChange={handleChange}
            disabled={isAdhoc}
            required
          />

          {isAdhoc && (
            <p style={{ marginTop: "5px", color: "#666" }}>
              For Ad-hoc billing, interval is fixed as 1 for testing.
            </p>
          )}
        </div>

        <br />

        <div>
          <label>Payment Start Date</label>
          <br />
          <input
            type="date"
            name="payment_start_date"
            min={today}
            value={formData.payment_start_date}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>Payment End Date</label>
          <br />
          <input
            type="date"
            name="payment_end_date"
            min={formData.payment_start_date || today}
            value={formData.payment_end_date}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>
            Payment Mode <span style={{ color: "red" }}>*</span>
          </label>
          <br />
          <select
            name="payment_mode"
            value={formData.payment_mode}
            onChange={handleChange}
            required
          >
            {PAYMENT_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <br />

        {isEnach && (
          <>
            <h3>eNACH Bank Details</h3>

            <div>
              <label>
                PayU Bank Code <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <input
                type="text"
                name="bankcode"
                placeholder="Example: ICICENCC"
                value={formData.bankcode}
                onChange={handleChange}
                required
              />
            </div>

            <br />

            <div>
              <label>
                Account Number <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <input
                type="text"
                name="account_number"
                value={formData.account_number}
                onChange={handleChange}
                required
              />
            </div>

            <br />

            <div>
              <label>
                Account Type <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <select
                name="account_type"
                value={formData.account_type}
                onChange={handleChange}
                required
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <br />

            <div>
              <label>
                IFSC Code <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <input
                type="text"
                name="ifsc_code"
                value={formData.ifsc_code}
                onChange={handleChange}
                required
              />
            </div>

            <br />

            <div>
              <label>
                Verification Mode <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <select
                name="verification_mode"
                value={formData.verification_mode}
                onChange={handleChange}
                required
              >
                {VERIFICATION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {isUpiCollect && (
          <>
            <h3>UPI Collect Details</h3>

            <div>
              <label>
                UPI ID / VPA <span style={{ color: "red" }}>*</span>
              </label>
              <br />
              <input
                type="text"
                name="vpa"
                placeholder="example@upi"
                value={formData.vpa}
                onChange={handleChange}
                required
              />
            </div>
          </>
        )}

        {isUpiIntent && (
          <p>
            UPI Intent does not require bank details or VPA. You will be
            redirected to PayU for the UPI intent flow.
          </p>
        )}

        <br />

        <button type="submit" disabled={loading}>
          {loading ? "Redirecting to PayU..." : "Subscribe Now"}
        </button>
      </form>

      {error && (
        <p style={{ color: "red", marginTop: "15px" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default PayUSubscribe;