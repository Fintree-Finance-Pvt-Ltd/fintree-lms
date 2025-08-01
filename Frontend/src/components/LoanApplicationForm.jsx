import { useState } from "react";
import api from "../api/api";
import html2pdf from "html2pdf.js";

//	BL116600

const LoanApplicationForm = () => {
  const [lan, setLan] = useState("");
  const [loanData, setLoanData] = useState(null);
  const [documents, setDocuments] = useState([]);


  const onSubmit = async () => {
    try {
      const response = await api.get(
        `/application-form/${lan}`
      );
      console.log("API Response:", response);
      setLoanData(response.data.loan);
      setDocuments(response.data.documents || []);
    } catch (err) {
      console.error("Failed to fetch loan details.");
    }
  };


  const handleSubmit = () => {
    onSubmit();
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById("print-section");

    // Wait for all images to load
    const images = element.querySelectorAll("img");
    const promises = Array.from(images).map(img => {
      return new Promise(resolve => {
        if (img.complete) return resolve();
        img.onload = img.onerror = resolve;
      });
    });

    Promise.all(promises).then(() => {
      const opt = {
        margin: 0.5,
        filename: `Loan_Application_${loanData.lan || 'Details'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(element).save();
    });
  };




  return (
    <div>
      <h1>Loan Application Form</h1>
      <h4>Enter the LAN No.</h4>
      <input
        type="text"
        placeholder="Enter LAN No."
        onChange={(e) => setLan(e.target.value)}
      />
      <button onClick={handleSubmit}>Go</button>

      {loanData && (
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "30px",
          fontSize: "10px",
          fontFamily: "Arial, sans-serif",
          backgroundColor: "#fdfdfd",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          boxShadow: "0 0 10px rgba(0,0,0,0.05)"
        }}>
          <div
            style={{
              backgroundColor: "#4e4e4e",
              color: "#fff",
              fontSize: "10px",
              fontWeight: "bold",
              padding: "10px",
              textTransform: "uppercase",
              marginBottom: "10px"
            }}
          >
            Loan Details
          </div>

          <button
            onClick={handleDownloadPDF}
            style={{
              padding: "8px 16px",
              backgroundColor: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            ⬇ Download PDF
          </button>

          <div id="print-section">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "20px" }}>
              <thead style={{
                backgroundColor: "#4e4e4e"
              }}>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>LAN</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.lan || "None"} </td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Partner Loan ID</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.partner_loan_id || "None"}</td>

                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Login Date</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.login_date || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Customer Name</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.customer_name || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Date of Birth</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.borrower_dob || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Father's Name</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.father_name || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Address Line 1</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.address_line_1 || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Address Line 2</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.address_line_2 || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Village</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.village || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>District</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.district || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>State</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.state || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Pincode</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.pincode || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Mobile Number</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.mobile_number || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Email</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.email || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Occupation</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.occupation || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Relationship with Borrower</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.relationship_with_borrower || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>CIBIL Score</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.cibil_score || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Guarantor/Co CIBIL Score</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.guarantor_co_cibil_score || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Loan Amount</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.loan_amount || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Loan Tenure</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.loan_tenure || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Interest Rate</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.interest_rate || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>EMI Amount</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.emi_amount || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Guarantor Aadhar</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.guarantor_aadhar || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Guarantor PAN</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.guarantor_pan || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Dealer Name</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.dealer_name || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Name in Bank</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.name_in_bank || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Bank Name</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.bank_name || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Account Number</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.account_number || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>IFSC</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.ifsc || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Aadhar Number</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.aadhar_number || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>PAN Card</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.pan_card || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Guarantor / Co-Applicant</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.guarantor_co_applicant || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Guarantor / Co-Applicant DOB</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.guarantor_co_applicant_dob || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Product</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.product || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Lender</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.lender || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Status</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.status || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Disbursal Amount</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.disbursal_amount || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Processing Fee</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.processing_fee || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Agreement Date</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.agreement_date || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>GST</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.gst || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Advance EMI</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.advance_emi || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Pre EMI</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.pre_emi || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Loan Account No</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.loan_account_no || "None"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "10px", fontWeight: "bold" }}>Speridian Loan Account No</td>
                  <td style={{ border: "1px solid #ccc", padding: "10px" }}>{loanData.speridian_loan_account_no || "None"}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ border: "1px solid #ccc", marginTop: "30px" }}>
              {/* Header */}
              <div style={{
                backgroundColor: "#4e4e4e",
                color: "white",
                padding: "10px",
                fontWeight: "bold",
                textTransform: "uppercase",
                fontSize: "14px"
              }}>
                AADHAR DECLARATION
              </div>

              {/* Content */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                padding: "10px",
                borderBottom: "1px solid #ccc"
              }}>
                {/* Applicant */}
                <div style={{ flex: 1, padding: "10px", borderRight: "1px solid #ccc" }}>
                  <p style={{ margin: "0 0 5px" }}>
                    <strong>Name of Applicant:</strong> {loanData.customer_name}
                  </p>
                  <p style={{ margin: 0, fontSize: "14px", lineHeight: "20px" }}>
                    I hereby submit voluntarily at my own discretion, the physical copy of
                    self-attested Aadhaar card/physical e-Aadhaar/masked Aadhaar/offline
                    electronic Aadhaar XML as issued by UIDAI (Aadhaar), to Fintree Finance
                    Pvt. Ltd for the purpose of establishing my identity/address proof, to
                    fulfill the Company’s KYC requirements. I have redacted/blackened out my
                    Aadhaar number on the Aadhaar copy which is being shared with the Company.
                  </p>
                </div>

                {/* Co-Applicant */}
                <div style={{ flex: 1, padding: "10px" }}>
                  <p style={{ margin: "0 0 5px" }}>
                    <strong>Name of Co-Applicant:</strong> {loanData.guarantor_co_applicant || "None"}
                  </p>
                  <p style={{ margin: 0, fontSize: "14px", lineHeight: "20px" }}>
                    I hereby submit voluntarily at my own discretion, the physical copy of
                    self-attested Aadhaar card/physical e-Aadhaar/masked Aadhaar/offline
                    electronic Aadhaar XML as issued by UIDAI (Aadhaar), to Fintree Finance
                    Pvt. Ltd for the purpose of establishing my identity/address proof, to
                    fulfill the Company’s KYC requirements. I have redacted/blackened out my
                    Aadhaar number on the Aadhaar copy which is being shared with the Company.
                  </p>
                </div>
              </div>
            </div>


            {/* CUSTOMER DECLARATION SECTION */}
            <div style={{ border: "1px solid #ccc", marginTop: "30px" }}>
              <div
                style={{
                  backgroundColor: "#4e4e4e",
                  color: "#fff",
                  fontWeight: "bold",
                  padding: "10px",
                  fontSize: "14px",
                  textTransform: "uppercase",
                }}
              >
                Customer Declaration
              </div>

              <div style={{ padding: "15px", fontSize: "14px", lineHeight: "22px", backgroundColor: "#f9f9f9" }}>
                <p>
                  I/We certify that all the information furnished by me/us is true and correct. We undertake to inform you of any changes therein immediately.
                  There is no overdues/statutory dues against me/us promoters except as indicated in the application, that no legal action has been/is being taken
                  against me/us. That We shall furnish all the other information that may be required by you in connection with my/our application; that this may
                  be exchanged by you with any agency you may deem fit, and you, your representatives of RBI or any agency as authorised by you; may at any time,
                  inspect, verify my/our asset books of accounts etc in your office/factory/business premises as given above. The Borrower(s)/Guarantor(s)
                  agree(s) to have given his/her Express consent to AFPL to disclose all the information and data furnished by them to receive information from
                  Central KYC Registry/third parties including but not limited to vendors, outsourcing agencies, business correspondents for analyzing, processing,
                  report generation, storing, record keeping or to various credit information companies/credit bureaus e.g. Credit Information Bureau (India) Ltd
                  (CIBIL), or to information utilities under the Insolvency and Bankruptcy Code 2016 through physical or SMS or Email or any other mode.
                </p>

                <p>
                  [We hereby grant my/our explicit consent to download and use my/our records from CKYCR.]
                </p>

                <p>
                  We hereby give my/our consent to provide additional information, which is in addition to the requirement as prescribed in the KYC policy of AFPL
                  for the purpose of loan application evaluation and related matters.
                </p>

                <p>
                  The Borrower(s)/Guarantor(s) further agree(s) that they shall execute such additional documents as may be necessary for the purpose. We shall
                  immediately inform the company when my/our residential status changes.
                </p>

                <p>
                  We confirm that I/we do not have any existing ID/customer id apart from the one mentioned above and in case found otherwise; Company reserves
                  the right to consolidate the customer ids under a single customer id as it may decide, without prior notice to me/us.
                </p>

                <p>
                  I/We undertake the proceeds of this facility shall not be used for any illegal and/or anti-social and/or speculative purpose including but not
                  limited to participation in capital market. In case of any falsification of information related to any applicable statute/law including Goods and
                  Services Tax (GST) mentioned herein, I/We would be solely responsible for consequences thereof. We also hereby undertake to indemnify AFPL and
                  its directors and officers with respect to all the statutory and other liabilities/penalties/fines that may be levied on AFPL or its directors or
                  officers under such Act(s)/law(s) due to non-compliance/mis-representation by me/us.
                </p>

                <p>
                  The rate of interest and the approach for gradations of risk and rationale for charging different rate of interest to different categories of
                  borrowers is disclosed in the Interest Rate policy of Fintree Finance Pvt. Ltd available on its website{" "}
                  <a href="https://fintreefinance.com/" target="_blank" rel="noopener noreferrer">https://fintreefinance.com/</a>
                </p>

                <p>
                  We am/are hereby submitting and shall submit the KYC documents, from time to time, as required by AFPL. I hereby agree and confirm that in case
                  of any amendments/changes in the KYC documents as submitted, I shall make necessary update to the said documents and shall submit the same to
                  AFPL within 30 days of the update to the documents.
                </p>

                <p>
                  Except to the extent disclosed to AFPL, no director or a relative/near relation (as specified by RBI) of a director or a relative/near relation
                  (as specified by RBI) of a senior officer of AFPL (as specified by RBI) is: the Applicants(s), or a partner of our concern, or a trustee, member,
                  director, employee or our concern, or of our subsidiary, or our holding company, or a guarantor on my/our behalf, or holds substantial interest
                  in our concern or my/our subsidiary or holding company.
                </p>

                <p>
                  We authorize Fintree Finance Pvt. Ltd, its associates/partners/correspondences/agents and other NBFC/Bank/companies etc., to access and collect
                  information from Credit Bureau agencies for the purpose of evaluating and processing my loan application. I also understand and agree that
                  Fintree may share my data with co-lenders to enable them to process my loan request. Fintree will keep the information in its systems or with
                  third parties for as long as necessary to fulfil the purposes it was collected for, including for the purposes of satisfying any legal,
                  accounting, or reporting requirements or as required to comply with any legal obligations to which it is subject to. Please refer to the Privacy
                  Policy and Terms & Conditions.
                </p>

                {/* Confirmation Points */}
                <div style={{ marginTop: "20px" }}>
                  <p style={{ fontWeight: "bold" }}>I/We also confirm that I/We have been explained the following:</p>
                  <ul style={{ paddingLeft: "20px" }}>
                    <li>AFPL may at its sole discretion sanction or decline the application. No commitment has been given to me/us with regard to sanction of the loan.</li>
                    <li>AFPL will decide and assign the loan limit and no commitment has been given to me/us for the same.</li>
                    <li>Processing Fees of 5,000 will not be refunded in case of rejection/withdrawal of the case.</li>
                    <li>Schedule of charges has been given to me/us for the same.</li>
                  </ul>
                </div>
              </div>
            </div>


            {documents.length > 0 && (
              <div style={{ marginTop: "40px" }}>
                <h3 style={{
                  textAlign: "center",
                  backgroundColor: "#4e4e4e",
                  color: "#fff",
                  padding: "10px",
                  marginBottom: "20px",
                  textTransform: "uppercase",
                  letterSpacing: "1px"
                }}>
                  Document Attachments
                </h3>

                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "30px",
                  justifyContent: "center"
                }}>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        width: "250px",
                        backgroundColor: "#fff",
                        borderRadius: "8px",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                        padding: "10px",
                        textAlign: "center",
                        border: "1px solid #e0e0e0",
                        transition: "transform 0.2s ease-in-out",
                      }}
                    >
                      <img
                        src={`${import.meta.env.VITE_API_BASE_URL}/uploads/${doc.file_name}`}
                        alt={doc.original_name}
                        style={{
                          width: "100%",
                          height: "200px",
                          borderRadius: "4px",
                          marginBottom: "10px",
                        }}
                      />
                      <div style={{
                        fontSize: "14px",
                        fontWeight: "bold",
                        color: "#333"
                      }}>
                        {doc.original_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanApplicationForm;
