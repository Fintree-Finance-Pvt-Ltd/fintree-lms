import YaMoneyTable from "./YaMoneyTable";
import { useYaMoneyLoans, YA_MONEY_ENDPOINTS } from "./yaMoneyData";

const YaMoneyDisbursedLoans = () => {
  const { rows, totalRows, loading, error, refresh } = useYaMoneyLoans({
    endpoint: YA_MONEY_ENDPOINTS.disbursed,
    statuses: ["Disbursed", "disbursed"],
  });

  return (
    <YaMoneyTable
      title="Ya Money Disbursed Loans"
      rows={rows}
      totalRows={totalRows}
      loading={loading}
      error={error}
      onRefresh={refresh}
      exportFileName="ya_money_disbursed_loans"
    />
  );
};

export default YaMoneyDisbursedLoans;
