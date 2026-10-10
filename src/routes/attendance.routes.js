const router = require("express").Router();
const c = require("../controllers/attendance.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);

// ── EXISTING ROUTES (unchanged) ──────────────────────────────
router.post("/mark",          restrictTo("schooladmin","teacher"), checkPermission("canMarkAttendance"), c.markAttendance);
router.get("/",               restrictTo("schooladmin","teacher"), c.getAttendanceByDate);
router.get("/monthly",        restrictTo("schooladmin","teacher"), c.getMonthlyReport);
router.get("/today-absentees",restrictTo("schooladmin","teacher"), c.getTodayAbsentees);
router.get("/student/me",     restrictTo("student"),               c.getStudentAttendance);
router.get("/student/:studentId", restrictTo("schooladmin","teacher","parent"), c.getStudentAttendance);

// ── NEW ROUTES ────────────────────────────────────────────────
router.post("/bulk",   restrictTo("schooladmin","teacher"), checkPermission("canMarkAttendance"), c.bulkAttendance);
router.post("/single", restrictTo("schooladmin","teacher"), checkPermission("canMarkAttendance"), c.singleAttendance);
router.get("/class/:classId",      restrictTo("schooladmin","teacher"), c.getClassAttendance);
router.get("/history/:studentId",  restrictTo("schooladmin","teacher","student","parent"), c.getStudentHistory);

module.exports = router;
