const { Exam, Result } = require("../models/Exam");
const Student          = require("../models/Student");
const Test             = require("../models/Test");
const ScheduledExam    = require("../models/ScheduledExam");
const ExamSubject      = require("../models/ExamSubject");
const Class            = require("../models/Class");

exports.createExam = async (req, res) => {
  try {
    const { title, class: cls, section, subject, date, startTime, endTime, totalMarks, passingMarks, examType, instructions } = req.body;
    const exam = await Exam.create({
      school: req.schoolId, title, class: cls, section, subject, date, startTime, endTime,
      totalMarks, passingMarks, examType: examType || "unit-test", instructions,
      createdBy: req.user._id, status: "upcoming",
    });
    res.status(201).json({ success: true, message: "Exam created.", data: exam });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getExams = async (req, res) => {
  try {
    const { class: cls, subject, status } = req.query;
    const query = { school: req.schoolId };
    if (cls) query.class = cls;
    if (subject) query.subject = subject;
    if (status) query.status = status;
    const exams = await Exam.find(query).populate("createdBy", "name teacherId").sort({ date: 1 });
    res.json({ success: true, data: exams });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUpcomingExams = async (req, res) => {
  try {
    const now = new Date();

    // Resolve classId when student is requesting (Test/ScheduledExam use ObjectId classId)
    let classId = null;
    if (req.userRole === "student" && req.user.class) {
      const clsQuery = { school: req.schoolId, name: req.user.class };
      if (req.user.section) clsQuery.section = req.user.section.toUpperCase();
      const cls = await Class.findOne(clsQuery).select("_id");
      classId = cls?._id || null;
    }

    const schoolFilter = { school: req.schoolId };

    // ── Tests (single-subject, single date) ──────────────────────────────────
    const testQuery = { ...schoolFilter, date: { $gte: now }, status: "upcoming" };
    if (classId) testQuery.classId = classId;
    const tests = await Test.find(testQuery)
      .populate("classId",   "name section")
      .populate("subjectId", "name")
      .sort({ date: 1 })
      .limit(10);

    // ── Scheduled Exams (multi-subject, date range) ───────────────────────────
    const examQuery = { ...schoolFilter, endDate: { $gte: now }, status: { $ne: "completed" } };
    if (classId) examQuery.classId = classId;
    const scheduledExams = await ScheduledExam.find(examQuery)
      .populate("classId", "name section")
      .sort({ startDate: 1 })
      .limit(10);

    // ── Fetch per-subject details for each scheduled exam ────────────────────
    const examIds = scheduledExams.map((e) => e._id);
    const examSubjectDocs = examIds.length > 0
      ? await ExamSubject.find({ examId: { $in: examIds } })
          .populate("subjectId", "name code")
          .sort({ date: 1 })
      : [];

    // Group by examId
    const subjectsByExam = {};
    for (const es of examSubjectDocs) {
      const key = es.examId.toString();
      if (!subjectsByExam[key]) subjectsByExam[key] = [];
      subjectsByExam[key].push(es);
    }

    // ── Normalise to a common shape ───────────────────────────────────────────
    const testItems = tests.map((t) => ({
      _id:         t._id,
      title:       t.title,
      subject:     t.subjectId?.name || "",
      subjectCode: t.subjectId?.code || "",
      date:        t.date,
      examType:    "test",
      class:       t.classId?.name || "",
      section:     t.classId?.section || "",
      status:      t.status,
      totalMarks:  t.totalMarks,
      passingMarks: Math.ceil(t.totalMarks * 0.33),
      duration:    t.duration,
      description: t.description || "",
      source:      "test",
      subjects:    [],
    }));

    const examItems = scheduledExams.map((e) => ({
      _id:         e._id,
      title:       e.title,
      subject:     "",
      subjectCode: "",
      date:        e.startDate,
      endDate:     e.endDate,
      examType:    e.examType,
      class:       e.classId?.name || "",
      section:     e.classId?.section || "",
      status:      e.status,
      description: e.description || "",
      source:      "scheduledExam",
      subjects:    (subjectsByExam[e._id.toString()] || []).map((es) => ({
        _id:         es._id,
        subject:     es.subjectId?.name || "",
        subjectCode: es.subjectId?.code || "",
        date:        es.date,
        totalMarks:  es.totalMarks,
        passingMarks: Math.ceil(es.totalMarks * 0.33),
        duration:    es.duration,
      })),
    }));

    const normalised = [...testItems, ...examItems]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 30);

    res.json({ success: true, data: normalised });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.enterMarks = async (req, res) => {
  try {
    const { examId, results } = req.body;
    const exam = await Exam.findOne({ _id: examId, school: req.schoolId });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });

    const saved = [];
    for (const r of results) {
      const existing = await Result.findOne({ exam: examId, student: r.student });
      if (existing) {
        existing.marksObtained = r.marksObtained;
        existing.remarks = r.remarks || "";
        existing.totalMarks = exam.totalMarks;
        existing.enteredBy = req.user._id;
        await existing.save();
        saved.push(existing);
      } else {
        const result = await Result.create({
          school: req.schoolId, exam: examId, student: r.student,
          marksObtained: r.marksObtained, totalMarks: exam.totalMarks,
          remarks: r.remarks || "", enteredBy: req.user._id,
        });
        saved.push(result);
        // Points for good marks
        if (result.percentage >= 90) await Student.findByIdAndUpdate(r.student, { $inc: { points: 20 }, $addToSet: { badges: "Top Scorer" } });
        else if (result.percentage >= 75) await Student.findByIdAndUpdate(r.student, { $inc: { points: 10 } });
      }
    }
    exam.status = "completed"; await exam.save();
    res.json({ success: true, message: "Marks entered.", count: saved.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStudentResults = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    const query = { student: studentId };
    if (req.userRole === "student") query.isPublished = true;

    const results = await Result.find(query)
      .populate("exam", "title subject date examType totalMarks")
      .populate({ path: "testId", select: "title date totalMarks", populate: { path: "subjectId", select: "name code" } })
      .populate("scheduledExamId", "title examType startDate")
      .populate({ path: "examSubjectId", populate: { path: "subjectId", select: "name code" } })
      .sort({ createdAt: -1 });

    const avg = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
    res.json({ success: true, data: { results, averagePercentage: avg } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getClassResults = async (req, res) => {
  try {
    const { examId } = req.params;
    const results = await Result.find({ exam: examId })
      .populate("student", "name studentId rollNumber class section")
      .sort({ marksObtained: -1 });
    const passed = results.filter(r => r.isPassed).length;
    const avgPercentage = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
    res.json({ success: true, data: { results, summary: { total: results.length, passed, failed: results.length - passed, avgPercentage } } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getClassStudentsForEntry = async (req, res) => {
  try {
    const { classId } = req.params;
    const { sourceType, sourceId, examSubjectId } = req.query;

    const cls = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!cls) return res.status(404).json({ success: false, message: "Class not found." });

    const studentQuery = { school: req.schoolId, class: cls.name };
    if (cls.section) studentQuery.section = cls.section;
    const students = await Student.find(studentQuery)
      .select("name studentId rollNumber")
      .sort({ rollNumber: 1, name: 1 });

    let existingResults = [];
    let totalMarks = 0;
    let sourceTitle = "";

    if (sourceType === "test" && sourceId) {
      const test = await Test.findOne({ _id: sourceId, school: req.schoolId })
        .populate("subjectId", "name");
      if (!test) return res.status(404).json({ success: false, message: "Test not found." });
      totalMarks = test.totalMarks;
      sourceTitle = `${test.title} (${test.subjectId?.name || ""})`;
      existingResults = await Result.find({ school: req.schoolId, sourceType: "test", testId: sourceId });
    } else if (sourceType === "scheduledExam" && sourceId && examSubjectId) {
      const es = await ExamSubject.findById(examSubjectId)
        .populate("subjectId", "name")
        .populate("examId", "title");
      if (!es) return res.status(404).json({ success: false, message: "Exam subject not found." });
      totalMarks = es.totalMarks;
      sourceTitle = `${es.examId?.title || ""} — ${es.subjectId?.name || ""}`;
      existingResults = await Result.find({
        school: req.schoolId, sourceType: "scheduledExam",
        scheduledExamId: sourceId, examSubjectId,
      });
    }

    const resultMap = {};
    existingResults.forEach(r => { resultMap[r.student.toString()] = r; });

    const data = students.map(s => ({
      student: { _id: s._id, name: s.name, studentId: s.studentId, rollNumber: s.rollNumber },
      result: resultMap[s._id.toString()] || null,
    }));

    res.json({ success: true, data, totalMarks, sourceTitle });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.saveBulkResults = async (req, res) => {
  try {
    const { sourceType, sourceId, examSubjectId, totalMarks, results } = req.body;
    if (!results?.length) return res.status(400).json({ success: false, message: "No results provided." });

    const saved = [];
    for (const r of results) {
      if (r.marksObtained === "" || r.marksObtained === null || r.marksObtained === undefined) continue;
      const query = { school: req.schoolId, student: r.studentId, sourceType };
      if (sourceType === "test") query.testId = sourceId;
      else if (sourceType === "scheduledExam") { query.scheduledExamId = sourceId; query.examSubjectId = examSubjectId; }

      const existing = await Result.findOne(query);
      if (existing) {
        existing.marksObtained = Number(r.marksObtained);
        existing.totalMarks = totalMarks;
        existing.remarks = r.remarks || "";
        existing.enteredBy = req.user._id;
        await existing.save();
        saved.push(existing);
      } else {
        const newResult = await Result.create({
          school: req.schoolId, student: r.studentId, sourceType,
          ...(sourceType === "test" ? { testId: sourceId } : {}),
          ...(sourceType === "scheduledExam" ? { scheduledExamId: sourceId, examSubjectId } : {}),
          marksObtained: Number(r.marksObtained), totalMarks,
          remarks: r.remarks || "", enteredBy: req.user._id,
        });
        saved.push(newResult);
        if (newResult.percentage >= 90)
          await Student.findByIdAndUpdate(r.studentId, { $inc: { points: 20 }, $addToSet: { badges: "Top Scorer" } });
        else if (newResult.percentage >= 75)
          await Student.findByIdAndUpdate(r.studentId, { $inc: { points: 10 } });
      }
    }
    res.json({ success: true, message: "Results saved.", count: saved.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.publishResults = async (req, res) => {
  try {
    const { resultIds, publish } = req.body;
    if (!resultIds?.length) return res.status(400).json({ success: false, message: "No result IDs provided." });

    const update = publish
      ? { $set: { isPublished: true, publishedAt: new Date() } }
      : { $set: { isPublished: false }, $unset: { publishedAt: "" } };

    await Result.updateMany({ _id: { $in: resultIds }, school: req.schoolId }, update);
    res.json({ success: true, message: publish ? "Results published." : "Results unpublished." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getReportCard = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    const student = await Student.findById(studentId).populate("school", "schoolName schoolCode").populate("classTeacher", "name");
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    const results = await Result.find({ student: studentId })
      .populate("exam", "title subject examType totalMarks date")
      .sort({ "exam.subject": 1 });
    const subjectMap = {};
    results.forEach(r => {
      const subj = r.exam.subject;
      if (!subjectMap[subj]) subjectMap[subj] = [];
      subjectMap[subj].push({ examType: r.exam.examType, marks: r.marksObtained, total: r.totalMarks, grade: r.grade, percentage: r.percentage });
    });
    res.json({ success: true, data: { student, subjects: subjectMap, results } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
