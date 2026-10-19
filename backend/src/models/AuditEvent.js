
const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
    {
        room: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Room",
            required: true,
            index: true,
        },
        sequence: {
            type: Number,
            required: true,
        },
        eventType: {
            type: String,
            required: true,
            enum: [
                "GUEST_JOINED",
                "FILE_UPLOADED",
                "FILE_DOWNLOADED",
                "GUEST_LEFT",
            ],
        },
        guestDisplayName: {
            type: String,
            default: null,
            maxlength: 40,
        },
        timestamp: {
            type: Date,
            default: Date.now,
            required: true,
        },
        previousHash: {
            type: String,
            required: true,
        },
        eventHash: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

auditEventSchema.index(
    { room: 1, sequence: 1 },
    { unique: true }
);

module.exports = mongoose.model("AuditEvent", auditEventSchema);
