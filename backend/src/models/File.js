
const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    uploadedBy: {
      type: String,
      required: true,
      trim: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    cloudinaryPublicId: {
      type: String,
      required: true,
      unique: true,
    },

    cloudinaryResourceType: {
      type: String,
      enum: ["image", "video", "raw"],
      default: "raw",
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },

    mimeType: {
      type: String,
      required: true,
    },

    sha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/i,
    },

    cleanupStatus: {
      type: String,
      enum: ["active", "pending", "deleted"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("File", fileSchema);
