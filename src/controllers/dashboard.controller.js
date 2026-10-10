const Admin      = require("../models/Admin");
const Teacher    = require("../models/Teacher");
const Student    = require("../models/Student");
const Parent     = require("../models/Parent");
const Attendance       = require("../models/Attendance");
const AttendanceRecord = require("../models/AttendanceRecord");
const { FeePayment, FeeStructure } = require("../models/Fee");
const { Exam, Result } = require("../models/Exam");
const Notice     = require("../models/Notice");
const Homework   = require("../models/Homework");
const Event      = require("../models/Event");

// ── ADMIN DASHBOARD ──────────────────────────────────────────
exports.adminDashboard = async (req, res) => {
  try {
    const schoolId = req.user._id;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

    // ── Base counts + notices + exams ──────────────────────────
    const [totalTeachers, totalStudents, totalFeeCollected, recentNotices, upcomingExams] = await Promise.all([
      Teacher.countDocuments({ school: schoolId, isActive: true }),
      Student.countDocuments({ school: schoolId, isActive: true }),
      FeePayment.aggregate([{ $match: { school: schoolId, status: "paid" } }, { $group: { _id: null, total: { $sum: "$paidAmount" } } }]),
      Notice.find({ school: schoolId }).sort({ createdAt: -1 }).limit(5).populate("postedBy","name"),
      Exam.find({ school: schoolId, date: { $gte: new Date() }, status: "upcoming" }).sort({ date: 1 }).limit(5),
    ]);

    // ── Today's attendance via AttendanceRecord ─────────────────
    const todayRecords = await AttendanceRecord.find({ school: schoolId, date: { $gte: todayStart, $lte: todayEnd } });
    const todayPresent = todayRecords.filter(r => r.status === "present" || r.status === "late").length;
    const todayAbsent  = todayRecords.filter(r => r.status === "absent").length;
    const feeTotal     = totalFeeCollected[0]?.total || 0;

    // ── Attendance overview — last 7 days ──────────────────────
    const attendanceOverview = [];
    for (let i = 6; i >= 0; i--) {
      const d      = new Date();
      d.setDate(d.getDate() - i);
      const dStart = new Date(d); dStart.setHours(0,0,0,0);
      const dEnd   = new Date(d); dEnd.setHours(23,59,59,999);
      const recs   = await AttendanceRecord.find({ school: schoolId, date: { $gte: dStart, $lte: dEnd } });
      attendanceOverview.push({
        day:     d.toLocaleDateString("en-US", { weekday: "short" }),
        present: recs.filter(r => r.status === "present" || r.status === "late").length,
        absent:  recs.filter(r => r.status === "absent").length,
      });
    }

    // ── Fee monthly chart — last 6 months ─────────────────────
    const feeMonthly = [];
    for (let m = 5; m >= 0; m--) {
      const ref    = new Date();
      ref.setDate(1);
      ref.setMonth(ref.getMonth() - m);
      const mStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const mEnd   = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
      const [coll, pend] = await Promise.all([
        FeePayment.aggregate([
          { $match: { school: schoolId, status: "paid", paidDate: { $gte: mStart, $lte: mEnd } } },
          { $group: { _id: null, total: { $sum: "$paidAmount" } } },
        ]),
        FeePayment.aggregate([
          { $match: { school: schoolId, status: { $in: ["pending","partial","overdue"] }, createdAt: { $gte: mStart, $lte: mEnd } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);
      feeMonthly.push({
        month:     mStart.toLocaleString("en-US", { month: "short" }),
        collected: coll[0]?.total || 0,
        pending:   pend[0]?.total || 0,
      });
    }

    // ── Class performance — per-class avg % across all results ─
    const classCounts = await Student.aggregate([
      { $match: { school: schoolId, isActive: true } },
      { $group: { _id: "$class", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    const classPerformance = await Promise.all(
      classCounts.filter(c => c._id).map(async (c) => {
        const stuIds = (await Student.find({ school: schoolId, class: c._id, isActive: true }).select("_id")).map(s => s._id);
        if (!stuIds.length) return { name: `Class ${c._id}`, avg: 0 };
        const res = await Result.find({ school: schoolId, student: { $in: stuIds } }).select("percentage");
        const avg = res.length ? Math.round(res.reduce((s, r) => s + (r.percentage || 0), 0) / res.length) : 0;
        return { name: `Class ${c._id}`, avg };
      })
    );

    // ── Pending fees: actual FeePayment records + virtual (no payment yet) ─
    // 1. Actual pending/partial/overdue FeePayment records
    const actualFees = await FeePayment.find({
      school: req.schoolId,
      status: { $in: ["pending","partial","overdue"] },
    }).sort({ dueDate: -1 }).limit(10).lean();

    // Resolve student names for actual records
    const actualStuIds = [...new Set(actualFees.map(f => f.student?.toString()).filter(Boolean))];
    const actualStuDocs = actualStuIds.length
      ? await Student.find({ _id: { $in: actualStuIds } }).select("name class section photo").lean()
      : [];
    const actualStuMap = new Map(actualStuDocs.map(s => [s._id.toString(), s]));

    const actualPending = actualFees.map(f => {
      const stu = f.student ? actualStuMap.get(f.student.toString()) : null;
      return {
        name:    stu?.name  || "Unknown",
        class:   stu ? `${stu.class}${stu.section ? "-" + stu.section : ""}` : "—",
        amount:  f.amount,
        paid:    f.paidAmount || 0,
        photo:   stu?.photo  || "",
        title:   f.title     || "Fee",
        dueDate: f.dueDate   || null,
        status:  f.status,
      };
    });

    // 2. Virtual pending: FeeStructure entries where student has NO FeePayment at all
    const structures = await FeeStructure.find({ school: req.schoolId, isActive: true }).lean();
    const virtualPending = [];

    for (const fs of structures) {
      const studentsInClass = await Student.find({
        school: req.schoolId, class: fs.class, isActive: true,
      }).select("_id name class section photo").lean();

      const existingPayments = await FeePayment.find({
        school: req.schoolId, feeStructure: fs._id,
      }).select("student").lean();

      const paidIds = new Set(existingPayments.map(p => p.student?.toString()).filter(Boolean));

      for (const stu of studentsInClass) {
        if (!paidIds.has(stu._id.toString())) {
          virtualPending.push({
            name:    stu.name,
            class:   `${stu.class}${stu.section ? "-" + stu.section : ""}`,
            amount:  fs.amount,
            paid:    0,
            photo:   stu.photo || "",
            title:   fs.title,
            dueDate: fs.dueDate || null,
            status:  fs.dueDate && new Date(fs.dueDate) < new Date() ? "overdue" : "pending",
          });
        }
      }
    }

    // Combine: actual first, then virtual — deduplicate by name+title
    const seen = new Set();
    const pendingFeeStudents = [...actualPending, ...virtualPending]
      .filter(f => {
        const key = `${f.name}|${f.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);

    // ── Calendar events — next 60 days ────────────────────────
    const calendarEvents = await Event.find({
      school:    schoolId,
      startDate: { $gte: new Date(), $lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
    }).sort({ startDate: 1 }).limit(20).select("title startDate eventType");

    // ── Recent activity ────────────────────────────────────────
    const [recentFeePayments, recentEnrollments] = await Promise.all([
      FeePayment.find({ school: schoolId, status: "paid" })
        .sort({ paidDate: -1 }).limit(3)
        .populate("student", "name"),
      Student.find({ school: schoolId, isActive: true })
        .sort({ createdAt: -1 }).limit(3).select("name class createdAt"),
    ]);

    const recentActivity = [
      ...recentFeePayments.map(f => ({
        type: "fee",
        text: `Fee payment received — ${f.student?.name || "Student"} (₹${f.paidAmount})`,
        time: f.paidDate || f.createdAt,
      })),
      ...recentEnrollments.map(s => ({
        type: "student",
        text: `Student enrolled — ${s.name} (Class ${s.class})`,
        time: s.createdAt,
      })),
      ...recentNotices.slice(0, 2).map(n => ({
        type: "notice",
        text: `Notice posted — ${n.title}`,
        time: n.createdAt,
      })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

    res.json({ success: true, data: {
      stats: { totalTeachers, totalStudents, feeCollected: feeTotal, todayPresent, todayAbsent },
      attendanceOverview,
      feeMonthly,
      classPerformance,
      upcomingExams,
      pendingFeeStudents,
      calendarEvents,
      recentActivity,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── TEACHER DASHBOARD ────────────────────────────────────────
exports.teacherDashboard = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id)
      .populate("assignedClasses", "name section");
    const schoolId = req.schoolId;

    // today: full-day range to avoid timezone exact-match issues
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const assignedClasses = teacher.assignedClasses || [];
    const classCount = assignedClasses.length;

    // Class name filters for student / result queries
    // Use case-insensitive regex on section to handle "a" vs "A" mismatches
    const classFilters = assignedClasses.map(c => ({
      class: c.name,
      ...(c.section
        ? { section: { $regex: new RegExp(`^${c.section}$`, "i") } }
        : {}),
    }));

    // ── Stats ──────────────────────────────────────────────────
    const myStudentCount = classFilters.length > 0
      ? await Student.countDocuments({ school: schoolId, isActive: true, $or: classFilters })
      : 0;

    // Query AttendanceRecord (the model the frontend bulk-attendance writes to)
    // classIds from assignedClasses gives exact ObjectId match — no string format issues
    const classIds = assignedClasses.map(c => c._id);

    const todayRecords = classIds.length > 0
      ? await AttendanceRecord.find({
          school: schoolId,
          classId: { $in: classIds },
          date: { $gte: todayStart, $lte: todayEnd },
        })
      : [];
    let todayPresent = 0, todayTotal = 0;
    todayRecords.forEach(r => {
      todayTotal++;
      if (r.status === "present" || r.status === "late") todayPresent++;
    });
    const todayAttendancePct = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : null;

    const pendingHomework = await Homework.countDocuments({
      school: schoolId, assignedBy: teacher._id, isActive: true, dueDate: { $gte: new Date() },
    });

    // ── Recent homework with submission details ────────────────
    const recentHwDocs = await Homework.find({
      school: schoolId, assignedBy: teacher._id, isActive: true,
    }).sort({ createdAt: -1 }).limit(5);

    const recentHomework = await Promise.all(
      recentHwDocs.map(async hw => {
        const totalStudents = await Student.countDocuments({
          school: schoolId, isActive: true,
          class: hw.class,
          ...(hw.section ? { section: { $regex: new RegExp(`^${hw.section}$`, "i") } } : {}),
        });
        return {
          _id:         hw._id,
          title:       hw.title,
          class:       `${hw.class}${hw.section ? "-" + hw.section : ""}`,
          due:         hw.dueDate,
          submissions: hw.submissions?.length || 0,
          total:       totalStudents,
          subject:     hw.subject,
        };
      })
    );

    // ── Weekly attendance trend — current month's calendar weeks ──
    // W1 = 1st-7th of this month, W2 = 8th-14th, etc.
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthName  = now.toLocaleString("en-US", { month: "short" });

    const weeklyTrend = [];
    let wCursor  = new Date(monthStart);
    let weekIdx  = 1;

    while (weekIdx <= 6) {
      const wStart = new Date(wCursor);
      const wEnd   = new Date(wCursor);
      wEnd.setDate(wEnd.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      // Stop adding empty future weeks beyond today + 1 week
      if (wStart > now) break;

      const atts = classIds.length > 0
        ? await AttendanceRecord.find({
            school:  schoolId,
            classId: { $in: classIds },
            date:    { $gte: wStart, $lte: wEnd },
          })
        : [];

      let wp = 0, wt = 0;
      atts.forEach(r => { wt++; if (r.status === "present" || r.status === "late") wp++; });

      const startDay = wStart.getDate();
      const endDay   = Math.min(wEnd.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
      weeklyTrend.push({
        week:  `W${weekIdx}`,
        label: `${monthName} ${startDay}-${endDay}`,
        rate:  wt > 0 ? Math.round((wp / wt) * 100) : 0,
      });

      wCursor.setDate(wCursor.getDate() + 7);
      weekIdx++;
    }

    // ── Class performance (avg Result % per class) ─────────────
    const classPerformance = await Promise.all(
      assignedClasses.map(async cls => {
        const label = `${cls.name}${cls.section ? "-" + cls.section : ""}`;
        const studentIds = (await Student.find({
          school: schoolId, isActive: true,
          class: cls.name,
          ...(cls.section
            ? { section: { $regex: new RegExp(`^${cls.section}$`, "i") } }
            : {}),
        }).select("_id")).map(s => s._id);

        if (studentIds.length === 0) return { name: label, avg: 0 };

        const results = await Result.find({ school: schoolId, student: { $in: studentIds } }).select("percentage");
        const avg = results.length > 0
          ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length)
          : 0;
        return { name: label, avg };
      })
    );

    res.json({
      success: true,
      data: {
        teacher: { name: teacher.name, teacherId: teacher.teacherId, classCount, subjects: teacher.subjects },
        stats: { classCount, myStudentCount, todayAttendancePct, pendingHomework },
        weeklyTrendMonth: `${monthName} ${now.getFullYear()}`,
        weeklyTrend,
        classPerformance,
        recentHomework,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── STUDENT DASHBOARD ────────────────────────────────────────
exports.studentDashboard = async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate("school", "schoolName schoolCode")
      .populate("classTeacher", "name teacherId phone");

    const [recentResults, pendingHomework, notices, upcomingExams, upcomingEvents] = await Promise.all([
      Result.find({ student: req.user._id }).sort({ createdAt: -1 }).limit(5).populate("exam", "title subject date"),
      Homework.find({ school: req.schoolId, class: student.class, isActive: true, dueDate: { $gte: new Date() } }),
      Notice.find({ school: req.schoolId, $or: [{ targetRoles: "all" }, { targetRoles: "student" }, { targetClass: student.class }] }).sort({ createdAt: -1 }).limit(5),
      Exam.find({ school: req.schoolId, class: student.class, date: { $gte: new Date() }, status: "upcoming" }).sort({ date: 1 }).limit(3),
      Event.find({ school: req.schoolId, startDate: { $gte: new Date() } }).sort({ startDate: 1 }).limit(3),
    ]);

    // Attendance summary this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAttendance = await Attendance.find({ school: req.schoolId, class: student.class, date: { $gte: monthStart } });
    let present = 0, total = 0;
    monthAttendance.forEach(a => {
      const r = a.records.find(rec => rec.student.toString() === student._id.toString());
      if (r) { total++; if (r.status === "present") present++; }
    });
    const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

    // Pending homework filter
    const pending = pendingHomework.filter(hw => !hw.submissions.find(s => s.student.toString() === student._id.toString()));
    const avgMarks = recentResults.length > 0 ? Math.round(recentResults.reduce((s, r) => s + r.percentage, 0) / recentResults.length) : 0;

    res.json({ success: true, data: {
      student: { name: student.name, studentId: student.studentId, class: student.class, section: student.section,
                 points: student.points, streakDays: student.streakDays, badges: student.badges, school: student.school, classTeacher: student.classTeacher },
      stats: { attendanceThisMonth: attendancePct, pendingHomework: pending.length, avgMarks },
      recentResults, pendingHomework: pending.slice(0, 3), notices, upcomingExams, upcomingEvents,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PARENT DASHBOARD ─────────────────────────────────────────
exports.parentDashboard = async (req, res) => {
  try {
    const parent = await Parent.findById(req.user._id).populate("students", "name studentId class section email phone photo points streakDays badges school classTeacher");
    if (!parent) return res.status(404).json({ success: false, message: "Parent not found." });

    const childrenData = await Promise.all(parent.students.map(async (student) => {
      const schoolId = student.school;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [monthAttendance, rawPayments, feeStructures, rawResults, upcomingExams, notices, pendingHomework, upcomingEvents] = await Promise.all([
        AttendanceRecord.find({ school: schoolId, studentId: student._id, date: { $gte: monthStart } }),
        FeePayment.find({ student: student._id }).sort({ createdAt: -1 }),
        FeeStructure.find({ school: schoolId, class: student.class, isActive: true }),
        Result.find({ student: student._id, school: schoolId }).sort({ createdAt: -1 }).limit(5)
          .populate("exam", "title subject date totalMarks examType")
          .populate({ path: "testId", select: "title date totalMarks", populate: { path: "subjectId", select: "name" } })
          .populate("scheduledExamId", "title examType startDate"),
        Exam.find({ school: schoolId, class: student.class, date: { $gte: now }, status: "upcoming" }).sort({ date: 1 }).limit(5),
        Notice.find({ school: schoolId, $or: [{ targetRoles: "all" }, { targetRoles: "parent" }, { targetRoles: "student" }, { targetClass: student.class }] }).sort({ createdAt: -1 }).limit(5),
        Homework.find({ school: schoolId, class: student.class, isActive: true, dueDate: { $gte: now } }).sort({ dueDate: 1 }).limit(5),
        Event.find({ school: schoolId, startDate: { $gte: now } }).sort({ startDate: 1 }).limit(3),
      ]);

      // Calculate attendance % using AttendanceRecord (per-student per-day records)
      let present = 0, total = 0;
      monthAttendance.forEach(a => {
        total++;
        if (a.status === "present") present++;
      });
      const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

      // Normalise results so frontend always gets { exam: { subject, title, date } }
      const recentResults = rawResults.map(r => {
        const obj = r.toObject ? r.toObject() : { ...r };
        if (!obj.exam) {
          if (obj.sourceType === "test" && obj.testId) {
            obj.exam = {
              subject: obj.testId.subjectId?.name || "Test",
              title:   obj.testId.title || "",
              date:    obj.testId.date,
              examType: "test",
            };
          } else if (obj.sourceType === "scheduledExam" && obj.scheduledExamId) {
            obj.exam = {
              subject: "Exam",
              title:   obj.scheduledExamId.title || "",
              date:    obj.scheduledExamId.startDate,
              examType: obj.scheduledExamId.examType || "exam",
            };
          }
        }
        return obj;
      });

      // Merge fee structures + payments (same logic as getStudentFees)
      const linkedIds = new Set(rawPayments.map(p => p.feeStructure?.toString()).filter(Boolean));
      const virtualFees = feeStructures
        .filter(fs => !linkedIds.has(fs._id.toString()))
        .map(fs => ({
          _id: fs._id, student: student._id, feeStructure: fs._id,
          title: fs.title, amount: fs.amount, paidAmount: 0,
          dueDate: fs.dueDate, status: fs.dueDate && new Date(fs.dueDate) < now ? "overdue" : "pending",
          paymentMode: "cash", receiptNo: null, isVirtual: true,
        }));
      const feePayments = [...rawPayments, ...virtualFees];

      const totalPending = feePayments
        .filter(f => f.status !== "paid")
        .reduce((sum, f) => sum + (f.amount - (f.paidAmount || 0)), 0);
      const totalPaid = feePayments
        .filter(f => f.status === "paid")
        .reduce((sum, f) => sum + (f.paidAmount || 0), 0);

      // Avg marks
      const avgMarks = recentResults.length > 0 ? Math.round(recentResults.reduce((s, r) => s + r.percentage, 0) / recentResults.length) : 0;

      return {
        student: {
          _id: student._id, name: student.name, studentId: student.studentId,
          class: student.class, section: student.section, photo: student.photo,
          points: student.points, streakDays: student.streakDays,
        },
        stats: { attendanceThisMonth: attendancePct, attendancePresent: present, attendanceTotal: total, avgMarks, totalPending, totalPaid },
        feePayments: feePayments.slice(0, 8), recentResults, upcomingExams, notices, pendingHomework, upcomingEvents,
      };
    }));

    res.json({ success: true, data: { parent: { name: parent.name, email: parent.email, phone: parent.phone, relation: parent.relation }, children: childrenData } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── DOCUMENT GENERATOR ───────────────────────────────────────
exports.generateTC = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findOne({ _id: studentId, school: req.schoolId })
      .populate("school", "schoolName schoolCode schoolAddress").populate("classTeacher", "name");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    const tcData = {
      type: "Transfer Certificate",
      studentName: student.name, studentId: student.studentId, class: student.class, section: student.section,
      dateOfBirth: student.dateOfBirth, gender: student.gender, bloodGroup: student.bloodGroup,
      school: student.school, classTeacher: student.classTeacher?.name || "N/A",
      issuedDate: new Date().toLocaleDateString("en-IN"), issuedBy: req.user.name,
    };
    res.json({ success: true, message: "TC data generated.", data: tcData });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.generateIDCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findOne({ _id: studentId, school: req.schoolId })
      .populate("school", "schoolName schoolCode schoolAddress schoolPhone website logo");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, data: {
      type: "ID Card", studentName: student.name, studentId: student.studentId,
      class: student.class, section: student.section, photo: student.photo,
      bloodGroup: student.bloodGroup, phone: student.phone, school: student.school,
      academicYear: new Date().getFullYear() + "-" + (new Date().getFullYear() + 1),
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
