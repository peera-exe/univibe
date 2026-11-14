const http = require('http');
const { PORT } = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const app = require('./src/app');
const { initSocket } = require('./src/sockets/chat');
const { startReminders } = require('./src/jobs/reminders');

// กันเซิร์ฟเวอร์ล้มทั้งระบบจาก error ที่หลุดมาจากงานเบื้องหลัง: บันทึกไว้แล้วทำงานต่อ
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

async function main() {
  await connectDB();
  const server = http.createServer(app);
  initSocket(server); // แชทเรียลไทม์ใช้ server ตัวเดียวกับเว็บ
  server.listen(PORT, () => {
    console.log(`UniVibe รันที่ http://localhost:${PORT}`);
  });
  startReminders(); // เตือนคาบเรียน/กำหนดส่งงานอัตโนมัติทุก 60 วินาที
}

main().catch((err) => {
  console.error('เริ่มระบบไม่สำเร็จ:', err.message);
  console.error('ตรวจสอบว่า MongoDB (mongod) กำลังทำงานอยู่ และ MONGO_URL ใน .env ถูกต้อง');
  process.exit(1);
});
