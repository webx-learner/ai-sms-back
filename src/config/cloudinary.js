const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, "../../uploads/study-materials");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = [".pdf",".doc",".docx",".ppt",".pptx",".xls",".xlsx",".txt"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed. Allowed: ${ALLOWED.join(", ")}`));
  },
});

// Stub — kept so controller import doesn't break; destroy is a no-op here
const cloudinary = {
  uploader: {
    destroy: async () => {},
  },
};

module.exports = { cloudinary, upload };
