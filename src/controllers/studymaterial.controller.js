const StudyMaterial = require("../models/StudyMaterial");
const Teacher       = require("../models/Teacher");
const { cloudinary } = require("../config/cloudinary");
const path = require("path");
const fs   = require("fs");

// ── helper: get teacher's assigned class names ─────────────────────────────
const teacherClasses = async (teacherId) => {
  const t = await Teacher.findById(teacherId).populate("assignedClasses", "name section");
  return t?.assignedClasses ?? [];
};

// ── GET /study-materials ──────────────────────────────────────────────────
exports.getMaterials = async (req, res) => {
  try {
    const { class: cls, subject, section } = req.query;
    const query = { school: req.schoolId };

    if (req.userRole === "student") {
      // Students see only their own class materials
      query.class = req.user.class;
      if (req.user.section) {
        query.$or = [{ section: req.user.section }, { section: "" }];
      }
    } else if (req.userRole === "teacher") {
      // Teachers see only their assigned classes
      const assigned = await teacherClasses(req.user._id);
      if (assigned.length === 0) return res.json({ success: true, data: [] });
      query.$or = assigned.flatMap((c) => [
        { class: c.name, section: c.section },
        { class: c.name, section: "" },
      ]);
    } else {
      // Admin: optional filters
      if (cls)     query.class   = cls;
      if (section) query.section = section;
    }

    if (subject) query.subject = { $regex: subject, $options: "i" };

    const materials = await StudyMaterial.find(query)
      .populate("uploadedBy", "name teacherId")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: materials.length, data: materials });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /study-materials  (multipart/form-data) ──────────────────────────
exports.uploadMaterial = async (req, res) => {
  try {
    const { title, description, subject, class: cls, section, type } = req.body;

    if (!title || !subject || !cls)
      return res.status(400).json({ success: false, message: "title, subject and class are required." });
    if (!req.file)
      return res.status(400).json({ success: false, message: "A file is required." });

    // Teacher: verify class is one of their assigned classes
    if (req.userRole === "teacher") {
      const assigned = await teacherClasses(req.user._id);
      const allowed  = assigned.some((c) => c.name === cls);
      if (!allowed)
        return res.status(403).json({ success: false, message: "You can only upload materials for your assigned classes." });
    }

    // Build a URL that the frontend can download directly
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${baseUrl}/uploads/study-materials/${req.file.filename}`;

    const material = await StudyMaterial.create({
      school:        req.schoolId,
      title,
      description:   description || "",
      subject,
      class:         cls,
      section:       section || "",
      type:          type || "pdf",
      fileUrl,
      filePublicId:  req.file.filename,
      fileName:      req.file.originalname,
      uploadedBy:    req.user._id,
      uploaderModel: req.userRole === "schooladmin" ? "Admin" : "Teacher",
      uploaderName:  req.user.name,
    });

    res.status(201).json({ success: true, message: "Material uploaded.", data: material });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /study-materials/:id/download ───────────────────────────────────
exports.incrementDownload = async (req, res) => {
  try {
    const material = await StudyMaterial.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId },
      { $inc: { downloads: 1 } },
      { new: true }
    );
    if (!material) return res.status(404).json({ success: false, message: "Material not found." });
    res.json({ success: true, data: { downloads: material.downloads, fileUrl: material.fileUrl } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /study-materials/:id ───────────────────────────────────────────
exports.deleteMaterial = async (req, res) => {
  try {
    const query = { _id: req.params.id, school: req.schoolId };
    if (req.userRole === "teacher") query.uploadedBy = req.user._id;

    const material = await StudyMaterial.findOne(query);
    if (!material) return res.status(404).json({ success: false, message: "Material not found or access denied." });

    // Delete local file
    if (material.filePublicId) {
      try {
        const filePath = path.join(__dirname, "../../uploads/study-materials", material.filePublicId);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }

    await material.deleteOne();
    res.json({ success: true, message: "Material deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
