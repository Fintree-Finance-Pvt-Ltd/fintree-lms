import { useCallback, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../../api/api";
import YaMoneyTable from "./YaMoneyTable";
import {
  getYaMoneyUser,
  useYaMoneyLoans,
  YA_MONEY_ENDPOINTS,
  YA_MONEY_TABLE,
} from "./yaMoneyData";

const OPS_CHECKER_STATUS = ["Approved", "approved"];

const YaMoneyOpsCheckerScreen = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useYaMoneyLoans({
    endpoint: YA_MONEY_ENDPOINTS.opsChecker,
    statuses: OPS_CHECKER_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");

  const handleOpsDecision = useCallback(
    async (row, status) => {
      const isApproval = status === "Disbursed";
      const confirmed = window.confirm(
        `Are you sure you want to ${isApproval ? "approve disbursement for" : "reject"} ${row.lan}?`,
      );

      if (!confirmed) return;

      const user = getYaMoneyUser();
      const payload = {
        table: YA_MONEY_TABLE,
        status,
        stage: status,
        ops_checker_id: user.userId,
        ops_checker_name: user.name,
      };

      setBusyLan(row.lan);
      setError("");

      try {
        await api.put(`/loan-booking/approve-initiated-loans/${row.lan}`, payload);
        await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            "Unable to update this Ya Money ops checker case.",
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
        <button
          type="button"
          className="ym-action-button ym-action-approve"
          onClick={() => handleOpsDecision(row, "Disbursed")}
          disabled={busyLan === row.lan}
        >
          <CheckCircle2 size={16} />
          Disburse
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
      </>
    ),
    [busyLan, handleOpsDecision],
  );

  return (
    <YaMoneyTable
      title="Ya Money Ops Checker"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="ya_money_ops_checker"
    />
  );
};

export default YaMoneyOpsCheckerScreen;
