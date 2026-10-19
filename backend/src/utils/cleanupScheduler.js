
const cron = require("node-cron");
const Room = require("../models/Room");
const File = require("../models/File");
const { cleanupExpiredRoom } = require("./roomCleanup");

function startCleanupScheduler() {
  cron.schedule("*/5 * * * *", async () => {
    console.log("Checking for expired TrustFlow rooms...");

    try {
      // Find rooms that still have files needing cleanup.
      const roomsWithFiles = await File.distinct("room", {
        cleanupStatus: { $in: ["active", "pending"] },
      });

      // Include already-expired rooms so failed deletions are retried.
      const expiredRooms = await Room.find({
        _id: { $in: roomsWithFiles },
        expiresAt: { $lte: new Date() },
      }).select("_id");

      for (const room of expiredRooms) {
        try {
          const result = await cleanupExpiredRoom(room._id);

          if (result.success) {
            console.log(`Cleaned up expired room ${room._id}`);
          } else {
            console.warn(
              `Cleanup incomplete for room ${room._id}:`,
              result
            );
          }
        } catch (error) {
          console.error(
            `Room cleanup failed for ${room._id}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        "Expired-room scan failed:",
        error.message
      );
    }
  });

  console.log("TrustFlow cleanup scheduler started.");
}

module.exports = { startCleanupScheduler };
