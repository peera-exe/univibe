// การ์ดโพสต์ (ใช้ร่วมกันในฟีด โปรไฟล์ ค้นหา แฮชแท็ก และหน้าโพสต์เดี่ยว)
(function () {
  const el = ui.el;
  const VIS_LABEL = { public: 'ทุกคน', followers: 'เฉพาะผู้ติดตาม' };

  async function sendForm(url, fields, files) {
    const form = new FormData();
    Object.keys(fields).forEach(function (k) { form.append(k, fields[k]); });
    files.forEach(function (f) { form.append('images', f); });
    const res = await fetch(url, { method: 'POST', body: form });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ไม่มี JSON */ }
    if (!res.ok) throw new Error((data && data.error) || 'ส่งข้อมูลไม่สำเร็จ');
    return data;
  }
  window.sendForm = sendForm;

  function imageGrid(urls) {
    const grid = el('div', 'image-grid image-grid-' + Math.min(urls.length, 4));
    urls.forEach(function (url) {
      const a = el('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'รูปในโพสต์';
      img.loading = 'lazy';
      a.appendChild(img);
      grid.appendChild(a);
    });
    return grid;
  }

  window.imageGrid = imageGrid;

  function header(item, meta) {
    const head = el('div', 'post-head');
    head.appendChild(ui.avatar(item.author, 'md'));
    const info = el('div', 'post-info');
    const nameRow = el('div', 'post-name');
    nameRow.appendChild(ui.userLink(item.author, 'name-link'));
    if (!item.author.deleted) nameRow.appendChild(roleBadge(item.author));
    info.appendChild(nameRow);
    info.appendChild(el('div', 'muted small', meta));
    head.appendChild(info);
    return head;
  }

  // ---------- คอมเมนต์ ----------
  function commentNode(comment, state) {
    const row = el('div', 'comment');
    row.appendChild(ui.avatar(comment.author, 'sm'));
    const bubble = el('div', 'comment-body');
    const top = el('div', 'comment-top');
    top.appendChild(ui.userLink(comment.author, 'name-link'));
    top.appendChild(el('span', 'muted small', ui.timeAgo(comment.createdAt) + (comment.editedAt ? ' · แก้ไขแล้ว' : '')));
    bubble.appendChild(top);
    const text = el('div', 'comment-text');
    text.appendChild(ui.richText(comment.text));
    bubble.appendChild(text);
    if (comment.images.length) bubble.appendChild(imageGrid(comment.images));

    const actions = el('div', 'comment-actions');
    if (comment.canEdit) {
      const edit = el('button', 'link-btn', 'แก้ไข');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        const next = window.prompt('แก้ไขความคิดเห็น', comment.text);
        if (next === null) return;
        api.send('PATCH', '/api/comments/' + comment._id, { text: next })
          .then(function () { state.reload(); })
          .catch(function (err) { state.error(err.message); });
      });
      actions.appendChild(edit);
    }
    if (comment.canDelete) {
      const del = el('button', 'link-btn danger', 'ลบ');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm('ลบความคิดเห็นนี้ใช่หรือไม่?')) return;
        api.send('DELETE', '/api/comments/' + comment._id)
          .then(function () { state.reload(true); })
          .catch(function (err) { state.error(err.message); });
      });
      actions.appendChild(del);
    }
    bubble.appendChild(actions);
    row.appendChild(bubble);
    return row;
  }

  function commentSection(post, onCountChange) {
    const box = el('div', 'comments');
    const list = el('div', 'comment-list');
    const alertBox = el('p', 'alert', '');
    alertBox.setAttribute('role', 'alert');

    const state = {
      error: function (msg) { showAlert(alertBox, msg); },
      reload: function (countChanged) {
        load();
        if (countChanged) onCountChange(-1);
      },
    };

    function load() {
      return api.get('/api/posts/' + post._id + '/comments').then(function (data) {
        list.replaceChildren();
        data.comments.forEach(function (c) { list.appendChild(commentNode(c, state)); });
      }).catch(function (err) { state.error(err.message); });
    }

    const form = el('form', 'comment-form');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'เขียนความคิดเห็น...';
    input.maxLength = 1000;
    const picker = createImagePicker({ max: 4, label: 'รูป', onError: state.error });
    const send = el('button', 'btn btn-sm', 'ส่ง');
    send.type = 'submit';
    const row = el('div', 'comment-form-row');
    row.appendChild(input);
    row.appendChild(picker.button);
    row.appendChild(send);
    form.appendChild(row);
    form.appendChild(picker.previews);
    form.appendChild(picker.input);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const text = input.value.trim();
      if (!text && picker.files().length === 0) return;
      send.disabled = true;
      sendForm('/api/posts/' + post._id + '/comments', { text: text }, picker.files())
        .then(function () {
          input.value = '';
          picker.clear();
          showAlert(alertBox, '');
          onCountChange(1);
          return load();
        })
        .catch(function (err) { state.error(err.message); })
        .then(function () { send.disabled = false; });
    });

    box.appendChild(list);
    box.appendChild(alertBox);
    box.appendChild(form);
    load();
    return box;
  }

  // ---------- การ์ดโพสต์ ----------
  // options: { onDeleted(post), expanded }
  window.createPostCard = function (post, options) {
    options = options || {};
    const card = el('article', 'card post');
    let commentsBox = null;

    const meta = ui.timeAgo(post.createdAt) + (post.editedAt ? ' · แก้ไขแล้ว' : '') + ' · ' + VIS_LABEL[post.visibility];
    const head = header(post, meta);

    const canReport = !post.canEdit && !post.author.deleted;
    if (post.canEdit || post.canDelete || canReport) {
      const menu = el('div', 'post-menu');
      if (canReport) {
        const rep = el('button', 'link-btn', 'รายงาน');
        rep.type = 'button';
        rep.addEventListener('click', function () { toggleReport(); });
        menu.appendChild(rep);
      }
      if (post.canEdit) {
        const edit = el('button', 'link-btn', 'แก้ไข');
        edit.type = 'button';
        edit.addEventListener('click', function () { startEdit(); });
        menu.appendChild(edit);
      }
      if (post.canDelete) {
        const del = el('button', 'link-btn danger', 'ลบ');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!window.confirm('ลบโพสต์นี้ใช่หรือไม่?')) return;
          api.send('DELETE', '/api/posts/' + post._id).then(function () {
            card.remove();
            if (options.onDeleted) options.onDeleted(post);
          }).catch(function (err) { showAlert(alertBox, err.message); });
        });
        menu.appendChild(del);
      }
      head.appendChild(menu);
    }
    card.appendChild(head);

    // ฟอร์มรายงานโพสต์ (เปิดจากปุ่ม "รายงาน")
    let reportBox = null;
    function toggleReport() {
      if (reportBox) { reportBox.remove(); reportBox = null; return; }
      reportBox = el('div', 'report-form');
      reportBox.appendChild(el('strong', '', 'รายงานโพสต์นี้'));
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'เหตุผลที่รายงาน');
      ['สแปมหรือโฆษณา', 'เนื้อหาไม่เหมาะสม', 'คุกคามหรือกลั่นแกล้ง', 'ข้อมูลเท็จ', 'อื่น ๆ'].forEach(function (r) {
        const o = el('option', '', r); o.value = r; select.appendChild(o);
      });
      const detail = document.createElement('textarea');
      detail.rows = 2; detail.maxLength = 400; detail.placeholder = 'รายละเอียดเพิ่มเติม (ไม่บังคับ)';
      detail.setAttribute('aria-label', 'รายละเอียดเพิ่มเติม');
      const msg = el('p', 'alert', '');
      msg.setAttribute('role', 'alert');
      const actions = el('div', 'row-actions');
      const send = el('button', 'btn btn-sm', 'ส่งรายงาน');
      send.type = 'button';
      send.addEventListener('click', function () {
        send.disabled = true;
        api.post('/api/posts/' + post._id + '/report', { category: select.value, detail: detail.value }).then(function () {
          reportBox.replaceChildren(el('p', 'success-text', 'ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลชุมชน แอดมินจะตรวจสอบและแจ้งผลให้ทราบ'));
        }).catch(function (err) { showAlert(msg, err.message); send.disabled = false; });
      });
      const cancel = el('button', 'btn btn-ghost btn-sm', 'ยกเลิก');
      cancel.type = 'button';
      cancel.addEventListener('click', toggleReport);
      actions.append(send, cancel);
      reportBox.append(select, detail, msg, actions);
      head.after(reportBox);
    }

    const body = el('div', 'post-text');
    function renderText() {
      body.replaceChildren(ui.richText(post.text));
      body.classList.toggle('hidden', !post.text);
    }
    renderText();
    card.appendChild(body);
    if (post.images.length) card.appendChild(imageGrid(post.images));

    const alertBox = el('p', 'alert', '');
    alertBox.setAttribute('role', 'alert');

    // แก้ไขโพสต์ในที่เดิม
    function startEdit() {
      const form = el('form', 'edit-form');
      const area = document.createElement('textarea');
      area.value = post.text;
      area.maxLength = 2000;
      area.rows = 3;
      const select = document.createElement('select');
      [['public', 'ทุกคน'], ['followers', 'เฉพาะผู้ติดตาม']].forEach(function (o) {
        const opt = el('option', '', o[1]);
        opt.value = o[0];
        if (post.visibility === o[0]) opt.selected = true;
        select.appendChild(opt);
      });
      const save = el('button', 'btn btn-sm', 'บันทึก');
      save.type = 'submit';
      const cancel = el('button', 'btn btn-ghost btn-sm', 'ยกเลิก');
      cancel.type = 'button';
      const row = el('div', 'row-actions');
      row.appendChild(select);
      row.appendChild(save);
      row.appendChild(cancel);
      form.appendChild(area);
      form.appendChild(row);
      body.classList.add('hidden');
      body.after(form);

      cancel.addEventListener('click', function () { form.remove(); renderText(); });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        api.send('PATCH', '/api/posts/' + post._id, { text: area.value, visibility: select.value })
          .then(function (data) {
            Object.assign(post, data.post);
            form.remove();
            renderText();
            card.replaceWith(createPostCard(post, options));
          })
          .catch(function (err) { showAlert(alertBox, err.message); });
      });
    }

    // ปุ่มไลก์/คอมเมนต์
    const stats = el('div', 'post-stats');
    const likeBtn = el('button', 'like-btn');
    likeBtn.type = 'button';
    const commentBtn = el('button', 'link-btn');
    commentBtn.type = 'button';

    function renderStats() {
      likeBtn.textContent = (post.likedByMe ? '♥ ถูกใจแล้ว' : '♡ ถูกใจ') + ' · ' + post.likesCount;
      likeBtn.classList.toggle('liked', post.likedByMe);
      commentBtn.textContent = 'ความคิดเห็น ' + post.commentsCount;
    }
    renderStats();

    likeBtn.addEventListener('click', function () {
      const method = post.likedByMe ? 'DELETE' : 'POST';
      likeBtn.disabled = true;
      api.send(method, '/api/posts/' + post._id + '/like')
        .then(function (data) {
          post.likedByMe = data.liked;
          post.likesCount = data.likesCount;
          renderStats();
        })
        .catch(function (err) { showAlert(alertBox, err.message); })
        .then(function () { likeBtn.disabled = false; });
    });

    function toggleComments(open) {
      if (open === undefined) open = !commentsBox;
      if (open && !commentsBox) {
        commentsBox = commentSection(post, function (delta) {
          post.commentsCount = Math.max(0, post.commentsCount + delta);
          renderStats();
        });
        card.appendChild(commentsBox);
      } else if (!open && commentsBox) {
        commentsBox.remove();
        commentsBox = null;
      }
    }
    commentBtn.addEventListener('click', function () { toggleComments(); });

    stats.appendChild(likeBtn);
    stats.appendChild(commentBtn);
    card.appendChild(stats);
    card.appendChild(alertBox);
    if (options.expanded) toggleComments(true);
    return card;
  };

  // คำสั่งสร้างโพสต์ (ใช้ในฟีด)
  window.createComposer = function (onCreated, user) {
    const form = el('form', 'card composer');
    const area = document.createElement('textarea');
    const firstName = user && user.displayName ? user.displayName.split(/\s+/)[0] : '';
    area.placeholder = 'คุณกำลังคิดอะไรอยู่' + (firstName ? ' ' + firstName : '') + '?';
    area.rows = 1;
    area.maxLength = 2000;
    area.setAttribute('aria-label', 'เขียนโพสต์');
    const alertBox = el('p', 'alert', '');
    alertBox.setAttribute('role', 'alert');
    const picker = createImagePicker({ max: 10, label: 'เพิ่มรูป', onError: function (msg) { showAlert(alertBox, msg); } });

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'ผู้เห็นโพสต์');
    [['public', 'ผู้เห็น: ทุกคน'], ['followers', 'ผู้เห็น: เฉพาะผู้ติดตาม']].forEach(function (o) {
      const opt = el('option', '', o[1]);
      opt.value = o[0];
      select.appendChild(opt);
    });
    const submit = el('button', 'btn btn-sm', 'โพสต์');
    submit.type = 'submit';
    const bar = el('div', 'composer-bar');
    bar.appendChild(picker.button);
    bar.appendChild(select);
    bar.appendChild(el('span', 'composer-hint muted small', 'ใช้ #แฮชแท็ก ได้'));
    bar.appendChild(submit);

    // แถวบน: รูปโปรไฟล์ + ช่องพิมพ์ทรงแคปซูล (กดแล้วขยายออก)
    const top = el('div', 'composer-top');
    top.appendChild(ui.avatar(user, 'md'));
    top.appendChild(area);

    form.appendChild(top);
    form.appendChild(picker.previews);
    form.appendChild(picker.input);
    form.appendChild(alertBox);
    form.appendChild(bar);

    function hasContent() { return area.value.trim() !== '' || picker.files().length > 0; }
    function sync() {
      const open = hasContent() || form.contains(document.activeElement);
      form.classList.toggle('is-open', open);
      area.rows = open ? 3 : 1;
    }
    form.addEventListener('focusin', sync);
    form.addEventListener('focusout', function () { setTimeout(sync, 0); });
    area.addEventListener('input', sync);
    sync();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!area.value.trim() && picker.files().length === 0) return showAlert(alertBox, 'เขียนข้อความหรือแนบรูปก่อนโพสต์');
      submit.disabled = true;
      sendForm('/api/posts', { text: area.value.trim(), visibility: select.value }, picker.files())
        .then(function (data) {
          area.value = '';
          picker.clear();
          showAlert(alertBox, '');
          sync();
          onCreated(data.post);
        })
        .catch(function (err) { showAlert(alertBox, err.message); })
        .then(function () { submit.disabled = false; });
    });
    return form;
  };

  // โหลดรายการโพสต์แบบ "โหลดเพิ่ม" ลงในกล่อง container
  window.createPostList = function (container, fetchPage, cardOptions) {
    let cursor = null;
    const list = el('div', 'post-list');
    const more = el('button', 'btn btn-ghost', 'โหลดเพิ่ม');
    more.type = 'button';
    const empty = el('p', 'muted center hidden', 'ยังไม่มีโพสต์');
    const alertBox = el('p', 'alert', '');
    container.replaceChildren(list, empty, alertBox, more);

    function load(reset) {
      if (reset) { cursor = null; list.replaceChildren(); }
      more.disabled = true;
      return fetchPage(cursor).then(function (data) {
        data.posts.forEach(function (p) { list.appendChild(createPostCard(p, cardOptions)); });
        cursor = data.nextCursor;
        more.classList.toggle('hidden', !cursor);
        empty.classList.toggle('hidden', list.children.length > 0);
        showAlert(alertBox, '');
      }).catch(function (err) { showAlert(alertBox, err.message); })
        .then(function () { more.disabled = false; });
    }
    more.addEventListener('click', function () { load(false); });
    return {
      reload: function () { return load(true); },
      prepend: function (post) {
        list.prepend(createPostCard(post, cardOptions));
        empty.classList.add('hidden');
      },
    };
  };
})();
