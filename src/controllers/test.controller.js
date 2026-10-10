const Test    = require("../models/Test");
const Teacher = require("../models/Teacher");

const withPopulate = (q) =>
  q.populate("classId", "name section").populate("subjectId", "name code");

const teacherClassIds = async (teacherId) => {
  const t = await Teacher.findById(teacherId).populate("assignedClasses", "_id");
  return (t?.assignedClasses ?? []).map((c) => c._id.toString());
};

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.createTest = async (req, res) => {
  try {
    const { title, classId, subjectId, date, totalMarks, duration, description } = req.body;
    if (!title || !classId || !subjectId || !date || !totalMarks || !duration)
      return res.status(400).json({
        success: false,
        message: "title, classId, subjectId, date, totalMarks and duration are required.",
      });

    if (req.userRole === "teacher") {
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(classId.toString()))
        return res.status(403).json({ success: false, message: "You can only create tests for your assigned classes." });
    }

    const test = await Test.create({
      school: req.schoolId, title, classId, subjectId,
      date, totalMarks, duration, description: description || "",
    });
    const data = await withPopulate(Test.findById(test._id));
    res.status(201).json({ success: true, message: "Test created.", data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ALL ───────────────────────────────────────────────────────────────────
exports.getTests = async (req, res) => {
  try {
    const { classId, subjectId } = req.query;
    const query = { school: req.schoolId };

    if (req.userRole === "teacher") {
      const ids = await teacherClassIds(req.user._id);
      if (ids.length === 0) return res.json({ success: true, data: [] });
      query.classId = { $in: ids };
    } else {
      if (classId) query.classId = classId;
    }

    if (subjectId) query.subjectId = subjectId;

    const tests = await withPopulate(Test.find(query)).sort({ date: 1 });
    res.json({ success: true, data: tests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ONE ───────────────────────────────────────────────────────────────────
exports.getTest = async (req, res) => {
  try {
    const test = await withPopulate(
      Test.findOne({ _id: req.params.id, school: req.schoolId })
    );
    if (!test) return res.status(404).json({ success: false, message: "Test not found." });
    res.json({ success: true, data: test });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
exports.updateTest = async (req, res) => {
  try {
    const { title, classId, subjectId, date, totalMarks, duration, description, status } = req.body;

    if (req.userRole === "teacher") {
      const existing = await Test.findOne({ _id: req.params.id, school: req.schoolId });
      if (!existing) return res.status(404).json({ success: false, message: "Test not found." });
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(existing.classId.toString()))
        return res.status(403).json({ success: false, message: "Access denied." });
      if (classId && !ids.includes(classId.toString()))
        return res.status(403).json({ success: false, message: "You can only assign tests to your classes." });
    }

    const test = await withPopulate(
      Test.findOneAndUpdate(
        { _id: req.params.id, school: req.schoolId },
        { title, classId, subjectId, date, totalMarks, duration, description, status },
        { new: true, runValidators: true }
      )
    );
    if (!test) return res.status(404).json({ success: false, message: "Test not found." });
    res.json({ success: true, message: "Test updated.", data: test });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
exports.deleteTest = async (req, res) => {
  try {
    if (req.userRole === "teacher") {
      const existing = await Test.findOne({ _id: req.params.id, school: req.schoolId });
      if (!existing) return res.status(404).json({ success: false, message: "Test not found." });
      const ids = await teacherClassIds(req.user._id);
      if (!ids.includes(existing.classId.toString()))
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const test = await Test.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!test) return res.status(404).json({ success: false, message: "Test not found." });
    res.json({ success: true, message: "Test deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
