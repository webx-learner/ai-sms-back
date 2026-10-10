const mongoose = require("mongoose");

const periodSchema = new mongoose.Schema({
  periodNo:  { type: Number, required: true },
  subject:   { type: String, required: true },
  teacher:   { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
  startTime: { type: String, required: true },
  endTime:   { type: String, required: true },
  room:      { type: String, default: "" },
}, { _id: false });

const timetableSchema = new mongoose.Schema({
  school:  { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  class:   { type: String, required: true },
  section: { type: String, default: "" },
  day:     { type: String, enum: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], required: true },
  periods: [periodSchema],
  academicYear: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

timetableSchema.index({ school: 1, class: 1, section: 1, day: 1 }, { unique: true });
module.exports = mongoose.model("Timetable", timetableSchema);
