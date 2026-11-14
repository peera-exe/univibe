const { Server } = require('socket.io');
const sessionMiddleware = require('../config/session');
const User = require('../models/User');
const realtime = require('./realtime');
const chat = require('../services/chatService');

// ผูก Socket.io เข้ากับ HTTP server โดยใช้ session ตัวเดียวกับเว็บ (ล็อกอินครั้งเดียวใช้ได้ทั้งสองทาง)
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    // กัน Cross-Site WebSocket Hijacking: ยอมรับเฉพาะคำขอที่มาจาก origin เดียวกับเซิร์ฟเวอร์
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      try { callback(null, new URL(origin).host === req.headers.host); } catch (e) { callback(null, false); }
    },
  });
  realtime.setIO(io);

  io.use(async (socket, next) => {
    try {
      const session = await sessionMiddleware.readSession(socket.request.headers.cookie);
      if (!session || !session.userId) return next(new Error('unauthorized'));
      const user = await User.findById(session.userId);
      if (!user || user.isDeleted || user.isSuspended || user.approval !== 'approved') return next(new Error('unauthorized'));
      socket.data.user = { _id: String(user._id), displayName: user.displayName, hidePresence: user.showOnlineStatus === false };
      next();
    } catch (err) {
      next(err);
    }
  });

  async function announcePresence(userId, online) {
    const partners = await chat.directPartners(userId);
    realtime.emitToUsers(partners, 'presence', { userId: String(userId), online });
  }

  io.on('connection', (socket) => {
    const { _id: userId, displayName, hidePresence } = socket.data.user;
    socket.join(`user:${userId}`);
    if (realtime.addSocket(userId, socket.id) && !hidePresence) announcePresence(userId, true).catch(() => {});

    // กำลังพิมพ์: ส่งต่อให้สมาชิกคนอื่นของห้อง (ตรวจสิทธิ์ก่อนทุกครั้ง)
    socket.on('typing', async (payload) => {
      try {
        const convId = payload && payload.conversationId;
        const ids = await chat.memberIdsIfAllowed(convId, userId);
        if (!ids) return;
        realtime.emitToUsers(ids.filter((id) => id !== userId), 'typing', {
          conversationId: String(convId), userId, displayName, isTyping: Boolean(payload.isTyping),
        });
      } catch (e) { /* เหตุการณ์ผิดรูปแบบ ไม่ต้องทำอะไร */ }
    });

    socket.on('disconnect', () => {
      if (realtime.removeSocket(userId, socket.id)) announcePresence(userId, false).catch(() => {});
    });
  });

  return io;
}

module.exports = { initSocket };
