import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/api";
import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import { useArthavidhiCapitalLoans, ARTHAVIDHI_CAPITAL_ENDPOINTS } from "./arthavidhiCapitalData";
import "../../styles/YaMoney.css";
import "../../styles/ArthavidhiCapitalLoanBooking.css";

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 };
const input = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 6, font: "inherit", width: "100%", boxSizing: "border-box" };
const buttons = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 };
const norm = v => String(v || "").trim().toLowerCase().replace(/[ -]+/g, "_");

function MandateAndEsign({ loan, onSaved }) {
  const [completion,setCompletion]=useState(loan);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const todayDate=new Date(`${today}T00:00:00Z`);
  const [startDate,setStartDate]=useState(new Date(Date.UTC(todayDate.getUTCFullYear(),todayDate.getUTCMonth()+1,5)).toISOString().slice(0,10));
  const [accountType,setAccountType]=useState("savings");
  const mandateDialog=useRef(null);
  const [activeAction,setActiveAction]=useState("");
  const root=`/arthavidhi-capital/${encodeURIComponent(loan.lan)}`;
  const finalTermsSaved=["signing_pending","ops_initiate","approved"].includes(norm(loan.status));
  const canInitiate=norm(loan.status)==="signing_pending";
  const collectionStart=new Date(`${startDate}T00:00:00Z`);
  const finalCollectionDate=Number.isFinite(collectionStart.getTime()) && Number(loan.loan_tenure)>0
    ? new Date(Date.UTC(collectionStart.getUTCFullYear(),collectionStart.getUTCMonth()+Number(loan.loan_tenure)-1,5)).toISOString().slice(0,10) : "";
  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); setMessage("Customer link copied."); }
    catch { setError("Unable to copy the link. Use Open link to access it."); }
  }
  function openMandateDialog() {
    setError(""); setMessage("");
    if (!loan.account_number || !loan.ifsc || !loan.name_in_bank || !loan.mobile_number) {
      setError("Save the customer's bank details and mobile number before sending the mandate."); return;
    }
    if (!Number.isFinite(collectionStart.getTime()) || collectionStart.getUTCDate()!==5 || startDate<today) {
      setError("Choose a collection date on the 5th, today or later."); return;
    }
    mandateDialog.current?.showModal();
  }
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>api.get(`${root}/completion-status`,{signal:controller.signal})
      .then(({data})=>{setCompletion(data.data);if(data.data.status && data.data.status!==loan.status)onSaved();})
      .catch(e=>{if(e.code!=="ERR_CANCELED")setError(e.response?.data?.message||"Unable to refresh mandate and e-sign status.");});
    refresh();
    return ()=>controller.abort();
  },[root, loan.status, onSaved]);
  async function run(action) {
    if(busy)return;
    setBusy(true);setActiveAction(action);setError("");setMessage("");
    try {
      if(action!=="refresh"){
        let data;
        if(action==="mandate"){
          const prepared=await api.post(`${root}/mandate-details`,{start_date:startDate,account_type:accountType});
          if(prepared.data.success===false)throw new Error(prepared.data.message||"Unable to prepare mandate details.");
          if(prepared.data.already_initiated)data=prepared.data;
          else ({data}=await api.post("/enach/create-mandate",prepared.data.data));
        }else ({data}=await api.post(`${root}/${action}`,{}));
        if(data.success===false)throw new Error(data.message || "The provider did not confirm this request.");
        if(action==="mandate")mandateDialog.current?.close();
        setMessage(data.message || (action==="esign"?"Agreement sent for customer signing.":"Mandate request saved."));
      }
      const {data}=await api.get(`${root}/completion-status`);
      setCompletion(data.data);
      if(data.data.status && data.data.status!==loan.status)onSaved();
    }catch(e){setError(e.response?.data?.message||e.message||"Unable to complete this request. Check the provider configuration.");}
    finally{setBusy(false);setActiveAction("");}
  }
  return <div style={{borderTop:"1px solid #e2e8f0",marginTop:22,paddingTop:22}}>
    <h3>2. Send agreement &amp; mandate</h3><p>Send both links from here. The customer completes them on their phone. Use Refresh Status after the customer completes authorisation.</p>{!finalTermsSaved && <p role="status"><strong>Complete step 1 first.</strong> Save the loan and bank details above to enable these buttons.</p>}
    <div style={grid}>
      <section className="avcl-authorisation-card"><h4>Digio eNACH</h4><p>Status: <strong>{completion.mandate_status || "NOT_INITIATED"}</strong></p><p>UMRN: {completion.mandate_umrn || "Awaiting registration"}</p>
        {canInitiate && completion.mandate_can_send && <div style={grid}><label>Account type<select style={input} disabled={busy} value={accountType} onChange={e=>setAccountType(e.target.value)}><option value="savings">Savings</option><option value="current">Current</option></select></label><label>First collection date (5th)<input style={input} disabled={busy} type="date" min={today} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Monthly EMI (INR)<input style={input} readOnly value={loan.emi_amount ?? ""}/></label><label>Final collection date<input style={input} type="date" readOnly value={finalCollectionDate}/></label><label>Frequency<input style={input} readOnly value="Monthly"/></label></div>}
        <div style={buttons}><button type="button" className="ym-action-button ym-action-approve" disabled={busy||!canInitiate||!completion.mandate_can_send||!startDate} onClick={openMandateDialog}>{activeAction==="mandate"?"Sending link...":completion.mandate_ready?"eNACH UMRN Done":completion.mandate_auth_url&&!completion.mandate_can_send?"eNACH Link Sent":"Send eNACH Link"}</button>
          <button type="button" className="ym-action-button ym-action-muted" disabled={busy||!completion.mandate_auth_url||completion.mandate_ready} onClick={()=>copyLink(completion.mandate_auth_url)}>Copy Link</button>
          {completion.mandate_auth_url && !completion.mandate_ready && <a className="ym-action-button ym-action-muted" href={completion.mandate_auth_url} target="_blank" rel="noopener noreferrer">Open Link</a>}</div>
        {!completion.mandate_ready && completion.mandate_block_reason && <p>{completion.mandate_block_reason}</p>}
      </section>
      <section className="avcl-authorisation-card"><h4>Agreement eSign</h4><p>Status: <strong>{completion.agreement_esign_status || "PENDING"}</strong></p><p>Signing link will be emailed to {loan.email || "the customer (email missing - add it before sending)"}. Agreement uses the saved final loan terms.</p>
        <div style={buttons}><button type="button" className="ym-action-button ym-action-approve" disabled={busy||!completion.agreement_esign_can_send||norm(loan.status)!=="signing_pending"} onClick={()=>run("esign")}>Email agreement signing link</button>
          {completion.agreement_sign_url && completion.agreement_esign_status!=="SIGNED" && <a className="ym-action-button ym-action-muted" href={completion.agreement_sign_url} target="_blank" rel="noopener noreferrer">Open customer signing link</a>}</div>
      </section>
    </div>
    <dialog ref={mandateDialog} className="avcl-mandate-dialog" aria-labelledby="avcl-mandate-title" onCancel={event=>{if(busy)event.preventDefault();}}>
      <h2 id="avcl-mandate-title">Confirm eNACH Mandate</h2>
      <p>The customer will receive an authorisation link for this saved repayment account.</p>
      <dl className="avcl-mandate-summary">{[
        ["LAN",loan.lan],["Customer",loan.customer_name],["Mobile",loan.mobile_number],
        ["Account holder",loan.name_in_bank],["Bank",loan.bank_name],
        ["Account number",loan.account_number],["IFSC",loan.ifsc],
        ["Account type",accountType],["Monthly EMI (INR)",loan.emi_amount],
        ["First collection",startDate],["Final collection",finalCollectionDate],["Frequency","Monthly"],
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      <p>The mandate limit is calculated from the saved repayment schedule. Creating a link does not mean the mandate is active.</p>
      {error && <p className="ym-error" role="alert">{error}</p>}
      <div style={buttons}><button type="button" className="ym-action-button ym-action-muted" disabled={busy} onClick={()=>mandateDialog.current?.close()}>Cancel</button>
        <button type="button" className="ym-action-button ym-action-approve" disabled={busy||!canInitiate||!completion.mandate_can_send} onClick={()=>run("mandate")}>{activeAction==="mandate"?"Sending link...":"Confirm & Send eNACH Link"}</button></div>
    </dialog>
    <div style={buttons}><button type="button" className="ym-action-button ym-action-muted" disabled={busy} onClick={()=>run("refresh")}>Refresh Status</button></div>
    {error && <div className="ym-error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
    <p>{completion.status==="ops_initiate" || completion.status==="approved" ? "Customer authorisations are complete. This case is now in Operations review." : "This case stays here until the agreement is signed and the mandate is active with a UMRN. It then moves to Ops Maker automatically."}</p>
  </div>;
}

function parsePolicy(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }

// Reuse this file's case actions for the dedicated signing screen.
export function ArthavidhiCapitalSigning() {
  const [params, setParams] = useSearchParams();
  const lan = params.get("lan") || "";
  const { rows, totalRows, loading, error, refresh } = useArthavidhiCapitalLoans({ endpoint: ARTHAVIDHI_CAPITAL_ENDPOINTS.signing });
  const [loan, setLoan] = useState(null);
  const [caseError, setCaseError] = useState("");
  const [caseLoading, setCaseLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => { setRevision(value => value + 1); refresh(); }, [refresh]);
  useEffect(() => {
    if (!lan) return;
    const controller = new AbortController();
    setCaseLoading(true); setCaseError(""); setLoan(null);
    api.get(`/arthavidhi-capital/customer-details/${encodeURIComponent(lan)}`, {signal: controller.signal})
      .then(({data}) => setLoan(data.data))
      .catch(error => { if (!controller.signal.aborted) setCaseError(error.response?.data?.message || "Unable to load this case."); })
      .finally(() => { if (!controller.signal.aborted) setCaseLoading(false); });
    return () => controller.abort();
  }, [lan, revision]);
  if (lan) return <section className="ym-page">
    <button type="button" className="ym-refresh-button" onClick={() => setParams({})}>Back to E-sign &amp; Mandate cases</button>
    <h1>E-sign &amp; Mandate — {lan}</h1>
    {caseLoading && <p role="status">Loading case...</p>}
    {caseError && <p className="ym-error" role="alert">{caseError}</p>}
    {loan && <><h2>{loan.customer_name}</h2>
      {["ops_initiate","approved","disbursed"].includes(norm(loan.status)) && <p role="status">This case has moved to Operations. <Link to="/arthavidhi-capital/ops-maker">Open Ops Maker</Link></p>}
      <ArthavidhiCapitalActions key={`${loan.lan}:${loan.status}`} loan={loan} onSaved={reload}/>
    </>}
  </section>;
  return <ArthavidhiCapitalTable title="Arthavidhi Capital E-sign & Mandate"
    rows={rows} totalRows={totalRows} loading={loading} error={error} onRefresh={refresh}
    caseDetailsPath="/arthavidhi-capital/signing"
    renderActions={row => <div><p>Agreement: {row.agreement_esign_status || "PENDING"}<br/>Mandate: {row.mandate_status || "NOT_INITIATED"}</p><Link className="ym-action-button ym-action-approve" to={`/arthavidhi-capital/signing?lan=${encodeURIComponent(row.lan)}`}>Open signing &amp; mandate</Link></div>}
    exportFileName="arthavidhi_capital_signing"/>;
}

export default function ArthavidhiCapitalActions({ loan, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [final, setFinal] = useState({
    loan_amount: Number(loan.arthavidhi_capital_final_offer) > 0
      ? Math.min(Number(loan.requested_amount ?? loan.loan_amount), Number(loan.arthavidhi_capital_final_offer))
      : loan.requested_amount ?? loan.loan_amount ?? "",
    loan_tenure: parsePolicy(loan.arthavidhi_capital_policy_inputs).tenure_months || (loan.tenure_unit === "months" ? loan.loan_tenure : "") || "", interest_rate: parsePolicy(loan.arthavidhi_capital_policy_inputs).proposed_interest_rate ?? loan.interest_rate ?? "",
    insurance_amount: loan.insurance_amount ?? 0, pre_emi_interest: loan.pre_emi_interest ?? 0,
    processing_fee: loan.processing_fee ?? 0, agreement_date: loan.agreement_date ? String(loan.agreement_date).slice(0, 10) : "",
    email: loan.email || "", bank_name: loan.bank_name || "", name_in_bank: loan.name_in_bank || "", account_number: loan.account_number || "", ifsc: loan.ifsc || "",
  });
  const state = norm(loan.status);
  const tenureBand = Number(final.loan_amount) <= 25000 ? [6, 12] : Number(final.loan_amount) <= 50000 ? [9, 18] : [12, 18];
  const policyResult=parsePolicy(loan.arthavidhi_capital_policy_result);
  const syntheticBureau=policyResult.synthetic===true;
  const bureauMissing=loan.check_configuration?.bureau?.ready===false&&!syntheticBureau;
  const breApproved=policyResult.eligible===true || (!Object.keys(policyResult).length && norm(loan.arthavidhi_capital_bre_status)==="bre_approved");
  const breReason=syntheticBureau?"UAT demo: evaluated using synthetic score and credit history. This is not an actual bureau verification and cannot authorise credit or payout.":bureauMissing?"Bureau configuration is incomplete. Credit eligibility has not been confirmed.":policyResult.pending?.includes("BUREAU_SCORE_MISSING")||policyResult.pending?.includes("BUREAU_REPORT_REQUIRED")?"Bureau report is unavailable. Complete the bureau check first.":policyResult.pending?.length?"Required policy data is incomplete. Credit eligibility has not been confirmed.":loan.arthavidhi_capital_bre_reason;
  const early = ["login", "bre_approved", "credit_initiated", "policy_review", "aml_review"].includes(state);
  const missingBureau = state === "bre_rejected" && String(loan.arthavidhi_capital_bre_reason || loan.bre_reason || "").trim() === "bureau_score is required";
  async function act(method, path, payload, message, confirmation) {
    if (busy || (confirmation && !window.confirm(confirmation))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await api[method](`/arthavidhi-capital/${encodeURIComponent(loan.lan)}/${path}`, payload);
      if(data.success === false)setError(data.message || "The requested check is not complete.");
      else setNotice(data.message || message);
      onSaved();
    } catch (e) { setError(e.response?.data?.message || "Unable to process this action. Check the API connection."); }
    finally { setBusy(false); }
  }
  return <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22 }}>
    <h2 style={{ marginTop: 0, fontSize: 19 }}>Case actions</h2>
    {["credit_approved","signing_pending","ops_initiate","approved"].includes(state) && <div style={{padding:16,background:"#eff6ff",borderRadius:8,marginBottom:20}} role="status">
      <strong>{state === "credit_approved" ? "Next: save loan and bank details" : state === "signing_pending" ? "Next: send agreement and mandate links to the customer" : state === "ops_initiate" ? "Next: Ops Maker review" : "Next: Ops Checker payment approval"}</strong>
      <p style={{marginBottom:0}}>1. Loan &amp; bank details → 2. Customer agreement &amp; mandate → 3. Operations review</p>
    </div>}
    <details open={!["credit_approved","signing_pending","ops_initiate","approved","disbursed"].includes(state)}>
    <summary style={{cursor:"pointer",marginBottom:16}}>Eligibility checks &amp; documents</summary>
    {loan.can_edit_booking&&state==="draft"&&<p><Link to={`/arthavidhi-capital/new?lan=${encodeURIComponent(loan.lan)}`}>Resume draft booking</Link></p>}
    {state==="bre_approved"&&<p>Next: <Link to={`/arthavidhi-capital/partner-credit?lan=${encodeURIComponent(loan.lan)}`}>Partner Credit Review</Link>. Internal credit review starts after partner approval.</p>}
    {state==="partner_approved"&&<p>Partner review complete. This case is waiting in the internal Credit Team.</p>}
    {loan.check_configuration && ["bureau","aml"].filter(key=>!loan.check_configuration[key]?.ready).map(key=><p key={key} role="status">{key.toUpperCase()} configuration required: {loan.check_configuration[key]?.missingFields?.join(", ")}. Configure these in Backend/.env and restart the backend.</p>)}
    {state === "draft" && <p>This application is incomplete. <Link to={`/arthavidhi-capital/new?lan=${encodeURIComponent(loan.lan)}`}>Resume booking</Link> to complete the details. Eligibility checks start after you submit it.</p>}
    {missingBureau && <div><p>The bureau check did not provide a score. Retry the bureau request for this same case. If eligibility passes, clear the AML error using Run / refresh AML before credit review.</p><button type="button" className="ym-action-button ym-action-muted" disabled={busy} onClick={() => act("post", "retry-bureau", {}, "Bureau check completed.", "Retry the bureau check for this case? Booking and FLDG availability will be rechecked.")}>Retry missing bureau check</button></div>}
    <div style={{ ...grid, marginBottom: 18 }}>{[
      ["BRE result", syntheticBureau?`${loan.arthavidhi_capital_bre_status} (UAT DEMO)`:bureauMissing?"BRE PENDING":loan.arthavidhi_capital_bre_status], ["BRE reason", breReason],
      ["Eligible amount", breApproved&&!bureauMissing?loan.arthavidhi_capital_final_offer:"Pending evaluation"], 
      ["AML", loan.aml_status], ["AML reason", loan.aml_reason], ["Agreement", loan.agreement_esign_status],
    ].map(([k, v]) => <div key={k}><small style={{ color: "#64748b" }}>{k}</small><p style={{ margin: "6px 0", overflowWrap: "anywhere" }}>{v ?? "Pending"}</p></div>)}</div>
    <Link className="ym-action-button ym-action-muted" to={`/documents/${encodeURIComponent(loan.lan)}`}>Open Documents & KYC</Link>
    {early && <div style={buttons}>
      <button type="button" className="ym-action-button ym-action-muted" disabled={busy} onClick={() => act("post", "run-bre", {}, "Eligibility refreshed.")}>Refresh eligibility</button>
      <button type="button" className="ym-action-button ym-action-muted" disabled={busy} onClick={() => act("post", "retry-bureau", {}, "Bureau check completed.", "Request a new bureau check for this customer?")}>Retry bureau</button>
    </div>}    {["login", "bre_approved", "credit_initiated", "policy_review", "aml_review", "credit_approved", "ops_initiate"].includes(state) && <div style={buttons}><button className="ym-action-button ym-action-muted" disabled={busy} onClick={() => act("post", "aml-screening", {}, "AML screening completed.")}>Run / refresh AML</button></div>}
    </details>
    {error && <div className="ym-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    {state === "credit_approved" && <form onSubmit={e => { e.preventDefault(); act("patch", "final-details", final, "Final loan details saved."); }}>
      <h3>1. Loan &amp; bank details</h3><p>Confirm the approved terms and the customer's repayment bank account. Save once, then send the signing and mandate links below. Monthly EMI is calculated automatically.</p>
      <p>For this amount, choose a tenure of <strong>{tenureBand[0]}–{tenureBand[1]} months</strong>. Loan amount must be INR 10,000–1,00,000 and cannot exceed the booked amount.</p>
      <fieldset disabled={busy} style={{ ...grid, border: 0, padding: 0 }}>{[
        ["loan_amount", "Approved amount (₹)", "number"], ["loan_tenure", "Tenure (months)", "number"],
        ["interest_rate", "Annual interest rate (%)", "number"], ["processing_fee", "Processing fee (₹)", "number"],
        ["insurance_amount", "Insurance amount (INR)", "number"], ["pre_emi_interest", "Pre-EMI interest (INR)", "number"],
        ["agreement_date", "Sanction date", "date"], ["bank_name", "Bank name"], ["name_in_bank", "Account holder name"],
        ["account_number", "Account number"], ["ifsc", "IFSC"], ["email", "Customer email (signing link)", "email"],
      ].map(([name, title, type = "text"]) => <label key={name} style={{ display: "grid", gap: 8, fontSize: 13 }}>{title} *<input style={input} name={name} type={type} required value={final[name]} onChange={e => setFinal(v => ({ ...v, [name]: e.target.value }))} {...(type === "number" ? { min: name === "loan_tenure" ? tenureBand[0] : name === "loan_amount" ? 10000 : 0, max: name === "loan_tenure" ? tenureBand[1] : name === "loan_amount" ? 100000 : undefined, step: name === "loan_tenure" ? 1 : "0.01" } : {})} /></label>)}</fieldset>
      <div style={buttons}><button className="ym-action-button ym-action-approve" disabled={busy}>Save final terms & enable customer signing</button></div>
    </form>}
    {["signing_pending","ops_initiate","approved"].includes(state) && <div style={{marginTop:20}}><h3>1. Loan &amp; bank details saved</h3><p>Customer signing and mandate status appear below.</p></div>}
    {["credit_approved","signing_pending","ops_initiate","approved"].includes(state) && <MandateAndEsign loan={loan} onSaved={onSaved}/>}
    {["bre_approved", "credit_initiated"].includes(state) && <p>Review the case, then approve or reject from the <Link to="/arthavidhi-capital/credit-team">Credit Team screen</Link>.</p>}
    {state === "ops_initiate" && <p>Complete borrower PAN, Aadhaar, bureau, AML and agreement signing, then review from the <Link to="/arthavidhi-capital/ops-maker">Ops Maker screen</Link>.</p>}
    {state === "approved" && <p>A different staff member must approve the case for manual payment from the <Link to="/arthavidhi-capital/ops-checker">Ops Checker screen</Link>.</p>}
    {state === "disburse_initiate" && <p>Checker approved. Finance must transfer the saved net disbursement manually, then upload the bank UTR from Upload UTR. RPS is generated after that confirmation.</p>}
    {loan.repayments?.length > 0 && <div style={{ overflowX: "auto", marginTop: 22 }}><h3>Monthly repayment schedule</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}><thead><tr>{["Due date", "Instalment", "Interest", "Principal", "Remaining", "Status", "DPD"].map(k => <th key={k} style={{ padding: 10 }}>{k}</th>)}</tr></thead>
        <tbody>{loan.repayments.map((r, i) => <tr key={r.id || i}>{[String(r.due_date).slice(0, 10), r.emi, r.interest, r.principal, r.remaining_emi, r.status, r.dpd ?? 0].map((v, j) => <td key={j} style={{ padding: 10, borderTop: "1px solid #e2e8f0" }}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
