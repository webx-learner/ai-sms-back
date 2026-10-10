const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Class   = require("../models/Class");
const { hashPassword, generatePassword } = require("../utils/helpers");

exports.getMyProfile = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id)
      .select("-password")
      .populate("school", "schoolName schoolCode")
      .populate("assignedClasses", "name section room");
    res.json({ success: true, data: teacher });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const allowed = ["name","phone","qualification","experience"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const teacher = await Teacher.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");
    res.json({ success: true, message: "Profile updated.", data: teacher });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id).populate("assignedClasses", "name section");

    if (!teacher.assignedClasses || teacher.assignedClasses.length === 0) {
      return res.json({ success: true, count: 0, data: [], message: "No class assigned" });
    }

    // Build OR conditions for each assigned class
    const classFilters = teacher.assignedClasses.map((c) => ({ class: c.name, section: c.section }));
    const students = await Student.find({
      school: req.schoolId,
      isActive: true,
      $or: classFilters,
    }).select("-password").sort({ class: 1, rollNumber: 1 });

    res.json({ success: true, count: students.length, data: students });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createStudentByTeacher = async (req, res) => {
  try {
    if (!req.user.permissions?.canCreateStudent)
      return res.status(403).json({ success: false, message: "Permission denied: canCreateStudent" });
    const { name, studentClass, section, rollNumber, phone } = req.body;
    if (!name || !studentClass) return res.status(400).json({ success: false, message: "Name and class required." });
    const rawPass = generatePassword();
    const student = await Student.create({
      name, class: studentClass, section: section || "", rollNumber: rollNumber || "",
      phone: phone || "", password: await hashPassword(rawPass),
      school: req.schoolId, classTeacher: req.user._id, isVerified: true,
    });
    res.status(201).json({ success: true, message: "Student created.", data: { ...student.toObject(), password: undefined }, tempPassword: rawPass });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyPermissions = async (req, res) => {
  res.json({ success: true, permissions: req.user.permissions });
};
