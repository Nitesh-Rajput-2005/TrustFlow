const express = require("express");

const {
    joinRoom,
    requestToJoinRoom,
    leaveRoom,
    getRoomGuests,
    getJoinRequests,
    reviewJoinRequest,
    getJoinRequestStatus,
    withdrawJoinRequest,
} = require("../controllers/guestController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/request-join", requestToJoinRoom);

// Join a room using an invite code and display name.
router.post("/join", joinRoom);

// Leave a room using the guest's session token.
router.post("/leave", leaveRoom);

router.get(
    "/rooms/:roomId/join-requests",
    authMiddleware,
    getJoinRequests
);

router.patch(
    "/rooms/:roomId/join-requests/:requestId",
    authMiddleware,
    reviewJoinRequest
);

router.post("/join-request-status", getJoinRequestStatus);

router.post("/withdraw-join-request", withdrawJoinRequest);

// Only the authenticated room creator can view participants.
router.get(
    "/rooms/:roomId/guests",
    authMiddleware,
    getRoomGuests
);

module.exports = router;
