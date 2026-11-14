// แท็บ "ประกาศ" และ "งาน" ของหน้าวิชา (ลงทะเบียนเข้า window.CourseWorkTabs ให้ course.js นำไปใช้)
(function () {
  const el = ui.el;
  const fmt = function (iso) {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const toLocalInput = function (iso) {
    const d = new Date(iso);
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const isTeacher = function (ctx) { return ctx.course.teachers.some(function (t) { return t._id === ctx.me._id; }); };
  const field = function (label, input) {
    const wrap = el('div', 'field');
    const l = el('label', '', label);
    input.id = input.id || 'w-' + Math.random().toString(36).slice(2, 8);
    l.htmlFor = input.id;
    wrap.append(l, input);
    return wrap;
  };
  const input = function (type, value, extra) {
    const i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') i.type = type;
    else i.rows = 3;
    i.value = value || '';
    Object.assign(i, extra || {});
    return i;
  };
  const btn = function (label, cls, fn) {
    const b = el('button', 'btn btn-sm ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const alertBox = function () { const a = el('p', 'alert'); a.setAttribute('role', 'alert'); return a; };

  // ======================= ประกาศ =======================
  // ฟอร์มประกาศหน้าตาเหมือนกล่องโพสต์ในฟีด: รูปโปรไฟล์ + ช่องทรงแคปซูล กดแล้วขยายเป็นหัวข้อ + ข้อความ
  function announcementForm(ctx, existing, done) {
    const form = el('form', 'card composer announce-composer');
    form.noValidate = true;
    const title = input('text', existing && existing.title, { maxLength: 150, placeholder: 'หัวข้อประกาศ' });
    title.className = 'composer-title';
    title.setAttribute('aria-label', 'หัวข้อประกาศ');
    const body = input('textarea', existing && existing.body, { maxLength: 5000 });
    const firstName = ctx.me && ctx.me.displayName ? ctx.me.displayName.split(/\s+/)[0] : '';
    body.placeholder = existing ? 'ข้อความประกาศ' : 'ประกาศอะไรถึงนักศึกษา' + (firstName ? ' ' + firstName : '') + '?';
    body.rows = 1;
    body.setAttribute('aria-label', 'ข้อความประกาศ');
    const msg = alertBox();

    const fields = el('div', 'composer-fields');
    fields.append(title, body);
    const top = el('div', 'composer-top');
    top.appendChild(ui.avatar(ctx.me, 'md'));
    top.appendChild(fields);

    const submit = el('button', 'btn btn-sm', existing ? 'บันทึก' : 'โพสต์ประกาศ');
    submit.type = 'submit';
    const bar = el('div', 'composer-bar');
    bar.appendChild(el('span', 'composer-hint muted small', 'นักศึกษาในวิชานี้จะได้รับแจ้งเตือน'));
    if (existing) { const cancel = btn('ยกเลิก', 'btn-ghost', done); bar.appendChild(cancel); }
    bar.appendChild(submit);
    form.append(top, msg, bar);

    function sync() {
      const open = Boolean(existing) || title.value.trim() !== '' || body.value.trim() !== '' || form.contains(document.activeElement);
      form.classList.toggle('is-open', open);
      body.rows = open ? 4 : 1;
    }
    form.addEventListener('focusin', sync);
    form.addEventListener('focusout', function () { setTimeout(sync, 0); });
    title.addEventListener('input', sync);
    body.addEventListener('input', sync);
    sync();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      submit.disabled = true;
      try {
        const payload = { title: title.value, body: body.value };
        if (existing) await api.send('PATCH', '/api/announcements/' + existing._id, payload);
        else await api.post('/api/courses/' + ctx.id + '/announcements', payload);
        done();
      } catch (err) { showAlert(msg, err.message); }
      submit.disabled = false;
    });
    return form;
  }

  async function renderAnnouncements(ctx) {
    const panel = ctx.panel;
    panel.appendChild(el('h2', '', 'ประกาศ'));
    if (isTeacher(ctx)) panel.appendChild(announcementForm(ctx, null, function () { ctx.reload(); }));
    const list = el('div');
    panel.appendChild(list);
    try {
      const data = await api.get('/api/courses/' + ctx.id + '/announcements');
      if (!data.announcements.length) list.appendChild(el('p', 'muted', 'ยังไม่มีประกาศ'));
      data.announcements.forEach(function (a) {
        const card = el('article', 'work-item');
        const render = function () {
          card.replaceChildren();
          card.appendChild(el('h3', '', a.title));
          const meta = el('div', 'muted small');
          meta.appendChild(ui.userLink(a.author));
          meta.appendChild(document.createTextNode(' · ' + ui.timeAgo(a.createdAt) + (a.updatedAt !== a.createdAt ? ' (แก้ไขแล้ว)' : '')));
          card.appendChild(meta);
          card.appendChild(el('p', 'pre-wrap', a.body));
          if (a.canEdit || a.canDelete) {
            const actions = el('div', 'row-actions');
            if (a.canEdit) actions.appendChild(btn('แก้ไข', 'btn-ghost', function () {
              card.replaceChildren(announcementForm(ctx, a, function () { ctx.reload(); }));
            }));
            if (a.canDelete) actions.appendChild(btn('ลบ', 'btn-ghost', function () {
              if (!confirm('ลบประกาศนี้?')) return;
              api.send('DELETE', '/api/announcements/' + a._id).then(function () { ctx.reload(); }).catch(function (e) { showAlert(ctx.message, e.message); });
            }));
            card.appendChild(actions);
          }
        };
        render();
        list.appendChild(card);
      });
    } catch (err) { showAlert(ctx.message, err.message); }
  }

  // ======================= งาน =======================
  function assignmentForm(ctx, existing, done) {
    const box = el('div', 'work-form');
    const title = input('text', existing && existing.title, { maxLength: 150 });
    const desc = input('textarea', existing && existing.description, { maxLength: 5000 });
    const inDays = function (d) { return toLocalInput(new Date(Date.now() + d * 86400e3)); };
    const due = input('datetime-local', existing ? toLocalInput(existing.dueAt) : inDays(7));
    const close = input('datetime-local', existing ? toLocalInput(existing.closeAt) : inDays(9));
    const max = input('number', existing ? existing.maxScore : 100, { min: 1, max: 1000, step: 'any' });
    const msg = alertBox();
    const actions = el('div', 'row-actions');
    actions.appendChild(btn(existing ? 'บันทึก' : 'สร้างงาน', '', async function () {
      try {
        const iso = function (v) { return v ? new Date(v).toISOString() : ''; };
        const payload = { title: title.value, description: desc.value, dueAt: iso(due.value), closeAt: iso(close.value), maxScore: max.value };
        if (existing) await api.send('PATCH', '/api/assignments/' + existing._id, payload);
        else await api.post('/api/courses/' + ctx.id + '/assignments', payload);
        done();
      } catch (err) { showAlert(msg, err.message); }
    }));
    actions.appendChild(btn('ยกเลิก', 'btn-ghost', done));
    box.append(field('ชื่องาน', title), field('รายละเอียด', desc), field('กำหนดส่ง (หลังเวลานี้ติดป้ายส่งช้า)', due),
      field('ปิดรับงาน (หลังเวลานี้ส่งไม่ได้)', close), field('คะแนนเต็ม', max), msg, actions);
    return box;
  }

  function statusBadge(a) {
    const s = a.mySubmission;
    if (s && s.score !== null) return ['ตรวจแล้ว ' + s.score + '/' + a.maxScore, 'badge'];
    if (s) return [s.isLate ? 'ส่งแล้ว (ส่งช้า)' : 'ส่งแล้ว', 'badge'];
    if (a.isClosed) return ['ปิดรับแล้ว', 'badge badge-warn'];
    return [a.isPastDue ? 'เลยกำหนดส่ง' : 'ยังไม่ส่ง', a.isPastDue ? 'badge badge-warn' : 'badge'];
  }

  async function renderAssignments(ctx) {
    const panel = ctx.panel;
    const header = el('div', 'page-head');
    header.appendChild(el('h2', '', 'งาน'));
    panel.appendChild(header);
    const holder = el('div');
    panel.appendChild(holder);
    if (isTeacher(ctx)) {
      const create = btn('+ สร้างงานใหม่', '', function () {
        create.classList.add('hidden');
        holder.prepend(assignmentForm(ctx, null, function () { ctx.reload(); }));
      });
      header.appendChild(create);
    }
    const list = el('div');
    holder.appendChild(list);
    try {
      const data = await api.get('/api/courses/' + ctx.id + '/assignments');
      if (!data.assignments.length) list.appendChild(el('p', 'muted', 'ยังไม่มีงาน'));
      data.assignments.forEach(function (a) {
        const row = el('article', 'work-item work-clickable');
        row.tabIndex = 0;
        row.appendChild(el('h3', '', a.title));
        row.appendChild(el('div', 'muted small', 'กำหนดส่ง ' + fmt(a.dueAt) + ' · ปิดรับ ' + fmt(a.closeAt) + ' · เต็ม ' + a.maxScore));
        if (a.counts) row.appendChild(el('div', 'small', 'ส่งแล้ว ' + a.counts.submitted + '/' + a.counts.students + ' คน · ตรวจแล้ว ' + a.counts.graded));
        else { const s = statusBadge(a); row.appendChild(el('span', s[1], s[0])); }
        const open = function () { holder.replaceChildren(); header.classList.add('hidden'); renderAssignmentDetail(ctx, a._id, holder, header); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
        list.appendChild(row);
      });
    } catch (err) { showAlert(ctx.message, err.message); }
  }

  async function renderAssignmentDetail(ctx, id, holder, header) {
    const back = btn('← กลับไปรายการงาน', 'btn-ghost', function () { ctx.reload(); });
    holder.appendChild(back);
    let a;
    try { a = (await api.get('/api/assignments/' + id)).assignment; } catch (err) { return showAlert(ctx.message, err.message); }
    const info = el('div', 'work-item');
    info.appendChild(el('h3', '', a.title));
    info.appendChild(el('div', 'muted small', 'กำหนดส่ง ' + fmt(a.dueAt) + ' · ปิดรับ ' + fmt(a.closeAt) + ' · คะแนนเต็ม ' + a.maxScore));
    if (a.description) info.appendChild(el('p', 'pre-wrap', a.description));
    if (a.canManage || a.canDelete) {
      const actions = el('div', 'row-actions');
      if (a.canManage) actions.appendChild(btn('แก้ไขงาน', 'btn-ghost', function () {
        holder.replaceChildren(assignmentForm(ctx, a, function () { holder.replaceChildren(); renderAssignmentDetail(ctx, id, holder, header); }));
      }));
      if (a.canDelete) actions.appendChild(btn('ลบงาน', 'btn-ghost', function () {
        if (!confirm('ลบงานนี้ (รวมถึงการส่งงานทั้งหมด)?')) return;
        api.send('DELETE', '/api/assignments/' + id).then(function () { ctx.reload(); }).catch(function (e) { showAlert(ctx.message, e.message); });
      }));
      info.appendChild(actions);
    }
    holder.appendChild(info);

    if (a.canManage || ctx.me.role === 'admin') await renderSubmissions(ctx, a, holder);
    else renderMySubmission(ctx, a, holder, function () { holder.replaceChildren(); renderAssignmentDetail(ctx, id, holder, header); });
  }

  // ---------- มุมมองนักศึกษา ----------
  function renderMySubmission(ctx, a, holder, refresh) {
    const box = el('div', 'work-item');
    box.appendChild(el('h3', '', 'การส่งงานของฉัน'));
    const s = a.mySubmission;
    if (s) {
      const line = el('div');
      const link = el('a', '', s.fileName);
      link.href = '/api/submissions/' + s._id + '/file';
      line.append(link, document.createTextNode(' · ส่งเมื่อ ' + fmt(s.submittedAt) + (s.isLate ? ' (ส่งช้า)' : '')));
      box.appendChild(line);
      if (s.score !== null) {
        box.appendChild(el('p', 'work-score', 'คะแนน ' + s.score + ' / ' + a.maxScore));
        if (s.feedback) box.appendChild(el('p', 'pre-wrap', 'คำติชม: ' + s.feedback));
      } else {
        box.appendChild(el('p', 'muted small', 'รอการตรวจ'));
      }
    } else {
      box.appendChild(el('p', 'muted', 'ยังไม่ได้ส่งงาน'));
    }
    if (a.isClosed) {
      box.appendChild(el('p', 'muted', 'งานนี้ปิดรับแล้ว'));
    } else {
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.pdf,.docx,.zip,.jpg,.jpeg,.png,.webp';
      file.setAttribute('aria-label', 'เลือกไฟล์ส่งงาน');
      const msg = alertBox();
      const send = btn(s ? 'ส่งใหม่ (แทนที่ไฟล์เดิม)' : 'ส่งงาน', '', async function () {
        if (!file.files[0]) return showAlert(msg, 'กรุณาเลือกไฟล์ที่จะส่ง');
        if (file.files[0].size > 10 * 1024 * 1024) return showAlert(msg, 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
        if (s && s.score !== null && !confirm('งานนี้ตรวจให้คะแนนแล้ว ถ้าส่งใหม่คะแนนเดิมจะถูกล้างเพื่อตรวจใหม่ ต้องการส่งต่อหรือไม่?')) return;
        send.disabled = true;
        const fd = new FormData();
        fd.append('file', file.files[0]);
        try { await api.post('/api/assignments/' + a._id + '/submission', fd); refresh(); }
        catch (err) { showAlert(msg, err.message); send.disabled = false; }
      });
      box.append(el('div', 'hint', 'รองรับ PDF, docx, zip และรูป ไม่เกิน 10 MB'), file, msg, send);
    }
    holder.appendChild(box);
  }

  // ---------- มุมมองอาจารย์ / แอดมิน ----------
  async function renderSubmissions(ctx, a, holder) {
    const box = el('div', 'work-item');
    box.appendChild(el('h3', '', 'การส่งงานของนักศึกษา'));
    holder.appendChild(box);
    try {
      const data = await api.get('/api/assignments/' + a._id + '/submissions');
      const wrap = el('div', 'table-wrap');
      const table = el('table', 'table');
      const head = el('tr');
      ['รหัส', 'ชื่อ', 'สถานะ', 'ไฟล์', 'คะแนน / คำติชม'].forEach(function (h) { head.appendChild(el('th', '', h)); });
      table.appendChild(el('thead')).appendChild(head);
      const body = el('tbody');
      data.rows.forEach(function (r) {
        const tr = el('tr');
        const s = r.submission;
        tr.appendChild(el('td', '', r.student.studentId));
        tr.appendChild(el('td', '', r.student.displayName));
        tr.appendChild(el('td', 'small', !s ? 'ยังไม่ส่ง' : (s.isLate ? 'ส่งช้า ' : 'ส่งแล้ว ') + fmt(s.submittedAt)));
        const fileCell = el('td', 'small');
        if (s) { const link = el('a', '', s.fileName); link.href = '/api/submissions/' + s._id + '/file'; fileCell.appendChild(link); }
        tr.appendChild(fileCell);
        const gradeCell = el('td');
        if (s && a.canManage) {
          const score = input('number', s.score === null ? '' : s.score, { min: 0, max: a.maxScore, step: 'any' });
          score.className = 'score-input';
          score.setAttribute('aria-label', 'คะแนนของ ' + r.student.displayName);
          const fb = input('text', s.feedback, { maxLength: 2000, placeholder: 'คำติชม (ไม่บังคับ)' });
          fb.setAttribute('aria-label', 'คำติชม');
          const msg = el('span', 'small');
          const save = btn('บันทึก', 'btn-ghost', async function () {
            try { await api.send('PATCH', '/api/submissions/' + s._id + '/grade', { score: score.value, feedback: fb.value }); msg.textContent = 'บันทึกแล้ว'; msg.className = 'small success-text'; }
            catch (err) { msg.textContent = err.message; msg.className = 'small error-text'; }
          });
          gradeCell.append(score, document.createTextNode(' / ' + a.maxScore + ' '), fb, save, msg);
        } else if (s) {
          gradeCell.appendChild(document.createTextNode(s.score === null ? 'ยังไม่ตรวจ' : s.score + ' / ' + a.maxScore));
        }
        tr.appendChild(gradeCell);
        body.appendChild(tr);
      });
      table.appendChild(body);
      wrap.appendChild(table);
      box.appendChild(wrap);
      if (!data.rows.length) box.appendChild(el('p', 'muted', 'ยังไม่มีนักศึกษาในวิชา'));
    } catch (err) { showAlert(ctx.message, err.message); }
  }

  window.CourseWorkTabs = [
    { id: 'announcements', label: 'ประกาศ', render: renderAnnouncements },
    { id: 'assignments', label: 'งาน', render: renderAssignments },
  ];
})();
