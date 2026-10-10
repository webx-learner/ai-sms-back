const jwt      = require("jsonwebtoken");
const Admin    = require("../models/Admin");
const Teacher  = require("../models/Teacher");
const Student  = require("../models/Student");
const Parent   = require("../models/Parent");
const Message  = require("../models/Message");
const Conversation = require("../models/Conversation");

const roleModelMap = { schooladmin: Admin, teacher: Teacher, student: Student, parent: Parent };

// Map: userId → Set of socket IDs (one user can have multiple tabs)
const onlineUsers = new Map();

module.exports = (io) => {

  // ── AUTHENTICATE SOCKET ────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
      const Model = roleModelMap[decoded.role];
      if (!Model) return next(new Error("Invalid role"));

      const user = await Model.findById(decoded.id).select("-password");
      if (!user || !user.isActive) return next(new Error("User not found or inactive"));

      socket.user     = user;
      socket.userRole = decoded.role;
      socket.schoolId = (decoded.schoolId || user.school || user._id).toString();
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ── CONNECTION ─────────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId   = socket.user._id.toString();
    const schoolId = socket.schoolId;

    console.log(`[Chat] Connected: ${socket.user.name} (${socket.userRole}) — socket ${socket.id}`);

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Join school room (scopes all events to same school)
    socket.join(`school:${schoolId}`);
    // Join personal room (for direct delivery)
    socket.join(`user:${userId}`);

    // Broadcast online status to school
    io.to(`school:${schoolId}`).emit("user:online", { userId });

    // ── JOIN CONVERSATION ROOM ─────────────────────────────
    socket.on("chat:join", async ({ conversationId }) => {
      try {
        const conv = await Conversation.findOne({
          _id: conversationId,
          "participants.userId": socket.user._id,
        });
        if (!conv) return socket.emit("error", { message: "Conversation not found" });

        socket.join(`conv:${conversationId}`);
        socket.emit("chat:joined", { conversationId });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── LEAVE CONVERSATION ROOM ────────────────────────────
    socket.on("chat:leave", ({ conversationId }) => {
      socket.leave(`conv:${conversationId}`);
    });

    // ── SEND MESSAGE (real-time) ───────────────────────────
    socket.on("chat:send", async ({ conversationId, text }, ack) => {
      try {
        if (!text || !text.trim()) {
          if (ack) ack({ success: false, error: "Empty message" });
          return;
        }

        // Verify conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          school: schoolId,
          "participants.userId": socket.user._id,
        });
        if (!conversation) {
          if (ack) ack({ success: false, error: "Conversation not found" });
          return;
        }

        // Save to DB
        const message = await Message.create({
          conversation: conversationId,
          sender: socket.user._id,
          senderRole: socket.userRole,
          senderName: socket.user.name,
          text: text.trim(),
          school: schoolId,
        });

        // Find the other participant
        const otherParticipant = conversation.participants.find(
          p => p.userId.toString() !== userId
        );
        const otherParticipantIndex = conversation.participants.findIndex(
          p => p.userId.toString() !== userId
        );

        // Update conversation
        const updateQuery = {
          $set: {
            lastMessage: text.trim(),
            lastMessageAt: new Date(),
            lastSenderId: socket.user._id,
          },
        };
        // Increment unread only if other participant is not in this conversation room
        const otherIsOnline = otherParticipant && onlineUsers.has(otherParticipant.userId.toString());
        if (otherParticipant && !otherIsOnline) {
          updateQuery.$inc = {
            [`participants.${otherParticipantIndex}.unread`]: 1,
          };
        }

        await Conversation.updateOne({ _id: conversationId }, updateQuery);

        const payload = {
          id: message._id,
          conversationId,
          sender: userId,
          senderRole: socket.userRole,
          senderName: socket.user.name,
          text: text.trim(),
          read: false,
          createdAt: message.createdAt,
        };

        // Emit to ALL in conversation room (sender + receiver)
        io.to(`conv:${conversationId}`).emit("chat:message", payload);

        // Also notify other participant's personal room if not in conv room
        if (otherParticipant) {
          io.to(`user:${otherParticipant.userId}`).emit("chat:notification", {
            conversationId,
            fromUserId: socket.user._id.toString(),
            from: socket.user.name,
            fromRole: socket.userRole,
            text: text.trim(),
            time: message.createdAt,
          });
        }

        // Acknowledge sender
        if (ack) ack({ success: true, message: payload });

      } catch (err) {
        console.error("[Chat] send error:", err.message);
        if (ack) ack({ success: false, error: err.message });
      }
    });

    // ── TYPING INDICATOR ──────────────────────────────────
    socket.on("chat:typing", ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit("chat:typing", {
        conversationId,
        userId,
        name: socket.user.name,
      });
    });

    socket.on("chat:stopTyping", ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit("chat:stopTyping", {
        conversationId,
        userId,
      });
    });

    // ── MARK READ ─────────────────────────────────────────
    socket.on("chat:markRead", async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversation: conversationId, sender: { $ne: socket.user._id }, read: false },
          { $set: { read: true, readAt: new Date() } }
        );
        await Conversation.updateOne(
          { _id: conversationId, "participants.userId": socket.user._id },
          { $set: { "participants.$.unread": 0 } }
        );
        // Tell the sender their messages were read
        io.to(`conv:${conversationId}`).emit("chat:read", { conversationId, readBy: userId });
      } catch (err) {
        console.error("[Chat] markRead error:", err.message);
      }
    });

    // ── DISCONNECT ────────────────────────────────────────
    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.to(`school:${schoolId}`).emit("user:offline", { userId });
        }
      }
      console.log(`[Chat] Disconnected: ${socket.user.name} — socket ${socket.id}`);
    });
  });

  // Expose helper
  io.getOnlineUsers = () => [...onlineUsers.keys()];
};
