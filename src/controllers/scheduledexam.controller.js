const ScheduledExam = require("../models/ScheduledExam");
const ExamSubject   = require("../models/ExamSubject");
const Teacher       = require("../models/Teacher");

const withPopulate = (q) => q.populate("classId", "name section");

const teacherClassIds = async (teacherId) => {
  const t = await Teacher.findById(teacherId).populate("assignedClasses", "_id");
  return (t?.assignedClasses ?? []).map((c) => c._id.toString());
};

// ── CREATE EXAM + EXAM SUBJECTS ───────────────────────────────────────────────
exports.createExam = async (req, res) => {
  try {
    const { title, classId, examType, startDate, endDate, description, subjects } = req.body;

    if (!title || !classId || !examType || !startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "title, classId, examType, startDate and endDate are required.",
      });

    if (!Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({
        success: false,
        message: "At least one subject with date, totalMarks and duration is required.",
      });

    if (req.userRole === "teacher") {
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(classId.toString()))
        return res.status(403).json({ success: false, message: "You can only create exams for your assigned classes." });
    }

    const exam = await ScheduledExam.create({
      school: req.schoolId, title, classId, examType,
      startDate, endDate, description: description || "",
    });

    await ExamSubject.insertMany(
      subjects.map((s) => ({
        school:     req.schoolId,
        examId:     exam._id,
        subjectId:  s.subjectId,
        date:       s.date,
        totalMarks: s.totalMarks,
        duration:   s.duration,
      }))
    );

    const data = await withPopulate(ScheduledExam.findById(exam._id));
    res.status(201).json({ success: true, message: "Exam created.", data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ALL ───────────────────────────────────────────────────────────────────
exports.getExams = async (req, res) => {
  try {
    const query = { school: req.schoolId };

    if (req.userRole === "teacher") {
      const ids = await teacherClassIds(req.user._id);
      if (ids.length === 0) return res.json({ success: true, data: [] });
      query.classId = { $in: ids };
    } else {
      if (req.query.classId) query.classId = req.query.classId;
    }

    const exams = await withPopulate(ScheduledExam.find(query)).sort({ startDate: 1 });
    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ONE ───────────────────────────────────────────────────────────────────
exports.getExam = async (req, res) => {
  try {
    const exam = await withPopulate(
      ScheduledExam.findOne({ _id: req.params.id, school: req.schoolId })
    );
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });

    const subjects = await ExamSubject.find({ examId: exam._id })
      .populate("subjectId", "name code")
      .sort({ date: 1 });

    res.json({ success: true, data: { ...exam.toObject(), subjects } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
exports.updateExam = async (req, res) => {
  try {
    const { title, classId, examType, startDate, endDate, description, status, subjects } = req.body;

    if (req.userRole === "teacher") {
      const existing = await ScheduledExam.findOne({ _id: req.params.id, school: req.schoolId });
      if (!existing) return res.status(404).json({ success: false, message: "Exam not found." });
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(existing.classId.toString()))
        return res.status(403).json({ success: false, message: "Access denied." });
      if (classId && !ids.includes(classId.toString()))
        return res.status(403).json({ success: false, message: "You can only assign exams to your classes." });
    }

    const exam = await withPopulate(
      ScheduledExam.findOneAndUpdate(
        { _id: req.params.id, school: req.schoolId },
        { title, classId, examType, startDate, endDate, description, status },
        { new: true }
      )
    );
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });

    if (Array.isArray(subjects)) {
      await ExamSubject.deleteMany({ examId: exam._id });
      if (subjects.length > 0) {
        await ExamSubject.insertMany(
          subjects.map((s) => ({
            school:     req.schoolId,
            examId:     exam._id,
            subjectId:  s.subjectId,
            date:       s.date,
            totalMarks: s.totalMarks,
            duration:   s.duration,
          }))
        );
      }
    }

    res.json({ success: true, message: "Exam updated.", data: exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
exports.deleteExam = async (req, res) => {
  try {
    if (req.userRole === "teacher") {
      const existing = await ScheduledExam.findOne({ _id: req.params.id, school: req.schoolId });
      if (!existing) return res.status(404).json({ success: false, message: "Exam not found." });
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(existing.classId.toString()))
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const exam = await ScheduledExam.findOneAndDelete({
      _id: req.params.id, school: req.schoolId,
    });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });

    await ExamSubject.deleteMany({ examId: exam._id });
    res.json({ success: true, message: "Exam deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET SUBJECTS FOR ONE EXAM ─────────────────────────────────────────────────
exports.getExamSubjects = async (req, res) => {
  try {
    const subjects = await ExamSubject.find({ examId: req.params.id })
      .populate("subjectId", "name code")
      .sort({ date: 1 });
    res.json({ success: true, data: subjects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
