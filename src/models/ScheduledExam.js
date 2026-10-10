const mongoose = require("mongoose");

const scheduledExamSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin",  required: true },
    title:       { type: String, required: true, trim: true },
    classId:     { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
    examType:    { type: String, enum: ["midterm", "final", "unit", "annual"], required: true },
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    description: { type: String, default: "" },
    status:      { type: String, enum: ["upcoming", "ongoing", "completed"], default: "upcoming" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduledExam", scheduledExamSchema);
