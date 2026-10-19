
const express = require("express");
const {
    joinRoom,
    leaveRoom,
    getRoomGuests,
} = require("../controllers/guestController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Join a room using an invite code and display name.
router.post("/join", joinRoom);

// Leave a room using the guest's session token.
router.post("/leave", leaveRoom);

// Only the authenticated room creator can view participants.
router.get(
    "/rooms/:roomId/guests",
    authMiddleware,
    getRoomGuests
);

module.exports = router;
