const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  school:   { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  class:    { type: String, required: true },
  section:  { type: String, default: "" },
  date:     { type: Date, required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  records: [{
    student:  { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    status:   { type: String, enum: ["present","absent","late","holiday","leave"], default: "present" },
    remark:   { type: String, default: "" },
  }],
  subject:  { type: String, default: "" },
}, { timestamps: true });

attendanceSchema.index({ school: 1, class: 1, date: 1 }, { unique: true });
module.exports = mongoose.model("Attendance", attendanceSchema);
