// เลือกรูปหลายรูป + แสดงตัวอย่าง + ลบก่อนส่ง (ตรวจชนิดและขนาดเบื้องต้น เซิร์ฟเวอร์ตรวจซ้ำ)
(function () {
  const MAX_BYTES = 2 * 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  window.createImagePicker = function (options) {
    const max = options.max;
    const files = [];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.multiple = max > 1;
    input.className = 'hidden';

    const previews = ui.el('div', 'image-previews');
    const button = ui.el('button', 'btn btn-ghost btn-sm', options.label || 'เพิ่มรูป');
    button.type = 'button';

    function render() {
      previews.replaceChildren();
      files.forEach(function (file, i) {
        const item = ui.el('div', 'preview-item');
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        const remove = ui.el('button', 'preview-remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'ลบรูป');
        remove.addEventListener('click', function () { files.splice(i, 1); render(); });
        item.appendChild(img);
        item.appendChild(remove);
        previews.appendChild(item);
      });
      button.disabled = files.length >= max;
    }

    button.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      for (const file of Array.from(input.files)) {
        if (files.length >= max) { options.onError('แนบรูปได้ไม่เกิน ' + max + ' รูป'); break; }
        if (TYPES.indexOf(file.type) === -1) { options.onError('รองรับเฉพาะรูป JPG, PNG และ WebP'); continue; }
        if (file.size > MAX_BYTES) { options.onError('รูป "' + file.name + '" ใหญ่เกิน 2 MB'); continue; }
        files.push(file);
      }
      input.value = '';
      render();
    });

    return {
      button: button,
      input: input,
      previews: previews,
      files: function () { return files.slice(); },
      clear: function () { files.length = 0; render(); },
    };
  };
})();
