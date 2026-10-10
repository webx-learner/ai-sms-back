const Groq = require("groq-sdk");
const Student          = require("../models/Student");
const Teacher          = require("../models/Teacher");
const Attendance       = require("../models/Attendance");
const AttendanceRecord = require("../models/AttendanceRecord");
const { Result }       = require("../models/Exam");
const { FeePayment }   = require("../models/Fee");

const getGroq = () => {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set in .env");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
};

const chat = async (messages, maxTokens = 1024) => {
  const groq = getGroq();
  const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
       max_tokens: maxTokens
       });
  return res.choices[0].message.content;
};


// ── AI STUDY ASSISTANT (Student chatbot) ─────────────────────
exports.studyAssistant = async (req, res) => {
  try {
    const { question, subject, conversationHistory, schoolContext } = req.body;
    if (!question) return res.status(400).json({ success: false, message: "Question required." });

    const isAdmin = subject === "school management";
    let systemPrompt;
    if (isAdmin) {
      systemPrompt =
        "You are a helpful school management AI assistant for the school admin. " +
        "Respond naturally to greetings and general conversation. " +
        "When asked about school data (students, fees, attendance, teachers, classes, results), " +
        "answer directly and specifically using the live school data provided below. " +
        "Always mention names, amounts, and specific details from the data. " +
        "Never say data is unavailable if it is present in the school data section.\n\n" +
        (schoolContext || "");
    } else {
      systemPrompt =
        "You are a friendly and helpful school study assistant for students in India. " +
        "Answer questions clearly, use simple language, and give examples. " +
        "Subject context: " + (subject || "General");
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user", content: question },
    ];
    const maxTok = isAdmin ? 2000 : 800;
    const answer = await chat(messages, maxTok);
    res.json({ success: true, answer, subject });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};




// ── AI LESSON PLAN GENERATOR (Teacher) ──────────────────────
exports.generateLessonPlan = async (req, res) => {
  try {
    const { subject, topic, class: cls, duration, objectives } = req.body;
    const prompt = `Create a detailed 5-day lesson plan for:
- Subject: ${subject}
- Topic: ${topic}
- Class: ${cls}
- Duration per class: ${duration || "45 minutes"}
- Learning objectives: ${objectives || "As per standard curriculum"}

Include: Day-wise activities, teaching methods, materials needed, homework, assessment methods. Format clearly.`;

    const plan = await chat([{ role: "user", content: prompt }], 1500);
    res.json({ success: true, lessonPlan: plan });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI REPORT CARD COMMENTS ──────────────────────────────────
exports.generateReportCardComment = async (req, res) => {
  try {
    const { studentName, class: cls, avgPercentage, attendance, subjects, behaviour } = req.body;
    const prompt = `Write a professional, encouraging report card comment for:
- Student: ${studentName}, Class: ${cls}
- Average marks: ${avgPercentage}%
- Attendance: ${attendance}%
- Subject performance: ${JSON.stringify(subjects || {})}
- Behaviour: ${behaviour || "Good"}

Write 3-4 sentences. Be specific, constructive, and encouraging. Include areas of strength and improvement.`;

    const comment = await chat([{ role: "user", content: prompt }], 300);
    res.json({ success: true, comment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI NOTICE WRITER ─────────────────────────────────────────
exports.generateNotice = async (req, res) => {
  try {
    const { topic, category, schoolName, details } = req.body;
    const prompt = `Write a formal school notice for:
- School: ${schoolName || "Our School"}
- Topic: ${topic}
- Category: ${category || "general"}
- Key details: ${details || ""}

Format: Title, Date, Body (2-3 paragraphs), Closing. Keep it professional and clear.`;

    const notice = await chat([{ role: "user", content: prompt }], 500);
    res.json({ success: true, notice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI STUDENT RISK ANALYSIS ─────────────────────────────────
exports.getStudentRiskAnalysis = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const students = await Student.find({ school: schoolId, isActive: true }).select("name studentId class streakDays points badges");
    const results  = await Result.find({ school: schoolId }).sort({ createdAt: -1 });
    const attendances = await Attendance.find({ school: schoolId }).sort({ date: -1 }).limit(30);

    // Build student stats
    const stats = students.map(s => {
      const sResults = results.filter(r => r.student.toString() === s._id.toString());
      const avgPerc  = sResults.length > 0 ? Math.round(sResults.reduce((sum, r) => sum + r.percentage, 0) / sResults.length) : null;
      let attendanceCount = 0, presentCount = 0;
      attendances.forEach(a => {
        const rec = a.records.find(r => r.student.toString() === s._id.toString());
        if (rec) { attendanceCount++; if (rec.status === "present") presentCount++; }
      });
      const attendPct = attendanceCount > 0 ? Math.round((presentCount / attendanceCount) * 100) : null;
      return { name: s.name, studentId: s.studentId, class: s.class, avgMarks: avgPerc, attendance: attendPct, streakDays: s.streakDays };
    });

    const atRisk = stats.filter(s => (s.avgMarks !== null && s.avgMarks < 40) || (s.attendance !== null && s.attendance < 75));

    if (atRisk.length === 0) return res.json({ success: true, message: "All students performing well!", atRisk: [], insights: "No at-risk students detected currently." });

    const prompt = `Analyze these at-risk students and give brief insights and recommendations:
${JSON.stringify(atRisk.slice(0, 10), null, 2)}

Provide: 1) Overall pattern 2) Top 3 recommendations for teachers 3) Parent engagement suggestions. Keep concise.`;

    const insights = await chat([{ role: "user", content: prompt }], 600);
    res.json({ success: true, atRiskCount: atRisk.length, atRisk, insights });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI CLASS HEALTH SCORE ────────────────────────────────────
exports.getClassHealthScore = async (req, res) => {
  try {
    const { class: cls } = req.query;
    const students  = await Student.find({ school: req.schoolId, class: cls, isActive: true });
    const results   = await Result.find({ school: req.schoolId });
    const attendances = await Attendance.find({ school: req.schoolId, class: cls });

    const studentIds = students.map(s => s._id.toString());
    const classResults = results.filter(r => studentIds.includes(r.student.toString()));
    const avgMarks = classResults.length > 0 ? Math.round(classResults.reduce((s, r) => s + r.percentage, 0) / classResults.length) : 0;

    let totalPresent = 0, totalRecords = 0;
    attendances.forEach(a => a.records.filter(r => studentIds.includes(r.student.toString())).forEach(r => {
      totalRecords++; if (r.status === "present") totalPresent++;
    }));
    const attendancePct = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
    const healthScore   = Math.round((avgMarks * 0.6) + (attendancePct * 0.4));

    const prompt = `A class has: avg marks ${avgMarks}%, attendance ${attendancePct}%, health score ${healthScore}/100.
Give a 2-sentence assessment and one actionable tip for the teacher.`;

    const assessment = await chat([{ role: "user", content: prompt }], 200);
    res.json({ success: true, class: cls, healthScore, avgMarks, attendancePct, assessment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI PRACTICE QUIZ ─────────────────────────────────────────
exports.generateQuiz = async (req, res) => {
  try {
    const { subject, topic, class: cls, count } = req.body;
    const prompt = `Generate ${count || 5} multiple choice questions for:
- Subject: ${subject}, Topic: ${topic}, Class: ${cls}

Format as JSON array: [{"question":"...","options":["A)...","B)...","C)...","D)..."],"correct":"A","explanation":"..."}]
Return ONLY the JSON array, no extra text.`;

    const raw = await chat([{ role: "user", content: prompt }], 1200);
    let questions;
    try { questions = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { questions = raw; }
    res.json({ success: true, questions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI SUMMARY MAKER ─────────────────────────────────────────
exports.generateSummary = async (req, res) => {
  try {
    const { text, subject } = req.body;
    if (!text) return res.status(400).json({ success: false, message: "Text required." });
    const prompt = `Summarize this ${subject || ""} content in simple bullet points for a school student:
${text.slice(0, 3000)}

Give: Key points, Important terms, Remember section. Keep student-friendly.`;
    const summary = await chat([{ role: "user", content: prompt }], 600);
    res.json({ success: true, summary });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI FEE DEFAULT PREDICTOR ─────────────────────────────────
exports.predictFeeDefaults = async (req, res) => {
  try {
    const { FeePayment } = require("../models/Fee");
    const pendingFees = await FeePayment.find({ school: req.schoolId, status: { $in: ["pending","overdue"] } })
      .populate("student", "name class").sort({ dueDate: 1 }).limit(20);

    if (pendingFees.length === 0) return res.json({ success: true, message: "No pending fees.", prediction: "All fees collected!" });

    const data = pendingFees.map(f => ({ student: f.student?.name, class: f.student?.class, amount: f.amount, daysOverdue: Math.max(0, Math.floor((new Date() - new Date(f.dueDate)) / 86400000)) }));
    const prompt = `Analyze these pending school fees and predict risk. Data: ${JSON.stringify(data.slice(0, 10))}
Give: 1) High-risk cases 2) Collection strategy 3) Parent communication suggestion. Be brief.`;
    const prediction = await chat([{ role: "user", content: prompt }], 400);
    res.json({ success: true, pendingCount: pendingFees.length, prediction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── AI STUDY TIPS ────────────────────────────────────────────
exports.getStudyTips = async (req, res) => {
  try {
    const { subject, examDate, studentClass } = req.body;
    const prompt = `Give 5 practical study tips for a Class ${studentClass || "10"} student:
- Subject: ${subject || "all subjects"}
- ${examDate ? "Exam in: " + examDate : "General tips"}

Tips should be actionable, motivating, and India-exam focused.`;
    const tips = await chat([{ role: "user", content: prompt }], 400);
    res.json({ success: true, tips });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PARENT WEEKLY SUMMARY ────────────────────────────────────
exports.generateParentSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });

    const results = await Result.find({ student: studentId }).sort({ createdAt: -1 }).limit(5);
    const avgMarks = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : null;

    const prompt = `Write a friendly weekly progress summary for parents:
- Student: ${student.name}, Class: ${student.class}
- Attendance streak: ${student.streakDays} days
- Recent avg marks: ${avgMarks || "No data"}%
- Points earned: ${student.points}
- Badges: ${student.badges.join(", ") || "None yet"}

Write in friendly Hindi-English mix OR pure English. 3-4 sentences. Be encouraging.`;

    const summary = await chat([{ role: "user", content: prompt }], 300);
    res.json({ success: true, summary, student: { name: student.name, class: student.class } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── RICH SCHOOL CONTEXT (for AI Insights) ────────────────────
exports.getSchoolContext = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [students, teachers, monthAttendance, fees, results] = await Promise.all([
      Student.find({ school: schoolId, isActive: true })
        .select("_id name class section studentId rollNumber"),
      Teacher.find({ school: schoolId, isActive: true })
        .select("name designation subjects"),
      AttendanceRecord.find({ school: schoolId, date: { $gte: monthStart } })
        .select("studentId status"),
      FeePayment.find({ school: schoolId })
        .populate("student", "name class section")
        .select("student amount paidAmount status title"),
      Result.find({ school: schoolId, isPublished: true })
        .populate("student", "name class section")
        .select("student percentage subject"),
    ]);

    // student _id → { key, name, class, section }
    const studentMeta = {};
    students.forEach(s => {
      const cls = s.class || "Unknown";
      const key = `${cls}${s.section ? "-" + s.section : ""}`;
      studentMeta[s._id.toString()] = { key, name: s.name, class: cls, section: s.section || "" };
    });

    // Build class buckets with student name lists
    const classMap = {};
    students.forEach(s => {
      const cls = s.class || "Unknown";
      const key = `${cls}${s.section ? "-" + s.section : ""}`;
      if (!classMap[key]) classMap[key] = {
        className: key, rawClass: cls, section: s.section || "",
        studentNames: [],
        presentDays: 0, totalAttendanceDays: 0,
        pendingFees: 0, pendingFeeNames: new Set(),
        markSum: 0, markCount: 0,
      };
      classMap[key].studentNames.push(s.name);
    });

    // Attendance per class (this month)
    const studentAttendMap = {};
    monthAttendance.forEach(a => {
      const sid = a.studentId?.toString();
      const meta = studentMeta[sid];
      if (!meta || !classMap[meta.key]) return;
      classMap[meta.key].totalAttendanceDays++;
      if (a.status === "present") classMap[meta.key].presentDays++;
      if (!studentAttendMap[sid]) studentAttendMap[sid] = { present: 0, total: 0, name: meta.name, class: meta.class };
      studentAttendMap[sid].total++;
      if (a.status === "present") studentAttendMap[sid].present++;
    });

    // Fee processing — per student and per class
    const pendingByStudent = {};
    fees.forEach(f => {
      if (!f.student) return;
      const cls = f.student.class || "Unknown";
      const sec = f.student.section || "";
      const key = `${cls}${sec ? "-" + sec : ""}`;

      if (f.status !== "paid") {
        const amt = Math.max(0, (f.amount || 0) - (f.paidAmount || 0));
        if (classMap[key]) {
          classMap[key].pendingFees += amt;
          classMap[key].pendingFeeNames.add(f.student.name);
        }
        const sid = f.student._id?.toString();
        if (sid) {
          if (!pendingByStudent[sid]) {
            pendingByStudent[sid] = { name: f.student.name, class: cls, section: sec, amount: 0, items: [] };
          }
          pendingByStudent[sid].amount += amt;
          if (f.title) pendingByStudent[sid].items.push(`${f.title}: ₹${amt}`);
        }
      }
    });

    // Results per class
    const resultsByStudent = {};
    results.forEach(r => {
      if (!r.student) return;
      const cls = r.student.class || "Unknown";
      const sec = r.student.section || "";
      const key = `${cls}${sec ? "-" + sec : ""}`;
      if (classMap[key]) {
        classMap[key].markSum += r.percentage;
        classMap[key].markCount++;
      }
      const sid = r.student._id?.toString();
      if (sid) {
        if (!resultsByStudent[sid]) resultsByStudent[sid] = { name: r.student.name, class: cls, results: [] };
        resultsByStudent[sid].results.push({ subject: r.subject || "General", pct: r.percentage });
      }
    });

    // Finalise class summary
    const classSummary = Object.values(classMap).map(c => ({
      class: c.className,
      students: c.studentNames.length,
      studentNames: c.studentNames,
      attendancePct: c.totalAttendanceDays > 0
        ? Math.round((c.presentDays / c.totalAttendanceDays) * 100) : null,
      pendingFees: Math.round(c.pendingFees),
      pendingFeeCount: c.pendingFeeNames.size,
      pendingFeeStudentNames: [...c.pendingFeeNames],
      avgMarks: c.markCount > 0 ? Math.round(c.markSum / c.markCount) : null,
    }));

    // Top pending fee students (sorted by amount)
    const pendingStudents = Object.values(pendingByStudent)
      .sort((a, b) => b.amount - a.amount)
      .map(p => ({ ...p, amount: Math.round(p.amount) }));

    // Students with low attendance (< 75%)
    const lowAttendance = Object.values(studentAttendMap)
      .filter(s => s.total > 0 && Math.round((s.present / s.total) * 100) < 75)
      .map(s => ({ name: s.name, class: s.class, pct: Math.round((s.present / s.total) * 100) }))
      .sort((a, b) => a.pct - b.pct);

    const totalPending   = pendingStudents.reduce((s, p) => s + p.amount, 0);
    const totalCollected = fees.filter(f => f.status === "paid")
      .reduce((s, f) => s + (f.paidAmount || 0), 0);

    res.json({
      success: true,
      data: {
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalClasses: Object.keys(classMap).length,
        totalPending: Math.round(totalPending),
        totalCollected: Math.round(totalCollected),
        currentMonth: now.toLocaleString("en", { month: "long", year: "numeric" }),
        allStudents: students.map(s => ({
          name: s.name,
          class: s.class || "Unknown",
          section: s.section || "",
          studentId: s.studentId || "",
          rollNumber: s.rollNumber || "",
        })),
        allTeachers: teachers.map(t => ({
          name: t.name,
          designation: t.designation || "Teacher",
          subjects: t.subjects || [],
        })),
        classSummary,
        pendingFeeStudents: pendingStudents,
        lowAttendanceStudents: lowAttendance,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
