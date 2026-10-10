const router = require("express").Router();
const { protect, restrictTo, checkPermission } = require("../middleware/auth");
const c = require("../controllers/scheduledexam.controller");

router.use(protect, restrictTo("schooladmin", "teacher"));

router.post("/",            checkPermission("canCreateExam"), c.createExam);
router.get("/",             c.getExams);
router.get("/:id",          c.getExam);
router.put("/:id",          checkPermission("canCreateExam"), c.updateExam);
router.delete("/:id",       checkPermission("canCreateExam"), c.deleteExam);
router.get("/:id/subjects", c.getExamSubjects);

module.exports = router;
