const { Book, BookIssue } = require("../models/Library");

exports.addBook = async (req, res) => {
  try {
    const book = await Book.create({ school: req.schoolId, ...req.body });
    res.status(201).json({ success: true, message: "Book added.", data: book });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getBooks = async (req, res) => {
  try {
    const { search, category } = req.query;
    const query = { school: req.schoolId };
    if (category) query.category = category;
    if (search) query.$or = [{ title: { $regex: search, $options: "i" } }, { author: { $regex: search, $options: "i" } }, { isbn: { $regex: search, $options: "i" } }];
    const books = await Book.find(query).sort({ title: 1 });
    res.json({ success: true, data: books });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.issueBook = async (req, res) => {
  try {
    const { bookId, issuedTo, issuedToModel, dueDate } = req.body;
    const book = await Book.findOne({ _id: bookId, school: req.schoolId });
    if (!book || book.availableCopies < 1) return res.status(400).json({ success: false, message: "Book not available." });
    book.availableCopies -= 1; await book.save();
    const issue = await BookIssue.create({ school: req.schoolId, book: bookId, issuedTo, issuedToModel, dueDate, issuedBy: req.user._id });
    res.status(201).json({ success: true, message: "Book issued.", data: issue });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.returnBook = async (req, res) => {
  try {
    const issue = await BookIssue.findOne({ _id: req.params.id, school: req.schoolId });
    if (!issue) return res.status(404).json({ success: false, message: "Issue record not found." });
    const daysLate = Math.max(0, Math.floor((new Date() - new Date(issue.dueDate)) / (1000 * 60 * 60 * 24)));
    const fine = daysLate * 2;
    issue.returnDate = new Date(); issue.status = "returned"; issue.fine = fine;
    await issue.save();
    await Book.findByIdAndUpdate(issue.book, { $inc: { availableCopies: 1 } });
    res.json({ success: true, message: "Book returned.", fine: fine > 0 ? "Fine: Rs." + fine : "No fine." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getIssuedBooks = async (req, res) => {
  try {
    const issues = await BookIssue.find({ school: req.schoolId, status: "issued" })
      .populate("book", "title author isbn").sort({ dueDate: 1 });
    const overdue = issues.filter(i => new Date(i.dueDate) < new Date());
    res.json({ success: true, data: issues, overdueCount: overdue.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
