const Permission = require("../models/Permission");
const Teacher    = require("../models/Teacher");

// All boolean keys that exist on Teacher.permissions
const ALL_KEYS = [
  "canCreateStudent", "canEditStudent", "canDeleteStudent", "canViewAllStudents",
  "canMarkAttendance", "canViewAttendance",
  "canManageFees", "canViewFees",
  "canCreateExam", "canEnterMarks", "canViewExams",
  "canPostNotice", "canViewNotices",
  "canAssignHomework", "canViewHomework",
  "canPostNoticeBoard", "canManageLibrary",
  "canDailyChallenge", "canAwardBadges",
];

// Build boolean permissions object from array of keys (for syncing to Teacher model)
function toBooleanMap(permArray) {
  const map = {};
  ALL_KEYS.forEach((k) => { map[k] = permArray.includes(k); });
  return map;
}

// POST /api/permissions/:teacherId  — Admin assigns permissions
exports.assignPermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions))
      return res.status(400).json({ success: false, message: "permissions must be an array." });

    // Validate keys
    const invalid = permissions.filter((k) => !ALL_KEYS.includes(k));
    if (invalid.length)
      return res.status(400).json({ success: false, message: "Invalid permission keys: " + invalid.join(", ") });

    const teacher = await Teacher.findOne({ _id: req.params.teacherId, school: req.user._id });
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });

    // Upsert Permission document
    const perm = await Permission.findOneAndUpdate(
      { teacher: teacher._id },
      { teacher: teacher._id, school: req.user._id, permissions, assignedBy: req.user._id, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    // Sync to Teacher.permissions boolean fields so existing checkPermission middleware works
    teacher.permissions = toBooleanMap(permissions);
    await teacher.save();

    res.json({ success: true, message: "Permissions updated.", data: perm });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/permissions/:teacherId  — Admin OR teacher (own ID only)
exports.getTeacherPermissions = async (req, res) => {
  try {
    let teacherId = req.params.teacherId;

    // Teacher can only access their own permissions
    if (req.userRole === "teacher") {
      if (req.user._id.toString() !== teacherId)
        return res.status(403).json({ success: false, message: "Access denied." });
    } else {
      // Admin: make sure teacher belongs to their school
      const teacher = await Teacher.findOne({ _id: teacherId, school: req.user._id });
      if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found." });
    }

    const perm = await Permission.findOne({ teacher: teacherId });
    res.json({
      success: true,
      data: perm || { teacher: teacherId, permissions: [], assignedBy: null, updatedAt: null },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/permissions  — Admin gets all teachers with permissions
exports.getAllPermissions = async (req, res) => {
  try {
    const teachers = await Teacher.find({ school: req.user._id }).select("name email teacherId permissions").lean();

    const permDocs = await Permission.find({ school: req.user._id }).lean();
    const permMap  = {};
    permDocs.forEach((p) => { permMap[p.teacher.toString()] = p.permissions; });

    const data = teachers.map((t) => ({
      teacher:     { _id: t._id, name: t.name, email: t.email, teacherId: t.teacherId },
      permissions: permMap[t._id.toString()] || ALL_KEYS.filter((k) => t.permissions?.[k]),
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
