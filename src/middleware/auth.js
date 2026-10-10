const jwt = require("jsonwebtoken");
const Admin   = require("../models/Admin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent  = require("../models/Parent");

const roleModelMap = { schooladmin: Admin, teacher: Teacher, student: Student, parent: Parent };

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer"))
      token = req.headers.authorization.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Not authorized. No token." });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
    const Model = roleModelMap[decoded.role];
    if (!Model) return res.status(401).json({ success: false, message: "Invalid token role." });
    const user = await Model.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ success: false, message: "User not found." });
    if (!user.isActive) return res.status(403).json({ success: false, message: "Account deactivated." });
    req.user = user;
    req.userRole = decoded.role;
    req.schoolId = decoded.schoolId || user.school || user._id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
};

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.userRole))
    return res.status(403).json({ success: false, message: "Access denied. Required: " + roles.join(", ") });
  next();
};

exports.checkPermission = (permKey) => (req, res, next) => {
  if (req.userRole === "schooladmin") return next();
  if (!req.user.permissions || !req.user.permissions[permKey])
    return res.status(403).json({ success: false, message: "Permission denied: " + permKey });
  next();
};
