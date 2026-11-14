// ตัวช่วยเรียก API ใช้ร่วมกันทุกหน้า
(function () {
  async function request(method, url, body) {
    const options = { method: method, headers: {} };
    if (body instanceof FormData) {
      options.body = body; // ไฟล์: ให้เบราว์เซอร์ตั้ง Content-Type (multipart) เอง
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ไม่มีเนื้อหา JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      err.status = res.status;
      err.data = data; // ข้อมูลเพิ่มเติมจากเซิร์ฟเวอร์ เช่น รายการที่ชนกัน
      throw err;
    }
    return data;
  }

  window.api = {
    get: function (url) { return request('GET', url); },
    post: function (url, body) { return request('POST', url, body === undefined ? {} : body); },
    send: function (method, url, body) { return request(method, url, body); },
  };

  // แสดงข้อความในกล่องแจ้งเตือน (ใช้ textContent เสมอ ปลอดภัยจาก XSS)
  window.showAlert = function (el, text, type) {
    el.textContent = text || '';
    el.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-error');
  };
})();
