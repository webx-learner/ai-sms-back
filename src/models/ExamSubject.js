const mongoose = require("mongoose");

const examSubjectSchema = new mongoose.Schema(
  {
    school:     { type: mongoose.Schema.Types.ObjectId, ref: "Admin",         required: true },
    examId:     { type: mongoose.Schema.Types.ObjectId, ref: "ScheduledExam", required: true },
    subjectId:  { type: mongoose.Schema.Types.ObjectId, ref: "Subject",       required: true },
    date:       { type: Date, required: true },
    totalMarks: { type: Number, required: true, min: 1 },
    duration:   { type: Number, required: true, min: 1 }, // minutes
  },
  { timestamps: true }
);

// One subject can appear only once per exam
examSubjectSchema.index({ examId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model("ExamSubject", examSubjectSchema);
