import { Link } from "react-router-dom";
import { useCallback, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../../api/api";
import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import {
  getArthavidhiCapitalUser,
  useArthavidhiCapitalLoans,
  ARTHAVIDHI_CAPITAL_ENDPOINTS,
} from "./arthavidhiCapitalData";

const OPS_CHECKER_STATUS = ["Approved", "approved", "disburse_initiate"];

const hasValue = (value) => String(value ?? "").trim() !== "";

const hasRequiredPayoutDetails = (row) =>
  row.mandate_ready === true && row.agreement_esign_status === "SIGNED" &&
  Number(row?.disbursal_amount || 0) > 0 &&
  hasValue(
    row?.account_number ||
      row?.bank_account_number ||
      row?.bank_ac_number ||
      row?.customer_account_number,
  ) &&
  hasValue(row?.ifsc || row?.bank_ifsc_code || row?.ifsc_code || row?.bank_ifsc);

const ArthavidhiCapitalOpsChecker = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useArthavidhiCapitalLoans({
    endpoint: ARTHAVIDHI_CAPITAL_ENDPOINTS.opsChecker,
    statuses: OPS_CHECKER_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");

  const handleOpsDecision = useCallback(
    async (row, status) => {
      const isApproval = status === "APPROVED";
      const confirmed = window.confirm(
        `Are you sure you want to ${isApproval ? "approve for manual payment" : "reject"} ${row.lan}?`,
      );

      if (!confirmed) return;

      const user = getArthavidhiCapitalUser();
      const payload = {
        status,
        ops_checker_id: user.userId,
        ops_checker_name: user.name,
      };

      const reason = isApproval ? "" : window.prompt("Enter the rejection reason:");
      if (reason === null || (!isApproval && !reason.trim())) return;
      payload.reason = reason;
      setBusyLan(row.lan);
      setError("");

      try {
        await api.put(`/arthavidhi-capital/${row.lan}/ops-checker-decision`, payload);
        await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            "Unable to update this Arthavidhi Capital ops checker case.",
        );
      } finally {
        setBusyLan("");
      }
    },
    [refresh, setError],
  );

  const renderActions = useCallback(
    (row) => {
      const awaitingUtr = String(row.status).toLowerCase() === "disburse_initiate";
      const payoutReady = hasRequiredPayoutDetails(row);

      return (
        <>
          <button
            type="button"
            className="ym-action-button ym-action-approve"
            onClick={() => handleOpsDecision(row, "APPROVED")}
            disabled={busyLan === row.lan || !payoutReady || awaitingUtr}
            title={
              payoutReady
                ? "Approve for finance to pay manually; no payout API is called"
                : "Net disbursement, account number, and IFSC are required"
            }
          >
            <CheckCircle2 size={16} />
            {awaitingUtr ? "Awaiting Manual Payment / UTR" : "Approve for Manual Payment"}
          </button>
          <button
            type="button"
            className="ym-action-button ym-action-reject"
            onClick={() => handleOpsDecision(row, "OPS_REJECTED")}
            disabled={busyLan === row.lan}
          >
            <XCircle size={16} />
            Reject
          </button>
          {awaitingUtr && (getArthavidhiCapitalUser().pages || []).some(page=>page.path==="/upload-utr") && <Link className="ym-action-button ym-action-muted" to="/upload-utr">Upload bank UTR</Link>}
        </>
      );
    },
    [busyLan, handleOpsDecision],
  );

  return (
    <>
    <p>Approve here for manual payment only. Finance transfers the net disbursement outside this app, then uploads LAN, bank UTR and payment date in Upload UTR. RPS and Disbursed status are saved after that confirmation.</p>
    <ArthavidhiCapitalTable
      title="Arthavidhi Capital Ops Checker"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="arthavidhi_capital_ops_checker"
    />
    </>
  );
};

export default ArthavidhiCapitalOpsChecker;
