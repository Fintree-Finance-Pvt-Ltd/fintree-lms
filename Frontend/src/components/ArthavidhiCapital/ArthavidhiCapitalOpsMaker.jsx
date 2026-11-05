import { useCallback, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../../api/api";
import { Link } from "react-router-dom";
import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import {
  useArthavidhiCapitalLoans,
  ARTHAVIDHI_CAPITAL_ENDPOINTS,
} from "./arthavidhiCapitalData";

const OPS_MAKER_STATUS = [
  "ops-initiate",
  "ops_initiate",
  "ops initiated",
  "ops-initiated",
  "ops_initiated",
];

const ArthavidhiCapitalOpsMaker = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useArthavidhiCapitalLoans({
    endpoint: ARTHAVIDHI_CAPITAL_ENDPOINTS.opsMaker,
    statuses: OPS_MAKER_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");

  const handleMakerDecision = useCallback(
    async (row, status) => {
      const isApproval = status === "Approved";
      const confirmed = window.confirm(
        `Are you sure you want to ${isApproval ? "approve" : "reject"} ${row.lan}?`,
      );

      if (!confirmed) return;

      const reason = isApproval ? "" : window.prompt("Enter the rejection reason:");
      if (reason === null || (!isApproval && !reason.trim())) return;
      const payload = { decision: isApproval ? "approved" : "rejected", reason };
      setBusyLan(row.lan);
      setError("");

      try {
        await api.patch(`/arthavidhi-capital/${row.lan}/ops-maker-decision`, payload);
        await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            "Unable to update this Arthavidhi Capital ops maker case.",
        );
      } finally {
        setBusyLan("");
      }
    },
    [refresh, setError],
  );

  const renderActions = useCallback(
    (row) => (
      <>
        <Link className="ym-action-button ym-action-muted" to={`/arthavidhi-capital/customer-details?lan=${encodeURIComponent(row.lan)}`}>Review case</Link>
        <button
          type="button"
          className="ym-action-button ym-action-approve"
          onClick={() => handleMakerDecision(row, "Approved")}
          disabled={busyLan === row.lan}
          title="Approve the reviewed case and send it to Ops Checker"
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button
          type="button"
          className="ym-action-button ym-action-reject"
          onClick={() => handleMakerDecision(row, "rejected")}
          disabled={busyLan === row.lan}
        >
          <XCircle size={16} />
          Reject
        </button>
      </>
    ),
    [busyLan, handleMakerDecision],
  );

  return (
    <ArthavidhiCapitalTable
      title="Arthavidhi Capital Ops Maker"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="arthavidhi_capital_ops_maker"
    />
  );
};

export default ArthavidhiCapitalOpsMaker;
