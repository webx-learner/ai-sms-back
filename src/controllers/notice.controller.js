const Notice = require("../models/Notice");

exports.createNotice = async (req, res) => {
  try {
    const { title, content, category, targetRoles, targetClass, isUrgent, isPinned, expiryDate } = req.body;
    const notice = await Notice.create({
      school: req.schoolId, title, content, category: category || "general",
      targetRoles: targetRoles || ["all"], targetClass: targetClass || "",
      postedBy: req.user._id, postedByModel: req.userRole === "schooladmin" ? "Admin" : "Teacher",
      isUrgent: isUrgent || false, isPinned: isPinned || false, expiryDate: expiryDate || null,
    });
    res.status(201).json({ success: true, message: "Notice posted.", data: notice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getNotices = async (req, res) => {
  try {
    const { category, isUrgent } = req.query;
    const query = { school: req.schoolId, $or: [{ expiryDate: null }, { expiryDate: { $gte: new Date() } }] };
    if (req.userRole === "student") query.$or = [{ targetRoles: "all" }, { targetRoles: "student" }, { targetClass: req.user.class }];
    else if (req.userRole === "teacher") query.$or = [{ targetRoles: "all" }, { targetRoles: "teacher" }];
    else if (req.userRole === "parent") query.$or = [{ targetRoles: "all" }, { targetRoles: "parent" }];
    if (category) query.category = category;
    if (isUrgent !== undefined) query.isUrgent = isUrgent === "true";
    const notices = await Notice.find(query)
      .sort({ isPinned: -1, isUrgent: -1, createdAt: -1 })
      .populate("postedBy", "name");
    res.json({ success: true, data: notices });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getNotice = async (req, res) => {
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId },
      { $inc: { views: 1 } }, { new: true }).populate("postedBy", "name");
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found." });
    res.json({ success: true, data: notice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateNotice = async (req, res) => {
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId },
      req.body, { new: true });
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found." });
    res.json({ success: true, message: "Notice updated.", data: notice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found." });
    res.json({ success: true, message: "Notice deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
