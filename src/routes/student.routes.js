const router = require("express").Router();
const { protect, restrictTo } = require("../middleware/auth");
const Student = require("../models/Student");

router.use(protect);

router.get("/me", (req, res) => res.json({ success: true, data: req.user }));

router.post("/mood", restrictTo("student"), async (req, res) => {
  try {
    const { mood } = req.body;
    const student = await Student.findById(req.user._id);
    student.moodHistory.push({ mood, date: new Date() });
    await student.save();
    res.json({ success: true, message: "Mood saved!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get("/profile/:id", restrictTo("schooladmin","teacher"), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select("-password").populate("parent classTeacher");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, data: student });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
