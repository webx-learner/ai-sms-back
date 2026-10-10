const router = require("express").Router();
const c = require("../controllers/teacher.controller");
const { protect, restrictTo } = require("../middleware/auth");
const T = restrictTo("teacher");

router.use(protect, T);
router.get("/me",           c.getMyProfile);
router.put("/me",           c.updateMyProfile);
router.get("/my-students",  c.getMyStudents);
router.post("/students",    c.createStudentByTeacher);
router.get("/permissions",  c.getMyPermissions);
module.exports = router;
