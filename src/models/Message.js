const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole:   { type: String, enum: ["schooladmin", "teacher", "student", "parent"], required: true },
  senderName:   { type: String, required: true },
  text:         { type: String, required: true, trim: true, maxlength: 2000 },
  read:         { type: Boolean, default: false },
  readAt:       { type: Date, default: null },
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ school: 1 });

module.exports = mongoose.model("Message", messageSchema);
