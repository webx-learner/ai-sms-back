const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema({
  schoolName:    { type: String, required: true, trim: true },
  schoolCode:    { type: String, unique: true },
  schoolAddress: { type: String, default: "" },
  schoolPhone:   { type: String, default: "" },
  schoolEmail:   { type: String, default: "" },
  website:       { type: String, default: "" },
  logo:          { type: String, default: "" },
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  password:      { type: String, required: true, minlength: 6 },
  phone:         { type: String, default: "" },
  role:          { type: String, enum: ["schooladmin"], default: "schooladmin" },
  isActive:      { type: Boolean, default: true },
  isVerified:    { type: Boolean, default: false },
  otp:           { type: String, default: null },
  otpExpire:     { type: Date, default: null },
  resetOTP:      { type: String, default: null },
  resetOTPExpire:{ type: Date, default: null },
}, { timestamps: true });

adminSchema.pre("save", async function (next) {
  if (!this.schoolCode) {
    const count = await mongoose.model("Admin").countDocuments();
    const year = new Date().getFullYear();
    this.schoolCode = "SCH-" + year + "-" + String(count + 1).padStart(4, "0");
  }
  next();
});

adminSchema.methods.comparePassword = function (p) { return bcrypt.compare(p, this.password); };
module.exports = mongoose.model("Admin", adminSchema);
