const express = require("express");
const router  = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const c = require("../controllers/subject.controller");

router.use(protect);

// Student: get subjects assigned to their own class
router.get("/my-class", restrictTo("student"), c.getMyClassSubjects);

// Teachers can read subjects assigned to a specific class (needed for homework creation)
router.get("/class/:classId", restrictTo("schooladmin", "teacher"), c.getSubjectsByClass);

// All other routes are admin-only
const A = restrictTo("schooladmin");
router.get   ("/assignments", A, c.getAssignments);
router.post  ("/assign",      A, c.assignToClass);
router.post  ("/bulk-assign", A, c.bulkAssign);
router.delete("/unassign",    A, c.unassignFromClass);
router.get   ("/",            A, c.getAllSubjects);
router.post  ("/",            A, c.createSubject);
router.put   ("/:id",         A, c.updateSubject);
router.delete("/:id",         A, c.deleteSubject);

module.exports = router;
