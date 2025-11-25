const axios = require('axios');

const getGstDetails = async (gstNumber) => {
    if (!gstNumber) {
        return res.status(400).json({ message : " Missing Required Fields"})
    }
    try {
        const payload = {
            mode: "sync",
            data: {
        business_gstin_number: gst_number.toUpperCase(),
        contact_info: true,
        financial_year: "2024-25",
        consent: "Y",
        consent_text:
          "I hereby declare my consent agreement for fetching my information via ZOOP API.",
      },
      task_id: uuidv4(),
    }

    const zoopResponse = await axios.post(
      process.env.ZOOP_GST_API_URL, 
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.ZOOP_API_KEY,
          "app-id": process.env.ZOOP_APP_ID,
        },
      }
    );

    return zoopResponse.data;

    } catch (error) {
        console.error(
      "❌ GST Verification Error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message: "GST verification failed",
      error: error.response?.data || error.message,
    });
    }
}