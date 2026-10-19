
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 60,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            select: false,
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        otpHash: {
            type: String,
            select: false,
        },

        otpExpiresAt: {
            type: Date,
            select: false,
        },

        otpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        otpLastSentAt: {
            type: Date,
            select: false,
        },


        resetOtpHash: {
            type: String,
            select: false,
        },

        resetOtpExpiresAt: {
            type: Date,
            select: false,
        },

        resetOtpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
