const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  title:       { type: String, required: true },
  author:      { type: String, required: true },
  isbn:        { type: String, default: "" },
  category:    { type: String, default: "" },
  publisher:   { type: String, default: "" },
  totalCopies: { type: Number, default: 1 },
  availableCopies:{ type: Number, default: 1 },
  shelfNumber: { type: String, default: "" },
  publishYear: { type: Number, default: null },
}, { timestamps: true });

const bookIssueSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  book:        { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  issuedTo:    { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "issuedToModel" },
  issuedToModel:{ type: String, enum: ["Student","Teacher"], required: true },
  issueDate:   { type: Date, default: Date.now },
  dueDate:     { type: Date, required: true },
  returnDate:  { type: Date, default: null },
  status:      { type: String, enum: ["issued","returned","overdue"], default: "issued" },
  fine:        { type: Number, default: 0 },
  issuedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
}, { timestamps: true });

exports.Book      = mongoose.model("Book", bookSchema);
exports.BookIssue = mongoose.model("BookIssue", bookIssueSchema);
