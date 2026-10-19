

const crypto = require("crypto");
const mongoose = require("mongoose");

const Room = require("../models/Room");
const File = require("../models/File");
const GuestSession = require("../models/GuestSession");
const AuditEvent = require("../models/AuditEvent");
const cloudinary = require("../config/cloudinary");


async function createRoom(req, res) {
    try {
        const { name, expiryHours = 24 } = req.body;

        if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 60) {
            return res.status(400).json({
                success: false,
                message: "Room name must be between 3 and 60 characters.",
            });
        }

        const hours = Number(expiryHours);

        if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
            return res.status(400).json({
                success: false,
                message: "Expiry must be between 1 and 168 hours.",
            });
        }

        const room = await Room.create({

            name: name.trim(),
            inviteCode: crypto.randomBytes(8).toString("hex"),
            expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            owner: req.user.userId,
        });

        return res.status(201).json({
            success: true,
            message: "Room created successfully.",
            room: {
                id: room._id,
                name: room.name,
                inviteCode: room.inviteCode,
                expiresAt: room.expiresAt,
                status: room.status,
                createdAt: room.createdAt,
            },
        });
    } catch (error) {
        console.error("Create room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to create room.",
        });
    }
}


async function getRoomByInviteCode(req, res) {
    try {
        const { inviteCode } = req.params;

        const room = await Room.findOne({ inviteCode });

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

        return res.status(200).json({
            success: true,
            message: "Room found successfully.",
            room: {
                id: room._id,
                name: room.name,
                expiresAt: room.expiresAt,
                status: room.status,
                createdAt: room.createdAt,
            },
        });
    } catch (error) {
        console.error("Find room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to find room.",
        });
    }
}


async function getMyRooms(req, res) {
    try {
        const rooms = await Room.find({ owner: req.user.userId })
            .select("name inviteCode expiresAt status createdAt")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: rooms.length,
            rooms: rooms.map((room) => ({
                id: room._id,
                name: room.name,
                inviteCode: room.inviteCode,
                expiresAt: room.expiresAt,
                status:
                    room.status === "active" && room.expiresAt <= new Date()
                        ? "expired"
                        : room.status,
                createdAt: room.createdAt,
            })),
        });
    } catch (error) {
        console.error("Get my rooms error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve your rooms.",
        });
    }
}

async function closeRoom(req, res) {
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

        if (room.status === "closed") {
            return res.status(400).json({
                success: false,
                message: "This room is already closed.",
            });
        }

        if (room.expiresAt <= new Date()) {
            return res.status(400).json({
                success: false,
                message: "This room has already expired.",
            });
        }

        room.status = "closed";
        await room.save();

        return res.status(200).json({
            success: true,
            message: "Room closed successfully.",
            room: {
                id: room._id,
                name: room.name,
                status: room.status,
            },
        });
    } catch (error) {
        console.error("Close room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to close room.",
        });
    }
}

async function reopenRoom(req, res) {
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

        if (room.expiresAt <= new Date()) {
            return res.status(410).json({
                success: false,
                message: "This room has expired and cannot be reopened.",
            });
        }

        if (room.status === "active") {
            return res.status(400).json({
                success: false,
                message: "This room is already open.",
            });
        }

        if (room.status !== "closed") {
            return res.status(400).json({
                success: false,
                message: "Only closed rooms can be reopened.",
            });
        }

        room.status = "active";
        await room.save();

        return res.status(200).json({
            success: true,
            message: "Room reopened successfully.",
            room: {
                id: room._id,
                name: room.name,
                status: room.status,
                expiresAt: room.expiresAt,
            },
        });
    } catch (error) {
        console.error("Reopen room error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to reopen room.",
        });
    }
}


async function deleteRoom(req, res) {
    try {
        const { roomId } = req.params;

        if (!mongoose.isValidObjectId(roomId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID.",
            });
        }

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

        // Delete Cloudinary assets before deleting any database records.
        const files = await File.find({ room: room._id });

        for (const file of files) {
            if (file.cleanupStatus === "deleted") {
                continue;
            }

            const result = await cloudinary.uploader.destroy(
                file.cloudinaryPublicId,
                {
                    resource_type: file.cloudinaryResourceType,
                    type: "authenticated",
                    invalidate: true,
                }
            );

            if (
                result.result !== "ok" &&
                result.result !== "not found"
            ) {
                throw new Error(
                    `Cloudinary deletion was not confirmed for ${file.originalName}.`
                );
            }
        }

        // Remove all database records associated with this room.
        await AuditEvent.deleteMany({ room: room._id });
        await GuestSession.deleteMany({ room: room._id });
        await File.deleteMany({ room: room._id });
        await Room.deleteOne({ _id: room._id });

        return res.status(200).json({
            success: true,
            message: "Room and its history deleted permanently.",
        });
    } catch (error) {
        console.error("Delete room error:", error.message);

        return res.status(500).json({
            success: false,
            message:
                "Unable to delete the room completely. Please retry.",
        });
    }
}

module.exports = {
    createRoom,
    getRoomByInviteCode,
    getMyRooms,
    closeRoom,
    reopenRoom,
    deleteRoom,
};