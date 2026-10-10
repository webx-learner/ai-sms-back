const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: "Class",   required: true },
  school:    { type: mongoose.Schema.Types.ObjectId, ref: "Admin",   required: true },
  date:      { type: Date, required: true },
  status:    { type: String, enum: ["present", "absent", "late"], required: true },
  markedBy: {
    id:   { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ["admin", "teacher"], required: true },
    name: { type: String, default: "" },
  },
}, { timestamps: true });

// One record per student per date per school
attendanceRecordSchema.index({ school: 1, studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceRecord", attendanceRecordSchema);
