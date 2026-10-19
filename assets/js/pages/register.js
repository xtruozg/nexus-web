/* Đăng ký tài khoản — render nội dung từ data/register.json, validate realtime, submit giả lập */
(function () {
  'use strict';
  const { ui, $, $$, href } = Nexus;
  const { icon, escapeHTML: esc, toast } = ui;

  const RULE_TESTS = {
    length: (v) => v.length >= 8,
    case: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
    number: (v) => /\d/.test(v),
    symbol: (v) => /[^A-Za-z0-9\s]/.test(v),
  };
  const USERNAME_RE = /^[A-Za-z0-9_]+$/;
  const FULLNAME_RE = /^[\p{L}][\p{L}'.\- ]*$/u;

  let cfg = null;
  const state = { touched: new Set(), submitted: false, usernameOk: false, country: null, focusIdx: -1, busy: false };
  let usernameTimer = 0;

  const flagImg = (c, cls = '') =>
    `<img class="reg__flag ${cls}" src="https://flagcdn.com/w40/${esc(c.iso.toLowerCase())}.png" alt="${esc(c.flag)}" width="24" height="17" loading="lazy">`;

  /* ---------- Render static content ---------- */
  function renderContent() {
    $('#regProtocol').innerHTML = `
      ${icon(cfg.protocol.icon, 'icon-15 icon--fill c-primary')}
      <span>${esc(cfg.protocol.text)}</span>
      <span class="dot animate-pulse" aria-hidden="true"></span>`;
    $('#regBadge').textContent = cfg.badge;

    const [tos, privacy] = cfg.terms;
    $('#termsText').innerHTML = `Tôi xác nhận đã đọc và đồng ý với
      <a href="${esc(tos.href)}" data-soon>${esc(tos.label)}</a> và
      <a href="${esc(privacy.href)}" data-soon>${esc(privacy.label)}</a> của sàn NEXUS.`;

    $('#regTrust').innerHTML = cfg.trustBadges.map((b) => `
      <div class="reg__trust-item">${icon(b.icon, `icon-16 c-${esc(b.tone)}`)}<span>${esc(b.text)}</span></div>`).join('');

    $('#passwordRules').innerHTML = cfg.passwordRules.map((r) =>
      `<li class="reg__rule" data-rule="${esc(r.id)}">${icon('radio_button_unchecked')}<span>${esc(r.label)}</span></li>`).join('');

    $('#countryMenu').innerHTML = cfg.countries.map((c, i) => `
      <li class="reg__option" role="option" id="country-${esc(c.iso)}" data-index="${i}" aria-selected="false">
        <span class="reg__option-main">${flagImg(c, 'reg__flag--sm')}<span class="t-body-md">${esc(c.name)}</span></span>
        <span class="reg__option-code num">${esc(c.dial)}</span>
      </li>`).join('');

    $('#loginLink').href = href('login');
    setSubmit('idle');
  }

  function setSubmit(mode) {
    const btn = $('#submitBtn');
    const s = cfg.submit;
    btn.disabled = mode !== 'idle';
    btn.classList.toggle('is-success', mode === 'success');
    btn.innerHTML = {
      idle: `<span>${esc(s.idle)}</span>${icon('arrow_forward', 'icon-18')}`,
      loading: `<span class="reg__spinner" aria-hidden="true"></span><span>${esc(s.loading)}</span>`,
      success: `${icon('verified', 'icon-18')}<span>${esc(s.success)}</span>`,
    }[mode];
  }

  /* ---------- Field error helpers ---------- */
  function setError(id, message) {
    const input = $('#' + id);
    const err = $('#' + id + 'Error');
    const show = Boolean(message) && (state.touched.has(id) || state.submitted);
    input.classList.toggle('is-invalid', show);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    if (err) {
      err.textContent = show ? message : '';
      err.classList.toggle('hidden', !show);
    }
    return !message;
  }

  function statusHTML(ico, text) {
    return `${icon(ico)}<span>${esc(text)}</span>`;
  }

  /* ---------- Validators: trả về chuỗi lỗi hoặc '' ---------- */
  function checkFullName() {
    const v = $('#fullName').value.trim().replace(/\s+/g, ' ');
    let msg = '';
    if (!v) msg = 'Vui lòng nhập họ và tên.';
    else if (!FULLNAME_RE.test(v)) msg = 'Họ tên chỉ gồm chữ cái và khoảng trắng.';
    else if (v.split(' ').length < 2) msg = 'Vui lòng nhập đầy đủ họ và tên (ít nhất 2 từ).';
    return setError('fullName', msg);
  }

  function usernameProblem(v) {
    const u = cfg.username;
    if (!v) return { msg: 'Vui lòng nhập tên người dùng.', status: null };
    if (!USERNAME_RE.test(v)) return { msg: 'Chỉ dùng chữ cái, số và dấu gạch dưới (_).', status: ['error', 'Ký tự không hợp lệ', 'reg__status--error'] };
    if (v.length < u.minLength) return { msg: `Tên người dùng tối thiểu ${u.minLength} ký tự.`, status: ['info', `Quá ngắn (min ${u.minLength})`, 'reg__status--warn'] };
    if (v.length > u.maxLength) return { msg: `Tên người dùng tối đa ${u.maxLength} ký tự.`, status: ['info', `Quá dài (max ${u.maxLength})`, 'reg__status--warn'] };
    if (u.taken.includes(v.toLowerCase())) return { msg: 'Tên người dùng đã có người sử dụng.', status: ['cancel', 'Đã được dùng', 'reg__status--error'] };
    return null;
  }

  function renderUsernameStatus(problem) {
    const el = $('#usernameStatus');
    el.className = 'reg__status';
    if (problem && !problem.status) { el.innerHTML = ''; return; }
    if (problem) {
      el.classList.add(problem.status[2]);
      el.innerHTML = statusHTML(problem.status[0], problem.status[1]);
    } else {
      el.innerHTML = statusHTML('check_circle', 'Khả dụng');
    }
  }

  function checkUsername() {
    const problem = usernameProblem($('#username').value.trim());
    state.usernameOk = !problem;
    renderUsernameStatus(problem);
    return setError('username', problem ? problem.msg : '');
  }

  /* Giả lập kiểm tra trùng username trên server (debounce) */
  function onUsernameInput() {
    clearTimeout(usernameTimer);
    const el = $('#usernameStatus');
    el.className = 'reg__status reg__status--muted';
    el.innerHTML = statusHTML('progress_activity', 'Đang kiểm tra...');
    usernameTimer = setTimeout(checkUsername, 450);
  }

  function passwordScore(v) {
    return cfg.passwordRules.reduce((n, r) => n + (RULE_TESTS[r.id] && RULE_TESTS[r.id](v) ? 1 : 0), 0);
  }

  function renderStrength() {
    const v = $('#password').value;
    const score = v ? Math.max(1, passwordScore(v)) : 0;
    const level = cfg.strengthLevels[score];
    const box = $('.reg__strength');
    box.dataset.tone = level.tone;
    $('#strengthLabel').textContent = level.label;
    $$('.reg__rule').forEach((li) => {
      const met = RULE_TESTS[li.dataset.rule](v);
      li.classList.toggle('is-met', met);
      li.querySelector('.icon').textContent = met ? 'check_circle' : 'radio_button_unchecked';
    });
    $('#passwordRules').classList.toggle('hidden', !v && document.activeElement !== $('#password'));
  }

  function checkPassword() {
    const v = $('#password').value;
    const unmet = cfg.passwordRules.filter((r) => !RULE_TESTS[r.id](v));
    let msg = '';
    if (!v) msg = 'Vui lòng nhập mật khẩu.';
    else if (unmet.length) msg = 'Mật khẩu chưa đạt: ' + unmet.map((r) => r.label.toLowerCase()).join(', ') + '.';
    return setError('password', msg);
  }

  function checkConfirm() {
    const pwd = $('#password').value;
    const v = $('#confirmPassword').value;
    const status = $('#matchStatus');
    status.classList.toggle('hidden', !v);
    if (v) {
      const ok = v === pwd;
      status.className = `reg__status${ok ? '' : ' reg__status--error'}`;
      status.innerHTML = ok ? statusHTML('task_alt', 'Mật khẩu khớp') : statusHTML('error', 'Chưa trùng khớp');
    }
    let msg = '';
    if (!v) msg = 'Vui lòng nhập lại mật khẩu.';
    else if (v !== pwd) msg = 'Mật khẩu nhập lại không khớp.';
    return setError('confirmPassword', msg);
  }

  function checkTerms() {
    const input = $('#termsCheck');
    const ok = input.checked;
    const show = !ok && state.submitted;
    input.classList.toggle('is-invalid', show);
    $('#termsError').textContent = show ? 'Bạn cần đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.' : '';
    $('#termsError').classList.toggle('hidden', !show);
    return ok;
  }

  /* ---------- Country dropdown ---------- */
  function selectCountry(idx, close = true) {
    const c = cfg.countries[idx];
    if (!c) return;
    state.country = c;
    $('#countryValue').value = c.iso;
    $('#countryTrigger').innerHTML = `
      <span class="reg__select-main">${flagImg(c)}
        <span class="reg__select-name">${esc(c.name)}</span>
        <span class="reg__select-code">(${esc(c.dial)})</span>
      </span>
      ${icon('expand_more', 'icon-18 reg__select-arrow')}`;
    $$('.reg__option').forEach((o, i) => o.setAttribute('aria-selected', i === idx ? 'true' : 'false'));
    if (close) toggleMenu(false);
  }

  function setFocusOption(idx) {
    const opts = $$('.reg__option');
    state.focusIdx = (idx + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('is-focus', i === state.focusIdx));
    const cur = opts[state.focusIdx];
    $('#countryMenu').setAttribute('aria-activedescendant', cur.id);
    cur.scrollIntoView({ block: 'nearest' });
  }

  function toggleMenu(open) {
    const wrap = $('#countrySelect');
    const isOpen = open ?? !wrap.classList.contains('is-open');
    wrap.classList.toggle('is-open', isOpen);
    $('#countryMenu').classList.toggle('hidden', !isOpen);
    $('#countryTrigger').setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      setFocusOption(cfg.countries.indexOf(state.country));
      $('#countryMenu').focus();
    }
  }

  function bindCountry() {
    const trigger = $('#countryTrigger');
    const menu = $('#countryMenu');
    trigger.addEventListener('click', () => toggleMenu());
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); toggleMenu(true); }
    });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.reg__option');
      if (!opt) return;
      selectCountry(Number(opt.dataset.index));
      trigger.focus();
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusOption(state.focusIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusOption(state.focusIdx - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCountry(state.focusIdx); trigger.focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { toggleMenu(false); if (e.key === 'Escape') trigger.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!$('#countrySelect').contains(e.target)) toggleMenu(false);
    });
  }

  /* ---------- Bind form ---------- */
  function bindForm() {
    const form = $('#registerForm');
    const validators = { fullName: checkFullName, username: checkUsername, password: checkPassword, confirmPassword: checkConfirm };

    Object.keys(validators).forEach((id) => {
      const input = $('#' + id);
      input.addEventListener('blur', () => {
        if (!input.value && !state.submitted) return;
        state.touched.add(id);
        validators[id]();
      });
    });

    $('#fullName').addEventListener('input', checkFullName);
    $('#username').addEventListener('input', onUsernameInput);
    $('#password').addEventListener('input', () => {
      renderStrength();
      checkPassword();
      if ($('#confirmPassword').value) checkConfirm();
    });
    $('#password').addEventListener('focus', renderStrength);
    $('#password').addEventListener('blur', () => setTimeout(renderStrength, 0));
    $('#confirmPassword').addEventListener('input', checkConfirm);
    $('#termsCheck').addEventListener('change', checkTerms);

    // Hiện/ẩn mật khẩu
    $$('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const input = $('#' + btn.dataset.toggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('.icon').textContent = show ? 'visibility_off' : 'visibility';
      btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    }));

    // Link chưa có trang
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-soon], a[href="#"]');
      if (!a) return;
      e.preventDefault();
      toast('Tính năng đang được phát triển', 'info');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.busy) return;
      state.submitted = true;
      clearTimeout(usernameTimer);
      const results = [checkFullName(), checkUsername(), checkPassword(), checkConfirm(), checkTerms()];
      renderStrength();
      if (results.includes(false)) {
        const first = $('.is-invalid', form);
        if (first) first.focus();
        toast('Vui lòng kiểm tra lại thông tin đăng ký', 'error');
        return;
      }
      state.busy = true;
      setSubmit('loading');
      setTimeout(() => {
        setSubmit('success');
        toast(cfg.submit.toast, 'success');
        setTimeout(() => { location.href = href('markets'); }, cfg.submit.redirectMs);
      }, cfg.submit.processMs);
    });
  }

  Nexus.boot(['register.json'], ({ data }) => {
    cfg = data.register;
    renderContent();
    const def = cfg.countries.findIndex((c) => c.iso === cfg.defaults.country);
    selectCountry(def < 0 ? 0 : def, false);
    $('#username').value = cfg.defaults.username || '';
    if ($('#username').value) checkUsername();
    renderStrength();
    bindCountry();
    bindForm();
  });
})();
