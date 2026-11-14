// ตัวกลางส่งเหตุการณ์เรียลไทม์ให้ service ต่างๆ เรียกใช้ได้ โดยไม่ต้องรู้จัก Socket.io โดยตรง
let io = null;
const sockets = new Map(); // userId -> Set(socketId)  ใช้บอกสถานะออนไลน์

function setIO(instance) { io = instance; }

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  for (const id of userIds) emitToUser(id, event, payload);
}

// คืน true ถ้านี่คือการเชื่อมต่อแรก (เพิ่งออนไลน์)
function addSocket(userId, socketId) {
  const key = String(userId);
  if (!sockets.has(key)) sockets.set(key, new Set());
  sockets.get(key).add(socketId);
  return sockets.get(key).size === 1;
}

// คืน true ถ้านี่คือการเชื่อมต่อสุดท้าย (เพิ่งออฟไลน์)
function removeSocket(userId, socketId) {
  const key = String(userId);
  const set = sockets.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) { sockets.delete(key); return true; }
  return false;
}

// ตัดการเชื่อมต่อเรียลไทม์ของผู้ใช้ทันที (ใช้ตอนแอดมินระงับบัญชี)
function disconnectUser(userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

function isOnline(userId) { return sockets.has(String(userId)); }

module.exports = { setIO, emitToUser, emitToUsers, addSocket, removeSocket, isOnline, disconnectUser };
