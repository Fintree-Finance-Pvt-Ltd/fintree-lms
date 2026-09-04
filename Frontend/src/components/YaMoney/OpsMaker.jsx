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

const OPS_MAKER_STATUS = [
  "ops-initiate",
  "ops_initiate",
  "ops initiated",
  "ops-initiated",
  "ops_initiated",
];

const YaMoneyOpsMakerScreen = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useYaMoneyLoans({
    endpoint: YA_MONEY_ENDPOINTS.opsMaker,
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

      const user = getYaMoneyUser();
      const payload = {
        table: YA_MONEY_TABLE,
        status,
        stage: status,
        ops_maker_id: user.userId,
        ops_maker_name: user.name,
      };

      setBusyLan(row.lan);
      setError("");

      try {
        await api.put(`/loan-booking/approve-initiated-loans/${row.lan}`, payload);
        await refresh();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            "Unable to update this Ya Money ops maker case.",
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
          onClick={() => handleMakerDecision(row, "Approved")}
          disabled={busyLan === row.lan}
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
    <YaMoneyTable
      title="Ya Money Ops Maker"
      rows={rows}
      totalRows={totalRows}
      loading={loading || Boolean(busyLan)}
      error={error}
      onRefresh={refresh}
      renderActions={renderActions}
      exportFileName="ya_money_ops_maker"
    />
  );
};

export default YaMoneyOpsMakerScreen;
