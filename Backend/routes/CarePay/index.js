const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");

const router = express.Router();

router.post("/mandate/update-umrn", verifyApiKey, async (req, res) => {
    try {
        const { lan, amount, umrn } = req.body;

        if (!lan || amount == null || !umrn) {
            return res.status(400).json({
                message: "Missing required fields: lan, amount, umrn"
            });
        }

        const [result] = await db.promise().query(
            `UPDATE loan_booking_carepay 
             SET mandate_amount = ?, umrn = ? 
             WHERE lan = ?`,
            [amount, umrn, lan]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "No record found for given LAN"
            });
        }

        return res.status(200).json({
            message: "Mandate updated successfully"
        });

    } catch (error) {
        console.error("Error updating mandate UMRN:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

module.exports = router;