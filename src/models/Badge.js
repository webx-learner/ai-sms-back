const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  name:        { type: String, required: true },
  description: { type: String, required: true },
  icon:        { type: String, default: "trophy" },
  color:       { type: String, default: "#FFD700" },
  criteria:    { type: String, default: "" },
  points:      { type: Number, default: 10 },
}, { timestamps: true });

const userBadgeSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  badge:        { type: mongoose.Schema.Types.ObjectId, ref: "Badge", required: true },
  awardedTo:    { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "awardedToModel" },
  awardedToModel:{ type: String, enum: ["Student","Teacher"], required: true },
  awardedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
  awardedByAdmin:{ type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  reason:       { type: String, default: "" },
  awardedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

const challengeSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  class:       { type: String, required: true },
  section:     { type: String, default: "" },
  question:    { type: String, required: true },
  answer:      { type: String, required: true },
  subject:     { type: String, default: "" },
  points:      { type: Number, default: 5 },
  postedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  responses: [{
    student:     { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    answer:      { type: String },
    isCorrect:   { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
    pointsEarned:{ type: Number, default: 0 },
  }],
  expiresAt:   { type: Date, required: true },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

exports.Badge      = mongoose.model("Badge", badgeSchema);
exports.UserBadge  = mongoose.model("UserBadge", userBadgeSchema);
exports.Challenge  = mongoose.model("Challenge", challengeSchema);
