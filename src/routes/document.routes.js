const router = require("express").Router();
const { protect, restrictTo } = require("../middleware/auth");
const Student = require("../models/Student");

router.use(protect, restrictTo("schooladmin","teacher"));

router.get("/bonafide/:studentId", async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId })
      .populate("school","schoolName schoolCode schoolAddress");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, data: {
      type: "Bonafide Certificate",
      studentName: student.name, studentId: student.studentId,
      class: student.class, section: student.section,
      school: student.school, issuedDate: new Date().toLocaleDateString("en-IN"),
      issuedBy: req.user.name,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
