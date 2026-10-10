const express    = require("express");
const router     = express.Router();
const { protect, restrictTo } = require("../middleware/auth");
const { upload } = require("../config/cloudinary");
const c          = require("../controllers/studymaterial.controller");

// All routes require auth
router.use(protect);

router.get   ("/",              c.getMaterials);
router.post  ("/", restrictTo("schooladmin", "teacher"), upload.single("file"), c.uploadMaterial);
router.patch ("/:id/download",  c.incrementDownload);
router.delete("/:id", restrictTo("schooladmin", "teacher"), c.deleteMaterial);

module.exports = router;
