const AttendanceRecord = require("../models/AttendanceRecord");
const { Result }       = require("../models/Exam");
const Student          = require("../models/Student");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── helpers ────────────────────────────────────────────────────────────────────
function calcGrade(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "F";
}
function pctToGpa(pct) {
  return (pct / 10).toFixed(2);
}

// ── GET /progress/student/me  ──────────────────────────────────────────────────
exports.getStudentProgress = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;

    // ── 1. Exam Results ──────────────────────────────────────────
    const results = await Result.find({ student: studentId })
      .populate("exam", "title subject examType totalMarks date createdBy")
      .populate({ path: "exam", populate: { path: "createdBy", select: "name" } })
      .sort({ createdAt: -1 });

    // Subject-wise aggregation
    const subjMap = {};
    results.forEach((r) => {
      const subj = r.exam?.subject || "General";
      if (!subjMap[subj]) subjMap[subj] = { scores: [], grades: [] };
      subjMap[subj].scores.push(r.percentage);
      subjMap[subj].grades.push(r.grade);
    });

    const subjectData = Object.entries(subjMap).map(([subject, d]) => {
      const score = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length);
      return {
        subject,
        score,
        classAvg: 0,     // classAvg requires fetching all students — left as 0
        grade: calcGrade(score),
      };
    });

    const avgScore = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length)
      : 0;
    const overallGPA = pctToGpa(avgScore);

    // Teacher remarks — from result remarks
    const remarks = results
      .filter((r) => r.remarks && r.remarks.trim())
      .slice(0, 6)
      .map((r) => ({
        date:     r.updatedAt?.toISOString().slice(0, 10) || r.createdAt?.toISOString().slice(0, 10),
        teacher:  r.exam?.createdBy?.name || "Teacher",
        subject:  r.exam?.subject || "General",
        remark:   r.remarks,
        positive: r.isPassed,
      }));

    // ── 2. Attendance monthly trend ──────────────────────────────
    const year = new Date().getFullYear();
    const attRecords = await AttendanceRecord.find({
      studentId,
      date: { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31, 23, 59, 59) },
    });

    const monthly = {};
    attRecords.forEach((r) => {
      const m = new Date(r.date).getMonth();
      if (!monthly[m]) monthly[m] = { present: 0, total: 0 };
      monthly[m].total++;
      if (r.status === "present" || r.status === "late") monthly[m].present++;
    });

    const performanceTrend = Object.entries(monthly)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([m, v]) => ({
        month: MONTHS[Number(m)],
        score: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      }));

    // ── 3. Class rank ────────────────────────────────────────────
    let rank = "—";
    if (results.length > 0) {
      const student = await Student.findById(studentId);
      if (student?.class && student?.section) {
        const classmates = await Student.find({
          school:  req.schoolId,
          class:   student.class,
          section: student.section,
          _id:     { $ne: studentId },
        }).select("_id");

        const cmIds = classmates.map((s) => s._id);
        // Get avg percentage for each classmate
        const cmResults = await Result.aggregate([
          { $match: { student: { $in: cmIds } } },
          { $group: { _id: "$student", avg: { $avg: "$percentage" } } },
        ]);

        const higherCount = cmResults.filter((c) => c.avg > avgScore).length;
        rank = `${higherCount + 1}${ordinal(higherCount + 1)}`;
      }
    }

    res.json({
      success: true,
      data: {
        overallGPA,
        rank,
        subjectCount:     subjectData.length,
        avgScore:         `${avgScore}%`,
        performanceTrend: performanceTrend.length > 0 ? performanceTrend : [],
        subjectData,
        remarks,
        hasResults: results.length > 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
