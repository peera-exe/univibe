// ดึงแฮชแท็ก (#...) จากข้อความ เก็บเป็นตัวพิมพ์เล็ก ไม่ซ้ำ ไม่เกิน 10 แท็ก
function extractHashtags(text) {
  const found = new Set();
  const re = /#([\p{L}\p{M}\p{N}_]{1,50})/gu;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    found.add(m[1].toLowerCase());
    if (found.size >= 10) break;
  }
  return [...found];
}

// ป้องกันตัวอักษรพิเศษของ regex เวลาค้นหาจากข้อความที่ผู้ใช้พิมพ์
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { extractHashtags, escapeRegex };
