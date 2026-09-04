import YaMoneyTable from "./YaMoneyTable";
import { useYaMoneyLoans } from "./yaMoneyData";

const YaMoneyAllLoans = () => {
  const { rows, totalRows, loading, error, refresh } = useYaMoneyLoans();

  return (
    <YaMoneyTable
      title="Ya Money All Loans"
      rows={rows}
      totalRows={totalRows}
      loading={loading}
      error={error}
      onRefresh={refresh}
      exportFileName="ya_money_all_loans"
    />
  );
};

export default YaMoneyAllLoans;
