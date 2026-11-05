import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import { useArthavidhiCapitalLoans, ARTHAVIDHI_CAPITAL_ENDPOINTS } from "./arthavidhiCapitalData";

const ArthavidhiCapitalDisbursedLoans = () => {
  const { rows, totalRows, loading, error, refresh } = useArthavidhiCapitalLoans({
    endpoint: ARTHAVIDHI_CAPITAL_ENDPOINTS.disbursed,
    statuses: ["Disbursed", "disbursed"],
  });

  return (
    <ArthavidhiCapitalTable
      title="Arthavidhi Capital Disbursed Loans"
      rows={rows}
      totalRows={totalRows}
      loading={loading}
      error={error}
      onRefresh={refresh}
      exportFileName="arthavidhi_capital_disbursed_loans"
    />
  );
};

export default ArthavidhiCapitalDisbursedLoans;
