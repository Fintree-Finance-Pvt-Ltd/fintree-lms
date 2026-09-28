const express = require("express");
const db = require("../config/db");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getMonthRange(query) {
  const monthParam = String(query.month || "").trim();
  let year;
  let month;

  if (/^\d{4}-\d{2}$/.test(monthParam)) {
    const [yearPart, monthPart] = monthParam.split("-");
    year = Number(yearPart);
    month = Number(monthPart);
  } else if (query.year && query.month) {
    year = Number(query.year);
    month = Number(query.month);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    monthKey: `${year}-${pad2(month)}`,
    startDate: `${year}-${pad2(month)}-01`,
    endDate: `${year}-${pad2(month)}-${pad2(daysInMonth)}`,
    endDateExclusive: `${nextMonthYear}-${pad2(nextMonth)}-01`,
    daysInMonth,
  };
}

function addOptionalStatsFilters({ conditions, params, query }) {
  const { partnerName, vendor, apiName } = query;

  if (partnerName) {
    conditions.push("partner_name = ?");
    params.push(partnerName);
  }

  if (vendor) {
    conditions.push("api_name = ?");
    params.push(vendor);
  }

  if (apiName) {
    conditions.push("api_name = ?");
    params.push(apiName);
  }
}

router.get("/counts", verifyToken, async (req, res) => {
  try {
    const {
      from,
      to,
      partnerName,
      vendor,
      apiName,
    } = req.query;

    const conditions = [];
    const params = [];

    if (from) {
      conditions.push("month_key >= ?");
      params.push(String(from).slice(0, 7));
    }

    if (to) {
      conditions.push("month_key <= ?");
      params.push(String(to).slice(0, 7));
    }

    addOptionalStatsFilters({
      conditions,
      params,
      query: { partnerName, vendor, apiName },
    });

    const whereSql = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [rows] = await db.promise().query(
      `
      SELECT
        month_key,
        partner_name,
        api_name,
        total_count AS total_hits,
        success_count AS success_hits,
        failed_count AS failed_hits,
        last_status_code,
        last_hit_at,
        updated_at
      FROM third_party_api_usage_counts
      ${whereSql}
      ORDER BY month_key DESC, total_count DESC, partner_name ASC, api_name ASC
      `,
      params,
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Third-party API stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch third-party API counts",
    });
  }
});

router.get("/monthly-partner-counts", verifyToken, async (req, res) => {
  try {
    const monthRange = getMonthRange(req.query);
    const conditions = ["month_key = ?"];
    const params = [monthRange.monthKey];

    addOptionalStatsFilters({
      conditions,
      params,
      query: req.query,
    });

    const [rows] = await db.promise().query(
      `
      SELECT
        partner_name,
        SUM(total_count) AS total_hits,
        SUM(success_count) AS success_hits,
        SUM(failed_count) AS failed_hits
      FROM third_party_api_usage_counts
      WHERE ${conditions.join(" AND ")}
      GROUP BY partner_name
      ORDER BY total_hits DESC, partner_name ASC
      `,
      params,
    );

    res.json({
      success: true,
      month: monthRange.monthKey,
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      days_in_month: monthRange.daysInMonth,
      data: rows,
    });
  } catch (error) {
    const status = /^Invalid /.test(error.message) ? 400 : 500;

    console.error("Third-party API monthly stats error:", error);
    res.status(status).json({
      success: false,
      message:
        status === 400
          ? "Invalid month. Use month=YYYY-MM or year=YYYY&month=M"
          : "Failed to fetch monthly third-party API counts",
    });
  }
});

router.get("/monthly-api-counts", verifyToken, async (req, res) => {
  try {
    const monthRange = getMonthRange(req.query);
    const conditions = ["month_key = ?"];
    const params = [monthRange.monthKey];
    const { partnerName, vendor, apiName } = req.query;

    if (partnerName) {
      conditions.push("partner_name = ?");
      params.push(partnerName);
    }

    if (vendor || apiName) {
      conditions.push("api_name = ?");
      params.push(vendor || apiName);
    }

    const [rows] = await db.promise().query(
      `
      SELECT
        partner_name,
        api_name,
        total_count AS count,
        success_count,
        failed_count,
        last_status_code,
        last_hit_at,
        updated_at
      FROM third_party_api_usage_counts
      WHERE ${conditions.join(" AND ")}
      ORDER BY partner_name ASC, api_name ASC
      `,
      params,
    );

    res.json({
      success: true,
      month: monthRange.monthKey,
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      data: rows,
    });
  } catch (error) {
    const status = /^Invalid /.test(error.message) ? 400 : 500;

    console.error("Third-party API monthly API count error:", error);
    res.status(status).json({
      success: false,
      message:
        status === 400
          ? "Invalid month. Use month=YYYY-MM or year=YYYY&month=M"
          : "Failed to fetch monthly API counts",
    });
  }
});

router.get("/recent", verifyToken, async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit || "100", 10);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;

    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        month_key,
        partner_name,
        api_name,
        total_count AS count,
        success_count,
        failed_count,
        last_status_code,
        last_hit_at,
        created_at,
        updated_at
      FROM third_party_api_usage_counts
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
      `,
      [limit],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Third-party API recent logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent third-party API logs",
    });
  }
});

module.exports = router;
