
require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
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

// Create HTTP server
const server = http.createServer(app);

// Attach Socket.IO
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:5173",
            "https://trust-flow-lyart.vercel.app",
        ],
        methods: ["GET", "POST", "PATCH", "DELETE"],
    },
});



const crypto = require("crypto");
const GuestSession = require("./models/GuestSession");
const Room = require("./models/Room");

io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error("Authentication required"));
    }

    // First, try authenticating as a logged-in owner.
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "trustflow",
            audience: "trustflow-users",
        });

        socket.user = {
            role: "owner",
            userId: decoded.userId,
        };

        return next();
    } catch (error) {
        // If it's not a valid owner JWT, check whether it's a guest token.
    }

    // Guest tokens are 64-character hexadecimal strings.
    if (!/^[a-f0-9]{64}$/i.test(token)) {
        return next(new Error("Invalid authentication token"));
    }

    try {
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const guest = await GuestSession.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
            leftAt: null,
        }).select("+tokenHash");

        if (!guest) {
            return next(new Error("Guest session expired or inactive"));
        }

        const room = await Room.findOne({
            _id: guest.room,
            status: "active",
            expiresAt: { $gt: new Date() },
        });

        if (!room) {
            return next(new Error("Room is no longer active"));
        }

        socket.user = {
            role: "guest",
            guestSessionId: guest._id.toString(),
            roomId: room._id.toString(),
            displayName: guest.displayName,
        };

        return next();
    } catch (error) {
        console.error("Socket authentication error:", error.message);
        return next(new Error("Unable to authenticate connection"));
    }
});

// Make io available to routes/controllers through req.app.get("io")
app.set("io", io);


io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id, socket.user.role);

    socket.on("room:subscribe", async (roomId, callback) => {
        try {
            if (typeof roomId !== "string" || !/^[a-f0-9]{24}$/i.test(roomId)) {
                return callback?.({ success: false, message: "Invalid room ID" });
            }

            const room = await Room.findOne({
                _id: roomId,
                status: "active",
                expiresAt: { $gt: new Date() },
            });

            if (!room) {
                return callback?.({ success: false, message: "Room is unavailable" });
            }

            if (socket.user.role === "owner") {
                if (room.owner.toString() !== socket.user.userId) {
                    return callback?.({ success: false, message: "Access denied" });
                }

                socket.join(`room:${roomId}:members`);
                socket.join(`room:${roomId}:owners`);
            } else if (socket.user.role === "guest") {
                if (socket.user.roomId !== roomId) {
                    return callback?.({ success: false, message: "Access denied" });
                }

                socket.join(`room:${roomId}:members`);
            } else {
                return callback?.({ success: false, message: "Access denied" });
            }

            return callback?.({ success: true });
        } catch (error) {
            console.error("Room subscription error:", error.message);
            return callback?.({ success: false, message: "Unable to subscribe" });
        }
    });


    socket.on("room:unsubscribe", (roomId) => {
        if (typeof roomId !== "string" || !/^[a-f0-9]{24}$/i.test(roomId)) {
            return;
        }

        socket.leave(`room:${roomId}:members`);
        socket.leave(`room:${roomId}:owners`);
    });


    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });
});


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

        startCleanupScheduler();

        server.listen(PORT, () => {
            console.log(`TrustFlow server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start TrustFlow server:", error.message);
        process.exit(1);
    }
}

startServer();
