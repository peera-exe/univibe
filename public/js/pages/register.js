const tabStudent = document.querySelector('#tab-student');
const tabTeacher = document.querySelector('#tab-teacher');
const studentForm = document.querySelector('#student-form');
const teacherForm = document.querySelector('#teacher-form');
const studentMessage = document.querySelector('#student-message');
const teacherMessage = document.querySelector('#teacher-message');

function selectTab(isStudent) {
  tabStudent.setAttribute('aria-selected', String(isStudent));
  tabTeacher.setAttribute('aria-selected', String(!isStudent));
  studentForm.classList.toggle('hidden', !isStudent);
  teacherForm.classList.toggle('hidden', isStudent);
}
tabStudent.addEventListener('click', function () { selectTab(true); });
tabTeacher.addEventListener('click', function () { selectTab(false); });

// ตรวจเบื้องต้นฝั่งหน้าเว็บ (เซิร์ฟเวอร์ตรวจซ้ำทุกครั้ง)
function checkCommon(data) {
  if (!/^[a-z0-9_]{3,20}$/.test(data.username)) return 'username ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว';
  if (data.password.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  if (data.password !== data.confirm) return 'รหัสผ่านและการยืนยันไม่ตรงกัน';
  return null;
}

studentForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(studentForm));
  data.username = data.username.trim().toLowerCase();
  if (!/^\d{9}$/.test(data.studentId.trim())) return showAlert(studentMessage, 'รหัสนักศึกษาต้องเป็นตัวเลข 9 หลัก');
  if (!data.birthDate) return showAlert(studentMessage, 'กรุณาเลือกวันเกิด');
  const problem = checkCommon(data);
  if (problem) return showAlert(studentMessage, problem);

  delete data.confirm;
  try {
    await api.post('/api/auth/register', data);
    location.href = '/feed.html';
  } catch (err) {
    showAlert(studentMessage, err.message);
  }
});

teacherForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(teacherForm));
  data.username = data.username.trim().toLowerCase();
  for (const key of ['fullName', 'faculty', 'department', 'staffId']) {
    if (!data[key].trim()) return showAlert(teacherMessage, 'กรุณากรอกข้อมูลให้ครบทุกช่อง');
  }
  const problem = checkCommon(data);
  if (problem) return showAlert(teacherMessage, problem);

  delete data.confirm;
  try {
    const result = await api.post('/api/auth/register-teacher', data);
    teacherForm.reset();
    showAlert(teacherMessage, result.message, 'success');
  } catch (err) {
    showAlert(teacherMessage, err.message);
  }
});
