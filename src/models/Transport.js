const mongoose = require("mongoose");

const busRouteSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  routeName:   { type: String, required: true },
  routeNumber: { type: String, required: true },
  driverName:  { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  vehicleNo:   { type: String, default: "" },
  stops:       [{ stopName: String, timing: String, fare: Number }],
  students:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("BusRoute", busRouteSchema);
