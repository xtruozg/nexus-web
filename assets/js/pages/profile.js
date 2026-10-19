/* Trung tâm người dùng — render từ data/profile.json + common.user, cài đặt bảo mật, thiết bị, phiên */
(function () {
  'use strict';
  const { fmt, ui, $, $$, href } = Nexus;
  const { icon, toast, escapeHTML: esc } = ui;

  let user = {};
  let p = {};
  let balanceHidden = false;

  /* ---------- Helpers ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }
  const maskCode = (c) => (c.length > 5 ? c.slice(0, 3) + '***' + c.slice(-2) : c.slice(0, 1) + '***');
  const last4 = (n) => String(n).slice(-4);

  function safety() {
    let score = p.safety.base;
    if (!p.security.twoFA) score -= 30;
    if (!p.antiPhishing.enabled) score -= 8;
    if (!p.security.withdrawWhitelist) score -= 5;
    const label = score >= 90 ? 'Rất cao' : score >= 70 ? 'Cao' : score >= 50 ? 'Trung bình' : 'Thấp';
    return { score, label };
  }

  /* ---------- Modal ---------- */
  const modal = { el: null, buttons: [] };

  function openModal(title, body, buttons = []) {
    modal.buttons = buttons;
    $('#pf-modal-title').textContent = title;
    $('#pf-modal-body').innerHTML = body;
    const foot = $('#pf-modal-foot');
    foot.innerHTML = buttons.map((b, i) =>
      `<button type="button" class="btn btn--md ${b.cls || 'btn--ghost'}" data-btn="${i}">${esc(b.text)}</button>`).join('');
    foot.classList.toggle('hidden', !buttons.length);
    modal.el.classList.add('is-open');
    const first = $('#pf-modal-body input, #pf-modal-body select');
    if (first) first.focus();
  }
  function closeModal() { modal.el.classList.remove('is-open'); }

  function bindModal() {
    modal.el = $('#pf-modal');
    modal.el.addEventListener('click', (e) => {
      if (e.target === modal.el || e.target.closest('[data-close]')) return closeModal();
      const b = e.target.closest('[data-btn]');
      if (!b) return;
      const def = modal.buttons[+b.dataset.btn];
      const keep = def.action ? def.action() === false : false;
      if (!keep) closeModal();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    $('#pf-modal-body').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      const primary = $('#pf-modal-foot .btn--primary');
      if (primary) { e.preventDefault(); primary.click(); }
    });
  }

  function fieldError(input, msg) {
    input.classList.add('is-invalid');
    const box = input.closest('.field');
    let err = $('.field__error', box);
    if (!err) { err = document.createElement('span'); err.className = 'field__error'; box.appendChild(err); }
    err.textContent = msg;
    input.addEventListener('input', () => { input.classList.remove('is-invalid'); err.remove(); }, { once: true });
    input.focus();
    return false;
  }

  /* ---------- Hero ---------- */
  function renderIdentity() {
    const s = p.lastLogin;
    $('#pf-identity').innerHTML = `
      <div class="pf-avatar">
        <div class="pf-avatar__frame">
          <img class="pf-avatar__img" id="pf-avatar-img" src="${esc(user.avatar)}" alt="Ảnh đại diện ${esc(user.displayName)}" onerror="this.style.visibility='hidden'">
          <div class="pf-avatar__hover" data-avatar>${icon('photo_camera', 'icon-26')}</div>
        </div>
        <button type="button" class="pf-avatar__btn" data-avatar aria-label="Thay đổi ảnh đại diện">
          ${icon('photo_camera', 'icon-18')}
          <span class="pf-avatar__tip">Nhấp để tải lên / thay đổi ảnh đại diện</span>
        </button>
      </div>
      <div class="pf-id__meta">
        <div class="flex items-center gap-xs wrap">
          <h1 class="pf-id__name">${esc(user.displayName)}</h1>
          <button type="button" class="pf-id__nick" id="pf-nick" title="Đổi biệt danh">(${esc(p.nickname)})</button>
          <span class="pf-id__vip">VIP ${user.vipLevel}</span>
        </div>
        <div class="flex items-center gap-sm wrap" style="margin-top:2px">
          <div class="pf-uid">
            <span class="t-label-sm c-muted">UID:</span>
            <span class="pf-uid__value num" id="pf-uid">${esc(p.uidPrefix + user.uid)}</span>
            <button type="button" class="pf-uid__copy" id="pf-copy-uid" aria-label="Sao chép ID" title="Sao chép ID">${icon('content_copy', 'icon-16')}</button>
          </div>
          <span class="pf-kyc-badge">${icon('verified', 'icon-15 icon--fill')}${esc(p.kyc.badge)}</span>
        </div>
        <p class="pf-id__since">
          ${icon('schedule', 'icon-15 c-outline')}
          <span>Thành viên từ: <span class="pf-id__val">${esc(p.memberSince)}</span></span>
          <span style="margin-inline:2px">•</span>
          <span>Đăng nhập gần nhất: <span class="pf-id__val c-secondary">${esc(s.time)} (IP: ${esc(s.ip)})</span></span>
        </p>
      </div>`;
  }

  function renderBalance() {
    const b = p.balance;
    const hide = balanceHidden;
    $('#pf-balance').innerHTML = `
      <div>
        <div class="pf-balance__head">
          <span class="flex items-center gap-xs">${icon('account_balance_wallet', 'icon-16 c-primary')}Tổng quan số dư tài sản ước tính</span>
          <button type="button" class="pf-balance__eye" id="pf-eye" aria-label="Ẩn hiện số dư" title="Ẩn/hiện số dư" aria-pressed="${hide}">${icon(hide ? 'visibility_off' : 'visibility', 'icon-16')}</button>
        </div>
        <div class="flex items-center gap-sm wrap" style="align-items:baseline">
          <span class="pf-balance__amount num">${hide ? '******' : fmt.usd(b.total)}</span>
          <span class="t-data c-primary fw-600">${esc(b.currency)}</span>
        </div>
        <div class="pf-balance__sub num">
          <span class="inline-flex items-center c-secondary fw-600" style="gap:2px">${icon('trending_up', 'icon-15')}${fmt.percent(b.weekChange, 1)} tuần này</span>
          <span class="c-muted">≈ ${hide ? '******' : Math.round(b.vnd).toLocaleString('en-US')} VNĐ</span>
        </div>
      </div>
      <div class="pf-balance__actions">
        <a class="pf-act pf-act--withdraw" href="${href('wallet')}?action=withdraw">${icon('arrow_upward', 'icon-20')}<span>RÚT TIỀN</span></a>
        <a class="pf-act" href="${href('deposit')}?action=deposit">${icon('arrow_downward', 'icon-18 c-secondary')}<span>Nạp tiền</span></a>
        <a class="pf-act" href="${href('wallet')}?action=transfer">${icon('sync_alt', 'icon-18 c-muted')}<span>Chuyển</span></a>
      </div>`;
  }

  function renderStats() {
    const sf = safety();
    $('#pf-stats').innerHTML = p.stats.map((s) => {
      const value = s.key === 'safety' ? `${sf.label} (${sf.score}%)` : s.value;
      const tone = s.key === 'safety' && sf.score < 70 ? 'error' : s.tone;
      return `<div class="pf-stat">
        <div class="pf-stat__icon">${icon(s.icon, 'icon-22 c-' + tone)}</div>
        <div style="min-width:0">
          <p class="t-label-sm c-muted truncate">${esc(s.label)}</p>
          <p class="t-headline-sm truncate num">${esc(value)}</p>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- Settings list ---------- */
  function itemView(it) {
    // Trạng thái động cho ngân hàng & 2FA
    if (it.key === 'bank') {
      return { ...it, action: { ...it.action, text: `Đã liên kết: ${p.bank.name} ****${last4(p.bank.number)}` } };
    }
    if (it.key === '2fa') {
      const on = p.security.twoFA;
      return {
        ...it, done: on,
        tag: on ? it.tag : { text: 'Chưa bật', style: 'warn' },
        action: on ? { ...it.action, text: p.security.twoFAApp } : { type: 'status', text: 'Bật ngay', icon: 'gpp_maybe', tone: 'warn' },
      };
    }
    return it;
  }

  function rowHTML(raw) {
    const it = itemView(raw);
    const tag = it.tag
      ? `<span class="pf-tag pf-tag--${it.tag.style}">${it.tag.style === 'live' ? '<span class="pf-tag__ping"></span>' : ''}${esc(it.tag.text)}</span>`
      : '';
    const a = it.action;
    const side = a.type === 'link'
      ? `<span class="pf-link"><span>${esc(a.text)}</span>${icon(a.icon, 'icon-16')}</span>`
      : `<span class="pf-status pf-status--${a.tone}">${icon(a.icon, 'icon-16' + (a.fill ? ' icon--fill' : ''))}<span>${esc(a.text)}</span></span>`;
    return `<button type="button" class="pf-row" data-setting="${it.key}">
      <div class="pf-row__main">
        <div class="pf-row__icon pf-row__icon--${it.tone}">${icon(it.icon, 'icon-24')}</div>
        <div style="min-width:0">
          <div class="pf-row__title"><span class="t-headline-sm">${esc(it.title)}</span>${tag}</div>
          <p class="pf-row__desc">${esc(it.desc)}</p>
        </div>
      </div>
      <div class="pf-row__side">${side}${icon('chevron_right', 'icon-20 pf-row__chev')}</div>
    </button>`;
  }

  function renderSettings() {
    const s = p.settings;
    $('#pf-settings-title').textContent = s.title;
    $('#pf-settings-desc').textContent = s.desc;
    const views = s.items.map(itemView);
    const done = views.filter((v) => v.done).length;
    const count = $('#pf-settings-count');
    count.classList.toggle('is-warn', done < views.length);
    count.innerHTML = `<span class="dot"></span>${done}/${views.length} Cấu hình hoàn tất`;
    $('#pf-settings-list').innerHTML = s.items.map(rowHTML).join('');
  }

  /* ---------- Audit cards ---------- */
  function renderDevices() {
    const list = p.devices;
    const lines = list.slice(0, 2).map((d) =>
      `${esc(d.name)}${d.current ? ` (${esc(d.location)})` : ''} • ${esc(d.client)}`).join('<br>');
    const more = list.length > 2 ? `<br>+${list.length - 2} thiết bị khác` : '';
    $('#pf-devices').innerHTML = `
        <div class="pf-card__head">
          <span class="pf-card__title t-headline-sm">${icon('devices', 'icon-18 c-primary')}Thiết bị đăng nhập</span>
          <span class="t-label-sm c-secondary">Đang hoạt động: ${list.length}</span>
        </div>
        <p class="pf-card__text">${lines}${more}</p>
      <button type="button" class="pf-card__link" id="pf-manage-devices"><span>Quản lý thiết bị tin cậy</span>${icon('arrow_forward', 'icon-14')}</button>`;
  }

  function renderPhishing() {
    const ap = p.antiPhishing;
    $('#pf-phishing').innerHTML = `
        <div class="pf-card__head">
          <span class="pf-card__title t-headline-sm">${icon('phishing', 'icon-18 c-secondary')}Mã chống giả mạo</span>
          <span class="pf-card__pill pf-card__pill--${ap.enabled ? 'on' : 'off'}">${ap.enabled ? 'Đã bật' : 'Đã tắt'}</span>
        </div>
        <p class="pf-card__text">${ap.enabled
          ? `Mã xác thực duy nhất hiển thị trên mọi email chính thức được gửi từ NEXUS Exchange: <span class="t-data c-primary fw-700">${esc(maskCode(ap.code))}</span>`
          : 'Bật mã chống giả mạo để nhận diện email chính thức từ NEXUS Exchange và tránh lừa đảo.'}</p>
      <button type="button" class="pf-card__link" id="pf-change-phishing"><span>${ap.enabled ? 'Thay đổi mã bảo vệ' : 'Thiết lập mã bảo vệ'}</span>${icon('arrow_forward', 'icon-14')}</button>`;
  }

  function renderSession() {
    $('#pf-session').innerHTML = `
        <div class="pf-card__head">
          <span class="pf-card__title t-headline-sm">${icon('power_settings_new', 'icon-18 c-error')}Phiên hoạt động</span>
          <span class="t-data c-muted">Session #${p.session.id}</span>
        </div>
        <p class="pf-card__text">Ngắt kết nối lập tức trên toàn bộ các thiết bị khác hoặc khóa tài khoản khẩn cấp trong trường hợp nghi ngờ lộ thông tin.</p>
      <button type="button" class="pf-danger-btn" id="pf-logout-all">Đăng xuất mọi thiết bị</button>`;
  }

  function refreshSecurity() {
    renderStats();
    renderSettings();
    renderPhishing();
  }

  /* ---------- Modals theo từng mục ---------- */
  function openNickname() {
    openModal('Đổi biệt danh', `
      <div class="pf-form">
        <label class="field"><span class="field__label">BIỆT DANH HIỂN THỊ</span>
          <input class="input input--lg" id="m-nick" maxlength="20" value="${esc(p.nickname)}"></label>
        <p class="field__hint">3–20 ký tự, chỉ gồm chữ cái không dấu, số và dấu gạch dưới.</p>
      </div>`, [
      { text: 'Hủy' },
      { text: 'Lưu thay đổi', cls: 'btn--primary', action: () => {
        const input = $('#m-nick');
        const v = input.value.trim();
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) return fieldError(input, 'Biệt danh không hợp lệ');
        p.nickname = v;
        renderIdentity();
        toast('Đã cập nhật biệt danh', 'success');
      } },
    ]);
  }

  function openSupport() {
    openModal('Liên hệ CSKH — Chuyên viên VIP', `
      <div class="pf-form">
        <div class="pf-chat" id="m-chat">
          <div class="pf-chat__msg">Xin chào ${esc(user.displayName)}! Chuyên viên VIP của Nexus đã sẵn sàng. Chúng tôi có thể hỗ trợ gì cho bạn?</div>
        </div>
        <div class="flex gap-sm">
          <input class="input" id="m-chat-input" placeholder="Nhập nội dung cần hỗ trợ...">
          <button type="button" class="btn btn--primary" id="m-chat-send">${icon('send', 'icon-16')}</button>
        </div>
      </div>`);
    const box = $('#m-chat');
    const input = $('#m-chat-input');
    const send = () => {
      const v = input.value.trim();
      if (!v) return;
      box.insertAdjacentHTML('beforeend', `<div class="pf-chat__msg pf-chat__msg--me">${esc(v)}</div>`);
      input.value = '';
      box.scrollTop = box.scrollHeight;
      setTimeout(() => {
        box.insertAdjacentHTML('beforeend', '<div class="pf-chat__msg">Cảm ơn bạn! Yêu cầu đã được ghi nhận, chuyên viên sẽ phản hồi trong vòng 2 phút.</div>');
        box.scrollTop = box.scrollHeight;
      }, 700);
    };
    $('#m-chat-send').addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  function openKyc() {
    const k = p.kyc;
    openModal('Xác minh danh tính (KYC)', `
      <div class="pf-kv"><span class="c-muted">Trạng thái</span><span class="c-secondary fw-600">${esc(k.status)}</span></div>
      <div class="pf-kv"><span class="c-muted">Họ tên</span><span>${esc(user.displayName)}</span></div>
      <div class="pf-kv"><span class="c-muted">Giấy tờ</span><span class="num">${esc(k.document)}</span></div>
      <div class="pf-kv"><span class="c-muted">Quốc gia</span><span>${esc(k.country)}</span></div>
      <div class="pf-kv"><span class="c-muted">Ngày xác minh</span><span class="num">${esc(k.verifiedAt)}</span></div>
      <div style="margin-top:12px">${k.checks.map((c) =>
        `<div class="pf-check">${icon(c.done ? 'check_circle' : 'radio_button_unchecked', 'icon-18 ' + (c.done ? 'c-secondary icon--fill' : 'c-muted'))}<span class="${c.done ? '' : 'c-muted'}">${esc(c.label)}</span></div>`).join('')}</div>`, [
      { text: 'Đóng' },
      { text: 'Nâng cấp Level 3', cls: 'btn--primary', action: () => toast('Đã gửi yêu cầu xác minh Level 3', 'success') },
    ]);
  }

  function openPin() {
    const pinField = (id, label) => `<label class="field"><span class="field__label">${label}</span>
      <input class="input input--lg pf-pin" id="${id}" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••••"></label>`;
    openModal('Đổi mật khẩu ví giao dịch', `
      <div class="pf-form">
        ${pinField('m-pin-old', 'MÃ PIN HIỆN TẠI')}
        ${pinField('m-pin-new', 'MÃ PIN MỚI (6 CHỮ SỐ)')}
        ${pinField('m-pin-confirm', 'XÁC NHẬN MÃ PIN MỚI')}
      </div>`, [
      { text: 'Hủy' },
      { text: 'Cập nhật mã PIN', cls: 'btn--primary', action: () => {
        const [o, n, c] = ['#m-pin-old', '#m-pin-new', '#m-pin-confirm'].map((s) => $(s));
        const six = /^\d{6}$/;
        if (!six.test(o.value)) return fieldError(o, 'Vui lòng nhập mã PIN hiện tại gồm 6 chữ số');
        if (!six.test(n.value)) return fieldError(n, 'Mã PIN mới phải gồm đúng 6 chữ số');
        if (/^(\d)\1{5}$/.test(n.value) || '0123456789'.includes(n.value)) return fieldError(n, 'Mã PIN quá dễ đoán');
        if (n.value === o.value) return fieldError(n, 'Mã PIN mới phải khác mã hiện tại');
        if (c.value !== n.value) return fieldError(c, 'Mã PIN xác nhận không khớp');
        toast('Đã cập nhật mật khẩu ví giao dịch', 'success');
      } },
    ]);
  }

  function openBank() {
    const b = p.bank;
    openModal('Tài khoản ngân hàng thụ hưởng', `
      <div class="pf-form">
        <label class="field"><span class="field__label">NGÂN HÀNG</span>
          <select class="input input--lg select" id="m-bank">${b.options.map((o) => `<option${o === b.name ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        <label class="field"><span class="field__label">SỐ TÀI KHOẢN</span>
          <input class="input input--lg num" id="m-bank-no" inputmode="numeric" maxlength="19" value="${esc(b.number)}"></label>
        <label class="field"><span class="field__label">CHỦ TÀI KHOẢN</span>
          <input class="input input--lg" id="m-bank-holder" value="${esc(b.holder)}" readonly></label>
        <p class="field__hint">Tên chủ tài khoản phải trùng với họ tên đã xác minh KYC.</p>
      </div>`, [
      { text: 'Hủy' },
      { text: 'Lưu liên kết', cls: 'btn--primary', action: () => {
        const no = $('#m-bank-no');
        if (!/^\d{6,19}$/.test(no.value.trim())) return fieldError(no, 'Số tài khoản gồm 6–19 chữ số');
        b.name = $('#m-bank').value;
        b.number = no.value.trim();
        renderSettings();
        toast(`Đã liên kết ${b.name} ****${last4(b.number)}`, 'success');
      } },
    ]);
  }

  function openSecurity() {
    const s = p.security;
    const row = (key, title, desc) => `<div class="pf-toggle">
      <div><p class="t-label-lg">${title}</p><p class="t-body-sm c-muted">${desc}</p></div>
      <label class="switch"><input type="checkbox" data-sec="${key}"${s[key] ? ' checked' : ''} aria-label="${title}"></label>
    </div>`;
    openModal('Bảo mật 2 lớp & tùy chọn an toàn', `
      ${row('twoFA', 'Google Authenticator (2FA)', 'Yêu cầu mã động khi đăng nhập và rút tiền')}
      ${row('withdrawWhitelist', 'Danh sách trắng địa chỉ rút', 'Chỉ cho phép rút tới các địa chỉ đã lưu')}
      ${row('loginAlert', 'Cảnh báo đăng nhập mới', 'Gửi email khi có thiết bị lạ đăng nhập')}`, [
      { text: 'Xong', cls: 'btn--primary' },
    ]);
    const labels = { twoFA: 'Bảo mật 2 lớp', withdrawWhitelist: 'Danh sách trắng rút tiền', loginAlert: 'Cảnh báo đăng nhập' };
    $$('[data-sec]', $('#pf-modal-body')).forEach((inp) => inp.addEventListener('change', () => {
      s[inp.dataset.sec] = inp.checked;
      refreshSecurity();
      toast(`${labels[inp.dataset.sec]}: ${inp.checked ? 'đã bật' : 'đã tắt'}`, inp.checked ? 'success' : 'error');
    }));
  }

  function devicesHTML() {
    return p.devices.map((d) => `<div class="pf-device">
      <div class="pf-device__icon">${icon(d.icon, 'icon-22')}</div>
      <div class="flex-1">
        <p class="t-label-lg">${esc(d.name)} ${d.current ? '<span class="badge badge--success">Thiết bị này</span>' : ''}</p>
        <p class="t-body-sm c-muted truncate">${esc(d.client)} • ${esc(d.location)} • IP ${esc(d.ip)}</p>
        <p class="t-body-sm ${d.current ? 'c-secondary' : 'c-muted'}">${esc(d.lastActive)}</p>
      </div>
      ${d.current ? '' : `<button type="button" class="pf-revoke" data-revoke="${esc(d.id)}">Thu hồi</button>`}
    </div>`).join('');
  }

  function openDevices() {
    openModal('Quản lý thiết bị tin cậy', `<div id="m-devices">${devicesHTML()}</div>`, [{ text: 'Đóng' }]);
    $('#m-devices').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-revoke]');
      if (!btn) return;
      const d = p.devices.find((x) => x.id === btn.dataset.revoke);
      p.devices = p.devices.filter((x) => x !== d);
      $('#m-devices').innerHTML = devicesHTML();
      renderDevices();
      toast(`Đã thu hồi quyền truy cập: ${d.name}`, 'success');
    });
  }

  function openPhishing() {
    const ap = p.antiPhishing;
    openModal('Mã chống giả mạo', `
      <div class="pf-form">
        <div class="pf-toggle" style="padding-top:0">
          <div><p class="t-label-lg">Bật mã chống giả mạo</p><p class="t-body-sm c-muted">Hiển thị trong mọi email chính thức</p></div>
          <label class="switch"><input type="checkbox" id="m-ap-on"${ap.enabled ? ' checked' : ''} aria-label="Bật mã chống giả mạo"></label>
        </div>
        <label class="field"><span class="field__label">MÃ BẢO VỆ MỚI</span>
          <input class="input input--lg" id="m-ap-code" maxlength="20" placeholder="VD: NEXUS77" value="${esc(ap.code)}"></label>
        <p class="field__hint">4–20 ký tự chữ và số. Không chia sẻ mã này cho bất kỳ ai.</p>
      </div>`, [
      { text: 'Hủy' },
      { text: 'Lưu mã bảo vệ', cls: 'btn--primary', action: () => {
        const input = $('#m-ap-code');
        const on = $('#m-ap-on').checked;
        const v = input.value.trim();
        if (on && !/^[A-Za-z0-9]{4,20}$/.test(v)) return fieldError(input, 'Mã bảo vệ gồm 4–20 ký tự chữ và số');
        ap.enabled = on;
        if (on) ap.code = v;
        refreshSecurity();
        toast(on ? 'Đã cập nhật mã chống giả mạo' : 'Đã tắt mã chống giả mạo', on ? 'success' : 'error');
      } },
    ]);
  }

  function openLogoutAll() {
    const others = p.devices.filter((d) => !d.current).length;
    openModal('Đăng xuất mọi thiết bị', `
      <p class="t-body-md">Toàn bộ <strong class="c-primary">${others}</strong> thiết bị khác sẽ bị ngắt kết nối ngay lập tức. Phiên hiện tại trên thiết bị này được giữ lại.</p>
      <p class="t-body-sm c-muted" style="margin-top:8px">Nếu nghi ngờ lộ thông tin, hãy đổi mật khẩu và mã PIN ví sau khi đăng xuất.</p>`, [
      { text: 'Hủy' },
      { text: 'Đăng xuất tất cả', cls: 'btn--sell', action: () => {
        p.devices = p.devices.filter((d) => d.current);
        p.session.id = 1000 + Math.floor(Math.random() * 9000);
        renderDevices();
        renderSession();
        toast(others ? `Đã đăng xuất ${others} thiết bị khác` : 'Không có thiết bị nào khác đang đăng nhập', 'success');
      } },
    ]);
  }

  /* ---------- Bind ---------- */
  function bindPage() {
    const main = $('main');
    const settingHandlers = { support: openSupport, kyc: openKyc, pin: openPin, bank: openBank, '2fa': openSecurity };
    const fileInput = $('#pf-avatar-input');

    main.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-avatar]')) return fileInput.click();
      if (t.closest('#pf-nick')) return openNickname();
      if (t.closest('#pf-eye')) { balanceHidden = !balanceHidden; return renderBalance(); }
      if (t.closest('#pf-manage-devices')) return openDevices();
      if (t.closest('#pf-change-phishing')) return openPhishing();
      if (t.closest('#pf-logout-all')) return openLogoutAll();
      const copyBtn = t.closest('#pf-copy-uid');
      if (copyBtn) {
        copyText($('#pf-uid').textContent.trim()).then(() => {
          toast('Đã sao chép UID', 'success');
        }).catch(() => toast('Không thể sao chép UID', 'error'));
        copyBtn.classList.add('is-done');
        copyBtn.firstElementChild.textContent = 'check';
        setTimeout(() => { copyBtn.classList.remove('is-done'); copyBtn.firstElementChild.textContent = 'content_copy'; }, 2000);
        return;
      }
      const row = t.closest('[data-setting]');
      if (row && settingHandlers[row.dataset.setting]) settingHandlers[row.dataset.setting]();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast('Vui lòng chọn tệp hình ảnh', 'error');
      if (file.size > 5 * 1024 * 1024) return toast('Ảnh tối đa 5MB', 'error');
      user.avatar = URL.createObjectURL(file);
      $('#pf-avatar-img').src = user.avatar;
      $('#pf-avatar-img').style.visibility = '';
      $$('.app-header .avatar').forEach((img) => { img.src = user.avatar; });
      fileInput.value = '';
      toast('Đã cập nhật ảnh đại diện', 'success');
    });
  }

  Nexus.boot(['profile.json'], ({ common, data }) => {
    user = { ...common.user };
    p = JSON.parse(JSON.stringify(data.profile));
    renderIdentity();
    renderBalance();
    renderStats();
    renderSettings();
    renderDevices();
    renderPhishing();
    renderSession();
    bindModal();
    bindPage();
  });
})();
