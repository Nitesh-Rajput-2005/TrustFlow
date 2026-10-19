
const express = require("express");

const {
    getRoomHistory,
    verifyRoomHistory,
} = require("../controllers/auditController");
const authMiddleware = require("../middleware/authMiddleware");
const roomOwnerMiddleware = require("../middleware/roomOwnerMiddleware");

const router = express.Router();

// Only the authenticated owner can view a room's audit history
router.get(
    "/rooms/:roomId/history",
    authMiddleware,
    roomOwnerMiddleware,
    getRoomHistory
);

router.get(
  "/rooms/:roomId/verify",
  authMiddleware,
  roomOwnerMiddleware,
  verifyRoomHistory
);

module.exports = router;
