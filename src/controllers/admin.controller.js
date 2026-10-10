const Admin   = require("../models/Admin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent  = require("../models/Parent");
const Class   = require("../models/Class");
const { FeePayment, FeeStructure } = require("../models/Fee");
const AttendanceRecord = require("../models/AttendanceRecord");
const { hashPassword, generatePassword } = require("../utils/helpers");
const { sendCredentialsMail } = require("../services/mailService");

// ── SCHOOL PROFILE ───────────────────────────────────────────
exports.getSchoolProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select("-password -otp -resetOTP");
    res.json({ success: true, data: admin });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateSchoolProfile = async (req, res) => {
  try {
    const { schoolName, schoolAddress, schoolPhone, schoolEmail, website, logo, name, phone } = req.body;
    const admin = await Admin.findByIdAndUpdate(req.user._id,
      { schoolName, schoolAddress, schoolPhone, schoolEmail, website, logo, name, phone },
      { new: true, runValidators: true }).select("-password");
    res.json({ success: true, message: "Profile updated.", data: admin });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── TEACHER MANAGEMENT ───────────────────────────────────────
exports.createTeacher = async (req, res) => {
  try {
    const { name, email, phone, subjects, classes, classIds, qualification, experience, designation } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: "Name and email required." });
    if (await Teacher.findOne({ email }))
      return res.status(400).json({ success: false, message: "Teacher email already exists." });

    // Resolve classIds → Class docs for label sync
    let assignedClasses = [];
    let classLabels = classes || [];
    if (Array.isArray(classIds) && classIds.length > 0) {
      const clsDocs = await Class.find({ _id: { $in: classIds }, school: req.user._id });
      assignedClasses = clsDocs.map((c) => c._id);
      classLabels = clsDocs.map((c) => `${c.name}-${c.section}`);
    }

    const rawPassword = generatePassword();
    const teacher = await Teacher.create({
      name, email, phone: phone || "",
      subjects: subjects || [], classes: classLabels,
      assignedClasses,
      qualification: qualification || "", experience: experience || "", designation: designation || "Teacher",
      password: await hashPassword(rawPassword),
      school: req.user._id, isVerified: true,
    });

    try { await sendCredentialsMail(email, { name, userId: teacher.teacherId, email, password: rawPassword }); }
    catch (e) { console.log("Mail error:", e.message); }

    res.status(201).json({ success: true, message: "Teacher created. Credentials sent to email.",
      data: { ...teacher.toObject(), password: undefined }, tempPassword: rawPassword });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const query = { school: req.user._id };
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (search) query.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { teacherId: { $regex: search, $options: "i" } }];
    const teachers = await Teacher.find(query).select("-password").populate("assignedClasses", "name section").sort({ createdAt: -1 });
    res.json({ success: true, count: teachers.length, data: teachers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ _id: req.params.id, school: req.user._id }).select("-password");
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });
    res.json({ success: true, data: teacher });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateTeacher = async (req, res) => {
  try {
    const { name, phone, subjects, classes, classIds, qualification, experience, designation, isActive } = req.body;

    const updateData = { name, phone, subjects, qualification, experience, designation, isActive };

    // Resolve classIds if provided
    if (Array.isArray(classIds)) {
      if (classIds.length === 0) {
        updateData.assignedClasses = [];
        updateData.classes = [];
      } else {
        const clsDocs = await Class.find({ _id: { $in: classIds }, school: req.user._id });
        updateData.assignedClasses = clsDocs.map((c) => c._id);
        updateData.classes = clsDocs.map((c) => `${c.name}-${c.section}`);
      }
    } else if (classes) {
      updateData.classes = classes;
    }

    const teacher = await Teacher.findOneAndUpdate(
      { _id: req.params.id, school: req.user._id },
      updateData,
      { new: true }
    ).select("-password").populate("assignedClasses", "name section");
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });

    res.json({ success: true, message: "Teacher updated.", data: teacher });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findOneAndDelete({ _id: req.params.id, school: req.user._id });
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });
    res.json({ success: true, message: "Teacher deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── ASSIGN CLASSES TO TEACHER (multiple) ─────────────────────
exports.assignClassToTeacher = async (req, res) => {
  try {
    const { classIds } = req.body; // array of Class ObjectIds

    const teacher = await Teacher.findOne({ _id: req.params.id, school: req.user._id });
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });

    if (!Array.isArray(classIds) || classIds.length === 0) {
      teacher.assignedClasses = [];
      teacher.classes = [];
      await teacher.save();
      return res.json({ success: true, message: "Classes unassigned.", data: teacher });
    }

    const clsDocs = await Class.find({ _id: { $in: classIds }, school: req.user._id });
    teacher.assignedClasses = clsDocs.map((c) => c._id);
    teacher.classes         = clsDocs.map((c) => `${c.name}-${c.section}`);
    await teacher.save();

    const populated = await Teacher.findById(teacher._id).populate("assignedClasses", "name section").select("-password");
    res.json({ success: true, message: "Classes assigned.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── TEACHER PERMISSIONS ──────────────────────────────────────
exports.updateTeacherPermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    const teacher = await Teacher.findOneAndUpdate(
      { _id: req.params.id, school: req.user._id },
      { permissions },
      { new: true }).select("-password");
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });
    res.json({ success: true, message: "Permissions updated.", data: teacher });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── STUDENT MANAGEMENT ───────────────────────────────────────
exports.createStudent = async (req, res) => {
  try {
    const { name, email, phone, studentClass, section, rollNumber, dateOfBirth, gender, address, bloodGroup,
            classTeacher, parentName, parentEmail, parentPhone, parentRelation } = req.body;
    if (!name || !studentClass) return res.status(400).json({ success: false, message: "Name and class required." });

    const rawPassword = generatePassword();
    const student = await Student.create({
      name, email: email || null, phone: phone || "",
      class: studentClass, section: section || "", rollNumber: rollNumber || "",
      dateOfBirth: dateOfBirth || null, gender: gender || "male",
      address: address || "", bloodGroup: bloodGroup || "",
      password: await hashPassword(rawPassword),
      school: req.user._id, classTeacher: classTeacher || null, isVerified: true,
    });

    // Create parent if details provided
    let parent = null;
    console.log("[createStudent] parentName:", parentName, "| parentEmail:", parentEmail);
    if (parentName && parentEmail) {
      const parentRawPass = generatePassword();
      const existingParent = await Parent.findOne({ email: parentEmail });
      console.log("[createStudent] existingParent found:", !!existingParent);
      if (existingParent) {
        existingParent.students.push(student._id);
        await existingParent.save();
        parent = existingParent;
        console.log("[createStudent] Parent already exists → no email sent");
      } else {
        parent = await Parent.create({
          name: parentName, email: parentEmail, phone: parentPhone || "",
          relation: parentRelation || "father", school: req.user._id,
          students: [student._id], password: await hashPassword(parentRawPass),
        });
        try {
          await sendCredentialsMail(parentEmail, { name: parentName, userId: "PARENT", email: parentEmail, password: parentRawPass });
          console.log("[createStudent] Parent email sent to:", parentEmail);
        }
        catch (e) { console.log("Parent mail error:", e.message); }
      }
      student.parent = parent._id;
      await student.save();
    } else {
      console.log("[createStudent] Parent skipped → parentName or parentEmail missing");
    }

    if (email) {
      try { await sendCredentialsMail(email, { name, userId: student.studentId, email, password: rawPassword }); }
      catch (e) { console.log("Student mail error:", e.message); }
    }

    res.status(201).json({ success: true, message: "Student created successfully.",
      data: { ...student.toObject(), password: undefined }, tempPassword: rawPassword,
      parent: parent ? { ...parent.toObject(), password: undefined } : null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllStudents = async (req, res) => {
  try {
    const { search, studentClass, section, isActive } = req.query;
    const query = { school: req.schoolId };
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (studentClass) query.class = studentClass;
    if (section) query.section = section;
    if (search) query.$or = [
      { name: { $regex: search, $options: "i" } },
      { studentId: { $regex: search, $options: "i" } },
      { rollNumber: { $regex: search, $options: "i" } },
    ];

    const [students, feePayments, feeStructures, attendanceDocs] = await Promise.all([
      Student.find(query).select("-password")
        .populate("classTeacher", "name teacherId")
        .populate("parent", "name email phone")
        .sort({ class: 1, rollNumber: 1 }),
      FeePayment.find({ school: req.schoolId }).select("student status"),
      FeeStructure.find({ school: req.schoolId, isActive: true }).select("class"),
      AttendanceRecord.find({ school: req.schoolId }).select("studentId status"),
    ]);

    // Build fee map: studentId → array of statuses
    const feeMap = {};
    for (const p of feePayments) {
      const sid = p.student.toString();
      if (!feeMap[sid]) feeMap[sid] = [];
      feeMap[sid].push(p.status);
    }

    // Set of classes that have at least one active fee structure
    const classesWithFees = new Set(feeStructures.map(fs => fs.class));

    // Build attendance map: studentId → { present, total }
    const attMap = {};
    for (const rec of attendanceDocs) {
      const sid = rec.studentId.toString();
      if (!attMap[sid]) attMap[sid] = { present: 0, total: 0 };
      attMap[sid].total++;
      if (rec.status === "present" || rec.status === "late") attMap[sid].present++;
    }

    const data = students.map(s => {
      const obj = s.toObject();
      const sid = s._id.toString();
      const statuses = feeMap[sid] || [];

      let feeStatus;
      if (statuses.length === 0) {
        feeStatus = classesWithFees.has(s.class) ? "pending" : "clear";
      } else if (statuses.some(st => st === "pending" || st === "overdue")) {
        feeStatus = "pending";
      } else if (statuses.some(st => st === "partial")) {
        feeStatus = "partial";
      } else {
        feeStatus = "paid";
      }

      const att = attMap[sid];
      const attendance = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;

      return { ...obj, feeStatus, attendance };
    });

    res.json({ success: true, count: data.length, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStudent = async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, school: req.schoolId })
      .select("-password").populate("classTeacher", "name teacherId email").populate("parent");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, data: student });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateStudent = async (req, res) => {
  try {
    const allowed = ["name","phone","class","section","rollNumber","dateOfBirth","gender","address","bloodGroup","classTeacher","isActive","photo"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const student = await Student.findOneAndUpdate({ _id: req.params.id, school: req.user._id }, updates, { new: true }).select("-password");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, message: "Student updated.", data: student });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ _id: req.params.id, school: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, message: "Student deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── STUDENT AI PERMISSION ────────────────────────────────────
exports.updateStudentAIPermission = async (req, res) => {
  try {
    const { canUseAI } = req.body;
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, school: req.user._id },
      { canUseAI: !!canUseAI },
      { new: true }).select("-password");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, message: `AI access ${canUseAI ? "granted" : "revoked"}.`, data: student });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── CLASS MANAGEMENT ─────────────────────────────────────────
exports.createClass = async (req, res) => {
  try {
    const { name, section, classTeacher, room, subjects } = req.body;
    if (!name || !section) return res.status(400).json({ success: false, message: "Class name and section required." });
    const existing = await Class.findOne({ school: req.user._id, name, section });
    if (existing) return res.status(400).json({ success: false, message: "Class already exists." });
    const cls = await Class.create({ name, section, classTeacher: classTeacher || null, room: room || "", subjects: subjects || [], school: req.user._id });
    await cls.populate("classTeacher", "name teacherId");
    res.status(201).json({ success: true, message: "Class created.", data: cls });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllClasses = async (req, res) => {
  try {
    const classes = await Class.find({ school: req.schoolId })
      .populate("classTeacher", "name teacherId")
      .sort({ name: 1, section: 1 });
    // Attach real student counts
    const withCounts = await Promise.all(classes.map(async (c) => {
      const count = await Student.countDocuments({ school: req.schoolId, class: c.name, section: c.section, isActive: true });
      return { ...c.toObject(), studentCount: count };
    }));
    res.json({ success: true, count: classes.length, data: withCounts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateClass = async (req, res) => {
  try {
    const { name, section, classTeacher, room, subjects } = req.body;
    const cls = await Class.findOneAndUpdate(
      { _id: req.params.id, school: req.user._id },
      { name, section, classTeacher: classTeacher || null, room, subjects },
      { new: true }).populate("classTeacher", "name teacherId");
    if (!cls) return res.status(404).json({ success: false, message: "Class not found." });
    res.json({ success: true, message: "Class updated.", data: cls });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteClass = async (req, res) => {
  try {
    const cls = await Class.findOneAndDelete({ _id: req.params.id, school: req.user._id });
    if (!cls) return res.status(404).json({ success: false, message: "Class not found." });
    res.json({ success: true, message: "Class deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── STATS ────────────────────────────────────────────────────
exports.getSchoolStats = async (req, res) => {
  try {
    const schoolId = req.user._id;
    const [totalTeachers, activeTeachers, totalStudents, activeStudents] = await Promise.all([
      Teacher.countDocuments({ school: schoolId }),
      Teacher.countDocuments({ school: schoolId, isActive: true }),
      Student.countDocuments({ school: schoolId }),
      Student.countDocuments({ school: schoolId, isActive: true }),
    ]);
    res.json({ success: true, data: { totalTeachers, activeTeachers, totalStudents, activeStudents } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
