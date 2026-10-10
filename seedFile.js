/**
 * seedfile.js
 * ---------------------------------------------------------------------------
 * Fills ONE school (matched by admin e-mail) with a complete, realistic data
 * set covering every module of the app: classes, subjects, teachers, students,
 * parents, attendance, fees, exams/results, tests, homework, timetable,
 * library, transport, notices, events, study material, gamification and chat.
 *
 * It only ever touches documents whose `school` field equals that school's id,
 * so other schools in the shared database are left untouched.
 *
 * Usage:  npm run seed     (or: node seedfile.js)
 *
 * If the school admin does not exist yet (fresh database) it is created with
 * ADMIN_PASSWORD below; an existing admin's password is never changed.
 * ---------------------------------------------------------------------------
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// ── Models ───────────────────────────────────────────────────────────────────
const Admin            = require("./src/models/Admin");
const Teacher          = require("./src/models/Teacher");
const Student          = require("./src/models/Student");
const Parent           = require("./src/models/Parent");
const Class            = require("./src/models/Class");
const Subject          = require("./src/models/Subject");
const Attendance       = require("./src/models/Attendance");
const AttendanceRecord = require("./src/models/AttendanceRecord");
const Notice           = require("./src/models/Notice");
const Homework         = require("./src/models/Homework");
const Event            = require("./src/models/Event");
const BusRoute         = require("./src/models/Transport");
const Timetable        = require("./src/models/Timetable");
const TimetableEntry   = require("./src/models/TimetableEntry");
const SchoolPeriod     = require("./src/models/SchoolPeriod");
const StudyMaterial    = require("./src/models/StudyMaterial");
const Permission       = require("./src/models/Permission");
const Test             = require("./src/models/Test");
const ScheduledExam    = require("./src/models/ScheduledExam");
const ExamSubject      = require("./src/models/ExamSubject");
const Conversation     = require("./src/models/Conversation");
const Message          = require("./src/models/Message");
const { Exam, Result }                        = require("./src/models/Exam");
const { FeeStructure, FeePayment, Concession } = require("./src/models/Fee");
const { Book, BookIssue }                      = require("./src/models/Library");
const { Badge, UserBadge, Challenge }          = require("./src/models/Badge");

// ── Config ───────────────────────────────────────────────────────────────────
const SCHOOL_EMAIL   = "samarali5177@gmail.com";
const ACADEMIC_YEAR  = "2026-27";
const SCHOOL_NAME    = "Alflah";
const ADMIN_PASSWORD = "Admin@123";   // used only when the admin is created
const PW_TEACHER     = "Teacher@123";
const PW_STUDENT     = "Student@123";
const PW_PARENT      = "Parent@123";
const STUDENTS_PER_CLASS = 8;
const ATTENDANCE_DAYS    = 24;   // school days back from today

// ── Deterministic RNG so re-runs produce the same school ─────────────────────
let _seed = 20260817;
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int  = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

// ── Date helpers ─────────────────────────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const day   = (offset, h = 0, m = 0) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
};
/** last N school days (Mon–Sat), most recent first */
function lastSchoolDays(n) {
  const out = [];
  let off = 0;
  while (out.length < n) {
    const d = day(-off);
    if (d.getDay() !== 0) out.push(d);   // 0 = Sunday
    off++;
  }
  return out.reverse();
}

// ── Chunked insert (keeps individual ops well under Mongo limits) ────────────
async function insertMany(Model, docs, label) {
  if (!docs.length) { console.log(`  ${label.padEnd(22)} 0`); return []; }
  const out = [];
  for (let i = 0; i < docs.length; i += 500) {
    out.push(...(await Model.insertMany(docs.slice(i, i + 500), { ordered: true })));
  }
  console.log(`  ${label.padEnd(22)} ${out.length}`);
  return out;
}

// ── Reference data ───────────────────────────────────────────────────────────
const MALE_FIRST = ["Aarav","Mohd Ayaan","Rehan","Kabir","Zaid","Arjun","Faizan","Rohit","Saif","Ibrahim",
  "Yash","Danish","Anas","Harsh","Owais","Ansh","Talha","Nikhil","Sameer","Adnan",
  "Rudra","Junaid","Aditya","Huzaifa","Kartik","Aman","Shoaib","Devansh","Areeb","Krish"];
const FEMALE_FIRST = ["Ayesha","Ananya","Zoya","Ishita","Hiba","Diya","Mahira","Sanya","Alfiya","Riya",
  "Nashra","Khushi","Sadia","Anushka","Iqra","Tanvi","Marium","Prachi","Areeba","Simran",
  "Rida","Kavya","Nazia","Aditi","Fatima","Sneha","Amara","Palak","Sumaiya","Vanshika"];
const SURNAMES = ["Khan","Sharma","Ansari","Verma","Siddiqui","Gupta","Qureshi","Singh","Ahmad","Tyagi",
  "Saifi","Chauhan","Malik","Rastogi","Idrisi","Jain","Farooqui","Yadav","Abbasi","Kashyap"];
const BLOOD  = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];
const AREAS  = ["Shastri Nagar","Jagriti Vihar","Lisari Gate","Abu Lane","Saket","Ganga Nagar",
  "Pallavpuram","Modipuram","Zakir Colony","Brahmpuri","Kanker Khera","Rohta Road"];

const SUBJECT_DEFS = [
  { name: "English",            code: "ENG",  description: "Language, grammar, literature and comprehension." },
  { name: "Hindi",              code: "HIN",  description: "Hindi vyakaran, gadya and padya." },
  { name: "Urdu",               code: "URD",  description: "Urdu language and literature." },
  { name: "Mathematics",        code: "MATH", description: "Arithmetic, algebra, geometry and statistics." },
  { name: "Science",            code: "SCI",  description: "General science for middle school." },
  { name: "Environmental Studies", code: "EVS", description: "Environment and surroundings for primary classes." },
  { name: "Social Science",     code: "SST",  description: "History, civics, geography and economics." },
  { name: "Computer Science",   code: "CS",   description: "Computer fundamentals, IT tools and programming." },
  { name: "Physics",            code: "PHY",  description: "Mechanics, optics and electricity." },
  { name: "Chemistry",          code: "CHEM", description: "Matter, reactions and periodic classification." },
  { name: "Biology",            code: "BIO",  description: "Life processes, plants and human biology." },
  { name: "Islamic Studies",    code: "ISL",  description: "Deeniyat and moral education." },
  { name: "Physical Education", code: "PE",   description: "Sports, fitness and health." },
  { name: "Art & Craft",        code: "ART",  description: "Drawing, painting and craft work." },
  { name: "General Knowledge",  code: "GK",   description: "Current affairs and general awareness." },
];

/** Subjects taught in a class (by class number) */
function curriculumFor(classNo) {
  if (classNo <= 5)  return ["English","Hindi","Mathematics","Environmental Studies","Computer Science","Art & Craft","General Knowledge","Islamic Studies"];
  if (classNo <= 8)  return ["English","Hindi","Urdu","Mathematics","Science","Social Science","Computer Science","Physical Education"];
  return ["English","Hindi","Mathematics","Science","Social Science","Computer Science","Physics"];
}
/** Core subjects that get exams / results */
function coreFor(classNo) {
  if (classNo <= 5) return ["English","Hindi","Mathematics","Environmental Studies"];
  if (classNo <= 8) return ["English","Hindi","Mathematics","Science","Social Science"];
  return ["English","Mathematics","Science","Social Science","Computer Science"];
}

const TEACHER_DEFS = [
  { name: "Mohd Arif Khan",   subject: "Mathematics",         qualification: "M.Sc, B.Ed",   exp: "12 years", designation: "Senior Teacher" },
  { name: "Sana Parveen",     subject: "English",             qualification: "M.A English, B.Ed", exp: "9 years",  designation: "Senior Teacher" },
  { name: "Rakesh Sharma",    subject: "Science",             qualification: "M.Sc, B.Ed",   exp: "11 years", designation: "Head of Department" },
  { name: "Farhat Jahan",     subject: "Hindi",               qualification: "M.A Hindi, B.Ed", exp: "7 years", designation: "Teacher" },
  { name: "Imran Siddiqui",   subject: "Social Science",      qualification: "M.A History, B.Ed", exp: "10 years", designation: "Senior Teacher" },
  { name: "Priya Verma",      subject: "Computer Science",    qualification: "MCA",          exp: "6 years",  designation: "Teacher" },
  { name: "Abdul Rahman",     subject: "Urdu",                qualification: "M.A Urdu",     exp: "15 years", designation: "Senior Teacher" },
  { name: "Neha Gupta",       subject: "English",             qualification: "M.A, B.Ed",    exp: "5 years",  designation: "Teacher" },
  { name: "Shahid Ali",       subject: "Mathematics",         qualification: "M.Sc Maths",   exp: "8 years",  designation: "Teacher" },
  { name: "Anjali Singh",     subject: "Science",             qualification: "M.Sc Zoology, B.Ed", exp: "6 years", designation: "Teacher" },
  { name: "Kalim Ahmad",      subject: "Physics",             qualification: "M.Sc Physics", exp: "13 years", designation: "Head of Department" },
  { name: "Ruchi Tyagi",      subject: "Chemistry",           qualification: "M.Sc Chemistry, B.Ed", exp: "9 years", designation: "Senior Teacher" },
  { name: "Zeba Khatoon",     subject: "Biology",             qualification: "M.Sc Botany",  exp: "4 years",  designation: "Teacher" },
  { name: "Vikas Chauhan",    subject: "Physical Education",  qualification: "B.P.Ed",       exp: "7 years",  designation: "Sports Teacher" },
  { name: "Nazia Sultana",    subject: "Islamic Studies",     qualification: "Alimah, B.Ed", exp: "10 years", designation: "Teacher" },
  { name: "Deepak Kumar",     subject: "Mathematics",         qualification: "B.Sc, B.Ed",   exp: "3 years",  designation: "Teacher" },
  { name: "Aisha Siddiqui",   subject: "English",             qualification: "M.A English",  exp: "4 years",  designation: "Teacher" },
  { name: "Manoj Saini",      subject: "Social Science",      qualification: "M.A Geography, B.Ed", exp: "8 years", designation: "Teacher" },
  { name: "Tabassum Bano",    subject: "Hindi",               qualification: "M.A Hindi",    exp: "6 years",  designation: "Teacher" },
  { name: "Sunil Rathore",    subject: "Computer Science",    qualification: "B.Tech CSE",   exp: "5 years",  designation: "Teacher" },
  { name: "Rehana Begum",     subject: "Art & Craft",         qualification: "B.F.A",        exp: "11 years", designation: "Teacher" },
  { name: "Javed Akhtar",     subject: "Environmental Studies", qualification: "M.Sc, B.Ed", exp: "14 years", designation: "Librarian & Teacher" },
];

const PERM_KEYS = ["canCreateStudent","canEditStudent","canDeleteStudent","canViewAllStudents",
  "canMarkAttendance","canViewAttendance","canManageFees","canViewFees","canCreateExam",
  "canEnterMarks","canViewExams","canPostNotice","canViewNotices","canAssignHomework",
  "canViewHomework","canPostNoticeBoard","canManageLibrary","canDailyChallenge","canAwardBadges"];

const PERM_CLASS_TEACHER = ["canViewAllStudents","canMarkAttendance","canViewAttendance","canViewFees",
  "canCreateExam","canEnterMarks","canViewExams","canViewNotices","canAssignHomework","canViewHomework",
  "canDailyChallenge","canAwardBadges"];
const PERM_HOD = [...PERM_CLASS_TEACHER,"canCreateStudent","canEditStudent","canPostNotice","canPostNoticeBoard","canManageLibrary"];
const PERM_BASIC = ["canViewAttendance","canViewExams","canViewNotices","canViewHomework","canAssignHomework","canEnterMarks"];

function gradeOf(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 33) return "D";
  return "F";
}
function buildResult(base, marksObtained, totalMarks) {
  const percentage = Math.round((marksObtained / totalMarks) * 100);
  return {
    ...base,
    marksObtained, totalMarks, percentage,
    grade: gradeOf(percentage),
    isPassed: marksObtained >= totalMarks * 0.33,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
(async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected:", mongoose.connection.host, "/", mongoose.connection.db.databaseName, "\n");

  let admin = await Admin.findOne({ email: SCHOOL_EMAIL });
  let adminCreated = false;
  if (!admin) {
    admin = await Admin.create({
      schoolName: SCHOOL_NAME, name: "Samar Ali", email: SCHOOL_EMAIL,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10), isVerified: true,
    });
    adminCreated = true;
    console.log(`Created school admin ${SCHOOL_EMAIL}`);
  }
  const school = admin._id;
  console.log(`School: ${admin.schoolName} (${admin.schoolCode})  id=${school}\n`);

  // ── 0. Purge this school's existing data ──────────────────────────────────
  console.log("Clearing previous data for this school…");
  const byId = { school };
  const purge = [
    [Teacher, byId], [Student, byId], [Parent, byId], [Class, byId], [Subject, byId],
    [Attendance, byId], [AttendanceRecord, byId], [Exam, byId], [Result, byId],
    [FeeStructure, byId], [FeePayment, byId], [Concession, byId],
    [Notice, byId], [Homework, byId], [Event, byId], [BusRoute, byId],
    [Timetable, byId], [TimetableEntry, byId], [SchoolPeriod, byId],
    [StudyMaterial, byId], [Permission, byId], [Test, byId],
    [ScheduledExam, byId], [ExamSubject, byId],
    [Book, byId], [BookIssue, byId], [Badge, byId], [UserBadge, byId], [Challenge, byId],
    [Conversation, byId], [Message, byId],
  ];
  let removed = 0;
  for (const [Model, q] of purge) removed += (await Model.deleteMany(q)).deletedCount;
  console.log(`  removed ${removed} old documents\n`);

  // ── Passwords (hash once per distinct password, then reuse) ───────────────
  const hTeacher = await bcrypt.hash(PW_TEACHER, 10);
  const hStudent = await bcrypt.hash(PW_STUDENT, 10);
  const hParent  = await bcrypt.hash(PW_PARENT, 10);

  // ── Human-readable id sequences (globally unique across all schools) ──────
  async function maxSeq(Model, field) {
    const docs = await Model.find({ [field]: { $ne: null } }).select(field).lean();
    return docs.reduce((mx, d) => {
      const m = /(\d+)\s*$/.exec(d[field] || "");
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, 0);
  }
  let tSeq = await maxSeq(Teacher, "teacherId");
  let sSeq = await maxSeq(Student, "studentId");
  const yr = TODAY.getFullYear();

  console.log("Seeding…");

  // ── 1. School profile touch-ups ───────────────────────────────────────────
  admin.schoolEmail   = admin.schoolEmail   || "info@alflah.edu.in";
  admin.website       = admin.website       || "https://www.alflah.edu.in";
  admin.schoolAddress = admin.schoolAddress || "Meerut, Uttar Pradesh";
  await admin.save();

  // ── 2. Subjects ───────────────────────────────────────────────────────────
  const subjects = await insertMany(
    Subject, SUBJECT_DEFS.map((s) => ({ ...s, school })), "subjects");
  const subjByName = new Map(subjects.map((s) => [s.name, s]));

  // ── 3. School periods ─────────────────────────────────────────────────────
  const PERIOD_DEFS = [
    { label: "Period 1", startTime: "08:00", endTime: "08:45", periodNumber: 1 },
    { label: "Period 2", startTime: "08:45", endTime: "09:30", periodNumber: 2 },
    { label: "Period 3", startTime: "09:30", endTime: "10:15", periodNumber: 3 },
    { label: "Short Break", startTime: "10:15", endTime: "10:30", isBreak: true },
    { label: "Period 4", startTime: "10:30", endTime: "11:15", periodNumber: 4 },
    { label: "Period 5", startTime: "11:15", endTime: "12:00", periodNumber: 5 },
    { label: "Lunch Break", startTime: "12:00", endTime: "12:40", isBreak: true },
    { label: "Period 6", startTime: "12:40", endTime: "13:25", periodNumber: 6 },
    { label: "Period 7", startTime: "13:25", endTime: "14:10", periodNumber: 7 },
    { label: "Period 8", startTime: "14:10", endTime: "14:55", periodNumber: 8 },
  ];
  await insertMany(SchoolPeriod, PERIOD_DEFS.map((p, i) => ({
    school, label: p.label, startTime: p.startTime, endTime: p.endTime,
    isBreak: !!p.isBreak, periodNumber: p.periodNumber ?? null, order: i + 1,
  })), "school periods");
  const TEACH_PERIODS = PERIOD_DEFS.filter((p) => !p.isBreak);

  // ── 4. Teachers ───────────────────────────────────────────────────────────
  const teacherDocs = TEACHER_DEFS.map((t, i) => {
    const slug = t.name.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".");
    const perms = t.designation === "Head of Department" ? PERM_HOD
                : i < 20 ? PERM_CLASS_TEACHER : PERM_BASIC;
    const permMap = {};
    PERM_KEYS.forEach((k) => { permMap[k] = perms.includes(k); });
    return {
      name: t.name,
      email: `${slug}@alflah.edu.in`,
      password: hTeacher,
      phone: "+9190" + String(int(10000000, 99999999)),
      teacherId: `TCH-${yr}-${String(++tSeq).padStart(4, "0")}`,
      school,
      subjects: [t.subject],
      classes: [],
      qualification: t.qualification,
      experience: t.exp,
      designation: t.designation,
      permissions: permMap,
      isActive: true, isVerified: true,
      badges: [], points: int(40, 320),
      _permList: perms,   // stripped before insert
    };
  });
  const teachers = await insertMany(
    Teacher, teacherDocs.map(({ _permList, ...d }) => d), "teachers");
  teachers.forEach((t, i) => { t._permList = teacherDocs[i]._permList; });

  await insertMany(Permission, teachers.map((t) => ({
    teacher: t._id, school, permissions: t._permList, assignedBy: school, updatedAt: new Date(),
  })), "permission docs");

  // ── 5. Classes (1–10, sections A & B) ─────────────────────────────────────
  const classPlan = [];
  for (let n = 1; n <= 10; n++) for (const sec of ["A", "B"]) classPlan.push({ n, sec });

  const classDocs = classPlan.map((c, i) => {
    const names = curriculumFor(c.n);
    return {
      name: String(c.n),
      section: c.sec,
      school,
      classTeacher: teachers[i % teachers.length]._id,
      room: `R-${c.n < 6 ? 1 : 2}${String(i + 1).padStart(2, "0")}`,
      subjects: names,
      assignedSubjects: names.map((nm) => subjByName.get(nm)._id).filter(Boolean),
    };
  });
  const classes = await insertMany(Class, classDocs, "classes");
  classes.forEach((c, i) => { c._no = classPlan[i].n; c._label = `${c.name}-${c.section}`; });

  // Back-link classes onto teachers
  for (let i = 0; i < classes.length; i++) {
    const t = teachers[i % teachers.length];
    await Teacher.updateOne({ _id: t._id },
      { $addToSet: { assignedClasses: classes[i]._id, classes: classes[i]._label } });
  }
  // Give every teacher at least one class to work with
  for (let i = classes.length; i < teachers.length; i++) {
    const c = classes[i % classes.length];
    await Teacher.updateOne({ _id: teachers[i]._id },
      { $addToSet: { assignedClasses: c._id, classes: c._label } });
  }
  // A subject teacher pool per subject name, for timetable / homework variety
  const teachersBySubject = new Map();
  teachers.forEach((t) => {
    const s = t.subjects[0];
    if (!teachersBySubject.has(s)) teachersBySubject.set(s, []);
    teachersBySubject.get(s).push(t);
  });
  const teacherForSubject = (name) => {
    const pool = teachersBySubject.get(name);
    return pool && pool.length ? pool[int(0, pool.length - 1)] : teachers[int(0, teachers.length - 1)];
  };

  // ── 6. Students + Parents ─────────────────────────────────────────────────
  const studentDocs = [];
  const parentDocs  = [];
  const roster      = [];    // { classIdx, studentIdx } pairing helper
  let pSeq = 0;

  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    for (let r = 1; r <= STUDENTS_PER_CLASS; r++) {
      const gender  = chance(0.52) ? "male" : "female";
      const first   = gender === "male" ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
      const surname = pick(SURNAMES);
      const name    = `${first} ${surname}`;
      const sid     = `STU-${yr}-${String(++sSeq).padStart(4, "0")}`;
      const uid     = sid.toLowerCase().replace(/-/g, "");
      // age ≈ 5 + class number
      const dob = new Date(yr - (5 + cls._no), int(0, 11), int(1, 28));

      const studentIdx = studentDocs.length;
      studentDocs.push({
        name,
        email: `${uid}@student.alflah.edu.in`,
        password: hStudent,
        phone: "+9199" + String(int(10000000, 99999999)),
        studentId: sid,
        school,
        class: cls.name,
        section: cls.section,
        rollNumber: String(r),
        dateOfBirth: dob,
        gender,
        address: `${int(1, 240)}, ${pick(AREAS)}, Meerut, U.P. - 2500${int(1, 6)}`,
        bloodGroup: pick(BLOOD),
        photo: "",
        classTeacher: cls.classTeacher,
        isActive: true, isVerified: true, canUseAI: chance(0.9),
        points: int(0, 480),
        streakDays: int(0, 22),
        lastAttendance: day(-int(0, 2)),
        badges: [],
        moodHistory: Array.from({ length: int(2, 5) }, (_, k) => ({
          mood: pick(["happy", "calm", "tired", "excited", "stressed", "neutral"]),
          date: day(-(k * 3 + 1)),
        })),
      });

      const prel   = chance(0.72) ? "father" : "mother";
      const pfirst = prel === "father" ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
      parentDocs.push({
        name: `${pfirst} ${surname}`,
        email: `parent${String(++pSeq).padStart(3, "0")}.${uid}@alflah.edu.in`,
        password: hParent,
        phone: "+9198" + String(int(10000000, 99999999)),
        alternatePhone: chance(0.4) ? "+9197" + String(int(10000000, 99999999)) : "",
        address: studentDocs[studentIdx].address,
        occupation: pick(["Businessman","Shopkeeper","Govt. Employee","Teacher","Doctor","Engineer",
                          "Farmer","Driver","Homemaker","Tailor","Accountant","Sports Goods Trader"]),
        relation: prel,
        school,
        students: [],
      });
      roster.push({ ci, studentIdx });
    }
  }

  const students = await insertMany(Student, studentDocs, "students");
  const parents  = await insertMany(Parent,  parentDocs,  "parents");

  // Link student ↔️ parent
  const linkOps = students.map((s, i) => ({
    updateOne: { filter: { _id: s._id }, update: { $set: { parent: parents[i]._id } } },
  }));
  for (let i = 0; i < linkOps.length; i += 500) await Student.bulkWrite(linkOps.slice(i, i + 500));
  const plinkOps = parents.map((p, i) => ({
    updateOne: { filter: { _id: p._id }, update: { $set: { students: [students[i]._id] } } },
  }));
  for (let i = 0; i < plinkOps.length; i += 500) await Parent.bulkWrite(plinkOps.slice(i, i + 500));
  students.forEach((s, i) => { s.parent = parents[i]._id; });

  // students grouped by class index
  const byClass = classes.map(() => []);
  roster.forEach(({ ci, studentIdx }) => byClass[ci].push(students[studentIdx]));

  // ── 7. Attendance ─────────────────────────────────────────────────────────
  const dates = lastSchoolDays(ATTENDANCE_DAYS);
  const recordDocs = [];
  const attendanceDocs = [];

  // Attendance (class-level) is uniquely indexed on {school, class, date} — no
  // section — so both sections of a class share one document per date.
  for (const d of dates) {
    const perClassName = new Map();     // "6" -> records[]
    for (let ci = 0; ci < classes.length; ci++) {
      const cls = classes[ci];
      for (const st of byClass[ci]) {
        const roll = rnd();
        const status = roll < 0.88 ? "present" : roll < 0.95 ? "absent" : "late";
        recordDocs.push({
          studentId: st._id, classId: cls._id, school, date: d, status,
          markedBy: { id: cls.classTeacher, role: "teacher", name: "" },
        });
        if (!perClassName.has(cls.name)) perClassName.set(cls.name, []);
        perClassName.get(cls.name).push({
          student: st._id,
          status,
          remark: status === "absent" ? pick(["Sick leave","No information","Family function",""]) : "",
        });
      }
    }
    for (const [cname, records] of perClassName) {
      const anyCls = classes.find((c) => c.name === cname);
      attendanceDocs.push({
        school, class: cname, section: "", date: d,
        markedBy: anyCls.classTeacher, records, subject: "",
      });
    }
  }
  await insertMany(AttendanceRecord, recordDocs, "attendance records");
  await insertMany(Attendance, attendanceDocs, "class attendance");

  // ── 8. Fees ───────────────────────────────────────────────────────────────
  const tuitionFor = (n) => (n <= 5 ? 4500 : n <= 8 ? 6000 : 7500);
  const feeStructDocs = [];
  const structIndex   = new Map();   // className -> [structs]
  for (let n = 1; n <= 10; n++) {
    const base = tuitionFor(n);
    const rows = [
      { title: `Tuition Fee — Quarter 1 (${ACADEMIC_YEAR})`, amount: base,  dueDate: day(-118), frequency: "quarterly",
        description: "Quarterly tuition fee covering April to June." },
      { title: `Tuition Fee — Quarter 2 (${ACADEMIC_YEAR})`, amount: base,  dueDate: day(-26),  frequency: "quarterly",
        description: "Quarterly tuition fee covering July to September." },
      { title: `Admission & Development Fee (${ACADEMIC_YEAR})`, amount: 3200, dueDate: day(-140), frequency: "one-time",
        description: "Annual admission, development and maintenance charges." },
      { title: `Examination Fee — Half Yearly`, amount: 800, dueDate: day(14), frequency: "one-time",
        description: "Half yearly examination and stationery charges." },
    ];
    rows.forEach((r) => {
      feeStructDocs.push({ school, class: String(n), academicYear: ACADEMIC_YEAR, isActive: true, ...r });
    });
  }
  const feeStructs = await insertMany(FeeStructure, feeStructDocs, "fee structures");
  feeStructs.forEach((fs) => {
    if (!structIndex.has(fs.class)) structIndex.set(fs.class, []);
    structIndex.get(fs.class).push(fs);
  });

  const feePayDocs = [];
  let receipt = 0;
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    for (const st of byClass[ci]) {
      for (const fs of structIndex.get(cls.name)) {
        const overdue = fs.dueDate < TODAY;
        const roll = rnd();
        let status, paidAmount, paidDate;
        if (!overdue) {
          // future due date — mostly still pending
          if (roll < 0.25) { status = "paid"; paidAmount = fs.amount; paidDate = day(-int(1, 10)); }
          else             { status = "pending"; paidAmount = 0; paidDate = null; }
        } else if (roll < 0.68) { status = "paid";    paidAmount = fs.amount;                         paidDate = new Date(fs.dueDate.getTime() - int(0, 9) * 86400000); }
        else if (roll < 0.82)   { status = "partial"; paidAmount = Math.round(fs.amount * 0.5 / 100) * 100; paidDate = new Date(fs.dueDate.getTime() - int(0, 5) * 86400000); }
        else if (roll < 0.93)   { status = "overdue"; paidAmount = 0; paidDate = null; }
        else                    { status = "pending"; paidAmount = 0; paidDate = null; }

        feePayDocs.push({
          school, student: st._id, feeStructure: fs._id,
          title: fs.title, amount: fs.amount, paidAmount,
          dueDate: fs.dueDate, paidDate, status,
          paymentMode: status === "pending" || status === "overdue" ? "cash" : pick(["cash","online","cheque","dd"]),
          receiptNo: paidAmount > 0 ? `RCP-${admin.schoolCode}-${String(++receipt).padStart(5, "0")}` : undefined,
          remarks: status === "partial" ? "Balance promised by month end." : "",
          collectedBy: paidAmount > 0 ? cls.classTeacher : null,
        });
      }
    }
  }
  await insertMany(FeePayment, feePayDocs, "fee payments");

  const concessionDocs = [];
  for (let ci = 0; ci < classes.length; ci++) {
    for (const st of byClass[ci]) {
      if (!chance(0.09)) continue;
      const type = pick(["Sibling","Merit","SC/ST","Staff Ward","Custom"]);
      concessionDocs.push({
        school, student: st._id, feeStructure: structIndex.get(classes[ci].name)[0]._id,
        type, value: type === "Merit" ? 25 : type === "Sibling" ? 10 : 15, isPct: true,
        description: `${type} concession approved for ${ACADEMIC_YEAR}.`,
      });
    }
  }
  await insertMany(Concession, concessionDocs, "concessions");

  // ── 9. Exams + Results (legacy class-string model) ────────────────────────
  const examDocs = [];
  const examMeta = [];       // parallel: { ci, marks }
  const TERMS = [
    { title: "Unit Test 1",           type: "unit-test", offset: -72, marks: 25,  status: "completed" },
    { title: "Mid Term Examination",  type: "mid-term",  offset: -34, marks: 80,  status: "completed" },
    { title: "Unit Test 2",           type: "unit-test", offset: 11,  marks: 25,  status: "upcoming" },
    { title: "Practical Assessment",  type: "practical", offset: 21,  marks: 30,  status: "upcoming" },
  ];
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const core = coreFor(cls._no);
    TERMS.forEach((term, ti) => {
      const subs = term.type === "practical" ? core.slice(0, 2) : core;
      subs.forEach((subName, si) => {
        const t = teacherForSubject(subName);
        examDocs.push({
          school, title: `${term.title} — ${subName}`,
          class: cls.name, section: cls.section, subject: subName,
          date: day(term.offset + si, 9, 0),
          startTime: "09:00", endTime: term.marks >= 80 ? "12:00" : "10:30",
          totalMarks: term.marks,
          passingMarks: Math.round(term.marks * 0.33),
          examType: term.type,
          createdBy: t._id,
          instructions: "Bring your own stationery. Mobile phones are strictly not allowed in the exam hall.",
          status: term.status,
        });
        examMeta.push({ ci, marks: term.marks, scored: term.status === "completed", enteredBy: t._id, termIdx: ti });
      });
    });
  }
  const exams = await insertMany(Exam, examDocs, "exams");

  const resultDocs = [];
  exams.forEach((ex, i) => {
    const meta = examMeta[i];
    if (!meta.scored) return;
    for (const st of byClass[meta.ci]) {
      // per-student ability so results look consistent across subjects
      const ability = 0.45 + ((st.points % 100) / 100) * 0.5;
      const noise   = (rnd() - 0.5) * 0.22;
      const frac    = Math.max(0.18, Math.min(0.99, ability + noise));
      const marks   = Math.round(meta.marks * frac);
      resultDocs.push(buildResult({
        school, sourceType: "exam", exam: ex._id, student: st._id,
        remarks: frac > 0.85 ? pick(["Excellent work, keep it up.","Outstanding performance."])
               : frac > 0.6  ? pick(["Good effort. Revise weak topics.","Satisfactory, can do better."])
               : frac > 0.4  ? "Needs regular practice at home."
               : "Must attend remedial classes.",
        enteredBy: meta.enteredBy,
        isPublished: true, publishedAt: day(meta.termIdx === 0 ? -66 : -28),
      }, marks, meta.marks));
    }
  });
  await insertMany(Result, resultDocs, "exam results");

  // ── 10. Scheduled exams + exam subjects (new model) ───────────────────────
  const schedDocs = classes.map((cls) => ({
    school, title: `Half Yearly Examination ${ACADEMIC_YEAR}`, classId: cls._id,
    examType: "midterm", startDate: day(24, 9, 0), endDate: day(33, 12, 0),
    description: `Half yearly board-pattern examination for Class ${cls._label}.`,
    status: "upcoming",
  }));
  const scheduled = await insertMany(ScheduledExam, schedDocs, "scheduled exams");

  const examSubjDocs = [];
  scheduled.forEach((se, i) => {
    const cls = classes[i];
    coreFor(cls._no).forEach((subName, si) => {
      const sub = subjByName.get(subName);
      if (!sub) return;
      examSubjDocs.push({
        school, examId: se._id, subjectId: sub._id,
        date: day(24 + si * 2, 9, 0),
        totalMarks: 80, duration: 180,
      });
    });
  });
  await insertMany(ExamSubject, examSubjDocs, "exam subjects");

  // ── 11. Class tests + their results ───────────────────────────────────────
  const testDocs = [];
  const testMeta = [];
  classes.forEach((cls, ci) => {
    const core = coreFor(cls._no);
    [{ off: -18, st: "completed" }, { off: -6, st: "completed" }, { off: 8, st: "upcoming" }]
      .forEach((cfg, k) => {
        const subName = core[k % core.length];
        const sub = subjByName.get(subName);
        if (!sub) return;
        testDocs.push({
          school, title: `${subName} Class Test ${k + 1}`,
          classId: cls._id, subjectId: sub._id,
          date: day(cfg.off, 10, 30), totalMarks: 20, duration: 40,
          description: `Chapter-wise class test for ${subName}.`,
          status: cfg.st,
        });
        testMeta.push({ ci, scored: cfg.st === "completed" });
      });
  });
  const tests = await insertMany(Test, testDocs, "class tests");

  const testResultDocs = [];
  tests.forEach((t, i) => {
    if (!testMeta[i].scored) return;
    for (const st of byClass[testMeta[i].ci]) {
      const ability = 0.45 + ((st.points % 100) / 100) * 0.5;
      const marks = Math.max(3, Math.min(20, Math.round(20 * (ability + (rnd() - 0.5) * 0.25))));
      testResultDocs.push(buildResult({
        school, sourceType: "test", testId: t._id, student: st._id,
        remarks: "", enteredBy: classes[testMeta[i].ci].classTeacher,
        isPublished: true, publishedAt: t.date,
      }, marks, 20));
    }
  });
  await insertMany(Result, testResultDocs, "test results");

  // ── 12. Timetable (both models) ───────────────────────────────────────────
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const ttDocs = [];
  const entryDocs = [];
  classes.forEach((cls) => {
    const curr = curriculumFor(cls._no);
    DAYS.forEach((d, di) => {
      const periods = [];
      TEACH_PERIODS.forEach((p, pi) => {
        // rotate the curriculum so each day looks different but stays stable
        const subName = curr[(di * 3 + pi) % curr.length];
        const t = teacherForSubject(subName);
        periods.push({
          periodNo: p.periodNumber, subject: subName, teacher: t._id,
          startTime: p.startTime, endTime: p.endTime, room: cls.room,
        });
        entryDocs.push({
          school, classId: cls._id, teacherId: t._id, day: d,
          periodNumber: p.periodNumber, subject: subName,
          startTime: p.startTime, endTime: p.endTime,
        });
      });
      ttDocs.push({
        school, class: cls.name, section: cls.section, day: d,
        periods, academicYear: ACADEMIC_YEAR, isActive: true,
      });
    });
  });
  await insertMany(Timetable, ttDocs, "timetables");
  await insertMany(TimetableEntry, entryDocs, "timetable entries");

  // ── 13. Homework ──────────────────────────────────────────────────────────
  const HW_TEMPLATES = [
    { t: "Chapter Revision Worksheet", d: "Complete the end-of-chapter exercise questions 1 to 15 in your notebook. Show all working." },
    { t: "Reading & Summary",          d: "Read the prescribed chapter and write a 150-word summary in your own words." },
    { t: "Practice Problems Set",      d: "Solve the attached practice problem set. Attempt every question; partial credit is given for method." },
    { t: "Project Work",               d: "Prepare a chart/model on the assigned topic. Neatness and originality carry marks." },
    { t: "Weekly Assignment",          d: "Answer all questions from the weekly assignment sheet handed out in class." },
  ];
  const hwDocs = [];
  const hwMeta = [];
  classes.forEach((cls, ci) => {
    const core = coreFor(cls._no);
    [{ off: -9, past: true }, { off: -3, past: true }, { off: 4, past: false }, { off: 9, past: false }]
      .forEach((cfg, k) => {
        const subName = core[k % core.length];
        const tmpl = HW_TEMPLATES[(ci + k) % HW_TEMPLATES.length];
        const t = teacherForSubject(subName);
        hwDocs.push({
          school, title: `${subName}: ${tmpl.t}`, description: tmpl.d,
          subject: subName, class: cls.name, section: cls.section,
          dueDate: day(cfg.off, 23, 59),
          assignedBy: t._id, assignedByModel: "Teacher",
          attachments: [], submissions: [],
          maxMarks: 10, isActive: true,
        });
        hwMeta.push({ ci, past: cfg.past, teacher: t._id });
      });
  });
  // fill submissions for past homework
  hwDocs.forEach((hw, i) => {
    if (!hwMeta[i].past) return;
    for (const st of byClass[hwMeta[i].ci]) {
      if (!chance(0.78)) continue;                 // ~22% did not submit
      const late   = chance(0.15);
      const graded = chance(0.6);
      hw.submissions.push({
        student: st._id,
        submittedAt: new Date(hw.dueDate.getTime() + (late ? int(1, 3) : -int(1, 4)) * 86400000),
        note: pick(["Completed as instructed.","Done, please check question 7.","Submitted on time.",""]),
        status: graded ? "graded" : late ? "late" : "submitted",
        marks: graded ? int(5, 10) : null,
        feedback: graded ? pick(["Well presented.","Good, watch your handwriting.","Revise the last question.","Excellent."]) : "",
      });
    }
  });
  await insertMany(Homework, hwDocs, "homework");

  // ── 14. Notices ───────────────────────────────────────────────────────────
  const noticeDocs = [
    { title: "Half Yearly Examination Datesheet Released", category: "exam", isPinned: true, off: -2,
      content: "The datesheet for the Half Yearly Examination has been published on the notice board and in the app. Examinations begin in the last week of this month. Students are advised to collect their admit cards from the class teacher." },
    { title: "Parent–Teacher Meeting", category: "event", off: -4, isUrgent: false,
      content: "A Parent–Teacher Meeting for all classes will be held from 9:00 AM to 1:00 PM in the respective classrooms. Parents are requested to attend without fail and collect the progress report." },
    { title: "Quarter 2 Fee Payment Reminder", category: "fee", isUrgent: true, off: -6,
      content: "Parents are reminded to clear the Quarter 2 tuition fee at the earliest. A late fee will be applicable on payments made after the due date. Online payment is available through the parent portal." },
    { title: "Independence Day Celebration", category: "event", off: -9,
      content: "The school will celebrate Independence Day with flag hoisting at 8:00 AM followed by cultural programmes. All students must attend in full school uniform." },
    { title: "Annual Sports Week Registration Open", category: "general", off: -11,
      content: "Registration for the Annual Sports Week is now open. Interested students may register with the Physical Education department for athletics, cricket, kabaddi, badminton and chess." },
    { title: "Library Book Return Notice", category: "general", off: -13,
      content: "All students holding library books beyond the due date are requested to return them this week. A fine of ₹2 per day is being charged on overdue books." },
    { title: "Science Exhibition — Call for Projects", category: "event", off: -16,
      content: "Classes 6 to 10 are invited to submit project proposals for the inter-house Science Exhibition. Team size is limited to three students. Submit proposals to your science teacher." },
    { title: "Change in School Timings", category: "urgent", isUrgent: true, isPinned: true, off: -18,
      content: "Due to the heat advisory, school timings will be 8:00 AM to 1:30 PM until further notice. Transport timings have been adjusted accordingly." },
    { title: "Holiday — Local Public Holiday", category: "holiday", off: -21,
      content: "The school will remain closed on account of a local public holiday. Classes will resume as usual the following working day." },
    { title: "Uniform and Grooming Guidelines", category: "general", off: -24,
      content: "Students must attend school in the prescribed uniform with polished black shoes and a proper haircut. Repeated violations will be reported to parents." },
    { title: "Computer Lab Rules Updated", category: "other", off: -27,
      content: "Updated computer lab rules are in effect. Students must not install software, and must log out of their accounts before leaving the lab." },
    { title: "Vaccination & Health Check-up Camp", category: "general", off: -30,
      content: "A free health check-up and vaccination camp will be organised in the school hall. Consent forms have been shared with parents and must be returned signed." },
    { title: "Homework Submission Policy", category: "general", targetRoles: ["teacher","student"], off: -33,
      content: "Homework must be submitted through the app or in person by the due date. Late submissions will be accepted for two days with reduced marks." },
    { title: "Teachers' Staff Meeting", category: "other", targetRoles: ["teacher"], off: -5,
      content: "All teaching staff are required to attend the monthly staff meeting in the conference room after the last period. Attendance is mandatory." },
    { title: "Class 10 Board Preparation Extra Classes", category: "exam", targetClass: "10", off: -8,
      content: "Extra preparatory classes for Class 10 will be conducted every Saturday from 9:00 AM to 12:00 PM starting this week. Attendance will be marked." },
  ].map((n) => ({
    school, title: n.title, content: n.content, category: n.category,
    targetRoles: n.targetRoles || ["all"],
    targetClass: n.targetClass || "",
    postedBy: n.targetRoles && n.targetRoles.length === 1 && n.targetRoles[0] === "teacher"
      ? school : school,
    postedByModel: "Admin",
    isUrgent: !!n.isUrgent, isPinned: !!n.isPinned,
    expiryDate: day(n.off + 90),
    views: int(15, 340),
    createdAt: day(n.off), updatedAt: day(n.off),
  }));
  await insertMany(Notice, noticeDocs, "notices");

  // ── 15. Events ────────────────────────────────────────────────────────────
  const eventDocs = [
    { title: "Parent–Teacher Meeting",        type: "meeting",  s: 5,  e: 5,  venue: "Respective Classrooms", color: "#6366F1" },
    { title: "Half Yearly Examinations",      type: "exam",     s: 24, e: 33, venue: "Examination Halls",     color: "#EF4444" },
    { title: "Annual Sports Week",            type: "sports",   s: 41, e: 46, venue: "School Ground",         color: "#22C55E" },
    { title: "Science & Innovation Exhibition", type: "cultural", s: 17, e: 18, venue: "Main Hall",           color: "#0EA5E9" },
    { title: "Inter-House Debate Competition", type: "cultural", s: 12, e: 12, venue: "Auditorium",           color: "#A855F7" },
    { title: "Eid Holiday",                   type: "holiday",  s: 36, e: 38, venue: "—",                     color: "#F59E0B" },
    { title: "Gandhi Jayanti — Holiday",      type: "holiday",  s: 46, e: 46, venue: "—",                     color: "#F59E0B" },
    { title: "Annual Day Rehearsals",         type: "cultural", s: 52, e: 56, venue: "Auditorium",            color: "#EC4899" },
    { title: "Career Counselling Session (Class 9–10)", type: "meeting", s: 9, e: 9, venue: "Seminar Room", color: "#14B8A6", targetClass: "10" },
    { title: "Independence Day Celebration",  type: "cultural", s: -2, e: -2, venue: "School Ground",         color: "#3B82F6" },
    { title: "Health Check-up Camp",          type: "other",    s: 7,  e: 7,  venue: "School Hall",           color: "#10B981" },
    { title: "Unit Test 2",                   type: "exam",     s: 11, e: 14, venue: "Classrooms",            color: "#EF4444" },
    { title: "Staff Development Workshop",    type: "meeting",  s: 19, e: 19, venue: "Conference Room",       color: "#8B5CF6" },
    { title: "Founders' Day",                 type: "cultural", s: 60, e: 60, venue: "School Ground",         color: "#F97316" },
  ].map((e) => ({
    school, title: e.title,
    description: `${e.title} — organised by Alflah School. Details will be shared on the notice board.`,
    startDate: day(e.s, 9, 0), endDate: day(e.e, 15, 0),
    eventType: e.type, targetClass: e.targetClass || "all",
    venue: e.venue, createdBy: school, isPublic: true, color: e.color,
  }));
  await insertMany(Event, eventDocs, "events");

  // ── 16. Library ───────────────────────────────────────────────────────────
  const BOOK_DEFS = [
    ["NCERT Mathematics — Class 10","NCERT","Textbook","NCERT"],
    ["NCERT Science — Class 10","NCERT","Textbook","NCERT"],
    ["NCERT Mathematics — Class 9","NCERT","Textbook","NCERT"],
    ["NCERT Science — Class 9","NCERT","Textbook","NCERT"],
    ["NCERT Social Science — Class 8","NCERT","Textbook","NCERT"],
    ["Wren & Martin — High School English Grammar","P.C. Wren","Reference","S. Chand"],
    ["RS Aggarwal Mathematics — Class 10","R.S. Aggarwal","Reference","Bharati Bhawan"],
    ["Lakhmir Singh Physics — Class 9","Lakhmir Singh","Reference","S. Chand"],
    ["Together with Science — Class 10","Rachna Sagar","Reference","Rachna Sagar"],
    ["Oxford Advanced Learner's Dictionary","Oxford","Reference","Oxford University Press"],
    ["The Jungle Book","Rudyard Kipling","Fiction","Macmillan"],
    ["Malgudi Days","R.K. Narayan","Fiction","Indian Thought"],
    ["The Adventures of Tom Sawyer","Mark Twain","Fiction","Penguin"],
    ["Harry Potter and the Philosopher's Stone","J.K. Rowling","Fiction","Bloomsbury"],
    ["Panchatantra Stories","Vishnu Sharma","Fiction","Rupa"],
    ["Wings of Fire","A.P.J. Abdul Kalam","Biography","Universities Press"],
    ["The Story of My Experiments with Truth","M.K. Gandhi","Biography","Navajivan"],
    ["Ignited Minds","A.P.J. Abdul Kalam","Motivational","Penguin"],
    ["Discovery of India","Jawaharlal Nehru","History","Penguin"],
    ["India After Gandhi","Ramachandra Guha","History","Picador"],
    ["A Brief History of Time","Stephen Hawking","Science","Bantam"],
    ["Cosmos","Carl Sagan","Science","Random House"],
    ["The Selfish Gene","Richard Dawkins","Science","Oxford"],
    ["Let Us C","Yashavant Kanetkar","Computer","BPB"],
    ["Python Crash Course","Eric Matthes","Computer","No Starch Press"],
    ["Introduction to Algorithms","Thomas H. Cormen","Computer","MIT Press"],
    ["Urdu Adab Ki Tareekh","Jameel Jalibi","Language","Educational Publishing"],
    ["Diwan-e-Ghalib","Mirza Ghalib","Poetry","Maktaba Jamia"],
    ["Godan","Munshi Premchand","Fiction","Lokbharti"],
    ["Nirmala","Munshi Premchand","Fiction","Lokbharti"],
    ["Rashmirathi","Ramdhari Singh Dinkar","Poetry","Lokbharti"],
    ["Gitanjali","Rabindranath Tagore","Poetry","Macmillan"],
    ["Atlas of the World","Oxford","Reference","Oxford University Press"],
    ["Manorama Yearbook","Malayala Manorama","Reference","Manorama"],
    ["Lucent's General Knowledge","Binay Karna","Reference","Lucent"],
    ["Encyclopaedia Britannica — Junior Set","Britannica","Reference","Britannica"],
    ["The Diary of a Young Girl","Anne Frank","Biography","Penguin"],
    ["Train to Pakistan","Khushwant Singh","Fiction","Ravi Dayal"],
    ["Chemistry for Class 12","NCERT","Textbook","NCERT"],
    ["Biology for Class 11","NCERT","Textbook","NCERT"],
    ["Fun with Art & Craft","Sunita Rao","Activity","Vikas"],
    ["Sports Rules Handbook","Anil Kumble","Sports","Rupa"],
  ];
  const bookDocs = BOOK_DEFS.map((b, i) => {
    const total = int(2, 8);
    return {
      school, title: b[0], author: b[1], category: b[2], publisher: b[3],
      isbn: `978-81-${String(int(1000, 9999))}-${String(int(100, 999))}-${int(0, 9)}`,
      totalCopies: total, availableCopies: total,
      shelfNumber: `${String.fromCharCode(65 + (i % 6))}-${int(1, 12)}`,
      publishYear: int(1998, 2025),
    };
  });
  const books = await insertMany(Book, bookDocs, "library books");

  const issueDocs = [];
  const availDec = new Map();
  for (let i = 0; i < 55; i++) {
    const book = books[int(0, books.length - 1)];
    const toStudent = chance(0.82);
    const holder = toStudent ? students[int(0, students.length - 1)] : teachers[int(0, teachers.length - 1)];
    const issueOff = -int(3, 60);
    const dueOff   = issueOff + 14;
    const roll = rnd();
    let status, returnDate, fine = 0;
    if (roll < 0.5)      { status = "returned"; returnDate = day(dueOff - int(0, 6)); }
    else if (dueOff < 0 && roll < 0.78) { status = "overdue"; returnDate = null; fine = Math.abs(dueOff) * 2; }
    else                 { status = "issued";   returnDate = null; }

    if (status !== "returned") {
      availDec.set(book._id.toString(), (availDec.get(book._id.toString()) || 0) + 1);
    }
    issueDocs.push({
      school, book: book._id,
      issuedTo: holder._id, issuedToModel: toStudent ? "Student" : "Teacher",
      issueDate: day(issueOff), dueDate: day(dueOff),
      returnDate, status, fine,
      issuedBy: teachers[teachers.length - 1]._id,   // librarian
    });
  }
  await insertMany(BookIssue, issueDocs, "book issues");
  for (const [bid, n] of availDec) {
    await Book.updateOne({ _id: bid }, [{ $set: { availableCopies: { $max: [0, { $subtract: ["$totalCopies", n] }] } } }]);
  }

  // ── 17. Transport ─────────────────────────────────────────────────────────
  const ROUTES = [
    { routeName: "Shastri Nagar – Saket Circuit", routeNumber: "R-01", driverName: "Ramesh Pal",   vehicleNo: "UP15 AT 4521",
      stops: [["Shastri Nagar Sector 5","07:05",1400],["Sports Goods Market","07:15",1400],["Saket Crossing","07:25",1300],["School Gate","07:45",0]] },
    { routeName: "Jagriti Vihar – Abu Lane",      routeNumber: "R-02", driverName: "Nadeem Ali",   vehicleNo: "UP15 BT 7788",
      stops: [["Jagriti Vihar Block C","07:00",1500],["Abu Lane Market","07:18",1400],["Begum Bridge","07:30",1300],["School Gate","07:45",0]] },
    { routeName: "Modipuram – Pallavpuram",       routeNumber: "R-03", driverName: "Sukhbir Singh",vehicleNo: "UP15 CT 1109",
      stops: [["Modipuram Bypass","06:50",1800],["Pallavpuram Phase 2","07:05",1700],["Kanker Khera","07:22",1500],["School Gate","07:45",0]] },
    { routeName: "Lisari Gate – Brahmpuri",       routeNumber: "R-04", driverName: "Irfan Qureshi",vehicleNo: "UP15 DT 3366",
      stops: [["Lisari Gate","07:10",1300],["Zakir Colony","07:20",1300],["Brahmpuri Chowk","07:32",1200],["School Gate","07:45",0]] },
    { routeName: "Ganga Nagar – Rohta Road",      routeNumber: "R-05", driverName: "Mahesh Kumar", vehicleNo: "UP15 ET 9042",
      stops: [["Ganga Nagar Gate","07:00",1600],["Suraj Kund","07:14",1500],["Rohta Road Tiraha","07:28",1500],["School Gate","07:45",0]] },
    { routeName: "City Centre Shuttle",           routeNumber: "R-06", driverName: "Salim Ansari", vehicleNo: "UP15 FT 6673",
      stops: [["Delhi Chungi","07:05",1400],["Hapur Adda","07:18",1400],["Railway Road","07:30",1300],["School Gate","07:45",0]] },
  ];
  const shuffled = [...students].sort(() => rnd() - 0.5);
  let cursor = 0;
  const routeDocs = ROUTES.map((r) => {
    const count = int(10, 18);
    const assigned = shuffled.slice(cursor, cursor + count).map((s) => s._id);
    cursor += count;
    return {
      school, routeName: r.routeName, routeNumber: r.routeNumber,
      driverName: r.driverName, driverPhone: "+9196" + String(int(10000000, 99999999)),
      vehicleNo: r.vehicleNo,
      stops: r.stops.map(([stopName, timing, fare]) => ({ stopName, timing, fare })),
      students: assigned, isActive: true,
    };
  });
  await insertMany(BusRoute, routeDocs, "bus routes");

  // ── 18. Study material ────────────────────────────────────────────────────
  const MAT_KINDS = [
    { type: "notes",     suffix: "Chapter Notes",          desc: "Concise chapter notes with key definitions and solved examples." },
    { type: "worksheet", suffix: "Practice Worksheet",     desc: "Printable worksheet with graded practice questions." },
    { type: "paper",     suffix: "Previous Year Paper",    desc: "Previous year question paper with marking scheme." },
    { type: "pdf",       suffix: "Reference Handout",      desc: "Reference handout shared in class for extra reading." },
  ];
  const matDocs = [];
  classes.forEach((cls, ci) => {
    coreFor(cls._no).slice(0, 3).forEach((subName, si) => {
      const kind = MAT_KINDS[(ci + si) % MAT_KINDS.length];
      const t = teacherForSubject(subName);
      const slug = `${subName}-${cls._label}-${kind.type}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      matDocs.push({
        school, title: `${subName} — ${kind.suffix} (Class ${cls._label})`,
        description: kind.desc, subject: subName,
        class: cls.name, section: cls.section, type: kind.type,
        fileUrl: `https://res.cloudinary.com/demo/raw/upload/alflah/${slug}.pdf`,
        filePublicId: `alflah/${slug}`, fileName: `${slug}.pdf`,
        uploadedBy: t._id, uploaderModel: "Teacher", uploaderName: t.name,
        downloads: int(0, 120),
      });
    });
  });
  await insertMany(StudyMaterial, matDocs, "study materials");

  // ── 19. Gamification ──────────────────────────────────────────────────────
  const BADGE_DEFS = [
    ["Perfect Attendance","Present on every school day for a full month","calendar-check","#22C55E",  "30 consecutive present days", 50],
    ["Top Scorer","Highest marks in a class examination","trophy","#FFD700",                          "Rank 1 in any exam", 60],
    ["Homework Hero","Submitted every homework on time this term","book-open","#3B82F6",              "100% on-time submissions", 40],
    ["Quiz Champion","Won the weekly class quiz","zap","#A855F7",                                     "Win a daily/weekly challenge", 30],
    ["Bookworm","Issued and returned 10 library books","library","#F97316",                           "10 library books read", 35],
    ["Sports Star","Outstanding performance in Sports Week","medal","#EF4444",                        "Podium finish in any sport", 45],
    ["Helping Hand","Consistently helps classmates and teachers","heart-handshake","#EC4899",         "Nominated by class teacher", 25],
    ["Science Whiz","Excellence in the Science Exhibition","flask-conical","#0EA5E9",                 "Top 3 in science exhibition", 50],
    ["Punctuality Pro","No late marks for two months","clock","#14B8A6",                              "Zero late arrivals", 30],
    ["Creative Mind","Outstanding work in Art & Craft","palette","#8B5CF6",                           "Best artwork of the term", 25],
  ];
  const badges = await insertMany(Badge, BADGE_DEFS.map(([name, description, icon, color, criteria, points]) =>
    ({ school, name, description, icon, color, criteria, points })), "badges");

  const userBadgeDocs = [];
  const studentBadgeNames = new Map();
  for (const st of students) {
    if (!chance(0.42)) continue;
    const n = int(1, 3);
    const chosen = new Set();
    for (let k = 0; k < n; k++) chosen.add(badges[int(0, badges.length - 1)]);
    for (const b of chosen) {
      userBadgeDocs.push({
        school, badge: b._id, awardedTo: st._id, awardedToModel: "Student",
        awardedBy: st.classTeacher, awardedByAdmin: null,
        reason: `Awarded for ${b.criteria.toLowerCase()}.`,
        awardedAt: day(-int(1, 60)),
      });
      if (!studentBadgeNames.has(st._id.toString())) studentBadgeNames.set(st._id.toString(), []);
      studentBadgeNames.get(st._id.toString()).push(b.name);
    }
  }
  for (const t of teachers) {
    if (!chance(0.3)) continue;
    const b = badges[int(0, badges.length - 1)];
    userBadgeDocs.push({
      school, badge: b._id, awardedTo: t._id, awardedToModel: "Teacher",
      awardedBy: null, awardedByAdmin: school,
      reason: "Recognised by the school management for outstanding contribution.",
      awardedAt: day(-int(1, 45)),
    });
  }
  await insertMany(UserBadge, userBadgeDocs, "awarded badges");

  const badgeOps = [...studentBadgeNames.entries()].map(([id, names]) => ({
    updateOne: { filter: { _id: id }, update: { $set: { badges: [...new Set(names)] } } },
  }));
  for (let i = 0; i < badgeOps.length; i += 500) await Student.bulkWrite(badgeOps.slice(i, i + 500));

  const CHALLENGE_BANK = [
    ["What is the value of pi correct to two decimal places?","3.14","Mathematics"],
    ["Name the powerhouse of the cell.","Mitochondria","Science"],
    ["Who wrote the Indian national anthem?","Rabindranath Tagore","Social Science"],
    ["What is the past tense of 'go'?","went","English"],
    ["Which gas do plants absorb during photosynthesis?","Carbon dioxide","Science"],
    ["What is 15% of 200?","30","Mathematics"],
    ["Which is the longest river in India?","Ganga","Social Science"],
    ["What does CPU stand for?","Central Processing Unit","Computer Science"],
    ["Give the plural of 'child'.","children","English"],
    ["How many sides does a hexagon have?","6","Mathematics"],
    ["In which year did India gain independence?","1947","Social Science"],
    ["What is the chemical symbol for water?","H2O","Science"],
  ];
  const challengeDocs = [];
  CHALLENGE_BANK.forEach(([question, answer, subject], i) => {
    const cls = classes[(i * 3) % classes.length];
    const past = i >= 4;
    const responses = [];
    if (past) {
      for (const st of byClass[classes.indexOf(cls)]) {
        if (!chance(0.55)) continue;
        const correct = chance(0.62);
        responses.push({
          student: st._id,
          answer: correct ? answer : pick(["Not sure","42","I think it is different","—"]),
          isCorrect: correct,
          submittedAt: day(-int(2, 14), int(9, 16), 0),
          pointsEarned: correct ? 5 : 0,
        });
      }
    }
    challengeDocs.push({
      school, class: cls.name, section: cls.section,
      question, answer, subject, points: 5,
      postedBy: cls.classTeacher,
      responses,
      expiresAt: past ? day(-int(1, 10), 23, 59) : day(int(1, 5), 23, 59),
      isActive: !past,
    });
  });
  await insertMany(Challenge, challengeDocs, "daily challenges");

  // ── 20. Chat (conversations + messages) ───────────────────────────────────
  const CHAT_SCRIPTS = [
    ["Assalamu alaikum sir, my son was absent yesterday due to fever.",
     "Wa alaikum assalam. Thank you for informing. Please send a leave application when he returns.",
     "Sure sir, I will send it tomorrow.",
     "No problem. I will share yesterday's homework with him."],
    ["Good morning ma'am, when will the mid term results be published?",
     "Good morning. Results will be published in the app by the end of this week.",
     "Thank you ma'am."],
    ["Sir, I could not understand question 7 of the maths worksheet.",
     "Come to the staff room during the lunch break, I will explain it.",
     "Okay sir, thank you so much."],
    ["Ma'am, is the fee payment possible online?",
     "Yes, you can pay from the Fees section in the parent portal.",
     "Got it, I will pay today itself."],
    ["Please note the staff meeting has been moved to 3:30 PM.",
     "Noted sir, I will be there.",
     "Thank you."],
    ["Ma'am, my daughter left her library book at school.",
     "I will check with the librarian and keep it safe in the staff room.",
     "Thank you ma'am, appreciate it."],
    ["Sir, can I get extra practice papers for science?",
     "Yes, I have uploaded them under Study Materials. Please download from there.",
     "Thank you sir."],
    ["Regarding the Science Exhibition — is a team of four allowed?",
     "Maximum team size is three students. Please adjust your team.",
     "Understood, thank you."],
  ];
  const convDocs = [];
  const convScript = [];
  const adminPart = { userId: school, role: "schooladmin", name: admin.name, unread: 0 };

  for (let i = 0; i < 14; i++) {
    const script = CHAT_SCRIPTS[i % CHAT_SCRIPTS.length];
    let a, b;
    if (i % 4 === 0) {                        // parent ↔️ teacher
      const st = students[int(0, students.length - 1)];
      const pIdx = students.findIndex((s) => s._id.equals(st._id));
      const par = parents[pIdx];
      const tch = teachers.find((t) => t._id.equals(st.classTeacher)) || teachers[0];
      a = { userId: par._id, role: "parent", name: par.name, unread: 0 };
      b = { userId: tch._id, role: "teacher", name: tch.name, unread: 0 };
    } else if (i % 4 === 1) {                 // student ↔️ teacher
      const st = students[int(0, students.length - 1)];
      const tch = teachers.find((t) => t._id.equals(st.classTeacher)) || teachers[1];
      a = { userId: st._id, role: "student", name: st.name, unread: 0 };
      b = { userId: tch._id, role: "teacher", name: tch.name, unread: 0 };
    } else if (i % 4 === 2) {                 // admin ↔️ teacher
      const tch = teachers[int(0, teachers.length - 1)];
      a = { ...adminPart };
      b = { userId: tch._id, role: "teacher", name: tch.name, unread: 0 };
    } else {                                  // admin ↔️ parent
      const par = parents[int(0, parents.length - 1)];
      a = { ...adminPart };
      b = { userId: par._id, role: "parent", name: par.name, unread: 0 };
    }
    const startOff = -int(1, 25);
    convDocs.push({
      school, participants: [a, b],
      lastMessage: script[script.length - 1],
      lastMessageAt: day(startOff, 12 + script.length, 0),
      lastSenderId: script.length % 2 === 1 ? a.userId : b.userId,
    });
    convScript.push({ script, a, b, startOff });
  }
  const conversations = await insertMany(Conversation, convDocs, "conversations");

  const messageDocs = [];
  conversations.forEach((c, i) => {
    const { script, a, b, startOff } = convScript[i];
    script.forEach((text, k) => {
      const from = k % 2 === 0 ? a : b;
      messageDocs.push({
        conversation: c._id, sender: from.userId, senderRole: from.role,
        senderName: from.name, text, school,
        read: k < script.length - 1,
        readAt: k < script.length - 1 ? day(startOff, 12 + k + 1, 0) : null,
        createdAt: day(startOff, 12 + k, int(0, 59)),
        updatedAt: day(startOff, 12 + k, int(0, 59)),
      });
    });
  });
  await insertMany(Message, messageDocs, "chat messages");

  // Mark the last message unread for the recipient
  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    const { script, a, b } = convScript[i];
    const lastFrom = (script.length - 1) % 2 === 0 ? a : b;
    const other = lastFrom.userId.equals(c.participants[0].userId) ? 1 : 0;
    await Conversation.updateOne({ _id: c._id }, { $set: { [`participants.${other}.unread`]: 1 } });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete.\n");
  console.log("Login credentials");
  console.log("─".repeat(60));
  console.log(`  Admin    ${SCHOOL_EMAIL.padEnd(38)} ${adminCreated ? ADMIN_PASSWORD : "(your existing password)"}`);
  console.log(`  Teacher  ${teachers[0].email.padEnd(38)} ${PW_TEACHER}`);
  console.log(`  Teacher  ${teachers[1].email.padEnd(38)} ${PW_TEACHER}`);
  console.log(`  Student  ${students[0].email.padEnd(38)} ${PW_STUDENT}`);
  console.log(`  Student  ${students[1].email.padEnd(38)} ${PW_STUDENT}`);
  console.log(`  Parent   ${parents[0].email.padEnd(38)} ${PW_PARENT}`);
  console.log("─".repeat(60));
  console.log(`  All ${teachers.length} teachers share the password  ${PW_TEACHER}`);
  console.log(`  All ${students.length} students share the password  ${PW_STUDENT}`);
  console.log(`  All ${parents.length} parents  share the password  ${PW_PARENT}`);

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("\n❌ Seed failed:", err.message);
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});