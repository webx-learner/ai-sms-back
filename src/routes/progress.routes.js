const express = require("express");
const router  = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const c = require("../controllers/progress.controller");

router.use(protect);

router.get("/student/me",          restrictTo("student"),                              c.getStudentProgress);
router.get("/student/:studentId",  restrictTo("schooladmin","teacher","parent"),       c.getStudentProgress);

module.exports = router;
