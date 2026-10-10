const { FeeStructure, FeePayment, Concession } = require("../models/Fee");
const Student = require("../models/Student");
const Parent  = require("../models/Parent");

// ── HELPERS ───────────────────────────────────────────────────────────────────
const genReceipt = async () => {
  const count = await FeePayment.countDocuments();
  return "RCP-" + Date.now() + "-" + String(count + Math.floor(Math.random() * 99) + 1).padStart(4, "0");
};

const populatePayment = (q) =>
  q.populate("student", "name studentId class section rollNumber")
   .populate("feeStructure", "title class amount frequency")
   .populate("collectedBy", "name teacherId");

// ── FEE STRUCTURE ─────────────────────────────────────────────────────────────
exports.createFeeStructure = async (req, res) => {
  try {
    const { class: cls, title, amount, dueDate, frequency, description, academicYear } = req.body;
    if (!cls || !title || !amount)
      return res.status(400).json({ success: false, message: "Class, title and amount are required." });

    // For monthly/quarterly, dueDate defaults to end of current month if not provided
    const resolvedDueDate = dueDate || (() => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(0);
      return d.toISOString().slice(0, 10);
    })();

    const fee = await FeeStructure.create({
      school: req.schoolId, class: cls, title, amount,
      dueDate: resolvedDueDate, frequency, description, academicYear,
    });

    // Auto-assign pending FeePayment records to every student in this class
    const students = await Student.find({ school: req.schoolId, class: cls, isActive: true }).select("_id");
    if (students.length > 0) {
      const bulk = students.map((s) => ({
        school:       req.schoolId,
        student:      s._id,
        feeStructure: fee._id,
        title,
        amount:       parseFloat(amount),
        paidAmount:   0,
        dueDate:      new Date(resolvedDueDate),
        status:       new Date(resolvedDueDate) < new Date() ? "overdue" : "pending",
        paymentMode:  "cash",
      }));
      await FeePayment.insertMany(bulk, { ordered: false });
    }

    res.status(201).json({
      success: true,
      message: `Fee structure created and assigned to ${students.length} student(s).`,
      data: fee,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getFeeStructures = async (req, res) => {
  try {
    const { class: cls } = req.query;
    const query = { school: req.schoolId, isActive: true };
    if (cls) query.class = cls;
    const fees = await FeeStructure.find(query).sort({ class: 1, createdAt: -1 });
    res.json({ success: true, data: fees });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateFeeStructure = async (req, res) => {
  try {
    const { title, amount, dueDate, frequency, description, academicYear, isActive } = req.body;
    const update = {};
    if (title       !== undefined) update.title       = title;
    if (amount      !== undefined) update.amount      = amount;
    if (dueDate     !== undefined) update.dueDate     = dueDate;
    if (frequency   !== undefined) update.frequency   = frequency;
    if (description !== undefined) update.description = description;
    if (academicYear!== undefined) update.academicYear= academicYear;
    if (isActive    !== undefined) update.isActive    = isActive;
    const fee = await FeeStructure.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId }, update, { new: true, runValidators: true }
    );
    if (!fee) return res.status(404).json({ success: false, message: "Fee structure not found." });
    res.json({ success: true, message: "Fee structure updated.", data: fee });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteFeeStructure = async (req, res) => {
  try {
    const fee = await FeeStructure.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!fee) return res.status(404).json({ success: false, message: "Fee structure not found." });
    res.json({ success: true, message: "Fee structure deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── FEE COLLECTION ────────────────────────────────────────────────────────────
exports.collectFee = async (req, res) => {
  try {
    const { student, title, amount, paidAmount, dueDate, paymentMode, remarks, feeStructure } = req.body;
    if (!student || !title || !amount)
      return res.status(400).json({ success: false, message: "student, title and amount are required." });

    const paid = parseFloat(paidAmount) || 0;
    const total = parseFloat(amount);
    const status = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";

    const mongoose = require("mongoose");
    const payDoc = new FeePayment({
      school: req.schoolId, student: new mongoose.Types.ObjectId(student.toString()), title,
      amount: total, paidAmount: paid,
      dueDate: dueDate || new Date(),
      status,
      paymentMode: paymentMode || "cash",
      remarks: remarks || "",
      feeStructure: feeStructure || null,
      paidDate: status === "paid" ? new Date() : null,
      collectedBy: req.userRole === "teacher" ? req.user._id : null,
    });
    await payDoc.save(); // triggers pre-save receiptNo for "paid"

    if (status === "paid") await Student.findByIdAndUpdate(student, { $inc: { points: 5 } });

    const populated = await populatePayment(FeePayment.findById(payDoc._id));
    res.status(201).json({ success: true, message: "Fee recorded.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStudentFees = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;

    // Always fetch student to get class AND school — do not rely on req.schoolId for parent
    const stu = await Student.findById(studentId).select("class school");
    const studentClass = stu?.class || req.user?.class;
    const schoolId     = stu?.school || req.schoolId;

    // Real FeePayment records for this student
    const payments = await populatePayment(
      FeePayment.find({ student: studentId }).sort({ createdAt: -1 })
    );

    // FeeStructures for this student's class that don't yet have a FeePayment
    let allFees = [...payments];
    if (studentClass && schoolId) {
      const structures = await FeeStructure.find({ school: schoolId, class: studentClass, isActive: true });

      const linkedIds = new Set(payments.map((p) => p.feeStructure?._id?.toString()).filter(Boolean));

      for (const fs of structures) {
        if (linkedIds.has(fs._id.toString())) continue;
        const due = new Date(fs.dueDate);
        allFees.push({
          _id:         fs._id,
          student:     studentId,
          feeStructure:fs,
          title:       fs.title,
          amount:      fs.amount,
          paidAmount:  0,
          dueDate:     fs.dueDate,
          status:      due < new Date() ? "overdue" : "pending",
          paymentMode: "cash",
          receiptNo:   null,
          remarks:     "",
          collectedBy: null,
          isVirtual:   true,
        });
      }
    }

    const paid    = allFees.filter((f) => f.status === "paid").reduce((s, f) => s + (f.paidAmount || 0), 0);
    const pending = allFees.filter((f) => f.status !== "paid").reduce((s, f) => s + (f.amount - (f.paidAmount || 0)), 0);

    res.json({ success: true, data: { fees: allFees, summary: { paid, pending, total: paid + pending } } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllFees = async (req, res) => {
  try {
    const { status, class: cls, studentId } = req.query;
    const query = { school: req.schoolId };
    if (status)    query.status  = status;
    if (studentId) query.student = studentId;

    const fees = await populatePayment(FeePayment.find(query).sort({ createdAt: -1 }));
    const filtered = cls ? fees.filter(f => f.student?.class === cls) : fees;

    const totalCollected = filtered.filter(f => f.status === "paid").reduce((s, f) => s + f.paidAmount, 0);
    const totalPending   = filtered.filter(f => f.status !== "paid").reduce((s, f) => s + (f.amount - f.paidAmount), 0);
    res.json({ success: true, data: filtered, summary: { totalCollected, totalPending } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateFeeStatus = async (req, res) => {
  try {
    const { status, paidAmount, paymentMode, remarks } = req.body;
    const update = { status, paymentMode, paidDate: status === "paid" ? new Date() : null };
    if (paidAmount !== undefined) update.paidAmount = paidAmount;
    if (remarks    !== undefined) update.remarks    = remarks;
    // Generate receiptNo for paid (findOneAndUpdate skips pre-save hook)
    if (status === "paid") update.receiptNo = await genReceipt();

    const fee = await FeePayment.findOneAndUpdate(
      { _id: req.params.id, school: req.schoolId }, update, { new: true }
    );
    if (!fee) return res.status(404).json({ success: false, message: "Fee record not found." });

    if (status === "paid") await Student.findByIdAndUpdate(fee.student, { $inc: { points: 5 } });

    const populated = await populatePayment(FeePayment.findById(fee._id));
    res.json({ success: true, message: "Fee updated.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deletePayment = async (req, res) => {
  try {
    const fee = await FeePayment.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!fee) return res.status(404).json({ success: false, message: "Fee record not found." });
    res.json({ success: true, message: "Payment record deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── STUDENT SELF-PAYMENT ──────────────────────────────────────────────────────
exports.studentSelfPay = async (req, res) => {
  try {
    const { feePaymentId, feeStructureId, paidAmount, paymentMode, transactionId, remarks } = req.body;

    if (!paidAmount || parseFloat(paidAmount) <= 0)
      return res.status(400).json({ success: false, message: "Valid payment amount is required." });

    const paid = parseFloat(paidAmount);
    let payDoc;

    if (feePaymentId) {
      // Update existing FeePayment — must belong to this student
      payDoc = await FeePayment.findOne({ _id: feePaymentId, student: req.user._id });
      if (!payDoc) return res.status(404).json({ success: false, message: "Fee record not found." });

      const newPaid   = Math.min((payDoc.paidAmount || 0) + paid, payDoc.amount);
      const newStatus = newPaid >= payDoc.amount ? "paid" : "partial";

      payDoc.paidAmount  = newPaid;
      payDoc.status      = newStatus;
      payDoc.paymentMode = paymentMode || "online";
      payDoc.remarks     = [transactionId, remarks].filter(Boolean).join(" | ") || payDoc.remarks;
      if (newStatus === "paid") {
        payDoc.paidDate  = new Date();
        payDoc.receiptNo = await genReceipt();
      }
      await payDoc.save();

    } else if (feeStructureId) {
      // Virtual fee — create a new FeePayment from the structure
      const structure = await FeeStructure.findOne({ _id: feeStructureId, school: req.schoolId });
      if (!structure) return res.status(404).json({ success: false, message: "Fee structure not found." });

      const total    = structure.amount;
      const status   = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
      const receipt  = status === "paid" ? await genReceipt() : null;

      payDoc = await FeePayment.create({
        school:      req.schoolId,
        student:     req.user._id,
        feeStructure:feeStructureId,
        title:       structure.title,
        amount:      total,
        paidAmount:  Math.min(paid, total),
        dueDate:     structure.dueDate,
        status,
        paymentMode: paymentMode || "online",
        remarks:     [transactionId, remarks].filter(Boolean).join(" | ") || "",
        receiptNo:   receipt,
        paidDate:    status === "paid" ? new Date() : null,
      });

    } else {
      return res.status(400).json({ success: false, message: "Either feePaymentId or feeStructureId is required." });
    }

    if (payDoc.status === "paid")
      await Student.findByIdAndUpdate(req.user._id, { $inc: { points: 5 } });

    const populated = await populatePayment(FeePayment.findById(payDoc._id));
    res.json({ success: true, message: "Payment submitted successfully.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PARENT PAY FOR CHILD ──────────────────────────────────────────────────────
exports.parentPayFee = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { feePaymentId, feeStructureId, paidAmount, paymentMode, transactionId, remarks } = req.body;

    // Verify this student belongs to the parent
    const parent = await Parent.findById(req.user._id);
    if (!parent || !parent.students.map(s => s.toString()).includes(studentId))
      return res.status(403).json({ success: false, message: "This student is not linked to your account." });

    if (!paidAmount || parseFloat(paidAmount) <= 0)
      return res.status(400).json({ success: false, message: "Valid payment amount is required." });

    const paid = parseFloat(paidAmount);
    let payDoc;

    if (feePaymentId) {
      payDoc = await FeePayment.findOne({ _id: feePaymentId, student: studentId });
      if (!payDoc) return res.status(404).json({ success: false, message: "Fee record not found." });

      const newPaid   = Math.min((payDoc.paidAmount || 0) + paid, payDoc.amount);
      const newStatus = newPaid >= payDoc.amount ? "paid" : "partial";
      payDoc.paidAmount  = newPaid;
      payDoc.status      = newStatus;
      payDoc.paymentMode = paymentMode || "online";
      payDoc.remarks     = [transactionId, remarks].filter(Boolean).join(" | ") || payDoc.remarks;
      if (newStatus === "paid") { payDoc.paidDate = new Date(); payDoc.receiptNo = await genReceipt(); }
      await payDoc.save();

    } else if (feeStructureId) {
      const stuForSchool = await Student.findById(studentId).select("school");
      const schoolId = stuForSchool?.school || req.schoolId;
      const structure = await FeeStructure.findOne({ _id: feeStructureId, school: schoolId });
      if (!structure) return res.status(404).json({ success: false, message: "Fee structure not found." });

      const total  = structure.amount;
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
      payDoc = await FeePayment.create({
        school: schoolId, student: studentId, feeStructure: feeStructureId,
        title: structure.title, amount: total, paidAmount: Math.min(paid, total),
        dueDate: structure.dueDate, status, paymentMode: paymentMode || "online",
        remarks: [transactionId, remarks].filter(Boolean).join(" | ") || "",
        receiptNo: status === "paid" ? await genReceipt() : null,
        paidDate: status === "paid" ? new Date() : null,
      });
    } else {
      return res.status(400).json({ success: false, message: "Either feePaymentId or feeStructureId is required." });
    }

    if (payDoc.status === "paid") await Student.findByIdAndUpdate(studentId, { $inc: { points: 5 } });

    const populated = await populatePayment(FeePayment.findById(payDoc._id));
    res.json({ success: true, message: "Payment submitted successfully.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getPendingFees = async (req, res) => {
  try {
    const fees = await populatePayment(
      FeePayment.find({ school: req.schoolId, status: { $in: ["pending","partial","overdue"] } })
        .sort({ dueDate: 1 })
    );
    res.json({ success: true, count: fees.length, data: fees });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getFeeAnalytics = async (req, res) => {
  try {
    const year  = parseInt(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end   = new Date(year, 11, 31, 23, 59, 59);
    const fees  = await FeePayment.find({ school: req.schoolId, createdAt: { $gte: start, $lte: end } });

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const data = months.map(m => ({ month: m, collected: 0, pending: 0 }));

    fees.forEach(f => {
      const idx = new Date(f.createdAt).getMonth();
      if (f.status === "paid")   data[idx].collected += f.paidAmount;
      else                       data[idx].pending   += (f.amount - f.paidAmount);
    });

    // Summary totals
    const totalCollected = fees.filter(f => f.status === "paid").reduce((s, f) => s + f.paidAmount, 0);
    const totalPending   = fees.filter(f => f.status !== "paid").reduce((s, f) => s + (f.amount - f.paidAmount), 0);

    res.json({ success: true, data, summary: { totalCollected, totalPending, year } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ── CONCESSIONS ───────────────────────────────────────────────────────────────
const populateCon = (q) =>
  q.populate("student",      "name studentId class section rollNumber")
   .populate("feeStructure", "title class amount");

exports.getConcessions = async (req, res) => {
  try {
    const data = await populateCon(Concession.find({ school: req.schoolId }).sort({ createdAt: -1 }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createConcession = async (req, res) => {
  try {
    const { student, feeStructure, type, value, isPct, description } = req.body;
    if (!student || value === undefined)
      return res.status(400).json({ success: false, message: "student and value are required." });
    const con = await Concession.create({
      school: req.schoolId, student,
      feeStructure: feeStructure || null,
      type: type || "Custom", value, isPct: isPct !== false,
      description: description || "",
    });
    const populated = await populateCon(Concession.findById(con._id));
    res.status(201).json({ success: true, message: "Concession added.", data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateConcession = async (req, res) => {
  try {
    const { type, value, isPct, description, feeStructure } = req.body;
    const update = {};
    if (type        !== undefined) update.type        = type;
    if (value       !== undefined) update.value       = value;
    if (isPct       !== undefined) update.isPct       = isPct;
    if (description !== undefined) update.description = description;
    if (feeStructure!== undefined) update.feeStructure= feeStructure || null;

    const con = await populateCon(
      Concession.findOneAndUpdate({ _id: req.params.id, school: req.schoolId }, update, { new: true })
    );
    if (!con) return res.status(404).json({ success: false, message: "Concession not found." });
    res.json({ success: true, message: "Concession updated.", data: con });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteConcession = async (req, res) => {
  try {
    const con = await Concession.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!con) return res.status(404).json({ success: false, message: "Concession not found." });
    res.json({ success: true, message: "Concession deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
