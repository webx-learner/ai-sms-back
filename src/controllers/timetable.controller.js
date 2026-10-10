const Timetable = require("../models/Timetable");

exports.createTimetable = async (req, res) => {
  try {
    const { class: cls, section, day, periods, academicYear } = req.body;
    const existing = await Timetable.findOne({ school: req.schoolId, class: cls, section: section || "", day });
    if (existing) {
      existing.periods = periods; existing.academicYear = academicYear || "";
      await existing.save();
      return res.json({ success: true, message: "Timetable updated.", data: existing });
    }
    const tt = await Timetable.create({ school: req.schoolId, class: cls, section: section || "", day, periods, academicYear: academicYear || "" });
    res.status(201).json({ success: true, message: "Timetable created.", data: tt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getClassTimetable = async (req, res) => {
  try {
    const { class: cls, section } = req.query;
    const query = { school: req.schoolId, isActive: true };
    if (cls) query.class = cls;
    if (section) query.section = section;
    else if (req.userRole === "student") { query.class = req.user.class; query.section = req.user.section || ""; }
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const timetables = await Timetable.find(query).populate("periods.teacher", "name teacherId");
    const grouped = {};
    days.forEach(d => { grouped[d] = timetables.find(t => t.day === d) || null; });
    res.json({ success: true, data: grouped });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.params.teacherId || req.user._id;
    const all = await Timetable.find({ school: req.schoolId, "periods.teacher": teacherId });
    const schedule = all.map(tt => ({
      class: tt.class, section: tt.section, day: tt.day,
      periods: tt.periods.filter(p => p.teacher && p.teacher.toString() === teacherId.toString()),
    }));
    res.json({ success: true, data: schedule });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
