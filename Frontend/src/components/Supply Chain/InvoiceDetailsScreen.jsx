import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const InvoiceDetailsScreen = ({ title = "Invoice Details" }) => {

  const { invoice_number } = useParams();
  const decodedInvoiceNumber = decodeURIComponent(invoice_number);

  const [rows, setRows] = useState([]);
  const [rps, setRps] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);

  const abortRef = useRef(null);


  const fetchData = useCallback(async () => {

    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr("");

    try {

      const [dailyRes, rpsRes] = await Promise.all([

        api.get("/supply-chain/invoices/daily-demand", {
  params: {
    invoice_number: decodedInvoiceNumber,
    page,
    pageSize,
  },
  signal: ctrl.signal,
}),

api.get("/supply-chain/invoices/rps", {
  params: {
    invoice_number: decodedInvoiceNumber,
  },
  signal: ctrl.signal,
}),

      ]);

      const dailyData = dailyRes.data;

      if (dailyData?.rows) {
        setRows(dailyData.rows);
        setTotalRows(dailyData.pagination?.total ?? dailyData.rows.length);
      } else {
        setRows(dailyData);
        setTotalRows(dailyData.length);
      }

      setRps(rpsRes.data || null);

    } catch (e) {

      if (e?.code === "ERR_CANCELED") return;

      console.error("Invoice details fetch error:", e);
      setErr("Failed to fetch invoice details");

    } finally {
      setLoading(false);
    }

  }, [decodedInvoiceNumber, page, pageSize]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const columns = [

    {
  key: "daily_date",
  header: "Date",
  sortable: true,
  render: (r) =>
    r.daily_date
      ? new Date(r.daily_date).toLocaleDateString("en-GB")
      : "—",
  sortAccessor: (r) =>
    r.daily_date ? Date.parse(r.daily_date) : 0,
  width: 150,
},

    {
      key: "remaining_principal",
      header: "Remaining Principal",
      sortable: true,
      render: (r) =>
        Number(r.remaining_principal || 0)
          .toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r.remaining_principal || 0),
      width: 180,
    },

    {
      key: "remaining_interest",
      header: "Remaining Interest",
      sortable: true,
      render: (r) =>
        Number(r.remaining_interest || 0)
          .toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r.remaining_interest || 0),
      width: 180,
    },

    {
      key: "remaining_penal_interest",
      header: "Penal Interest",
      sortable: true,
      render: (r) =>
        Number(r.remaining_penal_interest || 0)
          .toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r.remaining_penal_interest || 0),
      width: 180,
    },

    {
      key: "total_amount_demand",
      header: "Total Demand",
      sortable: true,
      render: (r) =>
        Number(r.total_amount_demand || 0)
          .toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r.total_amount_demand || 0),
      width: 170,
    },

    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => {

        const styles = {
          Paid: {
            bg: "rgba(16,185,129,.12)",
            fg: "#065f46",
          },
          Due: {
            bg: "rgba(234,179,8,.12)",
            fg: "#713f12",
          },
          Late: {
            bg: "rgba(239,68,68,.12)",
            fg: "#7f1d1d",
          },
        };

        const s = styles[r.status] || {
          bg: "#eef2ff",
          fg: "#3730a3",
        };

        return (
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: s.bg,
              color: s.fg,
            }}
          >
            {r.status ?? "—"}
          </span>
        );
      },
      sortAccessor: (r) =>
        String(r?.status || "").toLowerCase(),
      width: 140,
    },

  ];


  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching invoice details…"
      />

      {err && (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>
          {err}
        </p>
      )}


      {/* RPS SUMMARY CARD */}

      {rps && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ marginBottom: 12 }}>
            Repayment Summary (RPS)
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
              gap: 10,
              fontSize: 14,
            }}
          >
            {/* <Info label="Collection Date" value={rps.collection_date} /> */}
            <Info
  label="Collection Date"
  value={
    rps.collection_date
      ? new Date(rps.collection_date).toLocaleDateString("en-IN")
      : "—"
  }
/>
            <Info label="Collection UTR" value={rps.collection_utr} />
            <Info label="Total Collected" value={formatCurrency(rps.total_collected)} />
            <Info label="Allocated Principal" value={formatCurrency(rps.allocated_principal)} />
            <Info label="Allocated Interest" value={formatCurrency(rps.allocated_interest)} />
            <Info label="Allocated Penal Interest" value={formatCurrency(rps.allocated_penal_interest)} />
            <Info label="Excess Payment" value={formatCurrency(rps.excess_payment)} />
          </div>
        </div>
      )}


      {/* DAILY DEMAND TABLE */}

      <DataTable
        title={`${title} (${invoice_number})`}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "daily_date",
          "status",
        ]}
        initialSort={{
          key: "daily_date",
          dir: "desc",
        }}
        exportFileName="invoice_daily_demand"
        initialPageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        serverPagination={true}
        totalRows={totalRows}
        currentPage={page}
        onPageChange={setPage}
        onPageSizeChange={(n) => setPageSize(n)}
      />
    </>
  );
};


function Info({ label, value }) {
  return (
    <div>
      <strong>{label}:</strong>{" "}
      <span>{value ?? "—"}</span>
    </div>
  );
}


function formatCurrency(val) {

  if (!val) return "₹0";

  return Number(val).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

}

export default InvoiceDetailsScreen;