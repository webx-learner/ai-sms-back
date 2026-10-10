const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema({
  school:     { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:      { type: String, required: true },
  content:    { type: String, required: true },
  category:   { type: String, enum: ["general","exam","fee","holiday","event","urgent","other"], default: "general" },
  targetRoles:{ type: [String], enum: ["all","teacher","student","parent"], default: ["all"] },
  targetClass:{ type: String, default: "" },
  postedBy:   { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "postedByModel" },
  postedByModel:{ type: String, enum: ["Admin","Teacher"], required: true },
  isUrgent:   { type: Boolean, default: false },
  isPinned:   { type: Boolean, default: false },
  expiryDate: { type: Date, default: null },
  views:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Notice", noticeSchema);
