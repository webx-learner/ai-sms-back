const router = require("express").Router();
const { protect, restrictTo, checkPermission } = require("../middleware/auth");
const c = require("../controllers/test.controller");

router.use(protect, restrictTo("schooladmin", "teacher"));

router.post("/",      checkPermission("canCreateExam"), c.createTest);
router.get("/",       c.getTests);
router.get("/:id",    c.getTest);
router.put("/:id",    checkPermission("canCreateExam"), c.updateTest);
router.delete("/:id", checkPermission("canCreateExam"), c.deleteTest);

module.exports = router;
