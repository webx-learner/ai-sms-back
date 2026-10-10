const mongoose = require("mongoose");

// Participant sub-schema
const participantSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  role:     { type: String, enum: ["schooladmin", "teacher", "student", "parent"], required: true },
  name:     { type: String, required: true },
  unread:   { type: Number, default: 0 },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  participants: [participantSchema],
  lastMessage:  { type: String, default: "" },
  lastMessageAt:{ type: Date, default: Date.now },
  lastSenderId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

// Index for fast lookup by school and participant
conversationSchema.index({ school: 1, "participants.userId": 1 });
conversationSchema.index({ school: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
