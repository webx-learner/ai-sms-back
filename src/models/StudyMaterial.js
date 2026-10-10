const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema({
  school:        { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:         { type: String, required: true, trim: true },
  description:   { type: String, default: "" },
  subject:       { type: String, required: true, trim: true },
  class:         { type: String, required: true },    // matches Student.class e.g. "10"
  section:       { type: String, default: "" },       // "" means all sections
  type:          { type: String, enum: ["pdf", "notes", "paper", "worksheet"], default: "pdf" },
  fileUrl:       { type: String, required: true },
  filePublicId:  { type: String, default: "" },
  fileName:      { type: String, default: "" },
  uploadedBy:    { type: mongoose.Schema.Types.ObjectId, refPath: "uploaderModel" },
  uploaderModel: { type: String, enum: ["Teacher", "Admin"], default: "Teacher" },
  uploaderName:  { type: String, default: "" },
  downloads:     { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);
