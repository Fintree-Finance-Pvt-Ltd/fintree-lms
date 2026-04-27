const axios = require("axios");
const mappings = require("../config/amlMappings");
const db = require("../config/db"); // your mysql connection

const BASE_URL = "https://prod.crimescan.ai/v1/global-check";

const headers = {
    Authorization: `Bearer ${process.env.CRIMESCAN_API_KEY}`,
    "Content-Type": "application/json"
};


/**
 * Convert product schema → standard schema
 */
function mapFields(product, record) {

    const map = mappings[product];

    if (!map) {
        throw new Error(`AML mapping missing for product: ${product}`);
    }

    return {
        fullName: record[map.fullName],
        address: record[map.address],
        fatherName: record[map.fatherName],
        pan: record[map.pan],
        mobile: record[map.mobile]
    };
}


/**
 * Convert standard schema → Crimescan payload
 */
function buildPayload(data) {

    return {
        name: { query: data.fullName || "" },
        address: data.address || "",
        father_name: { query: data.fatherName || "" },
        _pan_no: data.pan || "",
        _mobile_no: data.mobile || ""
    };
}


/**
 * Poll Crimescan results
 */
async function pollResults(searchId, retries = 10, delay = 2000) {

    for (let i = 0; i < retries; i++) {

        const response = await axios.post(
            `${BASE_URL}/results`,
            { search_id: searchId },
            { headers }
        );

        if (response.data.status === "COMPLETED") {
            return response.data;
        }

        await new Promise(res => setTimeout(res, delay));
    }

    throw new Error("AML polling timeout");
}


/**
 * Save AML result to MySQL
 */
async function saveResult(result, mappedData) {

    const record = result.results?.[0] || {};

    await db.promise().query(
        `
        INSERT INTO aml_pep_checks
        (
            search_id,
            name,
            match_score,
            match_type,
            designation,
            source,
            total_matches,
            has_exact_identity_match,
            pan,
            mobile,
            raw_response
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            result.search_id || null,
            record.name || null,
            record.score || null,
            record.match_type || null,
            record.designation || null,
            record.source_details?.source || null,
            result.total ?? 0,
            result.has_exact_identity_match ?? false,
            mappedData.pan || null,
            mappedData.mobile || null,
            JSON.stringify(result)
        ]
    );
}


/**
 * MAIN FUNCTION (call this anywhere)
 */
async function amlCheck(product, record) {

    // Step 1: map schema
    const mapped = mapFields(product, record);

    // Step 2: create Crimescan payload
    const payload = buildPayload(mapped);
    console.log("Crimescan Payload:", payload);

    // Step 3: trigger search
    const searchResponse = await axios.post(
        `${BASE_URL}/aml-pep-check`,
        payload,
        { headers }
    );

    const searchId = searchResponse.data.search_id;

    // Step 4: poll results
    const result = await pollResults(searchId);

    console.log("Crimescan Result:", result);

    // Step 5: store in DB
    await saveResult(result, mapped);

    return result;
}


module.exports = {
    amlCheck
};