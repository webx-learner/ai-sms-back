const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },   // e.g. "10", "Class 9"
  section:      { type: String, required: true, trim: true, uppercase: true }, // "A", "B"
  classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  room:         { type: String, default: "" },
  subjects:         [{ type: String }],
  assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
}, { timestamps: true });

classSchema.index({ school: 1, name: 1, section: 1 }, { unique: true });

module.exports = mongoose.model("Class", classSchema);
