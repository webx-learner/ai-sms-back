const mongoose = require("mongoose");

const timetableEntrySchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin",   required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: "Class",   required: true },
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
  day:          { type: String, enum: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], required: true },
  periodNumber: { type: Number, min: 1, required: true },
  subject:      { type: String, required: true, trim: true },
  startTime:    { type: String, default: "" },
  endTime:      { type: String, default: "" },
}, { timestamps: true });

// One entry per class + day + period
timetableEntrySchema.index({ school: 1, classId: 1, day: 1, periodNumber: 1 }, { unique: true });

module.exports = mongoose.model("TimetableEntry", timetableEntrySchema);
