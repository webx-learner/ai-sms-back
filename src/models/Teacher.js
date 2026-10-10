const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const permissionsSchema = new mongoose.Schema({
  canCreateStudent:   { type: Boolean, default: false },
  canEditStudent:     { type: Boolean, default: false },
  canDeleteStudent:   { type: Boolean, default: false },
  canViewAllStudents: { type: Boolean, default: false },
  canMarkAttendance:  { type: Boolean, default: false },
  canViewAttendance:  { type: Boolean, default: false },
  canManageFees:      { type: Boolean, default: false },
  canViewFees:        { type: Boolean, default: false },
  canCreateExam:      { type: Boolean, default: false },
  canEnterMarks:      { type: Boolean, default: false },
  canViewExams:       { type: Boolean, default: true },
  canPostNotice:      { type: Boolean, default: false },
  canViewNotices:     { type: Boolean, default: true },
  canAssignHomework:  { type: Boolean, default: false },
  canViewHomework:    { type: Boolean, default: true },
  canPostNoticeBoard: { type: Boolean, default: false },
  canManageLibrary:   { type: Boolean, default: false },
  canDailyChallenge:  { type: Boolean, default: false },
  canAwardBadges:     { type: Boolean, default: false },
}, { _id: false });

const teacherSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  password:      { type: String, required: true, minlength: 6 },
  phone:         { type: String, default: "" },
  teacherId:     { type: String, unique: true },
  school:        { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  subjects:      [{ type: String }],
  classes:       [{ type: String }],
  qualification: { type: String, default: "" },
  experience:    { type: String, default: "" },
  designation:   { type: String, default: "Teacher" },
  role:            { type: String, enum: ["teacher"], default: "teacher" },
  assignedClasses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
  permissions:     { type: permissionsSchema, default: () => ({}) },
  isActive:      { type: Boolean, default: true },
  isVerified:    { type: Boolean, default: true },
  resetOTP:      { type: String, default: null },
  resetOTPExpire:{ type: Date, default: null },
  // Gamification
  badges:        [{ type: String }],
  points:        { type: Number, default: 0 },
}, { timestamps: true });

teacherSchema.pre("save", async function (next) {
  if (!this.teacherId) {
    const count = await mongoose.model("Teacher").countDocuments();
    const year = new Date().getFullYear();
    this.teacherId = "TCH-" + year + "-" + String(count + 1).padStart(4, "0");
  }
  next();
});

teacherSchema.methods.comparePassword = function (p) { return bcrypt.compare(p, this.password); };
module.exports = mongoose.model("Teacher", teacherSchema);
