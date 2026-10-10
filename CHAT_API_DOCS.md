# Chat System - API Documentation

## New Files Added

```
src/
  models/
    Message.js          ← Chat message MongoDB model
    Conversation.js     ← Conversation (chat thread) model
  controllers/
    chat.controller.js  ← All chat REST API logic
  routes/
    chat.routes.js      ← Chat REST routes
  socket/
    chatSocket.js       ← Socket.io real-time handler
```

---

## REST API Endpoints

All routes require `Authorization: Bearer <token>` header.

### GET /api/chat/contacts
Get list of users the current user can chat with.
- **Student** → Teachers assigned to their class
- **Teacher** → Students in their classes + Admin
- **Admin**   → All teachers + all students

Response:
```json
{
  "success": true,
  "contacts": [
    { "id": "...", "name": "Dr. Smith", "role": "teacher", "subtitle": "Mathematics Teacher", "subjects": ["Math"] }
  ]
}
```

---

### POST /api/chat/conversations
Get or create a conversation with a user.

Body:
```json
{ "targetUserId": "...", "targetRole": "teacher" }
```

Response:
```json
{ "success": true, "conversation": { "_id": "...", "participants": [...], "lastMessage": "" } }
```

---

### GET /api/chat/conversations
List all my conversations (sorted by last message).

Response:
```json
{
  "success": true,
  "conversations": [
    { "id": "...", "name": "Dr. Smith", "role": "teacher", "lastMessage": "...", "time": "...", "unread": 2 }
  ]
}
```

---

### GET /api/chat/conversations/:conversationId/messages?page=1&limit=50
Get messages in a conversation (also marks them as read).

Response:
```json
{
  "success": true,
  "messages": [
    { "_id": "...", "sender": "...", "senderName": "...", "senderRole": "teacher", "text": "Hello!", "read": true, "createdAt": "..." }
  ]
}
```

---

### POST /api/chat/conversations/:conversationId/messages
Send a message (REST fallback — prefer Socket.io).

Body: `{ "text": "Hello!" }`

---

### GET /api/chat/unread
Get total unread message count for current user.

Response: `{ "success": true, "unread": 5 }`

---

### DELETE /api/chat/messages/:messageId
Delete your own message.

---

## Socket.io Real-Time Events

**Connection:**
```js
import { io } from "socket.io-client";
const socket = io("http://localhost:5000", {
  auth: { token: "<JWT_TOKEN>" }
});
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:join` | `{ conversationId }` | Join a conversation room |
| `chat:leave` | `{ conversationId }` | Leave a conversation room |
| `chat:send` | `{ conversationId, text }` | Send a message (with ack callback) |
| `chat:typing` | `{ conversationId }` | Notify typing started |
| `chat:stopTyping` | `{ conversationId }` | Notify typing stopped |
| `chat:markRead` | `{ conversationId }` | Mark all messages as read |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ id, conversationId, sender, senderName, senderRole, text, read, createdAt }` | New message received |
| `chat:notification` | `{ conversationId, from, fromRole, text, time }` | Notification for unread (user not in room) |
| `chat:typing` | `{ conversationId, userId, name }` | Someone is typing |
| `chat:stopTyping` | `{ conversationId, userId }` | Someone stopped typing |
| `chat:read` | `{ conversationId, readBy }` | Messages marked as read |
| `chat:joined` | `{ conversationId }` | Confirmed join |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId }` | User went offline |
| `error` | `{ message }` | Error from server |

---

## Frontend Integration Example

```typescript
// 1. Connect socket
const socket = io(API_URL, { auth: { token } });

// 2. Open a conversation
const { data } = await axios.post('/api/chat/conversations', { targetUserId, targetRole });
const conversationId = data.conversation._id;

// 3. Join conversation room
socket.emit('chat:join', { conversationId });

// 4. Listen for messages
socket.on('chat:message', (msg) => {
  setMessages(prev => [...prev, msg]);
});

// 5. Send message
socket.emit('chat:send', { conversationId, text: 'Hello!' }, (ack) => {
  if (ack.success) console.log('Sent!');
});

// 6. Typing indicator
input.addEventListener('input', () => {
  socket.emit('chat:typing', { conversationId });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit('chat:stopTyping', { conversationId }), 1000);
});
```
