import React from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  FileText,
  Landmark,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";

const maskAccountNumber = (value) => {
  const accountNumber = String(value || "");
  if (!accountNumber) return "—";
  return `${"*".repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
};

const SampadaMandateModal = ({
  open,
  loan,
  form,
  loading,
  error,
  result,
  onChange,
  onClose,
  onSubmit,
}) => {
  if (!open) return null;

  const bankDetails = [
    ["Account Holder Name", form.account_holder_name || "—"],
    ["Bank Name", form.bank_name || "—"],
    ["Account Number", maskAccountNumber(form.account_no)],
    ["IFSC Code", form.ifsc || "—"],
  ];

  return (
    <div className="smd-backdrop">
      <div className="smd-modal" role="dialog" aria-modal="true" aria-labelledby="smd-title">
        <header className="smd-header">
          <span className="smd-main-icon"><Landmark size={27} /></span>
          <div className="smd-title"><h3 id="smd-title">Bank Details &amp; Mandate</h3><p>These bank details will be used to create the auto-debit mandate.</p></div>
          <span className="smd-lan">{loan?.lan || "Sampada"}</span>
          <button className="smd-close" type="button" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </header>

        <form className="smd-layout" onSubmit={onSubmit}>
          <section className="smd-bank-card">
            <div className="smd-section-title">
              <span className="smd-circle smd-blue"><Landmark size={20} /></span>
              <h4>Bank Details</h4>
              <span className="smd-verified"><Check size={15} /> Verified</span>
            </div>
            <p className="smd-help">These details are fetched from the loan application and cannot be edited here.</p>
            <dl className="smd-bank-list">
              {bankDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              <div>
                <dt>Account Type</dt>
                <dd>
                  <select
                    className="smd-account-type"
                    name="account_type"
                    value={form.account_type}
                    onChange={onChange}
                    aria-label="Account Type"
                  >
                    <option value="SAVINGS">SAVINGS</option>
                    <option value="CURRENT">CURRENT</option>
                  </select>
                </dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{loan?.bank_branch_address || loan?.branch_name || "—"}</dd>
              </div>
            </dl>
            <div className="smd-info"><AlertCircle size={18} /><span>This bank account will be used for the mandate. Bank details cannot be changed from this screen.</span></div>
          </section>

          <section className="smd-mandate-card">
            <div className="smd-section-title">
              <span className="smd-circle smd-green"><FileText size={20} /></span>
              <div><h4>Mandate Information</h4><p>Provide mandate details to create the auto-debit instruction.</p></div>
            </div>

            <div className="smd-fields">
              <label><span>Mandate Amount (₹)<b>*</b></span><div className="smd-control"><strong>₹</strong><input type="number" name="mandate_amount" value={form.mandate_amount} readOnly aria-readonly="true" title="Mandate amount is calculated from the loan and cannot be edited" /></div></label>
              <label><span>Frequency</span><div className="smd-control"><RotateCcw size={17} /><select name="mandate_frequency" value={form.mandate_frequency} onChange={onChange}><option value="monthly">Monthly</option></select></div></label>
              <label><span>Mandate Start Date<b>*</b></span><div className="smd-control"><CalendarDays size={17} /><input type="date" name="mandate_start_date" value={form.mandate_start_date} onChange={onChange} /></div></label>
              <label><span>Mandate End Date</span><div className="smd-control"><CalendarDays size={17} /><input type="date" name="mandate_end_date" value={form.mandate_end_date} readOnly aria-readonly="true" title="Automatically set to two years after the mandate start date" /></div></label>
            </div>

            <div className="smd-secure"><span><ShieldCheck size={21} /></span><div><strong>Secure &amp; Automated Repayments</strong><p>Once created, the mandate will be used for automatic EMI collections as per the agreed schedule.</p></div></div>
            <div className="smd-warning"><span><AlertCircle size={21} /></span><div><strong>Please Note</strong><ul><li>Mandate will be created for the above bank account.</li><li>Ensure the account has sufficient balance on due dates.</li></ul></div></div>

            {error && <p className="smd-error">{error}</p>}
            {result && <div className="smd-result"><div>Verified: <b>{result.verified ? "YES" : "NO"}</b></div>{result.fuzzy_score != null && <div>Fuzzy Score: {result.fuzzy_score}</div>}{result.mandate_created && <div>Mandate Created: <b>{result.document_id}</b></div>}</div>}
            <div className="smd-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={loading}>{loading ? "Processing..." : "Verify & Create Mandate"}</button></div>
          </section>
        </form>
      </div>

      <style>{`
        .smd-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.5)}
        .smd-modal{width:min(920px,96vw);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #dbe4f0;border-radius:18px;box-shadow:0 24px 64px rgba(15,23,42,.24);color:#17233b}
        .smd-header{display:flex;align-items:center;gap:15px;padding:22px 24px;border-bottom:1px solid #e3e9f2}.smd-main-icon,.smd-circle{display:grid;place-items:center;flex:0 0 auto;border-radius:50%}.smd-main-icon{width:48px;height:48px;background:#e8f0ff;color:#1760cf}.smd-title{flex:1}.smd-title h3{margin:0;color:#12376d;font-size:25px;line-height:1.2}.smd-title p{margin:4px 0 0;color:#718096;font-size:13px}.smd-lan{padding:8px 18px;border-radius:999px;background:#edf3ff;color:#305b9a;font-size:12px;font-weight:800}.smd-close{display:grid;place-items:center;padding:7px;border:0;background:transparent;color:#334155;cursor:pointer}
        .smd-layout{display:grid;grid-template-columns:minmax(300px,.88fr) minmax(380px,1.12fr);gap:16px;padding:18px;background:#fbfdff}.smd-bank-card,.smd-mandate-card{border:1px solid #e3eaf4;border-radius:12px;background:#fff}.smd-bank-card{display:flex;flex-direction:column;padding:18px;background:linear-gradient(145deg,#f7faff,#fff)}.smd-mandate-card{padding:18px}.smd-section-title{display:flex;align-items:center;gap:10px}.smd-section-title h4{margin:0;color:#173866;font-size:16px}.smd-section-title p{margin:3px 0 0;color:#7b879a;font-size:11px}.smd-circle{width:36px;height:36px}.smd-blue{background:#e8f0ff;color:#1760cf}.smd-green{background:#e4f8ed;color:#16a765}.smd-verified{display:flex;align-items:center;gap:5px;margin-left:auto;padding:7px 13px;border-radius:999px;background:#e5f7ef;color:#218761;font-size:12px;font-weight:700}.smd-help{margin:10px 0 6px;color:#6b7890;font-size:12px;line-height:1.45}
        .smd-bank-list{margin:6px 0 18px}.smd-bank-list div{display:grid;grid-template-columns:1fr 1.05fr;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid #e5ebf3}.smd-bank-list dt{color:#6c7890;font-size:12px}.smd-bank-list dd{margin:0;color:#27354d;font-size:12px;font-weight:700;overflow-wrap:anywhere}.smd-account-type{width:100%;padding:7px 9px;border:1px solid #d6deea;border-radius:6px;background:#fff;color:#27354d;font-size:12px;font-weight:700;outline:none}.smd-account-type:focus{border-color:#4f83d1;box-shadow:0 0 0 3px rgba(79,131,209,.13)}.smd-info{display:flex;align-items:flex-start;gap:9px;margin-top:auto;padding:12px;border-radius:8px;background:#eaf2ff;color:#285ba6;font-size:11px;line-height:1.45}.smd-info svg{flex:none}
        .smd-fields{display:grid;grid-template-columns:1fr 1fr;gap:18px 14px;margin-top:22px}.smd-fields label>span{display:block;margin-bottom:7px;color:#24334c;font-size:12px;font-weight:700}.smd-fields label b{color:#e53e3e;margin-left:2px}.smd-control{display:flex;align-items:center;min-height:39px;border:1px solid #d6deea;border-radius:7px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.03)}.smd-control>svg,.smd-control>strong{margin-left:12px;color:#53647c}.smd-control input,.smd-control select{width:100%;min-width:0;padding:10px;border:0;outline:0;background:transparent;color:#26354d;font-size:12px}.smd-control:has(input[readonly]){background:#f2f5f9}.smd-control input[readonly]{cursor:not-allowed}
        .smd-secure,.smd-warning{display:flex;gap:12px;margin-top:16px;padding:14px;border-radius:9px;font-size:12px}.smd-secure{background:#e7f8f0;color:#207c57}.smd-warning{background:#fff5e7;color:#9b5b16}.smd-secure>span,.smd-warning>span{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%}.smd-secure>span{background:#cbf1df;color:#0fa566}.smd-warning>span{background:#ffe6bb;color:#ee9818}.smd-secure strong,.smd-warning strong{display:block;margin-bottom:4px}.smd-secure p,.smd-warning ul{margin:0;line-height:1.5}.smd-warning ul{padding-left:17px;color:#536075}.smd-error{margin:12px 0 0;color:#b91c1c;font-size:13px}.smd-result{margin-top:12px;padding:10px;border-radius:7px;background:#ecfdf5;color:#166534;font-size:13px}.smd-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.smd-actions button{padding:9px 15px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155;font-weight:700;cursor:pointer}.smd-actions button[type=submit]{border-color:#1d5fc1;background:#1d5fc1;color:#fff}.smd-actions button:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:760px){.smd-layout{grid-template-columns:1fr}.smd-fields{grid-template-columns:1fr}.smd-title h3{font-size:20px}.smd-lan{display:none}}
      `}</style>
    </div>
  );
};

export default SampadaMandateModal;
