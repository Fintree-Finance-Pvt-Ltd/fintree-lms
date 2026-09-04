import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/api";

export const YA_MONEY_TABLE = "loan_booking_ya_money";
export const YA_MONEY_ENDPOINTS = {
  allLoans: "/loan-booking/yaMoney/all-loans",
  creditScreen: "/loan-booking/yaMoney/credit-screen-loans",
  opsMaker: "/loan-booking/yaMoney/ops-maker-loans",
  opsChecker: "/loan-booking/yaMoney/ops-checker-loans",
  disbursed: "/loan-booking/yaMoney/disbursed-loans",
};
export const YA_MONEY_LIST_ENDPOINT = YA_MONEY_ENDPOINTS.allLoans;

const FETCH_PAGE_SIZE = 100;
const MAX_FETCH_PAGES = 50;

export const normalizeYaMoneyStatus = (status) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const formatYaMoneyStatus = (status) => {
  const text = String(status || "Pending").replace(/_/g, " ").trim();

  return text.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getYaMoneyUser = () => {
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

export const useYaMoneyLoans = ({
  endpoint = YA_MONEY_LIST_ENDPOINT,
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
          "Failed to fetch Ya Money loans.",
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
    () => (statuses || []).map(normalizeYaMoneyStatus),
    [statuses],
  );

  const visibleRows = useMemo(() => {
    if (!normalizedStatuses.length) return rows;

    return rows.filter((row) =>
      normalizedStatuses.includes(normalizeYaMoneyStatus(row?.status)),
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
