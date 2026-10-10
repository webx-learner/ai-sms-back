const router = require("express").Router();
const { protect, restrictTo } = require("../middleware/auth");
const c = require("../controllers/timetableEntry.controller");

router.use(protect);

// Admin: create or update a single cell
router.post("/",                   restrictTo("schooladmin"), c.upsertEntry);

// Read — any authenticated user (role restrictions handled in controller where needed)
router.get("/class/:classId",      c.getClassTimetable);
router.get("/teacher/:teacherId",  c.getTeacherTimetable);
router.get("/student/:studentId",  c.getStudentTimetable);

// Admin: delete a single cell entry
router.delete("/:id",              restrictTo("schooladmin"), c.deleteEntry);

module.exports = router;
