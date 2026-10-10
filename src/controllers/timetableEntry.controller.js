const TimetableEntry = require("../models/TimetableEntry");
const Student        = require("../models/Student");
const Class          = require("../models/Class");
const SchoolPeriod   = require("../models/SchoolPeriod");

// ── POST /api/timetable ───────────────────────────────
// Admin creates or updates a timetable entry
// Body: { classId, teacherId, day, periodNumber, subject, startTime, endTime }
exports.upsertEntry = async (req, res) => {
  try {
    const { classId, teacherId, day, periodNumber, subject, startTime, endTime } = req.body;

    if (!classId || !day || !periodNumber || !subject)
      return res.status(400).json({ success: false, message: "classId, day, periodNumber, subject required." });

    const pNum = Number(periodNumber);
    if (pNum < 1)
      return res.status(400).json({ success: false, message: "periodNumber must be >= 1." });

    // Look up real times from dynamic SchoolPeriod config
    const schoolPeriod = await SchoolPeriod.findOne({ school: req.schoolId, periodNumber: pNum, isBreak: false });
    const resolvedStart = startTime || schoolPeriod?.startTime || "";
    const resolvedEnd   = endTime   || schoolPeriod?.endTime   || "";

    const entry = await TimetableEntry.findOneAndUpdate(
      { school: req.schoolId, classId, day, periodNumber: pNum },
      {
        $set: {
          school:       req.schoolId,
          classId,
          day,
          periodNumber: pNum,
          teacherId:    teacherId || null,
          subject:      subject.trim(),
          startTime:    resolvedStart,
          endTime:      resolvedEnd,
        },
      },
      { upsert: true, new: true }
    )
      .populate("teacherId", "name")
      .populate("classId",   "name section");

    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/class/:classId ─────────────────
// Returns all entries for a class
exports.getClassTimetable = async (req, res) => {
  try {
    const { classId } = req.params;
    const entries = await TimetableEntry.find({ school: req.schoolId, classId })
      .populate("teacherId", "name")
      .sort({ day: 1, periodNumber: 1 });
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/teacher/:teacherId ─────────────
// Returns all entries where this teacher is assigned
exports.getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    const entries = await TimetableEntry.find({ school: req.schoolId, teacherId })
      .populate("classId", "name section")
      .sort({ day: 1, periodNumber: 1 });
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/timetable/student/:studentId ─────────────
// Finds student's class from their profile → returns that class's timetable
exports.getStudentTimetable = async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId });
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });

    const classQuery = { school: req.schoolId, name: student.class };
    if (student.section) classQuery.section = student.section;
    const cls = await Class.findOne(classQuery);
    if (!cls) return res.status(404).json({ success: false, message: "Class not found for student." });

    const entries = await TimetableEntry.find({ school: req.schoolId, classId: cls._id })
      .populate("teacherId", "name")
      .sort({ day: 1, periodNumber: 1 });

    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/timetable/:id ─────────────────────────
// Admin removes a single timetable entry → cell shows "—" again
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await TimetableEntry.findOne({ _id: req.params.id, school: req.schoolId });
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found." });
    await entry.deleteOne();
    res.json({ success: true, message: "Entry deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
