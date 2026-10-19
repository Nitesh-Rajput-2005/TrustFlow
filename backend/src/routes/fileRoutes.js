
const express = require("express");
const multer = require("multer");
const {
    uploadFile,
    downloadFile,
    listRoomFiles,
} = require("../controllers/fileController");
const roomParticipantMiddleware = require("../middleware/roomParticipantMiddleware");

const router = express.Router();


const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (req, file, callback) => {
        if (allowedMimeTypes.has(file.mimetype)) {
            return callback(null, true);
        }

        return callback(
            new Error("This file type is not allowed.")
        );
    },
});


router.post(
    "/rooms/:roomId/upload",
    roomParticipantMiddleware,
    upload.single("file"),
    uploadFile
);

router.get(
    "/rooms/:roomId/files/:fileId/download",
    roomParticipantMiddleware,
    downloadFile
);

router.get(
    "/rooms/:roomId/files",
    roomParticipantMiddleware,
    listRoomFiles
);


router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";

        return res.status(tooLarge ? 413 : 400).json({
            success: false,
            message: tooLarge
                ? "File exceeds the 10 MB limit."
                : "Invalid file upload.",
        });
    }

    if (error.message === "This file type is not allowed.") {
        return res.status(400).json({
            success: false,
            message:
                "Unsupported file type. Please select a supported format.",
        });
    }

    console.error("File route error:", error.message);

    return res.status(500).json({
        success: false,
        message: "An unexpected file upload error occurred.",
    });
});


module.exports = router;
