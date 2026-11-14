const session = require('express-session');
const signature = require('cookie-signature');
const MongoStore = require('connect-mongo').default;
const { MONGO_URL, SESSION_SECRET, IS_PROD } = require('./env');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_NAME = 'univibe.sid';
const store = MongoStore.create({ mongoUrl: MONGO_URL, collectionName: 'sessions', ttl: WEEK_MS / 1000 });

// เก็บ session ใน MongoDB (คอลเลกชัน sessions) ปิดเซิร์ฟเวอร์แล้วยังล็อกอินค้างอยู่
const sessionMiddleware = session({
  name: COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    httpOnly: true,   // JavaScript ฝั่งหน้าเว็บอ่านคุกกี้นี้ไม่ได้ (กันขโมยด้วย XSS)
    sameSite: 'lax',  // ไม่ส่งคุกกี้ไปกับคำขอข้ามเว็บ (ลดความเสี่ยง CSRF)
    secure: IS_PROD,
    maxAge: WEEK_MS,
  },
});

// อ่าน session จากหัวข้อ Cookie ตรง ๆ (ใช้กับ Socket.io แทนการเอา express-session ไปเสียบใน engine.io
// ซึ่งทำให้เซิร์ฟเวอร์ล้มด้วย ERR_HTTP_HEADERS_SENT เมื่อ handshake ถูกตัดกลางคัน)
// ทำงานเหมือน express-session: ตรวจลายเซ็นของคุกกี้ก่อน แล้วค่อยดึงจาก store เดียวกัน คืน null ถ้าไม่ผ่าน
function readSession(cookieHeader) {
  return new Promise((resolve) => {
    try {
      const pair = String(cookieHeader || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!pair) return resolve(null);
      let value = pair.slice(COOKIE_NAME.length + 1);
      try { value = decodeURIComponent(value); } catch (e) { return resolve(null); }
      if (!value.startsWith('s:')) return resolve(null);
      const sid = signature.unsign(value.slice(2), SESSION_SECRET);
      if (sid === false) return resolve(null);
      store.get(sid, (err, data) => resolve(err ? null : data || null));
    } catch (e) {
      resolve(null);
    }
  });
}

sessionMiddleware.readSession = readSession;
module.exports = sessionMiddleware;
