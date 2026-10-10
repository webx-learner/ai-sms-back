const Attendance       = require("../models/Attendance");
const AttendanceRecord = require("../models/AttendanceRecord");
const Student          = require("../models/Student");
const Class            = require("../models/Class");
const Parent           = require("../models/Parent");
const Teacher          = require("../models/Teacher");
const { sendAbsentAlertMail } = require("../services/mailService");

// Helper: get teacher's assigned classes array (returns [] if none)
async function getTeacherClasses(userId) {
  const teacher = await Teacher.findById(userId).populate("assignedClasses", "name section");
  return teacher?.assignedClasses || [];
}

// ── MARK ATTENDANCE ──────────────────────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    let { studentClass, section, date, records, subject } = req.body;
    const schoolId = req.schoolId;

    // Teacher can only mark attendance for one of their assigned classes
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      if (assigned.length === 0)
        return res.status(403).json({ success: false, message: "No class assigned to you yet." });
      // If teacher sends a class, verify it's one of their assigned ones
      const match = assigned.find((c) => c.name === studentClass && c.section === (section || ""));
      if (!match) {
        // Default to first assigned class if no valid class sent
        studentClass = assigned[0].name;
        section      = assigned[0].section;
      }
    }
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0,0,0,0);

    const existing = await Attendance.findOne({ school: schoolId, class: studentClass, section: section || "", date: attendanceDate });
    if (existing) {
      existing.records = records;
      existing.markedBy = req.user._id;
      existing.subject = subject || "";
      await existing.save();
      return res.json({ success: true, message: "Attendance updated.", data: existing });
    }

    const attendance = await Attendance.create({
      school: schoolId, class: studentClass, section: section || "",
      date: attendanceDate, markedBy: req.user._id, records, subject: subject || "",
    });

    // Update streak & send absent alerts
    const absentStudentIds = records.filter(r => r.status === "absent").map(r => r.student);
    if (absentStudentIds.length > 0) {
      const absentStudents = await Student.find({ _id: { $in: absentStudentIds } }).populate("parent");
      for (const s of absentStudents) {
        // Reset streak
        s.streakDays = 0; await s.save();
        // Send mail to parent
        if (s.parent && s.parent.email) {
          try { await sendAbsentAlertMail(s.parent.email, s.name, new Date(date).toLocaleDateString()); }
          catch (e) { console.log("Alert mail failed:", e.message); }
        }
      }
    }

    // Update streak for present students
    const presentIds = records.filter(r => r.status === "present").map(r => r.student);
    if (presentIds.length > 0) {
      await Student.updateMany({ _id: { $in: presentIds } },
        { $inc: { streakDays: 1, points: 2 }, lastAttendance: attendanceDate });
      // Badge for 30-day streak
      const thirtyStreakers = await Student.find({ _id: { $in: presentIds }, streakDays: { $gte: 30 } });
      for (const s of thirtyStreakers) {
        if (!s.badges.includes("30-Day Streak")) {
          s.badges.push("30-Day Streak"); s.points += 50; await s.save();
        }
      }
    }

    res.status(201).json({ success: true, message: "Attendance marked.", data: attendance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET ATTENDANCE BY DATE & CLASS ───────────────────────────
exports.getAttendanceByDate = async (req, res) => {
  try {
    let { studentClass, section, date } = req.query;
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0,0,0,0);

    // Teacher: restrict to only their assigned classes
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      if (assigned.length === 0)
        return res.json({ success: true, data: null, message: "No class assigned" });
      // Allow only if requested class is in their assigned list, otherwise use first
      const match = assigned.find((c) => c.name === studentClass && c.section === (section || ""));
      if (!match) {
        studentClass = assigned[0].name;
        section      = assigned[0].section;
      }
    }

    const query = { school: req.schoolId, date: attendanceDate };
    if (studentClass) query.class = studentClass;
    if (section) query.section = section;
    const attendance = await Attendance.findOne(query)
      .populate("records.student", "name studentId rollNumber photo")
      .populate("markedBy", "name teacherId");
    res.json({ success: true, data: attendance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET STUDENT ATTENDANCE (for student dashboard) ───────────
exports.getStudentAttendance = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    const { month, year } = req.query;
    const query = { "records.student": studentId };
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 0);
      query.date  = { $gte: start, $lte: end };
    }
    const records = await Attendance.find(query).select("date records class section");
    const studentRecords = records.map(a => {
      const r = a.records.find(rec => rec.student.toString() === studentId.toString());
      return { date: a.date, status: r ? r.status : "N/A", class: a.class, section: a.section, remark: r ? r.remark : "" };
    });

    const total   = studentRecords.length;
    const present = studentRecords.filter(r => r.status === "present").length;
    const absent  = studentRecords.filter(r => r.status === "absent").length;
    const late    = studentRecords.filter(r => r.status === "late").length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({ success: true, data: { records: studentRecords, summary: { total, present, absent, late, percentage } } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── MONTHLY ATTENDANCE REPORT ────────────────────────────────
exports.getMonthlyReport = async (req, res) => {
  try {
    const { studentClass, section, month, year } = req.query;
    if (!month || !year)
      return res.status(400).json({ success: false, message: "month and year are required." });

    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end   = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

    // Query AttendanceRecord (the model the Attendance page writes to)
    let records = await AttendanceRecord.find({ school: req.schoolId, date: { $gte: start, $lte: end } })
      .populate("studentId", "name studentId rollNumber")
      .populate("classId", "name section");

    // Filter by class/section if provided
    if (studentClass) {
      records = records.filter(r => r.classId?.name === studentClass);
      if (section) records = records.filter(r => r.classId?.section === section);
    }

    // Group by class-section-date to match the format the frontend expects
    const grouped = {};
    for (const r of records) {
      const cls  = r.classId?.name    || "";
      const sec  = r.classId?.section || "";
      const date = r.date.toISOString().slice(0, 10);
      const key  = `${cls}_${sec}_${date}`;
      if (!grouped[key]) grouped[key] = { class: cls, section: sec, date, records: [] };
      grouped[key].records.push({ student: r.studentId, status: r.status });
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── ABSENTEE LIST TODAY ──────────────────────────────────────
exports.getTodayAbsentees = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const query = { school: req.schoolId, date: today };
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      if (assigned.length === 0)
        return res.json({ success: true, count: 0, data: [], message: "No class assigned" });
      // Restrict to teacher's assigned classes only
      query.$or = assigned.map((c) => ({ class: c.name, section: c.section }));
    }
    const records = await Attendance.find(query)
      .populate("records.student", "name studentId class section photo");
    const absentees = [];
    records.forEach(a => {
      a.records.filter(r => r.status === "absent").forEach(r => {
        absentees.push({ student: r.student, class: a.class, section: a.section });
      });
    });
    res.json({ success: true, count: absentees.length, data: absentees });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── NEW: BULK ATTENDANCE ─────────────────────────────────────
// POST /api/attendance/bulk
// Body: { classId, date, attendance: [{ studentId, status }] }
exports.bulkAttendance = async (req, res) => {
  try {
    const { classId, date, attendance } = req.body;
    if (!classId || !date || !Array.isArray(attendance) || attendance.length === 0)
      return res.status(400).json({ success: false, message: "classId, date and attendance[] required." });

    // Verify class belongs to school
    const cls = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!cls) return res.status(404).json({ success: false, message: "Class not found." });

    // Teacher restriction: can only mark for their assigned classes
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      const allowed  = assigned.some((c) => c._id.toString() === classId.toString());
      if (!allowed) return res.status(403).json({ success: false, message: "Not your assigned class." });
    }

    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const markedBy = {
      id:   req.user._id,
      role: req.userRole === "schooladmin" ? "admin" : "teacher",
      name: req.user.name || "",
    };

    const ops = attendance.map(({ studentId, status }) => ({
      updateOne: {
        filter: { school: req.schoolId, studentId, date: normalizedDate },
        update: { $set: { studentId, classId, date: normalizedDate, status, markedBy, school: req.schoolId } },
        upsert: true,
      },
    }));
    await AttendanceRecord.bulkWrite(ops);

    // Send absent alerts
    const absentIds = attendance.filter((r) => r.status === "absent").map((r) => r.studentId);
    if (absentIds.length > 0) {
      const absentStudents = await Student.find({ _id: { $in: absentIds } }).populate("parent");
      for (const s of absentStudents) {
        if (s.parent?.email) {
          try { await sendAbsentAlertMail(s.parent.email, s.name, new Date(date).toLocaleDateString()); }
          catch (e) { console.log("Alert mail failed:", e.message); }
        }
      }
    }

    res.json({ success: true, message: `Attendance saved for ${attendance.length} students.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── NEW: SINGLE ATTENDANCE ───────────────────────────────────
// POST /api/attendance/single
// Body: { studentId, classId, date, status }
exports.singleAttendance = async (req, res) => {
  try {
    const { studentId, classId, date, status } = req.body;
    if (!studentId || !classId || !date || !status)
      return res.status(400).json({ success: false, message: "studentId, classId, date, status required." });

    if (!["present", "absent", "late"].includes(status))
      return res.status(400).json({ success: false, message: "Invalid status." });

    // Teacher restriction
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      const allowed  = assigned.some((c) => c._id.toString() === classId.toString());
      if (!allowed) return res.status(403).json({ success: false, message: "Not your assigned class." });
    }

    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const markedBy = {
      id:   req.user._id,
      role: req.userRole === "schooladmin" ? "admin" : "teacher",
      name: req.user.name || "",
    };

    const record = await AttendanceRecord.findOneAndUpdate(
      { school: req.schoolId, studentId, date: normalizedDate },
      { $set: { studentId, classId, date: normalizedDate, status, markedBy, school: req.schoolId } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Attendance saved.", data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── NEW: STUDENT ATTENDANCE HISTORY ─────────────────────────
// GET /api/attendance/student/:studentId
exports.getStudentHistory = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const { month, year } = req.query;

    if (req.userRole === "student" && req.user._id.toString() !== studentId)
      return res.status(403).json({ success: false, message: "Access denied." });

    if (req.userRole === "parent") {
      const parentDoc = await Parent.findById(req.user._id);
      const childIds = (parentDoc?.students || []).map(id => id.toString());
      if (!childIds.includes(studentId))
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const query = { school: req.schoolId, studentId };
    if (month && year) {
      query.date = {
        $gte: new Date(parseInt(year), parseInt(month) - 1, 1),
        $lte: new Date(parseInt(year), parseInt(month), 0, 23, 59, 59),
      };
    }

    const records = await AttendanceRecord.find(query)
      .sort({ date: -1 })
      .populate("classId", "name section");

    const total      = records.length;
    const present    = records.filter((r) => r.status === "present").length;
    const absent     = records.filter((r) => r.status === "absent").length;
    const late       = records.filter((r) => r.status === "late").length;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        records: records.map((r) => ({
          _id:      r._id,
          date:     r.date,
          status:   r.status,
          markedBy: r.markedBy,
          class:    r.classId ? `${r.classId.name}-${r.classId.section}` : "",
        })),
        summary: { total, present, absent, late, percentage },
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── NEW: CLASS ATTENDANCE FOR A DATE ────────────────────────
// GET /api/attendance/class/:classId?date=YYYY-MM-DD
exports.getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;

    const cls = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!cls) return res.status(404).json({ success: false, message: "Class not found." });

    // Teacher restriction
    if (req.userRole === "teacher") {
      const assigned = await getTeacherClasses(req.user._id);
      const allowed  = assigned.some((c) => c._id.toString() === classId.toString());
      if (!allowed) return res.status(403).json({ success: false, message: "Not your assigned class." });
    }

    const students = await Student.find({
      school: req.schoolId, class: cls.name, section: cls.section, isActive: true,
    }).select("name photo rollNumber").sort({ rollNumber: 1 });

    let existingRecords = [];
    if (date) {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      const end = new Date(normalizedDate);
      end.setHours(23, 59, 59, 999);
      existingRecords = await AttendanceRecord.find({
        school: req.schoolId,
        classId,
        date: { $gte: normalizedDate, $lte: end },
      });
    }

    const recMap = {};
    existingRecords.forEach((r) => { recMap[r.studentId.toString()] = r.status; });

    const data = students.map((s) => ({
      student: { _id: s._id, name: s.name, photo: s.photo, rollNumber: s.rollNumber },
      status:  recMap[s._id.toString()] || null,
    }));

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
