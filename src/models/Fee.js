const mongoose = require("mongoose");

const feeStructureSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  class:       { type: String, required: true },
  title:       { type: String, required: true },
  amount:      { type: Number, required: true },
  dueDate:     { type: Date, required: true },
  frequency:   { type: String, enum: ["monthly","quarterly","yearly","one-time"], default: "monthly" },
  description: { type: String, default: "" },
  academicYear:{ type: String, default: "" },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

const feePaymentSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  feeStructure:{ type: mongoose.Schema.Types.ObjectId, ref: "FeeStructure", default: null },
  title:       { type: String, required: true },
  amount:      { type: Number, required: true },
  paidAmount:  { type: Number, default: 0 },
  dueDate:     { type: Date },
  paidDate:    { type: Date, default: null },
  status:      { type: String, enum: ["paid","pending","partial","overdue"], default: "pending" },
  paymentMode: { type: String, enum: ["cash","online","cheque","dd"], default: "cash" },
  receiptNo:   { type: String, unique: true, sparse: true },
  remarks:     { type: String, default: "" },
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
}, { timestamps: true });

feePaymentSchema.pre("save", async function (next) {
  if (!this.receiptNo && this.status === "paid") {
    const count = await mongoose.model("FeePayment").countDocuments();
    this.receiptNo = "RCP-" + Date.now() + "-" + String(count + 1).padStart(4, "0");
  }
  next();
});

const concessionSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin",        required: true },
  student:      { type: mongoose.Schema.Types.ObjectId, ref: "Student",      required: true },
  feeStructure: { type: mongoose.Schema.Types.ObjectId, ref: "FeeStructure", default: null },
  type:         { type: String, enum: ["Sibling","Merit","SC/ST","Staff Ward","Custom"], default: "Custom" },
  value:        { type: Number, required: true, min: 0 },
  isPct:        { type: Boolean, default: true },
  description:  { type: String, default: "" },
}, { timestamps: true });

exports.FeeStructure = mongoose.model("FeeStructure", feeStructureSchema);
exports.FeePayment   = mongoose.model("FeePayment",   feePaymentSchema);
exports.Concession   = mongoose.model("Concession",   concessionSchema);
