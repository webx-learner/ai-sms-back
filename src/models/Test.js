const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin",   required: true },
    title:       { type: String, required: true, trim: true },
    classId:     { type: mongoose.Schema.Types.ObjectId, ref: "Class",   required: true },
    subjectId:   { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    date:        { type: Date, required: true },
    totalMarks:  { type: Number, required: true, min: 1 },
    duration:    { type: Number, required: true, min: 1 }, // minutes
    description: { type: String, default: "" },
    status:      { type: String, enum: ["upcoming", "completed", "cancelled"], default: "upcoming" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Test", testSchema);
