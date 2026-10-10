const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const {
  getContacts,
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  getUnreadCount,
  deleteMessage,
} = require("../controllers/chat.controller");

// All routes require authentication
router.use(protect);

// GET  /api/chat/contacts            → Get chat-eligible contacts for current user
router.get("/contacts", getContacts);

// GET  /api/chat/conversations       → List my conversations
router.get("/conversations", getConversations);

// POST /api/chat/conversations       → Get or create conversation with someone
router.post("/conversations", getOrCreateConversation);

// GET  /api/chat/conversations/:id/messages   → Get messages in conversation
router.get("/conversations/:conversationId/messages", getMessages);

// POST /api/chat/conversations/:id/messages   → Send message (REST fallback)
router.post("/conversations/:conversationId/messages", sendMessage);

// GET  /api/chat/unread              → Total unread count
router.get("/unread", getUnreadCount);

// DELETE /api/chat/messages/:id      → Delete own message
router.delete("/messages/:messageId", deleteMessage);

module.exports = router;
