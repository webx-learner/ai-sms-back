const router = require("express").Router();
const c = require("../controllers/fee.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);

// ── FEE STRUCTURES ────────────────────────────────────────────────────────────
router.post  ("/structure",      restrictTo("schooladmin"),             c.createFeeStructure);
router.get   ("/structure",      restrictTo("schooladmin","teacher"),   c.getFeeStructures);
router.put   ("/structure/:id",  restrictTo("schooladmin"),             c.updateFeeStructure);
router.delete("/structure/:id",  restrictTo("schooladmin"),             c.deleteFeeStructure);

// ── CONCESSIONS ───────────────────────────────────────────────────────────────
router.get   ("/concessions",    restrictTo("schooladmin"),             c.getConcessions);
router.post  ("/concessions",    restrictTo("schooladmin"),             c.createConcession);
router.put   ("/concessions/:id",restrictTo("schooladmin"),             c.updateConcession);
router.delete("/concessions/:id",restrictTo("schooladmin"),             c.deleteConcession);

// ── COLLECTIONS ───────────────────────────────────────────────────────────────
router.post  ("/collect",        restrictTo("schooladmin","teacher"), checkPermission("canManageFees"), c.collectFee);
router.get   ("/all",            restrictTo("schooladmin","teacher"),   c.getAllFees);
router.get   ("/pending",        restrictTo("schooladmin","teacher"),   c.getPendingFees);
router.get   ("/analytics",      restrictTo("schooladmin"),             c.getFeeAnalytics);
router.put   ("/:id",            restrictTo("schooladmin","teacher"),   c.updateFeeStatus);
router.delete("/:id",            restrictTo("schooladmin"),             c.deletePayment);

// ── STUDENT / PARENT FEES ─────────────────────────────────────────────────────
router.post("/pay",                    restrictTo("student"),                                  c.studentSelfPay);
router.post("/parent-pay/:studentId",  restrictTo("parent"),                                  c.parentPayFee);
router.get("/student/me",              restrictTo("student","parent"),                         c.getStudentFees);
router.get("/student/:studentId",      restrictTo("schooladmin","teacher","parent","student"), c.getStudentFees);

module.exports = router;
