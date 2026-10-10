const Homework = require("../models/Homework");
const Teacher  = require("../models/Teacher");
const Student  = require("../models/Student");

exports.assignHomework = async (req, res) => {
  try {
    const { title, description, subject, class: cls, section, dueDate, maxMarks } = req.body;
    if (!title || !description || !subject || !cls || !dueDate)
      return res.status(400).json({ success: false, message: "title, description, subject, class and dueDate are required." });

    // If teacher, verify the class is one of their assigned classes
    if (req.userRole === "teacher") {
      const teacher = await Teacher.findById(req.user._id).populate("assignedClasses", "name section");
      const allowed = teacher?.assignedClasses?.some(c => c.name === cls) ?? false;
      if (!allowed)
        return res.status(403).json({ success: false, message: "You can only assign homework to your assigned classes." });
    }

    const hw = await Homework.create({
      school: req.schoolId, title, description, subject,
      class: cls, section: section || "",
      dueDate, maxMarks: maxMarks || null,
      assignedBy:      req.user._id,
      assignedByModel: req.userRole === "schooladmin" ? "Admin" : "Teacher",
    });

    const populated = await Homework.findById(hw._id).populate("assignedBy", "name teacherId");
    res.status(201).json({ success: true, message: "Homework assigned.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getHomework = async (req, res) => {
  try {
    const { class: cls, subject, section } = req.query;
    const query = { school: req.schoolId, isActive: true };

    if (req.userRole === "student") {
      // Student sees only their class homework
      query.class   = req.user.class;
      if (req.user.section) query.section = req.user.section;
    } else if (req.userRole === "teacher") {
      // Teacher sees only homework for their assigned classes
      const teacher = await Teacher.findById(req.user._id).populate("assignedClasses", "name section");
      const assigned = teacher?.assignedClasses || [];
      if (assigned.length === 0) return res.json({ success: true, data: [] });
      query.$or = assigned.map(c => ({ class: c.name, section: c.section || "" }));
    } else {
      // Admin: optional filters
      if (cls)     query.class   = cls;
      if (section) query.section = section;
    }

    if (subject) query.subject = subject;

    const hw = await Homework.find(query)
      .populate("assignedBy", "name teacherId")
      .sort({ dueDate: 1 });
    res.json({ success: true, data: hw });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteHomework = async (req, res) => {
  try {
    const query = { _id: req.params.id, school: req.schoolId };
    // Teachers can only delete homework they assigned
    if (req.userRole === "teacher") query.assignedBy = req.user._id;
    const hw = await Homework.findOneAndDelete(query);
    if (!hw) return res.status(404).json({ success: false, message: "Homework not found or access denied." });
    res.json({ success: true, message: "Homework deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.submitHomework = async (req, res) => {
  try {
    const { note } = req.body;
    const hw = await Homework.findOne({ _id: req.params.id, school: req.schoolId });
    if (!hw) return res.status(404).json({ success: false, message: "Homework not found." });
    const alreadySubmitted = hw.submissions.find(s => s.student.toString() === req.user._id.toString());
    if (alreadySubmitted) return res.status(400).json({ success: false, message: "Already submitted." });
    const isLate = new Date() > new Date(hw.dueDate);
    hw.submissions.push({ student: req.user._id, note: note || "", status: isLate ? "late" : "submitted" });
    await hw.save();
    await Student.findByIdAndUpdate(req.user._id, { $inc: { points: isLate ? 1 : 3 } });
    res.json({ success: true, message: isLate ? "Submitted (late)." : "Homework submitted!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.gradeHomework = async (req, res) => {
  try {
    const { studentId, marks, feedback } = req.body;
    const hw = await Homework.findOne({ _id: req.params.id, school: req.schoolId });
    if (!hw) return res.status(404).json({ success: false, message: "Homework not found." });
    const sub = hw.submissions.find(s => s.student.toString() === studentId);
    if (!sub) return res.status(404).json({ success: false, message: "Submission not found." });
    sub.marks = marks; sub.feedback = feedback; sub.status = "graded";
    await hw.save();
    res.json({ success: true, message: "Graded." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getPendingHomework = async (req, res) => {
  try {
    const studentId = req.user._id;
    const all = await Homework.find({ school: req.schoolId, class: req.user.class, isActive: true, dueDate: { $gte: new Date() } });
    const pending = all.filter(hw => !hw.submissions.find(s => s.student.toString() === studentId.toString()));
    res.json({ success: true, count: pending.length, data: pending });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
