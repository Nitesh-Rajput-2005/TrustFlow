
const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
    {
        owner: {
            type: require("mongoose").Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 60,
        },

        inviteCode: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "expired", "closed"],
            default: "active",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Room", roomSchema);
