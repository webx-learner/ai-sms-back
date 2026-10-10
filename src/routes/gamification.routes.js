const router = require("express").Router();
const c = require("../controllers/gamification.controller");
const { protect, restrictTo, checkPermission } = require("../middleware/auth");

router.use(protect);
router.post("/badges",          restrictTo("schooladmin"), c.createBadge);
router.get("/badges",           c.getBadges);
router.post("/badges/award",    restrictTo("schooladmin","teacher"), checkPermission("canAwardBadges"), c.awardBadge);
router.get("/badges/user/:userId", c.getUserBadges);
router.get("/badges/me",        c.getUserBadges);
router.get("/leaderboard",      c.getLeaderboard);
router.get("/my-rank",          restrictTo("student"), c.getMyRank);
router.get("/star-student",     restrictTo("schooladmin","teacher"), c.getStarStudent);
router.post("/challenges",      restrictTo("teacher","schooladmin"), checkPermission("canDailyChallenge"), c.createChallenge);
router.get("/challenges",       c.getActiveChallenges);
router.post("/challenges/:id/answer", restrictTo("student"), c.answerChallenge);
router.post("/mood",            restrictTo("student"), c.moodCheckin);
router.get("/mood",             restrictTo("student"), c.getMoodHistory);
module.exports = router;
