
const crypto = require("crypto");
const File = require("../models/File");
const cloudinary = require("../config/cloudinary");
const { recordAuditEvent } = require("../utils/auditLedger");
const { validateUploadedFile } = require("../utils/fileValidation");

async function uploadFile(req, res) {

    let uploadedAsset = null;
    let savedFileId = null;

    try {
        if (!req.room || !req.participant) {
            return res.status(403).json({
                success: false,
                message: "Room access must be verified before uploading.",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a file to upload.",
            });
        }


        const validation = await validateUploadedFile(req.file);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
            });
        }


        // The room might have expired while the request was being processed.
        if (
            req.room.status !== "active" ||
            req.room.expiresAt <= new Date()
        ) {
            return res.status(410).json({
                success: false,
                message: "This room has expired.",
            });
        }

        const fileBuffer = req.file.buffer;
        const sha256 = crypto
            .createHash("sha256")
            .update(fileBuffer)
            .digest("hex");

        const resourceType = req.file.mimetype.startsWith("image/")
            ? "image"
            : req.file.mimetype.startsWith("video/")
                ? "video"
                : "raw";

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(

                {
                    resource_type: resourceType,
                    type: "authenticated",
                    folder: `trustflow/${req.room._id}`,
                    use_filename: false,
                    unique_filename: true,
                }
                ,
                (error, uploadResult) => {
                    if (error) return reject(error);
                    resolve(uploadResult);
                }
            );

            stream.end(fileBuffer);
        });

        uploadedAsset = {
            publicId: result.public_id,
            resourceType: result.resource_type,
        };

        // Recheck the room's current database state after uploading.
        const Room = require("../models/Room");
        const currentRoom = await Room.findById(req.room._id);

        if (
            !currentRoom ||
            currentRoom.status !== "active" ||
            currentRoom.expiresAt <= new Date()
        ) {
            await cloudinary.uploader.destroy(result.public_id, {
                resource_type: result.resource_type,
                type: "authenticated",
                invalidate: true,
            });

            uploadedAsset = null;

            return res.status(410).json({
                success: false,
                message: "The room expired or closed during upload. The file was not saved.",
            });
        }

        const savedFile = await File.create({
            room: req.room._id,
            uploadedBy:
                req.participant.type === "guest"
                    ? req.participant.displayName
                    : `creator:${req.participant.userId}`,
            originalName: req.file.originalname,
            cloudinaryPublicId: result.public_id,
            cloudinaryResourceType: result.resource_type,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            sha256,
        });

        savedFileId = savedFile._id;


        await recordAuditEvent({
            roomId: req.room._id,
            eventType: "FILE_UPLOADED",
            guestDisplayName:
                req.participant.type === "guest"
                    ? req.participant.displayName
                    : "Room creator",
        });

        // Notify everyone subscribed to this room that a file was uploaded.
        const io = req.app.get("io");

        io?.to(`room:${req.room._id}:members`).emit("file:updated", {
            roomId: req.room._id.toString(),
            fileId: savedFile._id.toString(),
            action: "uploaded",
        });

        uploadedAsset = null;



        return res.status(201).json({
            success: true,
            message: "File uploaded successfully.",
            file: {
                id: savedFile._id,
                originalName: savedFile.originalName,
                fileSize: savedFile.fileSize,
                mimeType: savedFile.mimeType,
                sha256: savedFile.sha256,
                uploadedAt: savedFile.createdAt,
            },
        });
    } catch (error) {
        console.error("File upload error:", error.message);

        // Remove metadata if it was saved before a later operation failed.
        if (savedFileId) {
            try {
                await File.findByIdAndDelete(savedFileId);
            } catch (metadataError) {
                console.error(
                    "File metadata cleanup failed:",
                    metadataError.message
                );
            }
        }

        // Remove the uploaded Cloudinary asset if it still exists.
        if (uploadedAsset) {
            try {
                await cloudinary.uploader.destroy(
                    uploadedAsset.publicId,
                    {
                        resource_type: uploadedAsset.resourceType,
                        type: "authenticated",
                        invalidate: true,
                    }
                );
            } catch (cleanupError) {
                console.error(
                    "Cloudinary cleanup failed:",
                    cleanupError.message
                );
            }
        }

        return res.status(500).json({
            success: false,
            message: "Unable to upload file.",
        });
    }
}



async function downloadFile(req, res) {
    try {
        const { fileId } = req.params;

        if (!require("mongoose").isValidObjectId(fileId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid file ID.",
            });
        }

        if (!req.room || !req.participant) {
            return res.status(403).json({
                success: false,
                message: "Room access has not been verified.",
            });
        }

        const file = await File.findOne({
            _id: fileId,
            room: req.room._id,
            cleanupStatus: "active",
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: "File not found or no longer available.",
            });
        }

        // Check the room's current status immediately before preparing access.
        const Room = require("../models/Room");
        const currentRoom = await Room.findById(req.room._id);

        if (
            !currentRoom ||
            currentRoom.status !== "active" ||
            currentRoom.expiresAt <= new Date()
        ) {
            return res.status(410).json({
                success: false,
                message: "This room has expired.",
            });
        }

        // Generate a short-lived Cloudinary private-download URL.
        const expiresAt = Math.floor(Date.now() / 1000) + 60 * 5;

        const path = require("path");
        const format = path.extname(file.originalName).slice(1).toLowerCase();

        if (!format) {
            return res.status(400).json({
                success: false,
                message: "Unable to determine the file format.",
            });
        }

        const downloadUrl = cloudinary.utils.private_download_url(
            file.cloudinaryPublicId,
            format,
            {
                resource_type: file.cloudinaryResourceType,
                type: "authenticated",
                expires_at: expiresAt,
                attachment: true,
            }
        );

        await recordAuditEvent({
            roomId: currentRoom._id,
            eventType: "FILE_DOWNLOADED",
            guestDisplayName:
                req.participant.type === "guest"
                    ? req.participant.displayName
                    : "Room creator",
        });

        return res.status(200).json({
            success: true,
            file: {
                id: file._id,
                originalName: file.originalName,
                downloadUrl,
                expiresAt: currentRoom.expiresAt,
                linkExpiresAt: new Date(expiresAt * 1000),
            },
        });
    } catch (error) {
        console.error("File download error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to prepare the download.",
        });
    }
}



async function listRoomFiles(req, res) {
    try {
        if (!req.room) {
            return res.status(403).json({
                success: false,
                message: "Room access has not been verified.",
            });
        }

        const files = await File.find({
            room: req.room._id,
            cleanupStatus: "active",
        })
            .select("originalName fileSize mimeType uploadedBy createdAt")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            files,
        });
    } catch (error) {
        console.error("List room files error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve room files.",
        });
    }
}

module.exports = { uploadFile, downloadFile, listRoomFiles };
