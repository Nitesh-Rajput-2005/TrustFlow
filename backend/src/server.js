
require("dotenv").config();
const roomRoutes = require("./routes/roomRoutes");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const guestRoutes = require("./routes/guestRoutes");
const auditRoutes = require("./routes/auditRoutes");
const fileRoutes = require("./routes/fileRoutes");
const { startCleanupScheduler } = require("./utils/cleanupScheduler");

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/files", fileRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to TrustFlow API",
        status: "running",
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "TrustFlow backend is healthy",
    });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
    res.json({
        success: true,
        message: "Authentication successful",
        userId: req.user.userId,
    });
});


async function startServer() {
    try {
        await connectDB();

        // Start automatic expired-room cleanup
        startCleanupScheduler();

        app.listen(PORT, () => {
            console.log(`TrustFlow server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start TrustFlow server:", error.message);
        process.exit(1);
    }
}

startServer();


