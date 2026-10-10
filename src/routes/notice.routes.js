const router = require("express").Router();
const c = require("../controllers/notice.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);
router.post("/",    restrictTo("schooladmin","teacher"), checkPermission("canPostNotice"), c.createNotice);
router.get("/",     c.getNotices);
router.get("/:id",  c.getNotice);
router.put("/:id",  restrictTo("schooladmin","teacher"), c.updateNotice);
router.delete("/:id", restrictTo("schooladmin","teacher"), c.deleteNotice);
module.exports = router;
