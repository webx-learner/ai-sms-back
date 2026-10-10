const mongoose = require("mongoose");

const schoolPeriodSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  label:        { type: String, required: true, trim: true },   // "Period 1", "Break", "Lunch"
  startTime:    { type: String, required: true },               // "8:00"
  endTime:      { type: String, required: true },               // "8:45"
  isBreak:      { type: Boolean, default: false },
  periodNumber: { type: Number, default: null },                // 1-N for actual periods, null for breaks
  order:        { type: Number, required: true },               // display order in grid (1,2,3...)
}, { timestamps: true });

schoolPeriodSchema.index({ school: 1, order: 1 });

module.exports = mongoose.model("SchoolPeriod", schoolPeriodSchema);
