const Event = require("../models/Event");

exports.createEvent = async (req, res) => {
  try {
    const event = await Event.create({ school: req.schoolId, createdBy: req.user._id, ...req.body });
    res.status(201).json({ success: true, message: "Event created.", data: event });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getEvents = async (req, res) => {
  try {
    const { month, year, eventType } = req.query;
    const query = { school: req.schoolId, isPublic: true };
    if (eventType) query.eventType = eventType;
    if (month && year) {
      query.startDate = { $gte: new Date(year, month - 1, 1), $lte: new Date(year, month, 0) };
    }
    const events = await Event.find(query).sort({ startDate: 1 });
    res.json({ success: true, data: events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const events = await Event.find({ school: req.schoolId, startDate: { $gte: new Date() }, isPublic: true })
      .sort({ startDate: 1 }).limit(5);
    res.json({ success: true, data: events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteEvent = async (req, res) => {
  try {
    await Event.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    res.json({ success: true, message: "Event deleted." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
