const mongoose = require("mongoose");

const examSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:       { type: String, required: true },
  class:       { type: String, required: true },
  section:     { type: String, default: "" },
  subject:     { type: String, required: true },
  date:        { type: Date, required: true },
  startTime:   { type: String, default: "" },
  endTime:     { type: String, default: "" },
  totalMarks:  { type: Number, required: true },
  passingMarks:{ type: Number, required: true },
  examType:    { type: String, enum: ["unit-test","mid-term","final","practical","assignment"], default: "unit-test" },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  instructions:{ type: String, default: "" },
  status:      { type: String, enum: ["upcoming","ongoing","completed","cancelled"], default: "upcoming" },
}, { timestamps: true });

const resultSchema = new mongoose.Schema({
  school:          { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  sourceType:      { type: String, enum: ["exam","test","scheduledExam"], default: "exam" },
  exam:            { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
  testId:          { type: mongoose.Schema.Types.ObjectId, ref: "Test" },
  scheduledExamId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduledExam" },
  examSubjectId:   { type: mongoose.Schema.Types.ObjectId, ref: "ExamSubject" },
  student:         { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  marksObtained:   { type: Number, required: true },
  totalMarks:      { type: Number, required: true },
  grade:           { type: String, default: "" },
  percentage:      { type: Number, default: 0 },
  isPassed:        { type: Boolean, default: false },
  remarks:         { type: String, default: "" },
  enteredBy:       { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
  isPublished:     { type: Boolean, default: false },
  publishedAt:     { type: Date },
}, { timestamps: true });

resultSchema.pre("save", function (next) {
  this.percentage = Math.round((this.marksObtained / this.totalMarks) * 100);
  this.isPassed   = this.marksObtained >= (this.totalMarks * 0.33);
  const p = this.percentage;
  if (p >= 90) this.grade = "A+";
  else if (p >= 80) this.grade = "A";
  else if (p >= 70) this.grade = "B+";
  else if (p >= 60) this.grade = "B";
  else if (p >= 50) this.grade = "C";
  else if (p >= 33) this.grade = "D";
  else this.grade = "F";
  next();
});

exports.Exam   = mongoose.model("Exam", examSchema);
exports.Result = mongoose.model("Result", resultSchema);
