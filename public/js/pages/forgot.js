const form = document.querySelector('#reset-form');
const message = document.querySelector('#message');

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!/^\d{9}$/.test(data.studentId.trim())) return showAlert(message, 'รหัสนักศึกษาต้องเป็นตัวเลข 9 หลัก');
  if (!data.birthDate) return showAlert(message, 'กรุณาเลือกวันเกิด');
  if (data.newPassword.length < 8) return showAlert(message, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  if (data.newPassword !== data.confirm) return showAlert(message, 'รหัสผ่านและการยืนยันไม่ตรงกัน');

  delete data.confirm;
  try {
    const result = await api.post('/api/auth/reset-password', data);
    form.reset();
    showAlert(message, result.message, 'success');
  } catch (err) {
    showAlert(message, err.message);
  }
});
