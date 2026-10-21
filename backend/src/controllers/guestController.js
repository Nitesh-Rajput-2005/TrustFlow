
const crypto = require("crypto");
const Room = require("../models/Room");
const GuestSession = require("../models/GuestSession");
const { recordAuditEvent } = require("../utils/auditLedger");
const JoinRequest = require("../models/JoinRequest");

// async function joinRoom(req, res) {
//     try {
//         const { inviteCode, displayName } = req.body;

//         if (typeof inviteCode !== "string" || !/^[a-f0-9]{16}$/i.test(inviteCode.trim())) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Enter a valid invite code.",
//             });
//         }

//         if (
//             typeof displayName !== "string" ||
//             displayName.trim().length < 2 ||
//             displayName.trim().length > 40
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Name must be between 2 and 40 characters.",
//             });
//         }

//         const room = await Room.findOne({
//             inviteCode: inviteCode.trim(),
//         });

//         if (!room) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Room not found. Check your invite code.",
//             });
//         }

//         if (room.status !== "active" || room.expiresAt <= new Date()) {
//             return res.status(410).json({
//                 success: false,
//                 message: "This room has expired or is no longer active.",
//             });
//         }

//         // The raw token is returned only to the guest.
//         // Only its SHA-256 hash is stored in MongoDB.
//         const sessionToken = crypto.randomBytes(32).toString("hex");
//         const tokenHash = crypto
//             .createHash("sha256")
//             .update(sessionToken)
//             .digest("hex");

//         // A guest session cannot outlive its room.
//         const sessionExpiresAt = new Date(
//             Math.min(
//                 Date.now() + 2 * 60 * 60 * 1000,
//                 room.expiresAt.getTime()
//             )
//         );

//         const guestSession = await GuestSession.create({
//             room: room._id,
//             displayName: displayName.trim(),
//             tokenHash,
//             expiresAt: sessionExpiresAt,
//         });

//         await recordAuditEvent({
//             roomId: room._id,
//             eventType: "GUEST_JOINED",
//             guestDisplayName: guestSession.displayName,
//         });

//         return res.status(201).json({
//             success: true,
//             message: "Joined room successfully.",
//             guest: {
//                 displayName: guestSession.displayName,
//                 joinedAt: guestSession.joinedAt,
//             },
//             sessionToken,
//             sessionExpiresAt,
//             room: {
//                 id: room._id,
//                 name: room.name,
//                 expiresAt: room.expiresAt,
//             },
//         });
//     } catch (error) {
//         console.error("Join room error:", error.message);

//         return res.status(500).json({
//             success: false,
//             message: "Unable to join room.",
//         });
//     }
// }

async function joinRoom(req, res) {
    return res.status(403).json({
        success: false,
        message: "Direct joining is disabled. Submit a join request and wait for owner approval.",
    });
}

async function requestToJoinRoom(req, res) {
    try {
        const { inviteCode, displayName } = req.body;

        if (
            typeof inviteCode !== "string" ||
            !/^[a-f0-9]{16}$/i.test(inviteCode.trim())
        ) {
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

        const existingRequest = await JoinRequest.findOne({
            room: room._id,
            displayName: displayName.trim(),
            status: "pending",
        });

        if (existingRequest) {
            return res.status(409).json({
                success: false,
                message: "A pending request already exists with this name.",
            });
        }

        const requestToken = crypto.randomBytes(32).toString("hex");
        const requestTokenHash = crypto
            .createHash("sha256")
            .update(requestToken)
            .digest("hex");

        const joinRequest = await JoinRequest.create({
            room: room._id,
            displayName: displayName.trim(),
            requestTokenHash,
        });


        const io = req.app.get("io");

        io?.to(`room:${room._id}:owners`).emit("join-request:new", {
            roomId: room._id.toString(),
            requestId: joinRequest._id.toString(),
            displayName: joinRequest.displayName,
            createdAt: joinRequest.createdAt,
        });


        return res.status(201).json({
            success: true,
            message: "Join request submitted. Wait for the room owner to respond.",
            request: {
                id: joinRequest._id,
                displayName: joinRequest.displayName,
                status: joinRequest.status,
                createdAt: joinRequest.createdAt,
            },
            requestToken,
            room: {
                id: room._id,
                name: room.name,
                expiresAt: room.expiresAt,
            },
        });
    } catch (error) {
        console.error("Request to join room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to submit join request.",
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


        const io = req.app.get("io");

        io?.to(`room:${guestSession.room}:members`).emit("member:left", {
            roomId: guestSession.room.toString(),
            displayName: guestSession.displayName,
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


async function getJoinRequests(req, res) {
    try {
        const { roomId } = req.params;

        const room = await Room.findOne({
            _id: roomId,
            owner: req.user.userId,
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found or you are not the owner.",
            });
        }

        const requests = await JoinRequest.find({
            room: room._id,
            status: "pending",
        })
            .select("displayName status createdAt")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            requests,
        });
    } catch (error) {
        console.error("Get join requests error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch join requests.",
        });
    }
}


async function reviewJoinRequest(req, res) {
    try {
        const { roomId, requestId } = req.params;
        const { decision } = req.body;

        if (!["accepted", "rejected"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Decision must be accepted or rejected.",
            });
        }

        const room = await Room.findOne({
            _id: roomId,
            owner: req.user.userId,
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found or you are not the owner.",
            });
        }

        if (room.status !== "active" || room.expiresAt <= new Date()) {
            return res.status(410).json({
                success: false,
                message: "This room is no longer active.",
            });
        }

        const joinRequest = await JoinRequest.findOne({
            _id: requestId,
            room: room._id,
            status: "pending",
        }).select("+requestTokenHash");

        if (!joinRequest) {
            return res.status(404).json({
                success: false,
                message: "Pending join request not found.",
            });
        }

        if (decision === "accepted") {
            const sessionExpiresAt = new Date(
                Math.min(
                    Date.now() + 2 * 60 * 60 * 1000,
                    room.expiresAt.getTime()
                )
            );

            await GuestSession.create({
                room: room._id,
                displayName: joinRequest.displayName,
                tokenHash: joinRequest.requestTokenHash,
                expiresAt: sessionExpiresAt,
            });
        }

        joinRequest.status = decision;
        joinRequest.reviewedAt = new Date();
        await joinRequest.save();


        if (decision === "accepted") {
            await recordAuditEvent({
                roomId: room._id,
                eventType: "GUEST_JOINED",
                guestDisplayName: joinRequest.displayName,
            });

            const io = req.app.get("io");

            io?.to(`room:${room._id}:members`).emit("member:joined", {
                roomId: room._id.toString(),
                displayName: joinRequest.displayName,
            });

            io?.to(`room:${room._id}:owners`).emit("join-request:updated", {
                roomId: room._id.toString(),
                requestId: joinRequest._id.toString(),
                status: "accepted",
            });
        } else {
            const io = req.app.get("io");

            io?.to(`room:${room._id}:owners`).emit("join-request:updated", {
                roomId: room._id.toString(),
                requestId: joinRequest._id.toString(),
                status: "rejected",
            });
        }


        return res.status(200).json({
            success: true,
            message:
                decision === "accepted"
                    ? "Join request accepted."
                    : "Join request rejected.",
            request: {
                id: joinRequest._id,
                displayName: joinRequest.displayName,
                status: joinRequest.status,
            },
        });
    } catch (error) {
        console.error("Review join request error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to review join request.",
        });
    }
}


async function getJoinRequestStatus(req, res) {
    try {
        const { requestToken } = req.body;

        if (
            typeof requestToken !== "string" ||
            !/^[a-f0-9]{64}$/i.test(requestToken)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid request token.",
            });
        }

        const requestTokenHash = crypto
            .createHash("sha256")
            .update(requestToken)
            .digest("hex");

        const joinRequest = await JoinRequest.findOne({
            requestTokenHash,
        });

        if (!joinRequest) {
            return res.status(404).json({
                success: false,
                message: "Join request not found.",
            });
        }

        const responseData = {
            success: true,
            status: joinRequest.status,
            message:
                joinRequest.status === "accepted"
                    ? "Your request was accepted."
                    : joinRequest.status === "rejected"
                        ? "Your request was rejected."
                        : joinRequest.status === "withdrawn"
                            ? "Your request was withdrawn."
                            : "Your request is awaiting approval.",
        };

        if (joinRequest.status === "accepted") {
            const room = await Room.findById(joinRequest.room);

            if (!room) {
                return res.status(404).json({
                    success: false,
                    message: "Room not found.",
                });
            }

            responseData.room = {
                id: room._id,
                name: room.name,
                expiresAt: room.expiresAt,
            };

            responseData.guest = {
                displayName: joinRequest.displayName,
            };

            responseData.sessionExpiresAt = room.expiresAt;
        }

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("Get join request status error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to check request status.",
        });
    }
}


async function withdrawJoinRequest(req, res) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Request token is required.",
            });
        }

        const requestToken = authHeader.slice(7).trim();

        if (!/^[a-f0-9]{64}$/i.test(requestToken)) {
            return res.status(401).json({
                success: false,
                message: "Invalid request token.",
            });
        }

        const requestTokenHash = crypto
            .createHash("sha256")
            .update(requestToken)
            .digest("hex");

        const joinRequest = await JoinRequest.findOne({
            requestTokenHash,
            status: "pending",
        });

        if (!joinRequest) {
            return res.status(404).json({
                success: false,
                message: "Pending join request not found. It may already have been reviewed or withdrawn.",
            });
        }

        joinRequest.status = "withdrawn";
        joinRequest.reviewedAt = new Date();
        await joinRequest.save();

        const io = req.app.get("io");

        io?.to(`room:${joinRequest.room}:owners`).emit(
            "join-request:updated",
            {
                roomId: joinRequest.room.toString(),
                requestId: joinRequest._id.toString(),
                status: "withdrawn",
            }
        );

        return res.status(200).json({
            success: true,
            message: "Join request withdrawn successfully.",
        });
    } catch (error) {
        console.error("Withdraw join request error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to withdraw join request.",
        });
    }
}

module.exports = {
    joinRoom,
    requestToJoinRoom,
    leaveRoom,
    getRoomGuests,
    getJoinRequests,
    reviewJoinRequest,
    getJoinRequestStatus,
    withdrawJoinRequest,
};
