// วิธีใช้:
//   npm run seed          สร้างข้อมูลตัวอย่าง (ถ้ายังไม่มี)
//   npm run seed:reset    ล้างข้อมูลทั้งหมดแล้วสร้างใหม่
//   npm run seed:clear    ล้างข้อมูลทั้งหมด
//   npm run seed:check    ตรวจไฟล์ข้อมูลตัวอย่างโดยไม่ต้องใช้ MongoDB
require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const M = require('../src/models');
const { buildSeed } = require('./build');

const mode = process.argv[2];

async function clearAll() {
  for (const model of Object.values(M)) await model.deleteMany({});
  await require('mongoose').connection.collection('sessions').deleteMany({}).catch(() => {});
  console.log('ล้างข้อมูลทั้งหมดแล้ว');
}

async function insertAll(seed) {
  for (const model of Object.values(M)) await model.init(); // สร้าง index (รวม unique) ก่อนบันทึก
  const order = ['registry', 'users', 'groups', 'memberships', 'enrollments', 'conversations'];
  for (const key of order) {
    for (const doc of seed[key]) await doc.save();
    console.log(`  ${key.padEnd(14)} ${seed[key].length} รายการ`);
  }
}

async function main() {
  const seed = await buildSeed();
  if (seed.problems.length) {
    console.error('ข้อมูลตัวอย่างไม่ถูกต้อง:');
    seed.problems.forEach((p) => console.error(' -', p));
    process.exit(1);
  }
  if (mode === '--check') {
    console.log('ตรวจข้อมูลตัวอย่างผ่าน:');
    for (const key of ['registry', 'users', 'groups', 'memberships', 'enrollments', 'conversations']) {
      console.log(`  ${key.padEnd(14)} ${seed[key].length} รายการ`);
    }
    return;
  }

  await connectDB();
  try {
    if (mode === '--clear') return await clearAll();
    if (mode === '--reset') await clearAll();
    else if (await M.User.exists({ role: 'admin' })) {
      console.log('มีข้อมูลตัวอย่างอยู่แล้ว ใช้ npm run seed:reset หากต้องการสร้างใหม่');
      return;
    }
    console.log('กำลังสร้างข้อมูลตัวอย่าง...');
    await insertAll(seed);
    console.log('เสร็จแล้ว! บัญชีตัวอย่างดูได้ในไฟล์ README.md');
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error('seed ไม่สำเร็จ:', err.message);
  process.exit(1);
});
