import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const AllocationListScreen = ({ title = "Allocation Ledger" }) => {

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

    api.get(`/supply-chain/customers/${lan}/allocation`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        setRows(res.data || []);
      })
      .catch((e) => {

        if (e?.code === "ERR_CANCELED") return;

        console.error("Allocation fetch error:", e);
        setErr("Failed to fetch allocation data");

      })
      .finally(() => setLoading(false));

  }, [lan]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const columns = [

    {
      key: "invoice_number",
      header: "Invoice Number",
      sortable: true,
      width: 220,
    },

    {
  key: "collection_date",
  header: "Collection Date",
  sortable: true,
  render: (r) =>
    r.collection_date
      ? new Date(r.collection_date).toLocaleDateString("en-IN")
      : "—",
  sortAccessor: (r) =>
    r.collection_date ? Date.parse(r.collection_date) : 0,
  width: 160,
},

    {
      key: "collection_utr",
      header: "Collection UTR",
      sortable: true,
      width: 260,
    },

    {
      key: "total_collected",
      header: "Total Collected",
      sortable: true,
      render: (r) =>
        formatCurrency(r.total_collected),
      sortAccessor: (r) =>
        Number(r.total_collected || 0),
      width: 180,
    },

    {
      key: "allocated_principal",
      header: "Principal",
      sortable: true,
      render: (r) =>
        formatCurrency(r.allocated_principal),
      sortAccessor: (r) =>
        Number(r.allocated_principal || 0),
      width: 160,
    },

    {
      key: "allocated_interest",
      header: "Interest",
      sortable: true,
      render: (r) =>
        formatCurrency(r.allocated_interest),
      sortAccessor: (r) =>
        Number(r.allocated_interest || 0),
      width: 160,
    },

    {
      key: "allocated_penal_interest",
      header: "Penal Interest",
      sortable: true,
      render: (r) =>
        formatCurrency(r.allocated_penal_interest),
      sortAccessor: (r) =>
        Number(r.allocated_penal_interest || 0),
      width: 170,
    },

    {
      key: "excess_payment",
      header: "Excess Payment",
      sortable: true,
      render: (r) =>
        formatCurrency(r.excess_payment),
      sortAccessor: (r) =>
        Number(r.excess_payment || 0),
      width: 170,
    },

  ];


  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching allocation ledger…"
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
          "invoice_number",
          "collection_utr",
        ]}
        exportFileName="allocation_ledger"
        initialPageSize={DEFAULT_PAGE_SIZE}
      />
    </>
  );
};


function formatCurrency(val) {

  return Number(val || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

}

export default AllocationListScreen;