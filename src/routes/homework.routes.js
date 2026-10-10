const router = require("express").Router();
const c = require("../controllers/homework.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);
router.post("/",            restrictTo("schooladmin","teacher"), checkPermission("canAssignHomework"), c.assignHomework);
router.get("/",             c.getHomework);
router.get("/pending/me",   restrictTo("student"),               c.getPendingHomework);
router.post("/:id/submit",  restrictTo("student"),               c.submitHomework);
router.put("/:id/grade",    restrictTo("schooladmin","teacher"), c.gradeHomework);
router.delete("/:id",       restrictTo("schooladmin","teacher"), c.deleteHomework);
module.exports = router;
