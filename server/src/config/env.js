// อ่านค่าตั้งค่าจากไฟล์ .env (ถ้าไม่มีจะใช้ค่าเริ่มต้นสำหรับรันบนเครื่องตัวเอง)
process.env.TZ = process.env.TZ || 'Asia/Bangkok'; // เวลาเรียนและการแจ้งเตือนใช้เวลาไทย

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const DEFAULT_SECRET = 'univibe-dev-secret-change-me';

const env = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URL: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/univibe',
  SESSION_SECRET: process.env.SESSION_SECRET || DEFAULT_SECRET,
  UPLOAD_DIR: path.join(__dirname, '..', '..', 'uploads'),
  IS_PROD: process.env.NODE_ENV === 'production',
};

if (env.SESSION_SECRET === DEFAULT_SECRET) {
  console.warn('[เตือน] ยังไม่ได้ตั้ง SESSION_SECRET ใน .env (ใช้ค่าเริ่มต้นสำหรับพัฒนาเท่านั้น)');
}

module.exports = env;
