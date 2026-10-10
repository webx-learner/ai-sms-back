const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, lowercase: true, default: null },
  password:      { type: String, minlength: 6, default: null },
  phone:         { type: String, default: "" },
  studentId:     { type: String, unique: true },
  school:        { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  class:         { type: String, default: "" },
  section:       { type: String, default: "" },
  rollNumber:    { type: String, default: "" },
  dateOfBirth:   { type: Date, default: null },
  gender:        { type: String, enum: ["male", "female", "other"], default: "male" },
  address:       { type: String, default: "" },
  bloodGroup:    { type: String, default: "" },
  photo:         { type: String, default: "" },
  classTeacher:  { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
  parent:        { type: mongoose.Schema.Types.ObjectId, ref: "Parent", default: null },
  role:          { type: String, enum: ["student"], default: "student" },
  isActive:      { type: Boolean, default: true },
  isVerified:    { type: Boolean, default: true },
  resetOTP:      { type: String, default: null },
  resetOTPExpire:{ type: Date, default: null },
  canUseAI:      { type: Boolean, default: true },
  // Gamification
  badges:        [{ type: String }],
  points:        { type: Number, default: 0 },
  streakDays:    { type: Number, default: 0 },
  lastAttendance:{ type: Date, default: null },
  moodHistory:   [{ mood: String, date: Date }],
}, { timestamps: true });

studentSchema.pre("save", async function (next) {
  if (!this.studentId) {
    const count = await mongoose.model("Student").countDocuments();
    const year = new Date().getFullYear();
    this.studentId = "STU-" + year + "-" + String(count + 1).padStart(4, "0");
  }
  next();
});

studentSchema.methods.comparePassword = function (p) { return bcrypt.compare(p, this.password); };
module.exports = mongoose.model("Student", studentSchema);
