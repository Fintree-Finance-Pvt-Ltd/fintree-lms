import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/api";

export const ARTHAVIDHI_CAPITAL_TABLE = "loan_booking_arthavidhi";
export const ARTHAVIDHI_CAPITAL_ENDPOINTS = {
  allLoans: "/arthavidhi-capital/all-loans",
  partnerCredit: "/arthavidhi-capital/partner-credit-loans",
  creditScreen: "/arthavidhi-capital/credit-screen-loans",
  signing: "/arthavidhi-capital/signing-loans",
  opsMaker: "/arthavidhi-capital/ops-maker-loans",
  opsChecker: "/arthavidhi-capital/ops-checker-loans",
  disbursed: "/arthavidhi-capital/disbursed-loans",
};
export const ARTHAVIDHI_CAPITAL_LIST_ENDPOINT = ARTHAVIDHI_CAPITAL_ENDPOINTS.allLoans;

const FETCH_PAGE_SIZE = 100;
const MAX_FETCH_PAGES = 50;

export const normalizeArthavidhiCapitalStatus = (status) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const formatArthavidhiCapitalStatus = (status) => {
  if (normalizeArthavidhiCapitalStatus(status) === "disburse_initiate") return "Awaiting Manual Payment / UTR";
  const text = String(status || "Pending").replace(/_/g, " ").trim();

  return text.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getArthavidhiCapitalUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

const getRowsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getPaginationTotal = (payload, fallback) =>
  Number(payload?.pagination?.total ?? payload?.total ?? fallback);

export const useArthavidhiCapitalLoans = ({
  endpoint = ARTHAVIDHI_CAPITAL_LIST_ENDPOINT,
  statuses,
} = {}) => {
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const fetchRows = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const collectedRows = [];
      let page = 1;
      let total = 0;
      let totalPages = 1;

      while (page <= totalPages && page <= MAX_FETCH_PAGES) {
        const { data } = await api.get(endpoint, {
          params: {
            page,
            pageSize: FETCH_PAGE_SIZE,
          },
          signal: controller.signal,
        });

        const pageRows = getRowsFromResponse(data);
        collectedRows.push(...pageRows);

        total = getPaginationTotal(data, collectedRows.length);
        totalPages = Math.max(1, Math.ceil(total / FETCH_PAGE_SIZE));

        if (!data?.pagination) {
          break;
        }

        page += 1;
      }

      if (!controller.signal.aborted) {
        setRows(collectedRows);
        setTotalRows(total || collectedRows.length);
      }
    } catch (err) {
      if (err?.code === "ERR_CANCELED") return;

      setRows([]);
      setTotalRows(0);
      setError(
        err?.response?.data?.message ||
          "Failed to fetch Arthavidhi Capital loans.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    fetchRows();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchRows]);

  const normalizedStatuses = useMemo(
    () => (statuses || []).map(normalizeArthavidhiCapitalStatus),
    [statuses],
  );

  const visibleRows = useMemo(() => {
    if (!normalizedStatuses.length) return rows;

    return rows.filter((row) =>
      normalizedStatuses.includes(normalizeArthavidhiCapitalStatus(row?.status)),
    );
  }, [rows, normalizedStatuses]);

  return {
    rows: visibleRows,
    totalRows,
    loading,
    error,
    setError,
    refresh: fetchRows,
  };
};
