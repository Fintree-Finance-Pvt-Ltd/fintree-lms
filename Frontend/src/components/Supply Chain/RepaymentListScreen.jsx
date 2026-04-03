import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const RepaymentListScreen = ({ title = "Repayments" }) => {

  const { lan } = useParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const abortRef = useRef(null);

  const fetchData = useCallback(() => {

    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr("");

    api.get(`/supply-chain/customers/${lan}/repayments`, {
      signal: ctrl.signal,
    })
      .then((res) => {

        setRows(res.data || []);

      })
      .catch((e) => {

        if (e?.code === "ERR_CANCELED") return;

        console.error("Repayment fetch error:", e);
        setErr("Failed to fetch repayments");

      })
      .finally(() => setLoading(false));

  }, [lan]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const columns = [

    {
  key: "collection_date",
  header: "Collection Date",
  sortable: true,
  render: (r) =>
    r.collection_date
      ? new Date(r.collection_date).toLocaleDateString("en-IN")
      : "—",
  sortAccessor: (r) =>
    r.collection_date
      ? Date.parse(r.collection_date)
      : 0,
  width: 160,
},

    {
      key: "collection_utr",
      header: "Collection UTR",
      sortable: true,
      width: 260,
    },

    {
      key: "collection_amount",
      header: "Collection Amount",
      sortable: true,
      render: (r) =>
        Number(r.collection_amount || 0)
          .toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
          }),
      sortAccessor: (r) =>
        Number(r.collection_amount || 0),
      width: 200,
    },

    {
  key: "created_at",
  header: "Created At",
  sortable: true,
  render: (r) =>
    r.created_at
      ? new Date(r.created_at).toLocaleDateString("en-IN")
      : "—",
  sortAccessor: (r) =>
    r.created_at
      ? Date.parse(r.created_at)
      : 0,
  width: 180,
},

  ];


  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching repayments…"
      />

      {err && (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>
          {err}
        </p>
      )}

      <DataTable
        title={`${title} (LAN: ${lan})`}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "collection_utr",
        ]}
        exportFileName="repayments"
        initialPageSize={DEFAULT_PAGE_SIZE}
      />
    </>
  );
};

export default RepaymentListScreen;