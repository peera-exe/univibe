const form = document.querySelector('#login-form');
const message = document.querySelector('#message');

// ล็อกอินอยู่แล้วไม่ต้องกรอกซ้ำ
api.get('/api/auth/me').then(function () { location.replace('/feed.html'); }).catch(function () {});

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.username.trim() || !data.password) {
    return showAlert(message, 'กรุณากรอก username และรหัสผ่าน');
  }
  try {
    await api.post('/api/auth/login', data);
    location.href = '/feed.html';
  } catch (err) {
    showAlert(message, err.message);
  }
});
