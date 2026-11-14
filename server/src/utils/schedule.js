// ตัวช่วยเรื่องตารางเรียน: ตรวจรูปแบบ แปลงเวลา และหาช่วงเวลาที่ชนกัน
const HttpError = require('./httpError');
const { DAYS } = require('./constants');
const { toMinutes, fromMinutes } = require('./time');

const DAY_LABEL = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์' };
const MAX_SLOTS = 10;

// รับ [{ day, start: "09:00", end: "12:00", room }] จากหน้าเว็บ แล้วแปลงเป็นรูปแบบที่เก็บในฐานข้อมูล
function parseSchedule(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new HttpError(400, 'ตารางเรียนไม่ถูกต้อง');
  if (input.length > MAX_SLOTS) throw new HttpError(400, `เพิ่มช่วงเวลาเรียนได้ไม่เกิน ${MAX_SLOTS} ช่วง`);
  const slots = input.map((s, i) => {
    const n = i + 1;
    if (!s || !DAYS.includes(s.day)) throw new HttpError(400, `ช่วงเวลาที่ ${n}: วันไม่ถูกต้อง`);
    let startMin, endMin;
    try { startMin = toMinutes(String(s.start)); endMin = toMinutes(String(s.end)); } catch (e) {
      throw new HttpError(400, `ช่วงเวลาที่ ${n}: รูปแบบเวลาต้องเป็น HH:mm`);
    }
    if (startMin > 1439 || endMin > 1440) throw new HttpError(400, `ช่วงเวลาที่ ${n}: เวลาไม่ถูกต้อง`);
    if (endMin <= startMin) throw new HttpError(400, `ช่วงเวลาที่ ${n}: เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม`);
    const room = typeof s.room === 'string' ? s.room.trim() : '';
    if (!room || room.length > 40) throw new HttpError(400, `ช่วงเวลาที่ ${n}: กรุณาระบุห้อง (ไม่เกิน 40 ตัวอักษร)`);
    return { day: s.day, startMin, endMin, room };
  });
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (overlap(slots[i], slots[j])) throw new HttpError(400, 'ช่วงเวลาเรียนของวิชานี้ซ้อนกันเอง');
    }
  }
  return slots;
}

function overlap(a, b) {
  return a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;
}

function describeSlot(s) {
  return `${DAY_LABEL[s.day]} ${fromMinutes(s.startMin)}–${fromMinutes(s.endMin)}`;
}

// แปลงกลับเป็นรูปแบบที่หน้าเว็บใช้ (HH:mm)
function serializeSlots(slots) {
  return (slots || []).map((s) => ({ day: s.day, start: fromMinutes(s.startMin), end: fromMinutes(s.endMin), room: s.room }));
}

module.exports = { parseSchedule, overlap, describeSlot, serializeSlots, DAY_LABEL, MAX_SLOTS };
