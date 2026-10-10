const Subject = require("../models/Subject");
const Class   = require("../models/Class");

// ── GET SUBJECTS FOR STUDENT'S OWN CLASS ─────────────────────────────────────
exports.getMyClassSubjects = async (req, res) => {
  try {
    const cls = await Class.findOne({
      name:    req.user.class,
      section: (req.user.section || "").toUpperCase(),
      school:  req.schoolId,
    }).populate("assignedSubjects", "name code");
    res.json({ success: true, data: cls?.assignedSubjects || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET SUBJECTS ASSIGNED TO A SPECIFIC CLASS ────────────────────────────────
exports.getSubjectsByClass = async (req, res) => {
  try {
    const cls = await Class.findOne({ _id: req.params.classId, school: req.schoolId })
      .populate("assignedSubjects", "name code description");
    if (!cls)
      return res.status(404).json({ success: false, message: "Class not found." });
    res.json({ success: true, data: cls.assignedSubjects || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ALL SUBJECTS ─────────────────────────────────────────────────────────
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({ school: req.schoolId }).sort({ createdAt: -1 });
    res.json({ success: true, data: subjects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE SUBJECT ───────────────────────────────────────────────────────────
exports.createSubject = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code)
      return res.status(400).json({ success: false, message: "Name and code are required." });

    const exists = await Subject.findOne({
      school: req.schoolId,
      code: code.trim().toUpperCase(),
    });
    if (exists)
      return res.status(400).json({ success: false, message: "Subject code already exists." });

    const subject = await Subject.create({
      name:        name.trim(),
      code:        code.trim().toUpperCase(),
      description: (description || "").trim(),
      school:      req.schoolId,
    });
    res.status(201).json({ success: true, message: "Subject created.", data: subject });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE SUBJECT ───────────────────────────────────────────────────────────
exports.updateSubject = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    // Duplicate code check (excluding current doc)
    if (code) {
      const exists = await Subject.findOne({
        school: req.schoolId,
        code:   code.trim().toUpperCase(),
        _id:    { $ne: req.params.id },
      });
      if (exists)
        return res.status(400).json({ success: false, message: "Subject code already exists." });
    }

    const update = {};
    if (name        !== undefined) update.name        = name.trim();
    if (code        !== undefined) update.code        = code.trim().toUpperCase();
    if (description !== undefined) update.description = description.trim();

    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId },
      update,
      { new: true, runValidators: true }
    );
    if (!subject)
      return res.status(404).json({ success: false, message: "Subject not found." });

    res.json({ success: true, message: "Subject updated.", data: subject });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE SUBJECT ───────────────────────────────────────────────────────────
exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findOneAndDelete({
      _id:    req.params.id,
      school: req.schoolId,
    });
    if (!subject)
      return res.status(404).json({ success: false, message: "Subject not found." });

    // Remove this subject from every class assignment in the school
    await Class.updateMany(
      { school: req.schoolId },
      { $pull: { assignedSubjects: subject._id } }
    );

    res.json({ success: true, message: "Subject deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ASSIGN SUBJECTS → ONE CLASS ──────────────────────────────────────────────
exports.assignToClass = async (req, res) => {
  try {
    const { classId, subjectIds } = req.body;
    if (!classId || !Array.isArray(subjectIds) || subjectIds.length === 0)
      return res.status(400).json({ success: false, message: "classId and subjectIds[] are required." });

    const cls = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!cls)
      return res.status(404).json({ success: false, message: "Class not found." });

    await Class.findByIdAndUpdate(classId, {
      $addToSet: { assignedSubjects: { $each: subjectIds } },
    });

    res.json({ success: true, message: "Subjects assigned to class." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── BULK ASSIGN SUBJECTS → MULTIPLE CLASSES ──────────────────────────────────
exports.bulkAssign = async (req, res) => {
  try {
    const { classIds, subjectIds } = req.body;
    if (!Array.isArray(classIds)   || classIds.length   === 0 ||
        !Array.isArray(subjectIds) || subjectIds.length === 0)
      return res.status(400).json({ success: false, message: "classIds[] and subjectIds[] are required." });

    await Class.updateMany(
      { _id: { $in: classIds }, school: req.schoolId },
      { $addToSet: { assignedSubjects: { $each: subjectIds } } }
    );

    res.json({
      success: true,
      message: `${subjectIds.length} subject(s) assigned to ${classIds.length} class(es).`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── REMOVE ONE SUBJECT FROM ONE CLASS ────────────────────────────────────────
exports.unassignFromClass = async (req, res) => {
  try {
    const { classId, subjectId } = req.body;
    if (!classId || !subjectId)
      return res.status(400).json({ success: false, message: "classId and subjectId are required." });

    const cls = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!cls)
      return res.status(404).json({ success: false, message: "Class not found." });

    await Class.findByIdAndUpdate(classId, {
      $pull: { assignedSubjects: subjectId },
    });

    res.json({ success: true, message: "Subject removed from class." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ALL CLASSES WITH THEIR ASSIGNED SUBJECTS ─────────────────────────────
exports.getAssignments = async (req, res) => {
  try {
    const classes = await Class.find({ school: req.schoolId })
      .populate("assignedSubjects", "name code description")
      .select("name section assignedSubjects")
      .sort({ name: 1, section: 1 });

    res.json({ success: true, data: classes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
