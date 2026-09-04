import { useCallback, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../../api/api";
import YaMoneyTable from "./YaMoneyTable";
import { useYaMoneyLoans, YA_MONEY_ENDPOINTS } from "./yaMoneyData";

const CREDIT_READY_STATUS = ["bre_approved"];

const YaMoneyCreditTeamScreen = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useYaMoneyLoans({
    endpoint: YA_MONEY_ENDPOINTS.creditScreen,
    statuses: CREDIT_READY_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");

  const handleDecision = useCallback(
    async (row, decision) => {
      const decisionLabel = decision === "approve" ? "approve" : "reject";
      const confirmed = window.confirm(
        `Are you sure you want to ${decisionLabel} ${row.lan}?`,
      );

      if (!confirmed) return;

      setBusyLan(row.lan);
      setError("");

      try {
        await api.patch(`/loan-booking/yaMoney/${row.lan}/credit-decision`, {
          decision,
        });
        await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            `Unable to ${decisionLabel} this Ya Money case.`,
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
    <YaMoneyTable
      title="Ya Money Credit Team"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="ya_money_credit_team"
    />
  );
};

export default YaMoneyCreditTeamScreen;
