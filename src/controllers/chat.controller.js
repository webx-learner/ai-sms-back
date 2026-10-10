const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const Teacher      = require("../models/Teacher");
const Student      = require("../models/Student");
const Admin        = require("../models/Admin");
const Class        = require("../models/Class");
const Parent       = require("../models/Parent");

// ── Helper: enrich contact list with existing conversation data ──
async function enrichWithConversations(contacts, userId, schoolId) {
  return Promise.all(
    contacts.map(async (c) => {
      try {
        const conv = await Conversation.findOne({
          school: schoolId,
          "participants.userId": { $all: [userId, c.id] },
        });
        if (conv) {
          const me = conv.participants.find(
            (p) => p.userId.toString() === userId.toString()
          );
          return {
            ...c,
            conversationId: conv._id,
            lastMessage: conv.lastMessage || "",
            time: conv.lastMessageAt || null,
            unread: me ? me.unread : 0,
          };
        }
      } catch {}
      return { ...c, conversationId: null, lastMessage: "", time: null, unread: 0 };
    })
  );
}

// ── GET CHAT CONTACTS ─────────────────────────────────────────────
// Student  → class teachers + admin
// Teacher  → students from assigned classes + admin
// Admin    → all teachers + all students
exports.getContacts = async (req, res) => {
  try {
    const { user, userRole, schoolId } = req;
    let contacts = [];

    if (userRole === "student") {
      const myClass   = (user.class   || "").trim();
      const mySection = (user.section || "").trim().toUpperCase();

      let teachers = [];

      if (myClass) {
        // Primary: Class document lookup (section normalised to uppercase)
        const classQuery = { school: schoolId, name: myClass };
        if (mySection) classQuery.section = mySection;
        const matchingClasses = await Class.find(classQuery).select("_id");
        const classIds = matchingClasses.map((c) => c._id);

        if (classIds.length > 0) {
          teachers = await Teacher.find({
            school: schoolId,
            isActive: true,
            assignedClasses: { $in: classIds },
          }).select("name email subjects designation photo");
        }

        // Fallback: populate assignedClasses and filter by name (handles name-format mismatches)
        if (teachers.length === 0) {
          const allTeachers = await Teacher.find({ school: schoolId, isActive: true })
            .populate("assignedClasses", "name section")
            .select("name email subjects designation photo assignedClasses");

          teachers = allTeachers.filter((t) =>
            (t.assignedClasses || []).some((c) => {
              if (!c || !c.name) return false;
              const nameMatch = c.name.trim().toLowerCase() === myClass.toLowerCase();
              const sectionMatch = !mySection || (c.section || "").trim().toUpperCase() === mySection;
              return nameMatch && sectionMatch;
            })
          );
        }
      }

      // Always include the student's directly-assigned classTeacher (if set and not already listed)
      if (user.classTeacher) {
        const alreadyListed = teachers.some(
          (t) => t._id.toString() === user.classTeacher.toString()
        );
        if (!alreadyListed) {
          const ct = await Teacher.findOne({
            _id: user.classTeacher,
            school: schoolId,
            isActive: true,
          }).select("name email subjects designation photo");
          if (ct) teachers.push(ct);
        }
      }

      const admin = await Admin.findById(schoolId).select("name schoolName");

      contacts = [
        ...(admin
          ? [{ id: admin._id, name: admin.name || admin.schoolName || "Admin", role: "schooladmin", subtitle: "School Admin", avatar: "" }]
          : []),
        ...teachers.map((t) => ({
          id: t._id,
          name: t.name,
          role: "teacher",
          subtitle: t.designation || "Teacher",
          avatar: t.photo || "",
        })),
      ];

    } else if (userRole === "teacher") {
      // Populate teacher's assignedClasses to get name + section
      const teacherDoc = await Teacher.findById(user._id)
        .populate("assignedClasses", "name section");
      const assignedClasses = teacherDoc?.assignedClasses || [];

      let students = [];
      if (assignedClasses.length > 0) {
        const classFilters = assignedClasses.map((cls) => ({
          class: cls.name,
          section: cls.section || "",
        }));
        students = await Student.find({
          school: schoolId,
          isActive: true,
          $or: classFilters,
        }).select("name studentId class section photo");
      }

      const admin = await Admin.findById(schoolId).select("name schoolName");

      contacts = [
        ...(admin
          ? [{ id: admin._id, name: admin.name || admin.schoolName || "Admin", role: "schooladmin", subtitle: "School Admin", avatar: "" }]
          : []),
        ...students.map((s) => ({
          id: s._id,
          name: s.name,
          role: "student",
          subtitle: `Class ${s.class}${s.section ? "-" + s.section : ""}`,
          avatar: s.photo || "",
        })),
      ];

    } else if (userRole === "schooladmin") {
      const [teachers, students] = await Promise.all([
        Teacher.find({ school: schoolId, isActive: true }).select("name subjects designation photo"),
        Student.find({ school: schoolId, isActive: true }).select("name studentId class section photo"),
      ]);

      contacts = [
        ...teachers.map((t) => ({
          id: t._id,
          name: t.name,
          role: "teacher",
          subtitle: t.designation || "Teacher",
          avatar: t.photo || "",
        })),
        ...students.map((s) => ({
          id: s._id,
          name: s.name,
          role: "student",
          subtitle: `Class ${s.class}${s.section ? "-" + s.section : ""}`,
          avatar: s.photo || "",
        })),
      ];

    } else if (userRole === "parent") {
      const parentDoc = await Parent.findById(user._id)
        .populate("students", "class section classTeacher school");

      // Collect class teacher IDs from all children
      const teacherIdSet = new Set();
      for (const stu of parentDoc?.students || []) {
        if (stu.classTeacher) teacherIdSet.add(stu.classTeacher.toString());
      }

      const [admin, teachers] = await Promise.all([
        Admin.findById(schoolId).select("name schoolName"),
        teacherIdSet.size > 0
          ? Teacher.find({ _id: { $in: [...teacherIdSet] }, school: schoolId, isActive: true })
              .select("name email designation photo")
          : Promise.resolve([]),
      ]);

      contacts = [
        ...(admin
          ? [{ id: admin._id, name: admin.name || admin.schoolName || "Admin", role: "schooladmin", subtitle: "School Admin", avatar: "" }]
          : []),
        ...teachers.map((t) => ({
          id: t._id,
          name: t.name,
          role: "teacher",
          subtitle: t.designation || "Teacher",
          avatar: t.photo || "",
        })),
      ];
    }

    // Enrich every contact with conversation meta (conversationId, lastMessage, unread, time)
    contacts = await enrichWithConversations(contacts, user._id, schoolId);

    // Sort: contacts with recent messages first, then alphabetically
    contacts.sort((a, b) => {
      if (a.time && b.time) return new Date(b.time) - new Date(a.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET OR CREATE CONVERSATION ────────────────────────────────────
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { user, userRole, schoolId } = req;
    const { targetUserId, targetRole } = req.body;

    if (!targetUserId || !targetRole)
      return res.status(400).json({ success: false, message: "targetUserId and targetRole required." });

    // Students can only start conversations with their class teachers or admin
    if (userRole === "student" && targetRole === "teacher") {
      const myClass   = (user.class   || "").trim();
      const mySection = (user.section || "").trim().toUpperCase();

      const classQuery = { school: schoolId, name: myClass };
      if (mySection) classQuery.section = mySection;
      const matchingClasses = await Class.find(classQuery).select("_id");
      const classIds = matchingClasses.map((c) => c._id.toString());

      const targetTeacher = await Teacher.findOne({ _id: targetUserId, school: schoolId })
        .populate("assignedClasses", "name section");

      if (!targetTeacher)
        return res.status(404).json({ success: false, message: "Teacher not found." });

      const isDirectClassTeacher = user.classTeacher &&
        user.classTeacher.toString() === targetUserId.toString();

      const isAssignedTeacher =
        classIds.length > 0
          ? targetTeacher.assignedClasses.some((c) => classIds.includes(c._id?.toString()))
          : targetTeacher.assignedClasses.some((c) => {
              if (!c || !c.name) return false;
              return c.name.trim().toLowerCase() === myClass.toLowerCase() &&
                (!mySection || (c.section || "").toUpperCase() === mySection);
            });

      if (!isDirectClassTeacher && !isAssignedTeacher)
        return res.status(403).json({ success: false, message: "You can only chat with teachers assigned to your class." });
    }

    let conversation = await Conversation.findOne({
      school: schoolId,
      "participants.userId": { $all: [user._id, targetUserId] },
    });

    if (!conversation) {
      let TargetModel;
      if (targetRole === "teacher")         TargetModel = Teacher;
      else if (targetRole === "student")    TargetModel = Student;
      else if (targetRole === "schooladmin") TargetModel = Admin;
      else if (targetRole === "parent")     TargetModel = Parent;
      else return res.status(400).json({ success: false, message: "Invalid targetRole." });

      const targetUser = await TargetModel.findById(targetUserId).select("name");
      if (!targetUser)
        return res.status(404).json({ success: false, message: "Target user not found." });

      conversation = await Conversation.create({
        school: schoolId,
        participants: [
          { userId: user._id,    role: userRole,    name: user.name,        unread: 0 },
          { userId: targetUserId, role: targetRole, name: targetUser.name,  unread: 0 },
        ],
        lastMessage: "",
        lastMessageAt: new Date(),
      });
    }

    res.json({ success: true, conversationId: conversation._id, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MY CONVERSATIONS LIST ─────────────────────────────────────
exports.getConversations = async (req, res) => {
  try {
    const { user, schoolId } = req;

    const conversations = await Conversation.find({
      school: schoolId,
      "participants.userId": user._id,
    }).sort({ lastMessageAt: -1 });

    const result = conversations.map((conv) => {
      const me    = conv.participants.find((p) => p.userId.toString() === user._id.toString());
      const other = conv.participants.find((p) => p.userId.toString() !== user._id.toString());
      return {
        id:            conv._id,
        conversationId: conv._id,
        name:          other ? other.name : "Unknown",
        role:          other ? other.role : "",
        lastMessage:   conv.lastMessage,
        time:          conv.lastMessageAt,
        unread:        me ? me.unread : 0,
        targetUserId:  other ? other.userId : null,
        targetRole:    other ? other.role : null,
      };
    });

    res.json({ success: true, conversations: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MESSAGES IN A CONVERSATION ────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { user, schoolId } = req;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      "participants.userId": user._id,
    });
    if (!conversation)
      return res.status(404).json({ success: false, message: "Conversation not found." });

    const messages = await Message.find({ conversation: conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Mark received messages as read
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: user._id }, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    // Reset unread counter for this participant
    await Conversation.updateOne(
      { _id: conversationId, "participants.userId": user._id },
      { $set: { "participants.$.unread": 0 } }
    );

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SEND MESSAGE (REST fallback — socket is primary) ──────────────
exports.sendMessage = async (req, res) => {
  try {
    const { user, userRole, schoolId } = req;
    const { conversationId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim())
      return res.status(400).json({ success: false, message: "Message text required." });

    const conversation = await Conversation.findOne({
      _id: conversationId,
      school: schoolId,
      "participants.userId": user._id,
    });
    if (!conversation)
      return res.status(404).json({ success: false, message: "Conversation not found." });

    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      senderRole: userRole,
      senderName: user.name,
      text: text.trim(),
      school: schoolId,
    });

    const otherParticipant = conversation.participants.find(
      (p) => p.userId.toString() !== user._id.toString()
    );
    const otherIndex = conversation.participants.findIndex(
      (p) => p.userId.toString() !== user._id.toString()
    );

    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: { lastMessage: text.trim(), lastMessageAt: new Date(), lastSenderId: user._id },
        ...(otherParticipant && {
          $inc: { [`participants.${otherIndex}.unread`]: 1 },
        }),
      }
    );

    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET UNREAD COUNT (per-conversation) ───────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const { user, schoolId } = req;

    const conversations = await Conversation.find({
      school: schoolId,
      "participants.userId": user._id,
    });

    const unread = [];
    conversations.forEach((conv) => {
      const me = conv.participants.find((p) => p.userId.toString() === user._id.toString());
      if (me && me.unread > 0) {
        unread.push({ conversationId: conv._id.toString(), count: me.unread });
      }
    });

    res.json({ success: true, unread });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE MESSAGE (own message only) ────────────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const { user } = req;
    const { messageId } = req.params;

    const msg = await Message.findOne({ _id: messageId, sender: user._id });
    if (!msg) return res.status(404).json({ success: false, message: "Message not found." });

    await msg.deleteOne();
    res.json({ success: true, message: "Message deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
