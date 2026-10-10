const SchoolPeriod = require("../models/SchoolPeriod");

// Re-compute periodNumber for all non-break periods in order
async function recomputePeriodNumbers(schoolId) {
  const all = await SchoolPeriod.find({ school: schoolId }).sort({ order: 1 });
  let num = 1;
  for (const p of all) {
    if (!p.isBreak) {
      p.periodNumber = num++;
    } else {
      p.periodNumber = null;
    }
    await p.save();
  }
}

// GET /api/periods → all periods for this school sorted by order
exports.getPeriods = async (req, res) => {
  try {
    const periods = await SchoolPeriod.find({ school: req.schoolId }).sort({ order: 1 });
    res.json({ success: true, data: periods });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/periods → add a new period row
// Body: { label, startTime, endTime, isBreak }
exports.addPeriod = async (req, res) => {
  try {
    const { label, startTime, endTime, isBreak } = req.body;
    if (!label || !startTime || !endTime)
      return res.status(400).json({ success: false, message: "label, startTime, endTime required." });

    // Append at the end
    const last = await SchoolPeriod.findOne({ school: req.schoolId }).sort({ order: -1 });
    const order = last ? last.order + 1 : 1;

    const period = await SchoolPeriod.create({
      school: req.schoolId,
      label:  label.trim(),
      startTime,
      endTime,
      isBreak: !!isBreak,
      order,
    });

    await recomputePeriodNumbers(req.schoolId);

    const updated = await SchoolPeriod.findById(period._id);
    res.status(201).json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/periods/:id → update label / times
// Body: { label, startTime, endTime, isBreak, order }
exports.updatePeriod = async (req, res) => {
  try {
    const { label, startTime, endTime, isBreak, order } = req.body;
    const period = await SchoolPeriod.findOne({ _id: req.params.id, school: req.schoolId });
    if (!period) return res.status(404).json({ success: false, message: "Period not found." });

    if (label     !== undefined) period.label     = label.trim();
    if (startTime !== undefined) period.startTime = startTime;
    if (endTime   !== undefined) period.endTime   = endTime;
    if (isBreak   !== undefined) period.isBreak   = !!isBreak;
    if (order     !== undefined) period.order     = Number(order);

    await period.save();
    await recomputePeriodNumbers(req.schoolId);

    const updated = await SchoolPeriod.findById(period._id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/periods/:id → remove a period row
exports.deletePeriod = async (req, res) => {
  try {
    const period = await SchoolPeriod.findOne({ _id: req.params.id, school: req.schoolId });
    if (!period) return res.status(404).json({ success: false, message: "Period not found." });

    await period.deleteOne();
    await recomputePeriodNumbers(req.schoolId);

    res.json({ success: true, message: "Period deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
