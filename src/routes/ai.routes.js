const router = require("express").Router();
const c = require("../controllers/ai.controller");
const { protect, restrictTo } = require("../middleware/auth");

router.use(protect);

// Student AI features
router.post("/study-assistant",  restrictTo("student","teacher","schooladmin"), c.studyAssistant);
router.post("/generate-quiz",    restrictTo("student","teacher","schooladmin"), c.generateQuiz);
router.post("/summarize",        restrictTo("student","teacher","schooladmin"), c.generateSummary);
router.post("/study-tips",       restrictTo("student"),                         c.getStudyTips);

// Teacher AI features
router.post("/lesson-plan",      restrictTo("teacher","schooladmin"),            c.generateLessonPlan);
router.post("/report-card-comment", restrictTo("teacher","schooladmin"),         c.generateReportCardComment);
router.get("/class-health",      restrictTo("teacher","schooladmin"),            c.getClassHealthScore);

// Admin AI features
router.post("/generate-notice",  restrictTo("schooladmin","teacher"),            c.generateNotice);
router.get("/risk-analysis",     restrictTo("schooladmin","teacher"),            c.getStudentRiskAnalysis);
router.get("/fee-prediction",    restrictTo("schooladmin"),                      c.predictFeeDefaults);
router.get("/school-context",    restrictTo("schooladmin"),                      c.getSchoolContext);
router.get("/parent-summary/:studentId", restrictTo("schooladmin","teacher","parent"), c.generateParentSummary);

module.exports = router;
