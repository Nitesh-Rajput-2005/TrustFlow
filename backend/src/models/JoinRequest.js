
const mongoose = require("mongoose");

const joinRequestSchema = new mongoose.Schema(
    {
        room: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Room",
            required: true,
            index: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 40,
        },
        requestTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "withdrawn"],
            default: "pending",
            index: true,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

joinRequestSchema.index({ room: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("JoinRequest", joinRequestSchema);
