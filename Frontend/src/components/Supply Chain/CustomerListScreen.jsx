// components/CustomerListScreen.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const PARTNERS = [
  { label: "Fintree", prefix: "FFPL" },
  { label: "Kite", prefix: "KITE" },
  { label: "Muthoot", prefix: "MFL" },
];

const CustomerListScreen = ({
  apiEndpoint = "/supply-chain/customers",
  title = "Customers",
}) => {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);

  const [selectedPartner, setSelectedPartner] = useState("FFPL");

  const navigate = useNavigate();
  const abortRef = useRef(null);


  const fetchPage = useCallback(() => {

    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr("");

    api.get(apiEndpoint, {
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

        console.error("Customer fetch error:", e);
        setErr("Failed to fetch customers");

      })
      .finally(() => setLoading(false));

  }, [apiEndpoint, page, pageSize]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);


  /*
  ---------------------------------------
  PARTNER FILTERING
  ---------------------------------------
  */

  const filteredRows = useMemo(() => {
    return rows.filter((r) =>
      r.lan?.startsWith(selectedPartner)
    );
  }, [rows, selectedPartner]);


  /*
  ---------------------------------------
  PARTNER COUNTS
  ---------------------------------------
  */

  const partnerCounts = useMemo(() => {

    const counts = {};

    PARTNERS.forEach((p) => {
      counts[p.prefix] = rows.filter(
        (r) => r.lan?.startsWith(p.prefix)
      ).length;
    });

    return counts;

  }, [rows]);


  /*
  ---------------------------------------
  TABLE COLUMNS
  ---------------------------------------
  */

  const columns = [

    {
      key: "applicant_name",
      header: "Customer Name",
      sortable: true,
      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            navigate(`/customers/${r.partner_loan_id}`)
          }
        >
          {r.applicant_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) =>
        String(r?.applicant_name || "").toLowerCase(),
      width: 220,
    },

    {
      key: "lan",
      header: "LAN",
      sortable: true,
      width: 160,
    },

    {
      key: "partner_loan_id",
      header: "Partner LAN Id",
      sortable: true,
      width: 160,
    },

    {
      key: "sanction_amount",
      header: "Sanction Amount",
      sortable: true,
      render: (r) =>
        Number(r.sanction_amount || 0).toLocaleString("en-IN"),
      sortAccessor: (r) => Number(r?.sanction_amount || 0),
      width: 180,
    },

    {
      key: "utilized_sanction_limit",
      header: "Utilized Limit",
      sortable: true,
      render: (r) =>
        Number(r.utilized_sanction_limit || 0).toLocaleString("en-IN"),
      sortAccessor: (r) =>
        Number(r?.utilized_sanction_limit || 0),
      width: 180,
    },

    {
      key: "actions",
      header: "Actions",
      width: 420,
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>

          <button
            style={actionBtn()}
            onClick={() =>
              navigate(`/customers/${r.lan}/invoices`)
            }
          >
            Invoices
          </button>

          <button
            style={actionBtn()}
            onClick={() =>
              navigate(`/customers/${r.partner_loan_id}/suppliers`)
            }
          >
            Suppliers
          </button>

          <button
            style={actionBtn()}
            onClick={() =>
              navigate(`/customers/${r.lan}/repayments`)
            }
          >
            Repayments
          </button>

          <button
            style={actionBtn()}
            onClick={() =>
              navigate(`/customers/${r.lan}/allocation`)
            }
          >
            Allocation
          </button>

        </div>
      ),
    },

  ];


  /*
  ---------------------------------------
  UI
  ---------------------------------------
  */

  return (
    <>
      <LoaderOverlay show={loading} label="Fetching customers…" />

      {err && (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>
          {err}
        </p>
      )}

      {/* PARTNER TABS */}

      <div style={styles.tabContainer}>
        {PARTNERS.map((p) => {

          const active = selectedPartner === p.prefix;

          return (
            <button
              key={p.prefix}
              onClick={() => setSelectedPartner(p.prefix)}
              style={{
                ...styles.tab,
                background: active ? "#2563eb" : "#fff",
                color: active ? "#fff" : "#374151",
              }}
            >
              {p.label} ({partnerCounts[p.prefix] || 0})
            </button>
          );
        })}
      </div>


      {/* DATA TABLE */}

      <DataTable
        title={`${title} — ${
          PARTNERS.find(p => p.prefix === selectedPartner)?.label
        }`}
        rows={filteredRows}
        columns={columns}
        globalSearchKeys={[
          "applicant_name",
          "partner_loan_id",
          "lan",
        ]}
        initialSort={{ key: "applicant_name", dir: "asc" }}
        exportFileName="customers"
        initialPageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        serverPagination={true}
        totalRows={filteredRows.length}
        currentPage={page}
        onPageChange={setPage}
        onPageSizeChange={(n) => setPageSize(n)}
      />
    </>
  );
};


function actionBtn() {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}


const styles = {

  tabContainer: {
    display: "flex",
    gap: 10,
    marginBottom: 14,
  },

  tab: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    cursor: "pointer",
    fontWeight: 600,
  },

};

export default CustomerListScreen;