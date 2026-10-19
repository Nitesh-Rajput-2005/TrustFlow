
const Room = require("../models/Room");
const File = require("../models/File");
const cloudinary = require("../config/cloudinary");

async function cleanupExpiredRoom(roomId) {
    const room = await Room.findById(roomId);

    if (!room) {
        return { success: false, message: "Room not found." };
    }

    if (
        !room.expiresAt ||
        room.expiresAt > new Date()
    ) {
        return {
            success: false,
            message: "Room has not expired yet.",
        };
    }

    const files = await File.find({
        room: room._id,
        cleanupStatus: { $in: ["active", "pending"] },
    });

    const failures = [];

    for (const file of files) {
        try {
            const result = await cloudinary.uploader.destroy(
                file.cloudinaryPublicId,
                {
                    resource_type: file.cloudinaryResourceType,
                    type: "authenticated",
                    invalidate: true,
                }
            );

            if (result.result !== "ok" && result.result !== "not found") {
                throw new Error(
                    `Cloudinary deletion was not confirmed: ${result.result}`
                );
            }

            file.cleanupStatus = "deleted";
            await file.save();
        } catch (error) {
            console.error(
                `Cleanup failed for file ${file._id}:`,
                error.message
            );

            file.cleanupStatus = "pending";
            await file.save().catch(() => { });

            failures.push(file._id.toString());
        }
    }

    if (failures.length === 0) {
        await File.deleteMany({ room: room._id });

        room.status = "expired";
        await room.save();
    } else {
        room.status = "expired";
        await room.save();
    }

    return {
        success: failures.length === 0,
        deletedCount: files.length - failures.length,
        failedFileIds: failures,
    };
}

module.exports = { cleanupExpiredRoom };
