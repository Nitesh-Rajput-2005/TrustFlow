
const express = require("express");


const {
    createRoom,
    getRoomByInviteCode,
    getMyRooms,
    closeRoom,
    reopenRoom,
    deleteRoom,
} = require("../controllers/roomController");


const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// List rooms belonging to the logged-in user
router.get("/my-rooms", authMiddleware, getMyRooms);

// Close a room owned by the logged-in user
router.patch("/:roomId/close", authMiddleware, closeRoom);

router.patch("/:roomId/reopen", authMiddleware, reopenRoom);


router.delete("/:roomId", authMiddleware, deleteRoom);


// Only authenticated users can create rooms
router.post("/", authMiddleware, createRoom);

// Guests can look up a room using its invite code
router.get("/:inviteCode", getRoomByInviteCode);

module.exports = router;


