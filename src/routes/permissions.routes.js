const router = require("express").Router();
const c = require("../controllers/permissions.controller");
const { protect, restrictTo } = require("../middleware/auth");

// GET /api/permissions — Admin only
router.get("/", protect, restrictTo("schooladmin"), c.getAllPermissions);

// POST /api/permissions/:teacherId — Admin only
router.post("/:teacherId", protect, restrictTo("schooladmin"), c.assignPermissions);

// GET /api/permissions/:teacherId — Admin OR teacher (own)
router.get("/:teacherId", protect, c.getTeacherPermissions);

module.exports = router;
