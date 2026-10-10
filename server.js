require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const http       = require("http");
const path       = require("path");
const { Server } = require("socket.io");
const connectDB  = require("./src/config/connectdb");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5001;

// ── SOCKET.IO SETUP ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});
require("./src/socket/chatSocket")(io);
app.use((req, _res, next) => { req.io = io; next(); });

// ── MIDDLEWARE ───────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_req, res) =>
  res.json({ success: true, message: "School Management API Running" })
);

// ── EXISTING ROUTES (unchanged) ──────────────────────────────
app.use("/api/auth",         require("./src/routes/auth.routes"));
app.use("/api/admin",        require("./src/routes/admin.routes"));
app.use("/api/teachers",     require("./src/routes/teacher.routes"));
app.use("/api/students",     require("./src/routes/student.routes"));
app.use("/api/attendance",   require("./src/routes/attendance.routes"));
app.use("/api/fees",         require("./src/routes/fee.routes"));
app.use("/api/exams",        require("./src/routes/exam.routes"));
app.use("/api/notices",      require("./src/routes/notice.routes"));
app.use("/api/homework",     require("./src/routes/homework.routes"));
app.use("/api/timetable",    require("./src/routes/timetable.routes"));
app.use("/api/dashboard",    require("./src/routes/dashboard.routes"));
app.use("/api/ai",           require("./src/routes/ai.routes"));
app.use("/api/gamification", require("./src/routes/gamification.routes"));
app.use("/api/library",      require("./src/routes/library.routes"));
app.use("/api/transport",    require("./src/routes/transport.routes"));
app.use("/api/events",       require("./src/routes/event.routes"));
app.use("/api/documents",    require("./src/routes/document.routes"));

// ── NEW: CHAT ROUTE ──────────────────────────────────────────
app.use("/api/chat",         require("./src/routes/chat.routes"));

// ── PERMISSIONS ──────────────────────────────────────────────
app.use("/api/permissions",  require("./src/routes/permissions.routes"));
app.use("/api/periods",      require("./src/routes/periods.routes"));

// ── SUBJECTS ─────────────────────────────────────────────────
app.use("/api/subjects",      require("./src/routes/subject.routes"));

// ── TESTS & SCHEDULED EXAMS ──────────────────────────────────
app.use("/api/tests",         require("./src/routes/test.routes"));
app.use("/api/school-exams",  require("./src/routes/scheduledexam.routes"));

// ── STUDY MATERIALS ───────────────────────────────────────────
app.use("/api/study-materials", require("./src/routes/studymaterial.routes"));

// ── PROGRESS ──────────────────────────────────────────────────
app.use("/api/progress",        require("./src/routes/progress.routes"));

// ── ERROR HANDLERS ───────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use((err, _req, res, _next) => {
  console.error("Error:", err.message);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Internal server error" });
});

// ── START ────────────────────────────────────────────────────
server.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Socket.io ready for real-time chat`);
});
