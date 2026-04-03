import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const SupplierListScreen = ({ title = "Suppliers" }) => {

  const { partner_loan_id } = useParams();

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

    api.get(`/supply-chain/customers/${partner_loan_id}/suppliers`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        setRows(res.data || []);
      })
      .catch((e) => {

        if (e?.code === "ERR_CANCELED") return;

        console.error("Supplier fetch error:", e);
        setErr("Failed to fetch suppliers");

      })
      .finally(() => setLoading(false));

  }, [partner_loan_id]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const columns = [

    {
      key: "supplier_name",
      header: "Supplier Name",
      sortable: true,
      sortAccessor: (r) =>
        String(r?.supplier_name || "").toLowerCase(),
      width: 220,
    },

    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      width: 160,
    },

    {
      key: "bank_account_number",
      header: "Account Number",
      sortable: true,
      width: 220,
    },

    {
      key: "ifsc_code",
      header: "IFSC Code",
      sortable: true,
      width: 150,
    },

    {
      key: "bank_name",
      header: "Bank Name",
      sortable: true,
      width: 200,
    },

    {
      key: "account_holder_name",
      header: "Account Holder",
      sortable: true,
      width: 220,
    },

    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => {

        const styles = {
          Active: {
            bg: "rgba(16,185,129,.12)",
            fg: "#065f46",
          },
          Inactive: {
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

    {
  key: "created_at",
  header: "Created At",
  sortable: true,
  render: (r) =>
    r.created_at
      ? new Date(r.created_at).toLocaleDateString("en-IN")
      : "—",
  sortAccessor: (r) =>
    r.created_at ? Date.parse(r.created_at) : 0,
  width: 180,
},

  ];


  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching suppliers…"
      />

      {err && (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>
          {err}
        </p>
      )}

      <DataTable
        title={`${title} (Loan ID: ${partner_loan_id})`}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "supplier_name",
          "mobile_number",
          "bank_name",
          "account_holder_name",
        ]}
        exportFileName="suppliers"
        initialPageSize={DEFAULT_PAGE_SIZE}
      />
    </>
  );
};

export default SupplierListScreen;