import { Link } from "react-router-dom";
import ArthavidhiCapitalTable from "./ArthavidhiCapitalTable";
import { useArthavidhiCapitalLoans } from "./arthavidhiCapitalData";

const ArthavidhiCapitalAllLoans = () => {
  const { rows, totalRows, loading, error, refresh } = useArthavidhiCapitalLoans();

  return (
    <ArthavidhiCapitalTable
      title="Arthavidhi Capital All Loans"
      rows={rows}
      totalRows={totalRows}
      loading={loading}
      error={error}
      onRefresh={refresh}
      renderActions={row => String(row.status).trim().toLowerCase() === "draft"
        ? <Link className="ym-action-button ym-action-approve" to={`/arthavidhi-capital/new?lan=${encodeURIComponent(row.lan)}`}>Resume draft booking</Link>
        : <Link className="ym-action-button ym-action-muted" to={`/arthavidhi-capital/${["credit_approved","signing_pending"].includes(String(row.status).trim().toLowerCase()) ? "signing" : "customer-details"}?lan=${encodeURIComponent(row.lan)}`}>Open case</Link>}
      exportFileName="arthavidhi_capital_all_loans"
    />
  );
};

export default ArthavidhiCapitalAllLoans;
