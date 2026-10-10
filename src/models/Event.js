const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:        { type: String, required: true },
  description:  { type: String, default: "" },
  startDate:    { type: Date, required: true },
  endDate:      { type: Date, required: true },
  eventType:    { type: String, enum: ["holiday","exam","sports","cultural","meeting","other"], default: "other" },
  targetClass:  { type: String, default: "all" },
  venue:        { type: String, default: "" },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  isPublic:     { type: Boolean, default: true },
  color:        { type: String, default: "#4F46E5" },
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema);
