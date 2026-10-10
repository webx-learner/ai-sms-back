const router = require("express").Router();
const c = require("../controllers/transport.controller");
const { protect, restrictTo } = require("../middleware/auth");

router.use(protect);
router.post("/",           restrictTo("schooladmin"), c.createRoute);
router.get("/",            c.getRoutes);
router.put("/:id",         restrictTo("schooladmin"), c.updateRoute);
router.post("/:id/assign", restrictTo("schooladmin"), c.assignStudentToRoute);
module.exports = router;
