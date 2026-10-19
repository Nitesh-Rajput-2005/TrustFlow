
const crypto = require("crypto");
const GuestSession = require("../models/GuestSession");
const Room = require("../models/Room");

async function guestAuthMiddleware(req, res, next) {
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
        message: "Guest session has expired or is invalid.",
      });
    }

    const room = await Room.findById(guestSession.room);

    if (
      !room ||
      room.status !== "active" ||
      room.expiresAt <= new Date()
    ) {
      return res.status(410).json({
        success: false,
        message: "This room has expired or is no longer active.",
      });
    }

    req.guestSession = guestSession;
    req.room = room;

    next();
  } catch (error) {
    console.error("Guest authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify guest session.",
    });
  }
}

module.exports = guestAuthMiddleware;
