const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const parentSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  password:      { type: String, required: true, minlength: 6 },
  phone:         { type: String, default: "" },
  alternatePhone:{ type: String, default: "" },
  address:       { type: String, default: "" },
  occupation:    { type: String, default: "" },
  relation:      { type: String, enum: ["father","mother","guardian"], default: "father" },
  school:        { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  students:      [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  role:          { type: String, enum: ["parent"], default: "parent" },
  isActive:      { type: Boolean, default: true },
  resetOTP:      { type: String, default: null },
  resetOTPExpire:{ type: Date, default: null },
}, { timestamps: true });

parentSchema.methods.comparePassword = function (p) { return bcrypt.compare(p, this.password); };
module.exports = mongoose.model("Parent", parentSchema);
