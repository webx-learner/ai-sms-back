const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema({
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true, unique: true },
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin",   required: true },
  permissions: [{ type: String }],
  assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  updatedAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.model("Permission", permissionSchema);
