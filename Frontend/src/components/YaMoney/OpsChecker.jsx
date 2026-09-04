import { useCallback, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../../api/api";
import YaMoneyTable from "./YaMoneyTable";
import {
  getYaMoneyUser,
  useYaMoneyLoans,
  YA_MONEY_ENDPOINTS,
} from "./yaMoneyData";

const OPS_CHECKER_STATUS = ["Approved", "approved"];

const hasValue = (value) => String(value ?? "").trim() !== "";

const hasRequiredPayoutDetails = (row) =>
  Number(row?.net_disbursement || 0) > 0 &&
  hasValue(
    row?.account_number ||
      row?.bank_account_number ||
      row?.bank_ac_number ||
      row?.customer_account_number,
  ) &&
  hasValue(row?.ifsc || row?.bank_ifsc_code || row?.ifsc_code || row?.bank_ifsc);

const YaMoneyOpsCheckerScreen = () => {
  const { rows, totalRows, loading, error, setError, refresh } = useYaMoneyLoans({
    endpoint: YA_MONEY_ENDPOINTS.opsChecker,
    statuses: OPS_CHECKER_STATUS,
  });
  const [busyLan, setBusyLan] = useState("");

  const handleOpsDecision = useCallback(
    async (row, status) => {
      const isApproval = status === "APPROVED";
      const confirmed = window.confirm(
        `Are you sure you want to ${isApproval ? "approve and pay" : "reject"} ${row.lan}?`,
      );

      if (!confirmed) return;

      const user = getYaMoneyUser();
      const payload = {
        status,
        ops_checker_id: user.userId,
        ops_checker_name: user.name,
      };

      setBusyLan(row.lan);
      setError("");

      try {
        await api.put(`/loan-booking/yaMoney/${row.lan}/ops-checker-pay`, payload);
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
    (row) => {
      const payoutReady = hasRequiredPayoutDetails(row);

      return (
        <>
          <button
            type="button"
            className="ym-action-button ym-action-approve"
            onClick={() => handleOpsDecision(row, "APPROVED")}
            disabled={busyLan === row.lan || !payoutReady}
            title={
              payoutReady
                ? "Approve and initiate payout"
                : "Net disbursement, account number, and IFSC are required"
            }
          >
            <CheckCircle2 size={16} />
            Approve and Pay
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
      );
    },
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
