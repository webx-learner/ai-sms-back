const Admin   = require("../models/Admin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent  = require("../models/Parent");
const { generateToken, generateOTP, hashPassword } = require("../utils/helpers");
const { sendOTPMail, sendPasswordResetMail } = require("../services/mailService");
const bcrypt = require("bcryptjs");

// ── SCHOOL SIGNUP (Admin = School) ───────────────────────────
exports.schoolSignup = async (req, res) => {
  try {
    const { schoolName, schoolAddress, schoolPhone, name, email, password, phone } = req.body;
    if (!schoolName || !name || !email || !password)
      return res.status(400).json({ success: false, message: "School name, admin name, email, password required." });

    if (await Admin.findOne({ email }))
      return res.status(400).json({ success: false, message: "Email already registered." });

    const otp = generateOTP();
    const admin = await Admin.create({
      schoolName, schoolAddress: schoolAddress || "", schoolPhone: schoolPhone || "",
      name, email, phone: phone || "",
      password: await hashPassword(password),
      otp, otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      isVerified: false,
    });

    await sendOTPMail(email, otp);
    res.status(201).json({ success: true, message: "OTP sent to email. Verify to complete signup.", email });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── VERIFY SIGNUP OTP ────────────────────────────────────────
exports.verifySignupOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found." });
    if (admin.isVerified) return res.status(400).json({ success: false, message: "Already verified." });
    if (admin.otp !== otp || admin.otpExpire < Date.now())
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });

    admin.isVerified = true; admin.otp = null; admin.otpExpire = null;
    await admin.save();

    const token = generateToken(admin._id, "schooladmin", admin._id);
    res.json({ success: true, message: "School registered successfully!", token,
      user: { id: admin._id, name: admin.name, email: admin.email, role: "schooladmin", schoolName: admin.schoolName, schoolCode: admin.schoolCode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADMIN LOGIN ──────────────────────────────────────────────
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(404).json({ success: false, message: "No school found with this email." });
    if (!(await admin.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Incorrect password." });
    if (!admin.isVerified) return res.status(401).json({ success: false, message: "Email not verified." });
    if (!admin.isActive) return res.status(403).json({ success: false, message: "Account deactivated." });

    const token = generateToken(admin._id, "schooladmin", admin._id);
    res.json({ success: true, message: "Login successful", token,
      user: { id: admin._id, name: admin.name, email: admin.email, role: "schooladmin",
              schoolName: admin.schoolName, schoolCode: admin.schoolCode, phone: admin.phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TEACHER LOGIN ────────────────────────────────────────────
exports.teacherLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const teacher = await Teacher.findOne({ email }).populate("school", "schoolName schoolCode");
    if (!teacher)
      return res.status(404).json({ success: false, message: "No teacher account found with this email." });
    if (!(await teacher.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Incorrect password." });
    if (!teacher.isActive) return res.status(403).json({ success: false, message: "Account deactivated." });

    const token = generateToken(teacher._id, "teacher", teacher.school._id);
    res.json({ success: true, message: "Login successful", token,
      user: { id: teacher._id, name: teacher.name, email: teacher.email, role: "teacher",
              teacherId: teacher.teacherId, school: teacher.school, permissions: teacher.permissions,
              subjects: teacher.subjects, classes: teacher.classes } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── STUDENT LOGIN ────────────────────────────────────────────
exports.studentLogin = async (req, res) => {
  try {
    const { studentId, password } = req.body;
    const student = await Student.findOne({ studentId }).populate("school", "schoolName schoolCode");
    if (!student) return res.status(404).json({ success: false, message: "No student found with this Student ID." });
    if (!student.password) return res.status(400).json({ success: false, message: "Password not set. Contact admin." });
    if (!(await student.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Incorrect password." });
    if (!student.isActive) return res.status(403).json({ success: false, message: "Account deactivated." });

    const token = generateToken(student._id, "student", student.school._id);
    res.json({ success: true, message: "Login successful", token,
      user: { id: student._id, name: student.name, studentId: student.studentId, role: "student",
              class: student.class, section: student.section, school: student.school,
              points: student.points, streakDays: student.streakDays, badges: student.badges,
              canUseAI: student.canUseAI } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARENT LOGIN ─────────────────────────────────────────────
exports.parentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const parent = await Parent.findOne({ email }).populate("students", "name studentId class section");
    if (!parent)
      return res.status(404).json({ success: false, message: "No parent account found with this email." });
    if (!(await parent.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Incorrect password." });
    if (!parent.isActive) return res.status(403).json({ success: false, message: "Account deactivated." });

    const token = generateToken(parent._id, "parent", parent.school);
    res.json({ success: true, message: "Login successful", token,
      user: { id: parent._id, name: parent.name, email: parent.email, role: "parent", students: parent.students } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── FORGOT PASSWORD ──────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;
    let user;
    if (role === "schooladmin") user = await Admin.findOne({ email });
    else if (role === "teacher") user = await Teacher.findOne({ email });
    else if (role === "parent") user = await Parent.findOne({ email });
    else if (role === "student") user = await Student.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const otp = generateOTP();
    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();
    await sendPasswordResetMail(email, otp);
    res.json({ success: true, message: "Password reset OTP sent to email." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── RESET PASSWORD ───────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, role } = req.body;
    let user;
    if (role === "schooladmin") user = await Admin.findOne({ email });
    else if (role === "teacher") user = await Teacher.findOne({ email });
    else if (role === "parent") user = await Parent.findOne({ email });
    else if (role === "student") user = await Student.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.resetOTP !== otp || user.resetOTPExpire < Date.now())
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });

    user.password = await hashPassword(newPassword);
    user.resetOTP = null; user.resetOTPExpire = null;
    await user.save();
    res.json({ success: true, message: "Password reset successful. Please login." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CHANGE PASSWORD (logged in) ──────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = req.user;
    if (!await bcrypt.compare(oldPassword, user.password || ""))
      return res.status(400).json({ success: false, message: "Old password incorrect." });
    user.password = await hashPassword(newPassword);
    await user.save();
    res.json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET PROFILE ──────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ── RESEND OTP ───────────────────────────────────────────────
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found." });
    if (admin.isVerified) return res.status(400).json({ success: false, message: "Already verified." });
    const otp = generateOTP();
    admin.otp = otp; admin.otpExpire = new Date(Date.now() + 5 * 60 * 1000);
    await admin.save();
    await sendOTPMail(email, otp);
    res.json({ success: true, message: "OTP resent." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
