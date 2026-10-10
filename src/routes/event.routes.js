const router = require("express").Router();
const c = require("../controllers/event.controller");
const { protect, restrictTo } = require("../middleware/auth");

router.use(protect);
router.post("/",        restrictTo("schooladmin"), c.createEvent);
router.get("/",         c.getEvents);
router.get("/upcoming", c.getUpcomingEvents);
router.delete("/:id",   restrictTo("schooladmin"), c.deleteEvent);
module.exports = router;
