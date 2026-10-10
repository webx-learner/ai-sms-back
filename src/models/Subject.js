const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    code:        { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, default: "", trim: true },
    school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { timestamps: true }
);

// No two subjects in the same school can share a code
subjectSchema.index({ school: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Subject", subjectSchema);
