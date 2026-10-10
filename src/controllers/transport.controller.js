const BusRoute = require("../models/Transport");

exports.createRoute = async (req, res) => {
  try {
    const route = await BusRoute.create({ school: req.schoolId, ...req.body });
    res.status(201).json({ success: true, message: "Route created.", data: route });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getRoutes = async (req, res) => {
  try {
    const routes = await BusRoute.find({ school: req.schoolId, isActive: true }).populate("students", "name studentId class");
    res.json({ success: true, data: routes });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.assignStudentToRoute = async (req, res) => {
  try {
    const { studentId } = req.body;
    const route = await BusRoute.findOne({ _id: req.params.id, school: req.schoolId });
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });
    if (!route.students.includes(studentId)) { route.students.push(studentId); await route.save(); }
    res.json({ success: true, message: "Student assigned to route." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateRoute = async (req, res) => {
  try {
    const route = await BusRoute.findOneAndUpdate({ _id: req.params.id, school: req.schoolId }, req.body, { new: true });
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });
    res.json({ success: true, message: "Route updated.", data: route });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
