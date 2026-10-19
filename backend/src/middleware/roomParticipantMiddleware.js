
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const GuestSession = require("../models/GuestSession");
const Room = require("../models/Room");
const mongoose = require("mongoose");

async function roomParticipantMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "A room participant token is required.",
            });
        }

        const token = authHeader.slice(7).trim();
        const roomId = req.params.roomId;

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: "Room ID is required.",
            });
        }

        if (!mongoose.isValidObjectId(roomId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID.",
            });
        }

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found.",
            });
        }

        if (room.status !== "active" || room.expiresAt <= new Date()) {
            return res.status(410).json({
                success: false,
                message: "This room has expired or is no longer active.",
            });
        }

        // Guest session tokens are 64 hexadecimal characters.
        if (/^[a-f0-9]{64}$/i.test(token)) {
            const tokenHash = crypto
                .createHash("sha256")
                .update(token)
                .digest("hex");

            const guestSession = await GuestSession.findOne({
                tokenHash,
                room: room._id,
                expiresAt: { $gt: new Date() },
                leftAt: null,
            });

            if (!guestSession) {
                return res.status(401).json({
                    success: false,
                    message: "Guest session is invalid or expired.",
                });
            }

            req.room = room;
            req.guestSession = guestSession;
            req.participant = {
                type: "guest",
                displayName: guestSession.displayName,
            };

            return next();
        }

        // Otherwise, verify the creator's JWT.
        let decoded;

        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET, {
                issuer: "trustflow",
                audience: "trustflow-users",
            });
        } catch {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired participant token.",
            });
        }

        if (!room.owner || room.owner.toString() !== decoded.userId) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this room.",
            });
        }

        req.room = room;
        req.user = { userId: decoded.userId };
        req.participant = {
            type: "creator",
            userId: decoded.userId,
        };

        return next();
    } catch (error) {
        console.error("Room participant middleware error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to verify room access.",
        });
    }
}

module.exports = roomParticipantMiddleware;
