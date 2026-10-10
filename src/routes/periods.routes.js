const router = require("express").Router();
const { protect, restrictTo } = require("../middleware/auth");
const c = require("../controllers/periods.controller");

router.use(protect);

router.get("/",      c.getPeriods);                              // any role can read
router.post("/",     restrictTo("schooladmin"), c.addPeriod);
router.put("/:id",   restrictTo("schooladmin"), c.updatePeriod);
router.delete("/:id",restrictTo("schooladmin"), c.deletePeriod);

module.exports = router;
