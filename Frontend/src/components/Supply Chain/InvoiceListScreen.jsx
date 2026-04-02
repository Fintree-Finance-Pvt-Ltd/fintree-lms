import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const InvoiceListScreen = ({
  title = "Invoices",
}) => {

  const { lan } = useParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);

  const navigate = useNavigate();
  const abortRef = useRef(null);


  const fetchPage = useCallback(() => {

    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr("");

    api.get(`/supply-chain/customers/${lan}/invoices`, {
      params: { page, pageSize },
      signal: ctrl.signal,
    })
      .then((res) => {

        const data = res.data;

        if (data?.rows) {
          setRows(data.rows);
          setTotalRows(data.pagination?.total ?? data.rows.length);
        } else {
          setRows(data);
          setTotalRows(data.length);
        }

      })
      .catch((e) => {

        if (e?.code === "ERR_CANCELED") return;

        console.error("Invoice fetch error:", e);
        setErr("Failed to fetch invoices");

      })
      .finally(() => setLoading(false));

  }, [lan, page, pageSize]);


  useEffect(() => {
    fetchPage();
  }, [fetchPage]);


  const columns = [

    {
      key: "invoice_number",
      header: "Invoice Number",
      sortable: true,
      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            navigate(`/invoices/${encodeURIComponent(r.invoice_number)}`)
          }
        >
          {r.invoice_number ?? "—"}
        </span>
      ),
      sortAccessor: (r) =>
        String(r?.invoice_number || "").toLowerCase(),
      width: 200,
    },

    {
      key: "disbursement_date",
      header: "Disbursement Date",
      sortable: true,
      sortAccessor: (r) =>
        r.disbursement_date
          ? Date.parse(r.disbursement_date)
          : 0,
      width: 170,
    },

    {
      key: "due_date",
      header: "Due Date",
      sortable: true,
      sortAccessor: (r) =>
        r.due_date
          ? Date.parse(r.due_date)
          : 0,
      width: 150,
    },

    {
      key: "disbursement_amount",
      header: "Disbursement Amount",
      sortable: true,
      render: (r) =>
        Number(r.disbursement_amount || 0)
          .toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r.disbursement_amount || 0),
      width: 190,
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
      width: 190,
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
      width: 160,
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
        label="Fetching invoices…"
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
          "status",
        ]}
        initialSort={{
          key: "disbursement_date",
          dir: "desc",
        }}
        exportFileName="invoice_list"
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

export default InvoiceListScreen;