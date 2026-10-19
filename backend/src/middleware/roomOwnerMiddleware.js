
const Room = require("../models/Room");

const roomOwnerMiddleware = async (req, res, next) => {
  try {
    const roomId = req.params.roomId;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required.",
      });
    }

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    if (room.owner.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Only the room owner can perform this action.",
      });
    }

    req.room = room;
    next();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid room ID.",
      });
    }

    console.error("Room owner check error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify room ownership.",
    });
  }
};

module.exports = roomOwnerMiddleware;
