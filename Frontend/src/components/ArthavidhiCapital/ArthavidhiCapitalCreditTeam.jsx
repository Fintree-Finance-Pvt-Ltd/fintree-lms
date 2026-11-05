import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/api";
import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import { useArthavidhiCapitalLoans, ARTHAVIDHI_CAPITAL_ENDPOINTS } from "./arthavidhiCapitalData";

const CREDIT_READY_STATUS = ["partner_approved"];

const ArthavidhiCapitalCreditTeam = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useArthavidhiCapitalLoans({
    endpoint: ARTHAVIDHI_CAPITAL_ENDPOINTS.creditScreen,
    statuses: CREDIT_READY_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");
  const navigate = useNavigate();

  const handleDecision = useCallback(
    async (row, decision) => {
      const isApproval = decision === "approve";
      const decisionLabel = decision === "approve" ? "approve" : "reject";
      let reason = "";
      if (!isApproval) {
        if (!window.confirm(`Are you sure you want to reject ${row.lan}?`)) return;
        reason = window.prompt("Enter the rejection reason:");
        if (reason === null || !reason.trim()) return;
        reason = reason.trim();
      }
      setBusyLan(row.lan);
      setError("");

      try {
        const { data } = await api.patch(`/arthavidhi-capital/${row.lan}/credit-decision`, {
          decision, reason,
        });
        if (data.success === false) throw new Error(data.message || "Credit approval could not be completed.");
        if (isApproval) {
          navigate(`/arthavidhi-capital/signing?lan=${encodeURIComponent(row.lan)}`);
        } else await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message || err.message ||
            `Unable to ${decisionLabel} this Arthavidhi Capital case.`,
        );
      } finally {
        setBusyLan("");
      }
    },
    [navigate, refresh, setError],
  );

  const renderActions = useCallback(
    (row) => (
      <>
        <button
          type="button"
          className="ym-action-button ym-action-approve"
          onClick={() => handleDecision(row, "approve")}
          disabled={busyLan === row.lan}
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button
          type="button"
          className="ym-action-button ym-action-reject"
          onClick={() => handleDecision(row, "reject")}
          disabled={busyLan === row.lan}
        >
          <XCircle size={16} />
          Reject
        </button>
      </>
    ),
    [busyLan, handleDecision],
  );

  return (
    <>
    <ArthavidhiCapitalTable
      title="Arthavidhi Capital Credit Team"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="arthavidhi_capital_credit_team"
    />
    </>
  );
};

export default ArthavidhiCapitalCreditTeam;

// Partner review precedes the existing internal Credit Team. Reuse the product's table and APIs.
export function ArthavidhiCapitalPartnerCreditReview() {
  const [params,setParams]=useSearchParams();
  const lan=params.get("lan")||"";
  const {rows,totalRows,loading,error,setError,refresh}=useArthavidhiCapitalLoans({endpoint:ARTHAVIDHI_CAPITAL_ENDPOINTS.partnerCredit,statuses:["bre_approved"]});
  const [loan,setLoan]=useState(null),[terms,setTerms]=useState({}),[reason,setReason]=useState("");
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{
    setLoan(null);setReason("");setError("");
    if(!lan)return;
    const controller=new AbortController();
    api.get(`/arthavidhi-capital/customer-details/${encodeURIComponent(lan)}`,{signal:controller.signal}).then(({data})=>{
      const row=data.data;
      if(row.status!=="bre_approved")throw new Error("This case is not waiting for partner review.");
      setLoan(row);setTerms({loan_amount:row.loan_amount??row.requested_amount,loan_tenure:row.loan_tenure??"",interest_rate:row.interest_rate??row.interest??"",processing_fee:row.processing_fee??0});
    }).catch(failure=>{if(failure.code!=="ERR_CANCELED")setError(failure.response?.data?.message||failure.message);});
    return ()=>controller.abort();
  },[lan,setError]);
  async function decide(decision){
    if(busy||!loan)return;
    if(decision==="reject"&&!reason.trim()){setError("Enter a reason before rejecting this case.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const {data}=await api.patch(`/arthavidhi-capital/${encodeURIComponent(lan)}/partner-review-decision`,{decision,terms,reason});
      if(!data.success)throw new Error(data.message||"Partner review could not be saved.");
      setNotice(decision==="approve"?`${lan} approved by partner and sent to the internal Credit Team.`:decision==="reject"?`${lan} rejected by partner.`:"Reviewed terms saved. This case still requires partner approval.");
      if(decision!=="save"){setParams({});setLoan(null);}
      await refresh();
    }catch(failure){setError(failure.response?.data?.message||failure.message);}
    finally{setBusy(false);}
  }
  const profile=loan?[
    ["Customer",loan.customer_name],["Mobile",loan.mobile_number],["Business name",loan.business_name],["Business type",loan.company_type||loan.business_type],
    ["Industry / activity",loan.industry],["Business vintage (years)",loan.business_vintage],["Annual turnover (INR)",loan.annual_turnover],["Monthly revenue (INR)",loan.monthly_revenue],
    ["Business address",loan.business_address],["City / state / PIN",[loan.business_city,loan.business_state,loan.business_pincode].filter(Boolean).join(", ")],
    ["GST",loan.gst_number],["Udyam",loan.udyam_registration||loan.udyam_number],["Requested amount (INR)",loan.requested_amount],["BRE result",loan.arthavidhi_capital_bre_status],["AML",loan.aml_status],
  ]:[];
  return <>
    {notice&&<p role="status" style={{padding:16}}>{notice}</p>}
    {lan&&!loan&&!error&&<p role="status">Loading business profile...</p>}
    {loan&&<section className="ym-page" aria-label="Partner business review">
      <h2>Partner review — {loan.lan}</h2><p>Original booking and identity are read-only. Review the business and proposed terms before sending the case to the internal Credit Team.</p>
      <dl style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>{profile.map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{margin:"6px 0",overflowWrap:"anywhere"}}>{value??"Not provided"}</dd></div>)}</dl>
      <fieldset disabled={busy} style={{border:0,padding:0}}><legend>Partner-reviewed terms</legend>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>{[["loan_amount","Loan amount (INR)"],["loan_tenure","Tenure (months)"],["interest_rate","Annual interest (%)"],["processing_fee","Processing fee (INR)"]].map(([key,label])=><label key={key}>{label}<input style={{display:"block",width:"100%",padding:10,boxSizing:"border-box"}} type="number" min="0" step={key==="loan_tenure"?"1":"0.01"} value={terms[key]??""} onChange={event=>setTerms(previous=>({...previous,[key]:event.target.value}))}/></label>)}</div>
        <label style={{display:"block",margin:"16px 0"}}>Review notes / rejection reason<textarea style={{display:"block",width:"100%",boxSizing:"border-box"}} rows={3} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
        <div className="ym-actions"><button className="ym-action-button ym-action-muted" type="button" onClick={()=>decide("save")}>Save reviewed terms</button><button className="ym-action-button ym-action-approve" type="button" onClick={()=>decide("approve")}>Approve & send to internal Credit Team</button><button className="ym-action-button ym-action-reject" type="button" onClick={()=>decide("reject")}>Reject</button></div>
      </fieldset>
    </section>}
    <ArthavidhiCapitalTable title="Arthavidhi Capital Partner Credit Review" rows={rows} totalRows={totalRows} loading={loading||busy} error={error} onRefresh={refresh} caseDetailsPath="/arthavidhi-capital/partner-credit" renderActions={row=><Link className="ym-action-button ym-action-muted" to={`/arthavidhi-capital/partner-credit?lan=${encodeURIComponent(row.lan)}`}>Review business profile</Link>} exportFileName="arthavidhi_partner_credit_review"/>
  </>;
}
