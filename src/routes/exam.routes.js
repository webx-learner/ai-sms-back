const router = require("express").Router();
const c = require("../controllers/exam.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);
router.post("/",              restrictTo("schooladmin","teacher"), checkPermission("canCreateExam"), c.createExam);
router.get("/",               c.getExams);
router.get("/upcoming",       c.getUpcomingExams);
router.post("/marks",         restrictTo("schooladmin","teacher"), checkPermission("canEnterMarks"), c.enterMarks);
router.get("/results/me",     restrictTo("student"), c.getStudentResults);
router.get("/results/student/:studentId", restrictTo("schooladmin","teacher","parent"), c.getStudentResults);
router.get("/results/class/:examId",      restrictTo("schooladmin","teacher"), c.getClassResults);
router.get("/report-card/me", restrictTo("student"),   c.getReportCard);
router.get("/report-card/:studentId", restrictTo("schooladmin","teacher","parent"), c.getReportCard);

// Result entry & publishing
router.get("/class/:classId/entry-data",  restrictTo("schooladmin","teacher"), checkPermission("canEnterMarks"), c.getClassStudentsForEntry);
router.post("/bulk-results",              restrictTo("schooladmin","teacher"), checkPermission("canEnterMarks"), c.saveBulkResults);
router.patch("/publish-results",          restrictTo("schooladmin","teacher"), checkPermission("canEnterMarks"), c.publishResults);

module.exports = router;
