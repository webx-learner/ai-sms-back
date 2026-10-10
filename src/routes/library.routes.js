const router = require("express").Router();
const c = require("../controllers/library.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);
router.post("/books",           restrictTo("schooladmin","teacher"), checkPermission("canManageLibrary"), c.addBook);
router.get("/books",            c.getBooks);
router.post("/issue",           restrictTo("schooladmin","teacher"), checkPermission("canManageLibrary"), c.issueBook);
router.put("/return/:id",       restrictTo("schooladmin","teacher"), checkPermission("canManageLibrary"), c.returnBook);
router.get("/issued",           restrictTo("schooladmin","teacher"), c.getIssuedBooks);
module.exports = router;
