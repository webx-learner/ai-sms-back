const router = require("express").Router();
const c = require("../controllers/dashboard.controller");
const { protect, restrictTo } = require("../middleware/auth");

router.use(protect);
router.get("/admin",   restrictTo("schooladmin"), c.adminDashboard);
router.get("/teacher", restrictTo("teacher"),     c.teacherDashboard);
router.get("/student", restrictTo("student"),     c.studentDashboard);
router.get("/parent",  restrictTo("parent"),      c.parentDashboard);
router.get("/tc/:studentId",   restrictTo("schooladmin","teacher"), c.generateTC);
router.get("/id-card/:studentId", restrictTo("schooladmin","teacher"), c.generateIDCard);
module.exports = router;
