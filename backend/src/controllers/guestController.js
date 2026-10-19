
const crypto = require("crypto");
const Room = require("../models/Room");
const GuestSession = require("../models/GuestSession");
const { recordAuditEvent } = require("../utils/auditLedger");

async function joinRoom(req, res) {
    try {
        const { inviteCode, displayName } = req.body;

        if (typeof inviteCode !== "string" || !/^[a-f0-9]{16}$/i.test(inviteCode.trim())) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid invite code.",
            });
        }

        if (
            typeof displayName !== "string" ||
            displayName.trim().length < 2 ||
            displayName.trim().length > 40
        ) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 40 characters.",
            });
        }

        const room = await Room.findOne({
            inviteCode: inviteCode.trim(),
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found. Check your invite code.",
            });
        }

        if (room.status !== "active" || room.expiresAt <= new Date()) {
            return res.status(410).json({
                success: false,
                message: "This room has expired or is no longer active.",
            });
        }

        // The raw token is returned only to the guest.
        // Only its SHA-256 hash is stored in MongoDB.
        const sessionToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
            .createHash("sha256")
            .update(sessionToken)
            .digest("hex");

        // A guest session cannot outlive its room.
        const sessionExpiresAt = new Date(
            Math.min(
                Date.now() + 2 * 60 * 60 * 1000,
                room.expiresAt.getTime()
            )
        );

        const guestSession = await GuestSession.create({
            room: room._id,
            displayName: displayName.trim(),
            tokenHash,
            expiresAt: sessionExpiresAt,
        });

        await recordAuditEvent({
            roomId: room._id,
            eventType: "GUEST_JOINED",
            guestDisplayName: guestSession.displayName,
        });

        return res.status(201).json({
            success: true,
            message: "Joined room successfully.",
            guest: {
                displayName: guestSession.displayName,
                joinedAt: guestSession.joinedAt,
            },
            sessionToken,
            sessionExpiresAt,
            room: {
                id: room._id,
                name: room.name,
                expiresAt: room.expiresAt,
            },
        });
    } catch (error) {
        console.error("Join room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to join room.",
        });
    }
}


async function leaveRoom(req, res) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Guest session token is required.",
            });
        }

        const sessionToken = authHeader.slice(7).trim();

        if (!/^[a-f0-9]{64}$/i.test(sessionToken)) {
            return res.status(401).json({
                success: false,
                message: "Invalid guest session token.",
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(sessionToken)
            .digest("hex");

        const guestSession = await GuestSession.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
            leftAt: null,
        }).select("+tokenHash");

        if (!guestSession) {
            return res.status(401).json({
                success: false,
                message: "Guest session is invalid, expired, or already left.",
            });
        }

        guestSession.leftAt = new Date();
        await guestSession.save();

        await recordAuditEvent({
            roomId: guestSession.room,
            eventType: "GUEST_LEFT",
            guestDisplayName: guestSession.displayName,
        });

        return res.status(200).json({
            success: true,
            message: "You have left the room.",
        });
    } catch (error) {
        console.error("Leave room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to leave the room.",
        });
    }
}


async function getRoomGuests(req, res) {
    try {
        const { roomId } = req.params;

        const room = await Room.findOne({
            _id: roomId,
            owner: req.user.userId,
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found or you are not its owner.",
            });
        }

        const guests = await GuestSession.find({
            room: room._id,
        })
            .select("displayName joinedAt expiresAt leftAt")
            .sort({ joinedAt: -1 });

        return res.status(200).json({
            success: true,
            guests: guests.map((guest) => ({
                id: guest._id,
                displayName: guest.displayName,
                joinedAt: guest.joinedAt,
                expiresAt: guest.expiresAt,
                leftAt: guest.leftAt,
                status:
                    guest.leftAt
                        ? "left"
                        : guest.expiresAt <= new Date()
                            ? "expired"
                            : "active",
            })),
        });
    } catch (error) {
        console.error("Get room guests error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve room guests.",
        });
    }
}

module.exports = { joinRoom, leaveRoom, getRoomGuests };
