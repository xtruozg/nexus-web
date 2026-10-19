/* Đăng nhập — render từ data/login.json, validate, khóa tạm khi sai nhiều lần, bước 2FA OTP */
(function () {
  'use strict';
  const { ui, $, $$, href } = Nexus;
  const { icon, escapeHTML: esc, toast } = ui;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
  const REMEMBER_KEY = 'nexus.login.remember';

  let cfg = null;
  const state = { method: 'email', attempts: 0, lockedUntil: 0, busy: false, submitted: false, touched: new Set() };
  let lockTimer = 0;
  let resendTimer = 0;

  /* localStorage có thể bị chặn (private mode) → luôn bọc try/catch */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(REMEMBER_KEY, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
    clear() { try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* bỏ qua */ } },
  };

  /* ---------- Render ---------- */
  function renderContent() {
    $('#lgProtocol').innerHTML = `
      ${icon(cfg.protocol.icon, 'icon-15 icon--fill c-primary')}
      <span>${esc(cfg.protocol.text)}</span>
      <span class="dot animate-pulse" aria-hidden="true"></span>`;
    $('#lgBadge').textContent = cfg.badge;

    $('#lgMethods').innerHTML = cfg.methods.map((m) =>
      `<button type="button" role="tab" class="seg__btn${m.key === state.method ? ' is-active' : ''}" data-value="${esc(m.key)}">${icon(m.icon, 'icon-16')}<span>${esc(m.label)}</span></button>`).join('');

    $('#dial').innerHTML = cfg.countries.map((c) => `<option value="${esc(c.dial)}">${esc(c.iso)} ${esc(c.dial)}</option>`).join('');

    $('#lgSocial').innerHTML = cfg.social.map((s) => {
      const mark = s.letter
        ? `<span class="lg__social-letter" style="color:${esc(s.color)}">${esc(s.letter)}</span>`
        : icon(s.icon, 'icon-18');
      return `<button type="button" class="lg__social-btn" data-social="${esc(s.label)}"${s.color && !s.letter ? ` style="color:${esc(s.color)}"` : ''}>${mark}<span class="c-on-surface">${esc(s.label)}</span></button>`;
    }).join('');

    $('#lgTrust').innerHTML = cfg.trustBadges.map((b) => `
      <div class="reg__trust-item">${icon(b.icon, `icon-16 c-${esc(b.tone)}`)}<span>${esc(b.text)}</span></div>`).join('');

    $('#otpBoxes').innerHTML = Array.from({ length: cfg.otpLength }, (_, i) =>
      `<input class="lg__otp-box" type="text" inputmode="numeric" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Chữ số ${i + 1}">`).join('');

    $('#phishBox').innerHTML = `${icon('verified_user', 'icon-18 c-secondary')}<span>Mã chống giả mạo của bạn: <strong>${esc(cfg.antiPhishing)}</strong>. Chỉ nhập mã khi thấy đúng mã này.</span>`;

    $('#registerLink').href = href('register');
    setSubmit('#submitBtn', 'idle');
    setSubmit('#verifyBtn', 'verify');
  }

  function setSubmit(sel, mode) {
    const btn = $(sel);
    const s = cfg.submit;
    btn.disabled = mode === 'loading' || mode === 'verifying' || mode === 'success' || mode === 'locked';
    btn.classList.toggle('is-success', mode === 'success');
    btn.innerHTML = {
      idle: `<span>${esc(s.idle)}</span>${icon('login', 'icon-18')}`,
      locked: `${icon('lock_clock', 'icon-18')}<span>Tạm khóa đăng nhập</span>`,
      loading: `<span class="reg__spinner" aria-hidden="true"></span><span>${esc(s.loading)}</span>`,
      verify: `<span>${esc(s.verify)}</span>${icon('verified', 'icon-18')}`,
      verifying: `<span class="reg__spinner" aria-hidden="true"></span><span>${esc(s.verifying)}</span>`,
      success: `${icon('check_circle', 'icon-18')}<span>${esc(s.success)}</span>`,
    }[mode];
  }

  /* ---------- Validation ---------- */
  function setError(id, message) {
    const input = $('#' + id);
    const err = $('#' + id + 'Error');
    const show = Boolean(message) && (state.touched.has(id) || state.submitted);
    input.classList.toggle('is-invalid', show);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    err.textContent = show ? message : '';
    err.classList.toggle('hidden', !show);
    return !message;
  }

  function checkIdentifier() {
    const v = $('#identifier').value.trim();
    let msg = '';
    if (!v) msg = 'Vui lòng nhập email hoặc tên người dùng.';
    else if (v.includes('@') ? !EMAIL_RE.test(v) : !USERNAME_RE.test(v)) {
      msg = v.includes('@') ? 'Email không đúng định dạng.' : 'Tên người dùng gồm 4–20 ký tự chữ, số hoặc dấu _.';
    }
    return setError('identifier', msg);
  }

  function phoneDigits() {
    return $('#phone').value.replace(/\D/g, '').replace(/^0/, '');
  }

  function checkPhone() {
    const d = phoneDigits();
    let msg = '';
    if (!d) msg = 'Vui lòng nhập số điện thoại.';
    else if (d.length < 8 || d.length > 11) msg = 'Số điện thoại không hợp lệ (8–11 chữ số).';
    return setError('phone', msg);
  }

  function checkPassword() {
    const v = $('#password').value;
    let msg = '';
    if (!v) msg = 'Vui lòng nhập mật khẩu.';
    else if (v.length < 8) msg = 'Mật khẩu tối thiểu 8 ký tự.';
    return setError('password', msg);
  }

  function credentialsMatch() {
    const d = cfg.demo;
    if ($('#password').value !== d.password) return false;
    if (state.method === 'phone') return $('#dial').value === '+84' && phoneDigits() === d.phone;
    const id = $('#identifier').value.trim().toLowerCase();
    return id === d.email.toLowerCase() || id === d.username.toLowerCase();
  }

  /* ---------- Khóa tạm sau nhiều lần sai ---------- */
  function showAttemptsLeft() {
    const left = cfg.maxAttempts - state.attempts;
    const box = $('#lockBox');
    box.classList.remove('hidden');
    box.innerHTML = `${icon('error', 'icon-18')}<span>Thông tin đăng nhập không chính xác. Bạn còn <strong>${left}</strong> lần thử trước khi tài khoản bị tạm khóa.</span>`;
  }

  function startLock() {
    state.lockedUntil = Date.now() + cfg.lockSeconds * 1000;
    setSubmit('#submitBtn', 'locked');
    const box = $('#lockBox');
    box.classList.remove('hidden');
    const tick = () => {
      const s = Math.ceil((state.lockedUntil - Date.now()) / 1000);
      if (s <= 0) {
        clearInterval(lockTimer);
        state.attempts = 0;
        state.lockedUntil = 0;
        box.classList.add('hidden');
        setSubmit('#submitBtn', 'idle');
        return;
      }
      box.innerHTML = `${icon('lock_clock', 'icon-18')}<span>Nhập sai ${cfg.maxAttempts} lần liên tiếp. Đăng nhập tạm khóa, thử lại sau <strong class="num">${s}s</strong> hoặc dùng <a href="#" data-forgot class="c-primary">Quên mật khẩu</a>.</span>`;
    };
    tick();
    clearInterval(lockTimer);
    lockTimer = setInterval(tick, 1000);
  }

  /* ---------- Bước 1: submit ---------- */
  function onSubmit(e) {
    e.preventDefault();
    if (state.busy || state.lockedUntil > Date.now()) return;
    state.submitted = true;
    const okId = state.method === 'email' ? checkIdentifier() : checkPhone();
    const okPwd = checkPassword();
    if (!okId || !okPwd) {
      const first = $('#loginForm .is-invalid');
      if (first) first.focus();
      return;
    }
    state.busy = true;
    setSubmit('#submitBtn', 'loading');
    setTimeout(() => {
      state.busy = false;
      if (!credentialsMatch()) {
        state.attempts += 1;
        $('#password').value = '';
        $('#password').focus();
        if (state.attempts >= cfg.maxAttempts) startLock();
        else { setSubmit('#submitBtn', 'idle'); showAttemptsLeft(); }
        return;
      }
      state.attempts = 0;
      $('#lockBox').classList.add('hidden');
      if ($('#remember').checked) {
        store.set({ method: state.method, identifier: $('#identifier').value.trim(), dial: $('#dial').value, phone: $('#phone').value });
      } else {
        store.clear();
      }
      setSubmit('#submitBtn', 'idle');
      showOtpStep();
    }, cfg.submit.processMs);
  }

  /* ---------- Bước 2: OTP ---------- */
  function maskTarget() {
    if (state.method === 'phone') {
      const d = phoneDigits();
      return `${$('#dial').value} ••• ••• ${d.slice(-3)}`;
    }
    const id = $('#identifier').value.trim();
    if (!id.includes('@')) return id;
    const [name, domain] = id.split('@');
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
  }

  function showOtpStep() {
    $('#loginForm').classList.add('hidden');
    $('#otpForm').classList.remove('hidden');
    $('#lgTitle').textContent = 'Xác thực bảo mật';
    $('#lgSubtitle').textContent = 'Bước cuối cùng để bảo vệ tài sản của bạn.';
    $('#otpTarget').innerHTML = `Nhập mã từ ứng dụng Authenticator liên kết với <span class="c-on-surface fw-600">${esc(maskTarget())}</span>`;
    clearOtp();
    startResend();
    toast(`Mã demo: ${cfg.demo.otp}`, 'info');
  }

  function backToLogin() {
    clearInterval(resendTimer);
    $('#otpForm').classList.add('hidden');
    $('#loginForm').classList.remove('hidden');
    $('#lgTitle').textContent = 'Đăng nhập tài khoản';
    $('#lgSubtitle').textContent = 'Chào mừng trở lại sàn giao dịch NEXUS CRYPTO. Vui lòng xác thực để tiếp tục.';
    $('#password').focus();
  }

  function startResend() {
    let s = cfg.otpResendSeconds;
    const btn = $('#resendBtn');
    const render = () => {
      btn.disabled = s > 0;
      btn.innerHTML = s > 0 ? `${icon('schedule', 'icon-16')}Gửi lại sau <span class="num">${s}s</span>` : `${icon('refresh', 'icon-16')}Gửi lại mã`;
      $('#otpTimer').textContent = s > 0 ? `Mã hiệu lực ${s}s` : 'Mã đã hết hạn';
    };
    render();
    clearInterval(resendTimer);
    resendTimer = setInterval(() => { s -= 1; render(); if (s <= 0) clearInterval(resendTimer); }, 1000);
  }

  const otpBoxes = () => $$('.lg__otp-box');
  const otpValue = () => otpBoxes().map((b) => b.value).join('');

  function clearOtp() {
    otpBoxes().forEach((b) => { b.value = ''; b.classList.remove('is-filled'); });
    setOtpError('');
    setTimeout(() => otpBoxes()[0].focus(), 50);
  }

  function setOtpError(msg) {
    $('#otpBoxes').classList.toggle('is-invalid', Boolean(msg));
    $('#otpError').textContent = msg;
    $('#otpError').classList.toggle('hidden', !msg);
  }

  function fillOtp(from, digits) {
    const boxes = otpBoxes();
    digits.split('').forEach((ch, i) => {
      const b = boxes[from + i];
      if (b) { b.value = ch; b.classList.add('is-filled'); }
    });
    const next = boxes[Math.min(from + digits.length, boxes.length - 1)];
    next.focus();
    if (otpValue().length === cfg.otpLength) verifyOtp();
  }

  function bindOtp() {
    const wrap = $('#otpBoxes');
    wrap.addEventListener('input', (e) => {
      const box = e.target;
      const idx = otpBoxes().indexOf(box);
      const digits = box.value.replace(/\D/g, '');
      box.value = '';
      box.classList.remove('is-filled');
      setOtpError('');
      if (digits) fillOtp(idx, digits.slice(0, cfg.otpLength - idx));
    });
    wrap.addEventListener('keydown', (e) => {
      const boxes = otpBoxes();
      const idx = boxes.indexOf(e.target);
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        boxes[idx - 1].value = '';
        boxes[idx - 1].classList.remove('is-filled');
        boxes[idx - 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && idx > 0) boxes[idx - 1].focus();
      else if (e.key === 'ArrowRight' && idx < boxes.length - 1) boxes[idx + 1].focus();
    });
    wrap.addEventListener('paste', (e) => {
      const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      otpBoxes().forEach((b) => { b.value = ''; b.classList.remove('is-filled'); });
      fillOtp(0, digits.slice(0, cfg.otpLength));
    });
    wrap.addEventListener('focusin', (e) => e.target.select());

    $('#otpForm').addEventListener('submit', (e) => { e.preventDefault(); verifyOtp(); });
    $('#backBtn').addEventListener('click', backToLogin);
    $('#resendBtn').addEventListener('click', () => {
      startResend();
      clearOtp();
      toast(`Đã gửi lại mã. Mã demo: ${cfg.demo.otp}`, 'success');
    });
  }

  function verifyOtp() {
    if (state.busy) return;
    const code = otpValue();
    if (code.length < cfg.otpLength) return setOtpError(`Vui lòng nhập đủ ${cfg.otpLength} chữ số.`);
    if ($('#resendBtn').disabled === false) return setOtpError('Mã đã hết hạn, vui lòng gửi lại mã mới.');
    state.busy = true;
    setSubmit('#verifyBtn', 'verifying');
    setTimeout(() => {
      if (code !== cfg.demo.otp) {
        state.busy = false;
        setSubmit('#verifyBtn', 'verify');
        setOtpError('Mã xác thực không đúng. Vui lòng thử lại.');
        setTimeout(clearOtp, 400);
        return;
      }
      clearInterval(resendTimer);
      setSubmit('#verifyBtn', 'success');
      toast(cfg.submit.toast, 'success');
      setTimeout(() => { location.href = redirectTarget(); }, cfg.submit.redirectMs);
    }, cfg.submit.processMs);
  }

  /* Chỉ cho phép quay lại trang nội bộ (?redirect=wallet.html) để tránh open redirect */
  function redirectTarget() {
    const r = new URLSearchParams(location.search).get('redirect');
    return r && /^[a-z0-9_-]+\.html([?#].*)?$/i.test(r) ? r : href('markets');
  }

  /* ---------- Bind ---------- */
  function switchMethod(m) {
    state.method = m;
    $$('[data-method]').forEach((el) => el.classList.toggle('hidden', el.dataset.method !== m));
    $$('#lgMethods [data-value]').forEach((b) => b.classList.toggle('is-active', b.dataset.value === m));
    state.touched.clear();
    ['identifier', 'phone'].forEach((id) => setError(id, ''));
  }

  function bindForm() {
    ui.bindTabs($('#lgMethods'), (v) => { switchMethod(v); $(v === 'phone' ? '#phone' : '#identifier').focus(); });

    const validators = { identifier: checkIdentifier, phone: checkPhone, password: checkPassword };
    Object.keys(validators).forEach((id) => {
      const input = $('#' + id);
      input.addEventListener('blur', () => {
        if (!input.value && !state.submitted) return;
        state.touched.add(id);
        validators[id]();
      });
      input.addEventListener('input', () => { if (state.touched.has(id) || state.submitted) validators[id](); });
    });

    $('#password').addEventListener('keyup', (e) => {
      $('#capsHint').classList.toggle('hidden', !(e.getModifierState && e.getModifierState('CapsLock')));
    });

    $$('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const input = $('#' + btn.dataset.toggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('.icon').textContent = show ? 'visibility_off' : 'visibility';
      btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    }));

    $('#demoBtn').addEventListener('click', () => {
      switchMethod('email');
      $('#identifier').value = cfg.demo.email;
      $('#password').value = cfg.demo.password;
      state.touched.add('identifier');
      state.touched.add('password');
      checkIdentifier();
      checkPassword();
      toast('Đã điền tài khoản demo', 'success');
    });

    $('#lgSocial').addEventListener('click', (e) => {
      const b = e.target.closest('[data-social]');
      if (b) toast(`Đăng nhập bằng ${b.dataset.social} đang được phát triển`, 'info');
    });

    // Quên mật khẩu (link trong nhãn hoặc trong hộp khóa)
    document.addEventListener('click', (e) => {
      const a = e.target.closest('#forgotLink, [data-forgot]');
      if (a) {
        e.preventDefault();
        const id = $('#identifier').value.trim();
        if (state.method === 'email' && EMAIL_RE.test(id)) toast(`Đã gửi liên kết đặt lại mật khẩu tới ${id}`, 'success');
        else toast('Nhập email đã đăng ký rồi bấm "Quên mật khẩu?" để nhận liên kết đặt lại', 'info');
        return;
      }
      const soon = e.target.closest('a[href="#"]');
      if (soon) { e.preventDefault(); toast('Tính năng đang được phát triển', 'info'); }
    });

    $('#loginForm').addEventListener('submit', onSubmit);
  }

  function restoreRemembered() {
    const saved = store.get();
    if (!saved) return;
    $('#remember').checked = true;
    switchMethod(saved.method === 'phone' ? 'phone' : 'email');
    $('#identifier').value = saved.identifier || '';
    $('#dial').value = saved.dial || cfg.countries[0].dial;
    $('#phone').value = saved.phone || '';
  }

  Nexus.boot(['login.json'], ({ data }) => {
    cfg = data.login;
    renderContent();
    bindForm();
    bindOtp();
    restoreRemembered();
  });
})();
