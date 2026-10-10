const { Badge, UserBadge, Challenge } = require("../models/Badge");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");

// ── BADGES ───────────────────────────────────────────────────
exports.createBadge = async (req, res) => {
  try {
    const badge = await Badge.create({ school: req.schoolId, ...req.body });
    res.status(201).json({ success: true, message: "Badge created.", data: badge });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getBadges = async (req, res) => {
  try {
    const badges = await Badge.find({ school: req.schoolId });
    res.json({ success: true, data: badges });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.awardBadge = async (req, res) => {
  try {
    const { badgeId, awardedTo, awardedToModel, reason } = req.body;
    const userBadge = await UserBadge.create({
      school: req.schoolId, badge: badgeId, awardedTo, awardedToModel, reason,
      awardedBy: req.userRole === "teacher" ? req.user._id : null,
      awardedByAdmin: req.userRole === "schooladmin" ? req.user._id : null,
    });
    const badge = await Badge.findById(badgeId);
    if (badge) {
      if (awardedToModel === "Student") await Student.findByIdAndUpdate(awardedTo, { $inc: { points: badge.points }, $addToSet: { badges: badge.name } });
      else await Teacher.findByIdAndUpdate(awardedTo, { $inc: { points: badge.points }, $addToSet: { badges: badge.name } });
    }
    res.status(201).json({ success: true, message: "Badge awarded!", data: userBadge });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUserBadges = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const userBadges = await UserBadge.find({ awardedTo: userId }).populate("badge");
    res.json({ success: true, data: userBadges });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── LEADERBOARD ──────────────────────────────────────────────
exports.getLeaderboard = async (req, res) => {
  try {
    const { class: cls, type } = req.query;
    const query = { school: req.schoolId, isActive: true };
    if (cls) query.class = cls;
    const students = await Student.find(query).select("name studentId class section points streakDays badges photo").sort({ points: -1 }).limit(20);
    const ranked = students.map((s, i) => ({ rank: i + 1, ...s.toObject() }));
    res.json({ success: true, data: ranked });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyRank = async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    const aboveCount = await Student.countDocuments({ school: req.schoolId, class: student.class, points: { $gt: student.points } });
    res.json({ success: true, rank: aboveCount + 1, points: student.points, streakDays: student.streakDays });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStarStudent = async (req, res) => {
  try {
    const { class: cls } = req.query;
    const query = { school: req.schoolId, isActive: true };
    if (cls) query.class = cls;
    const star = await Student.findOne(query).sort({ points: -1, streakDays: -1 }).select("name studentId class points streakDays badges photo");
    res.json({ success: true, data: star });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── DAILY CHALLENGE ──────────────────────────────────────────
exports.createChallenge = async (req, res) => {
  try {
    const { class: cls, section, question, answer, subject, points, expiresAt } = req.body;
    const challenge = await Challenge.create({
      school: req.schoolId, class: cls, section: section || "", question, answer, subject, points: points || 5,
      postedBy: req.user._id, expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    res.status(201).json({ success: true, message: "Challenge posted!", data: challenge });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getActiveChallenges = async (req, res) => {
  try {
    const query = { school: req.schoolId, isActive: true, expiresAt: { $gte: new Date() } };
    if (req.userRole === "student") query.class = req.user.class;
    const challenges = await Challenge.find(query).populate("postedBy", "name").select("-answer");
    res.json({ success: true, data: challenges });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.answerChallenge = async (req, res) => {
  try {
    const { answer } = req.body;
    const challenge = await Challenge.findOne({ _id: req.params.id, school: req.schoolId, isActive: true, expiresAt: { $gte: new Date() } });
    if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found or expired." });
    const alreadyAnswered = challenge.responses.find(r => r.student.toString() === req.user._id.toString());
    if (alreadyAnswered) return res.status(400).json({ success: false, message: "Already answered." });
    const isCorrect = answer.trim().toLowerCase() === challenge.answer.trim().toLowerCase();
    const pointsEarned = isCorrect ? challenge.points : 0;
    challenge.responses.push({ student: req.user._id, answer, isCorrect, pointsEarned });
    await challenge.save();
    if (isCorrect) await Student.findByIdAndUpdate(req.user._id, { $inc: { points: pointsEarned } });
    res.json({ success: true, isCorrect, pointsEarned, message: isCorrect ? "Correct! Points earned: " + pointsEarned : "Wrong answer. Try next time!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── MOOD CHECK-IN ────────────────────────────────────────────
exports.moodCheckin = async (req, res) => {
  try {
    const { mood } = req.body;
    const validMoods = ["happy","okay","sad","stressed","excited","confused"];
    if (!validMoods.includes(mood)) return res.status(400).json({ success: false, message: "Invalid mood." });
    const student = await Student.findById(req.user._id);
    student.moodHistory.push({ mood, date: new Date() });
    if (student.moodHistory.length > 30) student.moodHistory.shift();
    await student.save();
    res.json({ success: true, message: "Mood recorded!", data: { mood, points: 1 } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMoodHistory = async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).select("moodHistory");
    res.json({ success: true, data: student.moodHistory });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
