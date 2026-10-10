const router = require("express").Router();
const c = require("../controllers/admin.controller");
const { protect, restrictTo } = require("../middleware/auth");
const A = restrictTo("schooladmin");

router.use(protect);

// Shared read-only endpoints — accessible to teachers too
router.get("/classes", restrictTo("schooladmin","teacher"), c.getAllClasses);
router.get("/students", restrictTo("schooladmin","teacher"), c.getAllStudents);
router.get("/students/:id", restrictTo("schooladmin","teacher"), c.getStudent);

// Everything else is admin-only
router.use(A);
router.get("/profile",          c.getSchoolProfile);
router.put("/profile",          c.updateSchoolProfile);
router.get("/stats",            c.getSchoolStats);

// Teachers
router.post("/teachers",        c.createTeacher);
router.get("/teachers",         c.getAllTeachers);
router.get("/teachers/:id",     c.getTeacher);
router.put("/teachers/:id",     c.updateTeacher);
router.delete("/teachers/:id",  c.deleteTeacher);
router.put("/teachers/:id/permissions",   c.updateTeacherPermissions);
router.put("/teachers/:id/assign-class",  c.assignClassToTeacher);

// Students
router.post("/students",        c.createStudent);
router.get("/students",         c.getAllStudents);
router.get("/students/:id",     c.getStudent);
router.put("/students/:id",     c.updateStudent);
router.delete("/students/:id",  c.deleteStudent);
router.patch("/students/:id/ai-permission", c.updateStudentAIPermission);

// Classes
router.post("/classes",         c.createClass);
router.get("/classes",          c.getAllClasses);
router.put("/classes/:id",      c.updateClass);
router.delete("/classes/:id",   c.deleteClass);

module.exports = router;
