// แปลงเวลา "HH:mm" <-> จำนวนนาทีนับจากเที่ยงคืน (ใช้เทียบเวลาเรียนชนกัน)
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`รูปแบบเวลาไม่ถูกต้อง: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function fromMinutes(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = { toMinutes, fromMinutes };
