const mongoose = require("mongoose");

const homeworkSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  subject:     { type: String, required: true },
  class:       { type: String, required: true },
  section:     { type: String, default: "" },
  dueDate:     { type: Date, required: true },
  assignedBy:      { type: mongoose.Schema.Types.ObjectId, refPath: "assignedByModel" },
  assignedByModel: { type: String, enum: ["Teacher", "Admin"], default: "Teacher" },
  attachments: [{ type: String }],
  submissions: [{
    student:     { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    submittedAt: { type: Date, default: Date.now },
    note:        { type: String, default: "" },
    status:      { type: String, enum: ["submitted","late","graded"], default: "submitted" },
    marks:       { type: Number, default: null },
    feedback:    { type: String, default: "" },
  }],
  maxMarks:    { type: Number, default: null },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Homework", homeworkSchema);
