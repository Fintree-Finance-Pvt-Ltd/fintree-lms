import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/api";
import { Check } from "lucide-react";
import "../../styles/YaMoney.css";
import "../../styles/ArthavidhiCapitalLoanBooking.css";

const groups = [
  ["Basic Details", [["login_date", "Login Date", "date"], ["mobile_number", "Mobile Number", "tel"], ["customer_name", "Customer Name"], ["pan_number", "PAN Number"], ["first_name", "First Name"], ["last_name", "Last Name"], ["gender", "Gender"], ["dob", "Borrower DOB", "date"], ["father_name", "Father Name"], ["email", "Email", "email", false]]],
  ["Customer address", [["aadhaar_number", "Aadhaar Number"], ["customer_address", "Address"], ["customer_pincode", "PIN code"], ["customer_city", "City"], ["customer_state", "State"]]],
  ["Loan details", [["requested_amount", "Requested amount (INR)", "number"], ["loan_tenure", "Requested tenure (months)", "number"], ["interest_rate", "Proposed annual interest (%)", "number"], ["processing_fee", "Proposed processing fee (INR)", "number", false], ["annual_income", "Annual income (INR)", "number", false]]],
  ["Business details", [["business_name", "Business name"], ["business_type", "Business type"], ["industry", "Business activity / industry"], ["business_vintage", "Business vintage (years)", "number"], ["annual_turnover", "Annual business turnover (INR)", "number"], ["monthly_revenue", "Monthly business revenue (INR)", "number"], ["gst_number", "GST number", "text", false], ["udyam_number", "Udyam number", "text"], ["business_address", "Business address", "text"], ["business_pincode", "Business PIN code", "text"], ["business_city", "Business city", "text"], ["business_state", "Business state", "text"]]],
];
const policyReasonText=code=>({
  AGE_OUTSIDE_21_60:"Applicant age must be 21?60 years.",LOAN_AMOUNT_BELOW_MINIMUM:"Requested amount must be at least INR 10,000.",REQUESTED_AMOUNT_ABOVE_100000:"Requested amount cannot exceed ?1,00,000.",
  TENURE_OUTSIDE_AMOUNT_BAND:"Tenure must match the amount: INR 10,000-25,000: 6-12 months; INR 25,001-50,000: 9-18; above INR 50,000: 12-18.",
  MONTHLY_REVENUE_MISSING:"Enter monthly business revenue.",MONTHLY_REVENUE_BELOW_25000:"Monthly business revenue must be at least INR 25,000.",
  BUREAU_SCORE_MISSING:"Bureau score is unavailable. Complete or retry the bureau check.",BUREAU_SCORE_BELOW_600:"Bureau score is below the policy minimum of 600.",
  CO_BORROWER_VERIFIED_REQUIRES_VERIFICATION:"Bureau score 650?699 requires co-borrower review.",
}[code]||code.toLowerCase().replaceAll("_"," "));
const CONSENT_TEXT="I authorise Fintree Finance Private Limited and its service providers to verify my mobile, PAN, Aadhaar and credit details for this Arthavidhi Capital loan application and to send the required verification OTP and links.";
const localToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const inputStyle = { width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 6, boxSizing: "border-box", font: "inherit" };

export default function ArthavidhiCapitalLoanBooking() {
  const [values, setValues] = useState({ gender: "", login_date:localToday() });
  const [searchParams]=useSearchParams();
  const resumeLan=searchParams.get("lan") || "";
  const returnToAddress=searchParams.get("step")==="address";
  const aadhaarReturn=searchParams.get("aadhaar_return")==="1";
  const [draftLan,setDraftLan]=useState(resumeLan);
  const [draftNotice,setDraftNotice]=useState("");
  const [editingExisting,setEditingExisting]=useState(false);
  const [configuration,setConfiguration]=useState(null);
  const [loadingDraft,setLoadingDraft]=useState(Boolean(resumeLan));
  const formRef = useRef(null);
  const [activeSection, setActiveSection] = useState(returnToAddress ? 1 : 0);
  const tenureBand = Number(values.requested_amount) <= 25000 ? [6, 12] : Number(values.requested_amount) <= 50000 ? [9, 18] : [12, 18];
  const steps = [...groups.map(([title]) => title), "Review & book"];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [bookingChecks,setBookingChecks]=useState(null);
  const [bookingLocked,setBookingLocked]=useState(false);
  const [identity,setIdentity]=useState({});
  const [consent,setConsent]=useState(false);
  const [otp,setOtp]=useState("");
  const [otpSent,setOtpSent]=useState(false);
  const [otpOpen,setOtpOpen]=useState(false);
  const otpDialogRef=useRef(null);
  const identityRequestRef=useRef(false);
  useEffect(()=>{const dialog=otpDialogRef.current;if(otpOpen&&!dialog?.open)dialog?.showModal();else if(!otpOpen&&dialog?.open)dialog.close();},[otpOpen]);
  const [resendAt,setResendAt]=useState(0);
  const [identityNotice,setIdentityNotice]=useState("");
  useEffect(()=>{
    if(!resumeLan)return;
    const controller=new AbortController();
    api.get(`/arthavidhi-capital/customer-details/${encodeURIComponent(resumeLan)}`,{signal:controller.signal}).then(async ({data})=>{
      const draft=data.data;
      const isDraft=String(draft.status).toLowerCase()==="draft";
      if(!isDraft&&!draft.can_edit_booking&&["credit_approved","signing_pending","ops_initiate","approved","disbursed"].includes(String(draft.status).toLowerCase()))throw new Error("This case has progressed beyond booking. Open customer details to continue.");
      setEditingExisting(!isDraft);setBookingLocked(!isDraft);setConfiguration(draft.check_configuration);
      const restored=Object.fromEntries(groups.flatMap(([,fields])=>fields.map(([name])=>[name,draft[name]??""])));
      restored.dob=(draft.dob||draft.borrower_dob)?String(draft.dob||draft.borrower_dob).slice(0,10):"";
      restored.login_date=restored.login_date?String(restored.login_date).slice(0,10):localToday();
      if(Number(restored.requested_amount)===0)restored.requested_amount="";
      setValues(restored);setDraftLan(resumeLan);setDraftNotice(isDraft?"Saved draft loaded. Complete the remaining details to book this case.":"Submitted case loaded read-only. Retry checks without changing the original booking; partner term changes belong to Partner Credit Review.");
      const verification=await api.get(`/arthavidhi-capital/${encodeURIComponent(resumeLan)}/identity`,{signal:controller.signal});applyIdentity(verification.data.data);
      if(returnToAddress)setActiveSection(1);
      if(aadhaarReturn)setIdentityNotice(verification.data.data.aadhaarVerified
        ? "DigiLocker verified. Date of birth and address have been filled from Aadhaar."
        : verification.data.data.aadhaarRefresh?.message || "Returned from DigiLocker. Use Fetch Aadhaar Address to check completion.");
    }).catch(e=>{if(e.code!=="ERR_CANCELED")setError(e.response?.data?.message||e.message||"Unable to load draft.");}).finally(()=>{if(!controller.signal.aborted)setLoadingDraft(false);});
    return ()=>controller.abort();
  },[resumeLan,returnToAddress,aadhaarReturn]);
  const applyIdentity = data => {
    setIdentity(data);
    setValues(previous=>{
      const next={...previous,...(data.profile||{}),...(data.panDob&&!data.profile?.dob?{dob:data.panDob}:{}),...(typeof data.customerName==="string"?{customer_name:data.customerName}:{}),...(data.mobile?{mobile_number:data.mobile}:{}),...(data.pan?{pan_number:data.pan}:{})};
      if(!data.panVerified){next.first_name="";next.last_name="";}
      if(data.panVerified&&data.customerName){const names=data.customerName.trim().split(/\s+/);next.first_name=names[0];next.last_name=names.slice(1).join(" ")||names[0];}
      if(next.dob){const birth=new Date(next.dob+"T00:00:00"),today=new Date();next.age=String(today.getFullYear()-birth.getFullYear()-(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate())?1:0));}
      return next;
    });
  };
  async function refreshIdentity(lan=draftLan){
    const {data}=await api.get(`/arthavidhi-capital/${encodeURIComponent(lan)}/identity`);
    applyIdentity(data.data);return data.data;
  }
  async function verifyIdentity(action,{restart=false}={}){
    if(identityRequestRef.current||busy||loadingDraft)return;
    identityRequestRef.current=true;
    setBusy(true);setError("");setIdentityNotice("");
    try{
      if(action==="send"&&!consent)throw new Error("Confirm customer consent before sending OTP.");
      if(action==="send"&&!restart&&Date.now()<resendAt)throw new Error("Wait 60 seconds before resending OTP.");
      if(action==="send"&&!/^[6-9]\d{9}$/.test(values.mobile_number||""))throw new Error("Enter a valid mobile number first.");
      const lan=draftLan||await persistDraft();
      if(draftLan&&!editingExisting&&["pan","aadhaar"].includes(action))await persistDraft();
      if(action==="refresh"){
        const data=await refreshIdentity(lan);
        setIdentityNotice(data.aadhaarVerified?"DigiLocker verified. Date of birth and address have been filled from Aadhaar.":data.aadhaarRefresh?.message||"DigiLocker verification is pending. Ask the customer to complete their link, then refresh.");
      }else{
        const endpoint=action==="send"?"otp/send":action==="verify"?"otp/verify":action;
        const payload=action==="send"?{mobile:values.mobile_number,consent,restartIdentity:restart}:action==="verify"?{mobile:values.mobile_number,otp,consent}:action==="pan"?{panNumber:values.pan_number}:{};
        const {data}=await api.post(`/arthavidhi-capital/${encodeURIComponent(lan)}/identity/${endpoint}`,payload);
        if(!data.success)throw new Error(data.message||"Identity verification is incomplete.");
        if(action==="send"){
          setOtpSent(true);setOtp("");setResendAt(Date.now()+60000);
          if(restart||identity.mobile!==values.mobile_number)setIdentity({});
        }
        if(action==="verify"){setOtpSent(false);setOtp("");setOtpOpen(false);}
        if(action==="aadhaar"&&data.status==="INITIATED"){
          setIdentity(previous=>({...previous,aadhaarVerified:false,aadhaarStatus:"INITIATED",kycUrl:data.kycUrl||previous.kycUrl}));
        }else if(action!=="send")await refreshIdentity(lan);
        setIdentityNotice(data.message||(action==="pan"?"PAN verified. Customer name filled from verification.":"DigiLocker link is ready. Ask the customer to complete Aadhaar verification."));
      }
    }catch(e){setError(e.response?.data?.message||e.message||"Identity verification failed. Please retry.");}
    finally{identityRequestRef.current=false;setBusy(false);}
  }
  async function persistDraft() {
    const payload=Object.fromEntries(Object.entries(values).filter(([key,v])=>key!=="monthly_revenue"&&v!==""));
    if(values.monthly_revenue!==undefined)payload.assessment={monthly_revenue:values.monthly_revenue};
    const {data}=await api.post("/arthavidhi-capital/login",{...payload,action:editingExisting?"edit_pending":"save_draft",...(draftLan?{lan:draftLan}:{})});
    setDraftLan(data.data.lan);
    setDraftNotice(`${editingExisting?"Case":"Draft"} ${data.data.lan} saved in All Loans. You can resume it later.`);
    return data.data.lan;
  }
  async function saveDraft() {
    if(busy||loadingDraft)return;
    setBusy(true);setError("");
    try {await persistDraft();}
    catch(e){setError(e.response?.data?.message||"Draft could not be saved. Your entries remain on this screen.");}
    finally{setBusy(false);}
  }
  const change = e => {
    const {name,value}=e.target;
    setValues(previous=>{
      const next={...previous,[name]:value};
      if(name==="dob"){
        const birth=new Date(`${value}T00:00:00`),today=new Date();
        const age=today.getFullYear()-birth.getFullYear()-(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate())?1:0);
        next.age=Number.isFinite(age)&&age>=0?String(age):"";
      }
      return next;
    });
  };
  function showInvalid(field) {
    setActiveSection(Number(field.closest("[data-section]").dataset.section));
    requestAnimationFrame(() => { field.focus(); field.reportValidity(); });
  }
  function navigate(target) {
    if (busy || loadingDraft) return;
    if(target>0&&(!identity.mobileVerified||!identity.panVerified)){setError("Verify mobile OTP and PAN before continuing.");return;}
    if(target>1&&!identity.aadhaarVerified){setError("Complete Aadhaar DigiLocker verification in Customer address before continuing.");return;}
    setError("");
    if (target > activeSection) {
      const invalid = [...formRef.current.querySelectorAll("[data-section]")].filter(section => Number(section.dataset.section) < target).map(section => section.querySelector(":invalid")).find(Boolean);
      if (invalid) { showInvalid(invalid); return; }
    }
    setIdentityNotice("");
    setActiveSection(target);
  }
  async function submit(e) {
    e.preventDefault();
    if (busy || loadingDraft) return;
    if (activeSection < groups.length) { navigate(activeSection + 1); return; }
    if(!identity.mobileVerified||!identity.panVerified||!identity.aadhaarVerified){setError("Complete mobile, PAN and DigiLocker verification first.");setActiveSection(0);return;}
    const invalid = formRef.current.querySelector("input:invalid, select:invalid, textarea:invalid");
    if (invalid) { showInvalid(invalid); return; }
    setBusy(true); setError(""); setBookingChecks(null);
    try {
      const payload = Object.fromEntries(Object.entries(values).filter(([key, v]) => key!=="monthly_revenue"&&v !== ""));
      if(values.monthly_revenue!==undefined)payload.assessment={monthly_revenue:values.monthly_revenue};
      const lan=editingExisting?draftLan:await persistDraft();
      let result;
      if(bookingLocked){
        let bureau=bookingChecks?.bureau;
        if(bureau?.status!=="VERIFIED"){
          try{const response=await api.post(`/arthavidhi-capital/${encodeURIComponent(lan)}/retry-bureau`);bureau=response.data.data?.bureau||bureau;}
          catch(failure){if(!failure.response?.data?.data)throw failure;bureau=failure.response.data.data.bureau||bureau;}
        }
        let aml;
        try{const response=await api.post(`/arthavidhi-capital/${encodeURIComponent(lan)}/aml-screening`);aml=response.data.data;}
        catch(failure){if(!failure.response?.data?.data)throw failure;aml=failure.response.data.data;}
        const {data}=await api.post(`/arthavidhi-capital/${encodeURIComponent(lan)}/run-bre`);
        result={lan,partner_loan_id:bookingChecks?.partner_loan_id,...bookingChecks,bureau,bre:data.data,aml,status:data.data.status};
      }else{
        const {data}=await api.post("/arthavidhi-capital/login", {...payload,lan,...(editingExisting?{action:"edit_pending",retry_checks:true}:{})});
        result=data.data;
      }
      setDraftLan(result.lan);
      setBookingLocked(true);
      if(result.status!=="bre_approved"){
        setEditingExisting(true);
        setBookingChecks(result);
        setDraftNotice(`Application ${result.lan} retained in All Loans. Booking checks are incomplete.`);
        setActiveSection(groups.length);
      }else setCreated(result);
    } catch (e) {
      const failure=e.response?.data;
      const detail=failure?.error_code ? ` [${failure.error_code}${failure.step ? ` · ${failure.step}` : ""}]` : "";
      setError((failure?.message || "Unable to book loan. Check the API connection.")+detail);
    }
    finally { setBusy(false); }
  }
  return <section className="ym-page avcl-booking">
    <div className="ym-page-header"><div><span className="avcl-eyebrow">NEW APPLICATION</span><h1>Arthavidhi Capital Loan Booking</h1><p>Verify mobile and PAN, fetch Aadhaar details through DigiLocker, then complete the loan details.</p></div><Link className="ym-refresh-button" to="/arthavidhi-capital/all">All loans</Link></div>
    {created ? <div className="avcl-success" role="status"><h2>{editingExisting?"Case updated successfully":"Loan booked successfully"}</h2><p className="avcl-lan">{created.lan}</p><p>Partner loan ID: <strong>{created.partner_loan_id}</strong></p><p>Status: <strong>{created.status}</strong></p><p>{created.next_action}</p><p>Bureau: {created.bureau?.status || "Pending"} / BRE: {created.bre?.status || "Pending"}</p><div className="avcl-actions">{["bre_approved","policy_review"].includes(created.status) && <Link className="ym-action-button ym-action-approve" to="/arthavidhi-capital/partner-credit">Open Partner Credit Review</Link>}<Link className="ym-action-button ym-action-muted" to={`/arthavidhi-capital/customer-details?lan=${encodeURIComponent(created.lan)}`}>Open customer details</Link></div></div> :
      <div className="avcl-form-card">
        {draftNotice && <p role="status">{draftNotice}</p>}{configuration && ["bureau","aml"].filter(key=>!configuration[key]?.ready).map(key=><p key={key} role="status">{key.toUpperCase()} is unavailable: configure {configuration[key]?.missingFields?.join(", ")} in Backend/.env and restart the backend. You can save changes while checks are pending.</p>)}{loadingDraft && <p role="status">Loading saved draft...</p>}
        <nav className="avcl-section-tabs" aria-label="Loan booking sections">{steps.map((title, index) => <button key={title} type="button" disabled={busy} className={`avcl-section-tab ${activeSection === index ? "active" : ""}`} aria-current={activeSection === index ? "step" : undefined} onClick={() => navigate(index)}><span>{index + 1}</span>{title}</button>)}</nav>
        <div className="avcl-progress"><div style={{ width: `${((activeSection + 1) / steps.length) * 100}%` }}/></div>
        <form ref={formRef} onSubmit={submit} noValidate>
          <fieldset disabled={busy||loadingDraft||bookingLocked} className="avcl-fieldset">
            {groups.map(([title, fields], index) => <section data-section={index} key={title} hidden={activeSection !== index} aria-label={title}>
              <div className="avcl-section-heading"><span className="avcl-eyebrow">STEP {index + 1} OF {steps.length}</span><h2>{title}</h2><p>{index === 3 ? "Describe the business for partner review. These details do not add new BRE rules." : index === 2 ? "Enter the amount requested. Final terms are confirmed after credit approval." : "Fields marked * are required."}</p></div>
              {index===1 && <div className="avcl-address-actions">
                <button type="button" className="avcl-verify-button" disabled={busy||!identity.panVerified||identity.aadhaarVerified} onClick={()=>verifyIdentity("aadhaar")}>{identity.aadhaarVerified?"Aadhaar Verified":"Trigger Aadhaar DigiLocker"}</button>
                {identity.kycUrl&&!identity.aadhaarVerified&&<a className="avcl-verify-button" href={identity.kycUrl} target="_blank" rel="noopener noreferrer">Open customer DigiLocker link</a>}
                <button type="button" className="avcl-verify-button" disabled={busy||!draftLan} onClick={()=>verifyIdentity("refresh")}>Fetch Aadhaar Address</button>
                <span className="avcl-verification-state">{identity.aadhaarVerified?"Verified":identity.aadhaarStatus||"Pending"}</span>
              </div>}
              <div className={`avcl-form-grid ${index===0?"avcl-basic-grid":""}`}>{fields.map(([name, label, type="text", required=true])=>{
                const inline=name==="mobile_number"||name==="pan_number";
                const locked=["customer_name","first_name","last_name"].includes(name)||(name==="pan_number"&&(!identity.mobileVerified||identity.panVerified))||(name==="mobile_number"&&identity.mobileVerified)||(identity.aadhaarVerified&&((name==="dob"&&identity.profile?.dob)||(name==="aadhaar_number"&&identity.profile?.aadhaar_number)));
                return <div key={name} className={`${inline?"avcl-inline-field":"avcl-field"} ${name.endsWith("address")?"avcl-wide-field":""}`}>
                  <label className="avcl-field"><span>{label}{required&&" *"}</span>
                  {name==="business_type"?<select style={inputStyle} name={name} required={required} disabled={bookingLocked} value={values[name]??""} onChange={change}><option value="">Select business type</option>{["Proprietorship","Partnership","LLP","Private Limited"].map(value=><option key={value}>{value}</option>)}</select>:name==="gender"?<select name={name} disabled={bookingLocked} required={required} value={values[name]??""} onChange={change} style={inputStyle}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select>:<input style={inputStyle} name={name} value={values[name]??""} type={type} readOnly={Boolean(locked||bookingLocked)} required={required&&!(name==="dob"&&!identity.aadhaarVerified&&!identity.panDob)} onChange={e=>{if(name==="pan_number")change({target:{name,value:e.target.value.toUpperCase()}});else change(e);}} autoComplete={name==="email"?"email":name==="customer_name"?"name":"off"} {...(type==="number"?{min:name==="requested_amount"?10000:name==="loan_tenure"?tenureBand[0]:name==="monthly_revenue"?25000:name==="interest_rate"?0.01:0,max:name==="requested_amount"?100000:name==="loan_tenure"?tenureBand[1]:undefined,step:name==="loan_tenure"?1:"0.01"}:{})} {...(name==="mobile_number"?{pattern:"[6-9][0-9]{9}",maxLength:10,inputMode:"numeric"}:{})} {...(name==="pan_number"?{pattern:"[A-Z]{5}[0-9]{4}[A-Z]",maxLength:10}:{})} {...(name==="aadhaar_number"?{pattern:"([0-9]{12}|[Xx*]{8}[0-9]{4})",maxLength:12}:{})} {...(name.endsWith("pincode")?{pattern:"[1-9][0-9]{5}",maxLength:6,inputMode:"numeric"}:{})}/>}</label>
                  {name==="mobile_number"&&<button type="button" className="avcl-verify-button" disabled={busy||identity.mobileVerified||!/^[6-9]\d{9}$/.test(values.mobile_number||"")} onClick={()=>{setError("");setOtpOpen(true);}}>{identity.mobileVerified?<>Verified <Check size={14}/></>:"Send OTP"}</button>}
                  {name==="pan_number"&&<button type="button" className="avcl-verify-button" disabled={busy||!identity.mobileVerified||identity.panVerified||!/^[A-Z]{5}\d{4}[A-Z]$/.test(values.pan_number||"")} onClick={()=>verifyIdentity("pan")}>{identity.panVerified?<>PAN Verified <Check size={14}/></>:"Verify & Fetch"}</button>}
                </div>;
              })}</div>
              {index<=1&&identityNotice&&<p className="avcl-verification-notice" role="status">{identityNotice}</p>}
            </section>)}
            {activeSection === 2 && <p className="avcl-loan-note">Repayment is monthly. Requested tenure and proposed charges are reviewed by credit; final approved terms are saved after credit approval. No payment is triggered from booking.</p>}
            {activeSection === groups.length && <section className="avcl-review"><span className="avcl-eyebrow">READY TO SUBMIT</span><h2>Review your application</h2><p>Check the details below. Use Edit to make any changes before booking.</p>{groups.map(([title, fields], index) => <div className="avcl-review-section" key={title}><div className="avcl-review-heading"><h3>{title}</h3><button type="button" onClick={() => navigate(index)}>Edit<span className="avcl-sr-only"> {title}</span></button></div><dl>{fields.map(([name, label]) => <div key={name}><dt>{label}</dt><dd>{name === "aadhaar_number" && values[name] ? `********${values[name].slice(-4)}` : values[name] || "Not provided"}</dd></div>)}</dl></div>)}</section>}
          </fieldset>
          {activeSection===groups.length&&bookingChecks&&<section className="avcl-booking-checks" role="alert" aria-label="Booking check results">
            <h3>Booking could not be completed</h3>
            <p>Application <strong>{bookingChecks.lan}</strong> is retained. Review the issues below and retry using this same application.</p>
            {bookingLocked&&<p>Bureau has completed, so booking details are locked. Retry pending checks here.</p>}
            <p><strong>Why this case is blocked:</strong> {bookingChecks.bre?.reason || "Bureau, AML and BRE must all clear before Partner Credit Review."}</p>
            <h4>BRE: {bookingChecks.bre?.breStatus||bookingChecks.bre?.decision||"Pending"}</h4>
            {(bookingChecks.bre?.rejections?.length>0||bookingChecks.bre?.pending?.length>0)?<ul>{[...(bookingChecks.bre.rejections||[]),...(bookingChecks.bre.pending??[])].map(reason=><li key={reason}>{policyReasonText(reason)}</li>)}</ul>:<p>{bookingChecks.bre?.reason||"Evaluation has not completed."}</p>}
            <h4>Bureau: {bookingChecks.bureau?.status||"Pending"}</h4><p>{bookingChecks.bureau?.message}</p>
            <h4>AML: {bookingChecks.aml?.status||"Pending"}</h4><p>{bookingChecks.aml?.message||bookingChecks.aml?.reason}</p>
          </section>}
          {error && <div className="ym-error" role="alert">{error}</div>}
          <footer className="avcl-step-buttons"><button type="button" className="ym-action-button ym-action-muted" disabled={busy||loadingDraft||bookingLocked} onClick={saveDraft}>{editingExisting?"Save changes":"Save draft"}</button><button type="button" className="ym-action-button ym-action-muted" disabled={busy || activeSection === 0} onClick={() => navigate(activeSection - 1)}>Back</button><span>Step {activeSection + 1} of {steps.length}</span>{activeSection < groups.length ? <button type="button" className="ym-action-button avcl-next" disabled={busy} onClick={() => navigate(activeSection + 1)}>Next</button> : <button type="submit" className="ym-action-button avcl-next" disabled={busy}>{busy ? "Checking..." : bookingLocked?"Retry checks":editingExisting?"Save & retry checks":"Book loan"}</button>}</footer>
        </form>
      </div>}
    <dialog ref={otpDialogRef} className="avcl-otp-dialog" onCancel={()=>setOtpOpen(false)} aria-labelledby="avcl-otp-title">
      <div className="avcl-otp-heading"><h2 id="avcl-otp-title">Verify Mobile Number</h2><button type="button" disabled={busy} onClick={()=>setOtpOpen(false)}>Close</button></div>
      <p>Send an OTP to <strong>{values.mobile_number}</strong> and enter the code provided by the customer.</p>
      <label className="avcl-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{CONSENT_TEXT}</span></label>
      {otpSent&&<label className="avcl-field avcl-otp-input"><span>Enter 6-digit OTP</span><input value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} maxLength={6} inputMode="numeric" autoComplete="one-time-code"/></label>}
      {error&&<p className="ym-error" role="alert">{error}</p>}
      <div className="avcl-actions"><button type="button" className="avcl-verify-button" disabled={busy||!consent} onClick={()=>verifyIdentity("send",{restart:Boolean(identity.mobileVerified)})}>{otpSent?"Resend OTP":"Send OTP"}</button>{otpSent&&<button type="button" className="ym-action-button avcl-next" disabled={busy||otp.length!==6||!consent} onClick={()=>verifyIdentity("verify")}>Verify OTP</button>}</div>
    </dialog>
  </section>;
}
