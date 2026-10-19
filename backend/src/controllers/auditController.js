const { verifyRoomLedger } = require("../utils/auditLedger");
const AuditEvent = require("../models/AuditEvent");

async function getRoomHistory(req, res) {
    try {
        // roomOwnerMiddleware has already verified ownership
        const events = await AuditEvent.find({
            room: req.room._id,
        })
            .sort({ sequence: 1 })
            .select("sequence eventType guestDisplayName timestamp")
            .lean();

        return res.status(200).json({
            success: true,
            room: {
                id: req.room._id,
                name: req.room.name,
            },
            count: events.length,
            events,
        });
    } catch (error) {
        console.error("Get room history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve room history.",
        });
    }
}


async function verifyRoomHistory(req, res) {
    try {
        const result = await verifyRoomLedger(req.room._id);

        return res.status(200).json({
            success: true,
            room: {
                id: req.room._id,
                name: req.room.name,
            },
            verification: result,
        });
    } catch (error) {
        console.error("Verify room history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to verify room history.",
        });
    }
}

module.exports = { getRoomHistory, verifyRoomHistory };
