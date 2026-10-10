const router = require("express").Router();
const c = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth");

router.post("/school/signup",       c.schoolSignup);
router.post("/school/verify-otp",   c.verifySignupOTP);
router.post("/school/resend-otp",   c.resendOTP);
router.post("/admin/login",         c.adminLogin);
router.post("/teacher/login",       c.teacherLogin);
router.post("/student/login",       c.studentLogin);
router.post("/parent/login",        c.parentLogin);
router.post("/forgot-password",     c.forgotPassword);
router.post("/reset-password",      c.resetPassword);
router.post("/change-password", protect, c.changePassword);
router.get("/profile",          protect, c.getProfile);
module.exports = router;
