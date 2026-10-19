/* Vốn — Nạp / Rút tài sản: render từ data/wallet.json, chọn coin/mạng, QR giả lập,
   kiểm tra form rút, modal xác nhận → cập nhật số dư + lịch sử */
(function () {
  'use strict';
  const { fmt, ui, $, $$, href } = Nexus;
  const { icon, escapeHTML: esc } = ui;

  const MASK = '********';
  const state = {
    mode: 'chain', wdCoin: 'USDT', wdNet: null, depCoin: 'USDT', depNet: null, bankId: null,
    masked: false, assetTab: 'all', assetQuery: '', hideSmall: false, histTab: 'all', touched: false,
  };
  let W = null;          // dữ liệu wallet.json (bản sao có thể thay đổi)
  let assets = {};       // coin → asset
  let history = [];

  /* ---------- Helpers ---------- */
  const m = (s) => (state.masked ? MASK : s);
  const assetOf = (coin) => assets[coin];
  const netOf = (asset, key) => asset.networks.find((n) => n.key === key) || asset.networks[0];
  /* Số chữ số khi nhập/tính toán số lượng theo giá coin */
  const precision = (a) => (a.price >= 1000 ? 6 : a.price >= 10 ? 4 : 2);
  const fmtFee = (v) => (Number.isInteger(v) ? v.toFixed(1) : v.toLocaleString('en-US', { maximumFractionDigits: 8 }));
  const fmtVNDot = (v) => Math.round(v).toLocaleString('en-US') + ' VNĐ';
  const floorTo = (v, d) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d;
  const shortTx = (tx) => (tx.length > 16 ? `${tx.slice(0, 6)}...${tx.slice(-5)}` : tx);
  const coinAvatar = (a, sm) => `<div class="wl-coin wl-coin--${esc(a.tone)}${sm ? ' wl-coin--sm' : ''}">${esc(a.symbol)}</div>`;

  function nowStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function randHex(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); }
      ta.remove();
    });
  }
  function flash(panel) {
    panel.classList.add('is-flash');
    setTimeout(() => panel.classList.remove('is-flash'), 1200);
  }
  function jumpTo(id, focusSel) {
    const panel = document.getElementById(id);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flash(panel);
    if (focusSel) setTimeout(() => $(focusSel).focus({ preventScroll: true }), 400);
  }

  /* ---------- Pseudo-QR (SVG) xác định từ chuỗi địa chỉ ---------- */
  function hashStr(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0 || 1;
  }
  function qrSVG(text) {
    const N = 25;
    let seed = hashStr(text);
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    const inFinder = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
    const inLogo = (x, y) => x >= 9 && x <= 15 && y >= 9 && y <= 15;
    let d = '';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (inFinder(x, y) || inLogo(x, y)) continue;
        const timing = (x === 6 || y === 6) ? (x + y) % 2 === 0 : null;
        const on = timing !== null ? timing : rnd() < 0.48;
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="1.2" fill="#0B0E14"/>
      <rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="0.7" fill="#FFFFFF"/>
      <rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.3" fill="#0B0E14"/>`;
    return `<svg viewBox="0 0 ${N} ${N}" fill="none" role="img" aria-label="Mã QR địa chỉ nạp" shape-rendering="crispEdges">
      <path d="${d}" fill="#0B0E14"/>
      ${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}
      <rect x="10" y="10" width="5" height="5" rx="0.9" fill="#F59E0B" shape-rendering="geometricPrecision"/>
      <path d="M11.5 12.5H13.5M12.5 11.5V13.5" stroke="#0B0E14" stroke-width="0.5" stroke-linecap="round" shape-rendering="geometricPrecision"/>
    </svg>`;
  }

  /* ---------- 1. Hero ---------- */
  function renderHero(common) {
    const o = W.overview;
    $('#wl-overview-label').textContent = o.label;
    $('#wl-vip-tag').textContent = `VIP ${common.user.vipLevel} Tier`;
    $('#wl-total').innerHTML = `${m(fmt.usd(o.totalUsd))}<span class="wl-hero__unit">USDT</span>`;
    $('#wl-total-vnd').textContent = `≈ ${state.masked ? MASK + ' VNĐ' : fmtVNDot(o.totalUsd * W.usdVnd)}`;
    const up = o.change24hUsd >= 0;
    $('#wl-delta').className = `wl-hero__delta num wl-hero__delta--${up ? 'up' : 'down'}`;
    $('#wl-delta').innerHTML = `${icon(up ? 'trending_up' : 'trending_down', 'icon-14')}<span>${up ? '+' : '-'}${m(fmt.usd(Math.abs(o.change24hUsd)))} (${fmt.percent(o.change24hPct)} 24h)</span>`;
    $('#wl-eye').textContent = state.masked ? 'visibility_off' : 'visibility';
    $('#wl-toggle-balance').setAttribute('aria-pressed', String(state.masked));

    $('#wl-alloc').innerHTML = `
      <div class="wl-alloc__head">
        <span>Phân bổ danh mục</span>
        <div class="wl-alloc__legend">${o.allocation.map((a) =>
          `<span><span class="wl-alloc__dot bg-${esc(a.color)}"></span>${esc(a.label)}: ${a.pct}%</span>`).join('')}</div>
      </div>
      <div class="wl-alloc__bar">${o.allocation.map((a) => `<div class="bg-${esc(a.color)}" style="width:${a.pct}%"></div>`).join('')}</div>`;
  }

  /* ---------- 2a. Withdraw ---------- */
  function wdAsset() { return state.mode === 'bank' ? assetOf(W.bank.coin) : assetOf(state.wdCoin); }
  function wdNet() { return netOf(assetOf(state.wdCoin), state.wdNet); }

  function renderCoinButton() {
    const a = assetOf(state.wdCoin);
    $('#wl-coin-btn').innerHTML = `
      <div class="flex items-center gap-sm">
        ${coinAvatar(a, true)}
        <div><span class="t-headline-sm fw-600">${esc(a.coin)}</span><span class="t-label-sm c-muted" style="margin-left:6px">${esc(a.name)}</span></div>
      </div>
      <div class="flex items-center gap-sm">
        <span class="t-data c-muted num">Khả dụng: ${m(fmt.number(a.available, a.decimals === 3 ? 3 : 2))}</span>
        ${icon('arrow_drop_down', 'icon-18 c-muted')}
      </div>`;
  }

  function renderCoinList() {
    const q = $('#wl-coin-search').value.trim().toUpperCase();
    const list = W.assets.filter((a) => !q || a.coin.includes(q) || a.name.toUpperCase().includes(q));
    $('#wl-coin-list').innerHTML = list.length ? list.map((x) => {
      const a = assetOf(x.coin);
      const on = a.coin === state.wdCoin;
      return `<button type="button" role="option" aria-selected="${on}" class="wl-coinsel__opt${on ? ' is-active' : ''}" data-coin="${esc(a.coin)}">
        <span class="flex items-center gap-sm">${coinAvatar(a, true)}<span><span class="wl-coinsel__code">${esc(a.coin)}</span><span class="t-label-sm c-muted" style="margin-left:6px">${esc(a.name)}</span></span></span>
        <span class="t-data num ${a.available > 0 ? 'c-on-surface' : 'c-muted'}">${m(fmt.number(a.available, precision(a) > 2 ? Math.min(precision(a), 6) : 2))}</span>
      </button>`;
    }).join('') : '<div class="wl-empty">Không tìm thấy coin phù hợp</div>';
  }

  function renderNetworks() {
    const a = assetOf(state.wdCoin);
    const net = wdNet();
    const minFee = Math.min(...a.networks.map((n) => n.fee));
    $('#wl-nets').innerHTML = a.networks.map((n) => {
      const on = n.key === net.key;
      const cheap = !on && a.networks.length > 1 && n.fee === minFee;
      return `<button type="button" role="radio" aria-checked="${on}" class="wl-net${on ? ' is-active' : ''}" data-net="${esc(n.key)}">
        ${on ? `<span class="wl-net__check">${icon('check')}</span>` : ''}
        <span class="wl-net__name">${esc(n.name)}</span>
        <span class="wl-net__chain truncate">${esc(n.chain)}</span>
        <span class="wl-net__fee${cheap ? ' is-cheap' : ''}">Phí: ${fmtFee(n.fee)} ${esc(a.coin)}</span>
      </button>`;
    }).join('');
    $('#wl-eta').textContent = `Thời gian trung bình: ${net.eta}`;
    $('#wl-address-label').textContent = `Địa chỉ ví nhận (${net.name})`;
    $('#wl-address').placeholder = net.placeholder;
    $('#wl-memo-wrap').classList.toggle('hidden', !net.memoRequired);
    renderAddressBook();
  }

  function renderAddressBook() {
    const net = wdNet();
    const items = W.addressBook.filter((b) => b.network === net.key);
    $('#wl-book-menu').innerHTML = items.length
      ? items.map((b) => `<button type="button" class="wl-book__item" data-addr="${esc(b.address)}">
          <span class="t-label-md c-on-surface fw-600">${esc(b.label)} <span class="tag">${esc(b.network)}</span></span>
          <span class="wl-book__addr num">${esc(b.address)}</span>
        </button>`).join('')
      : `<div class="wl-empty" style="padding:12px">Chưa có địa chỉ ${esc(net.name)} nào trong danh bạ</div>`;
  }

  function renderBanks() {
    const b = W.bank;
    $('#wl-bank-eta').textContent = `Thời gian xử lý: ${b.eta}`;
    $('#wl-banks').innerHTML = b.accounts.map((acc) => {
      const on = acc.id === state.bankId;
      return `<button type="button" role="radio" aria-checked="${on}" class="wl-bankopt${on ? ' is-active' : ''}" data-bank="${esc(acc.id)}">
        ${on ? `<span class="wl-net__check">${icon('check')}</span>` : ''}
        <span class="wl-net__name">${esc(acc.bank)}</span>
        <span class="wl-net__chain num">•••• ${esc(acc.number.slice(-4))}</span>
        <span class="wl-net__fee${acc.napas ? ' is-cheap' : ''}">${acc.napas ? 'NAPAS 24/7' : 'Giờ hành chính'}</span>
      </button>`;
    }).join('');
    const acc = b.accounts.find((x) => x.id === state.bankId);
    $('#wl-bank-rate').innerHTML = `
      <div><span>Chủ tài khoản:</span><span class="c-on-surface fw-500">${esc(acc.holder)}</span></div>
      <div><span>Số tài khoản:</span><span class="c-on-surface num">${esc(acc.number)}</span></div>
      <div><span>Tỷ giá quy đổi:</span><span class="c-on-surface num">1 USDT = ${b.rateVnd.toLocaleString('en-US')} VNĐ</span></div>`;
  }

  function currentFee(amount) {
    if (state.mode === 'bank') return Math.max(W.bank.minFeeUsdt, (amount * W.bank.feePct) / 100);
    return wdNet().fee;
  }
  function currentMin() { return state.mode === 'bank' ? W.bank.minUsdt : wdNet().minWithdraw; }
  function limitLeftUsd() { return Math.max(0, W.limits.daily24hUsd - W.limits.usedUsd); }

  function renderAmountMeta() {
    const a = wdAsset();
    const d = precision(a);
    $('#wl-avail').textContent = `${m(fmt.number(a.available, d))} ${a.coin}`;
    $('#wl-amount-unit').textContent = a.coin;
    $('#wl-amount').placeholder = `Tối thiểu ${fmt.number(currentMin(), d)}`;
    $('#wl-limit-left').textContent = `Hạn mức còn lại: ${fmt.number(limitLeftUsd(), 0)} USDT`;
  }

  function renderSummary() {
    const a = wdAsset();
    const d = precision(a);
    const amount = parseFloat($('#wl-amount').value) || 0;
    const fee = currentFee(amount);
    const receive = Math.max(0, amount - fee);
    const used = W.limits.usedUsd;
    const limitRow = `<div class="wl-summary__row"><span>Hạn mức rút 24 giờ:</span><span class="num">${fmt.number(W.limits.daily24hUsd, 0)} USDT (Đã dùng: ${used ? fmt.number(used, 2) : 0})</span></div>`;
    if (state.mode === 'bank') {
      $('#wl-summary').innerHTML = `
        <div class="wl-summary__row"><span>Phí xử lý (${W.bank.feePct}%, tối thiểu ${W.bank.minFeeUsdt} USDT):</span><span class="num fw-500">${fmt.number(fee, 2)} USDT</span></div>
        ${limitRow}
        <div class="wl-summary__row wl-summary__row--total"><span>Số tiền thực nhận:</span><span class="num">${fmtVNDot(receive * W.bank.rateVnd)}</span></div>`;
    } else {
      $('#wl-summary').innerHTML = `
        <div class="wl-summary__row"><span>Phí mạng lưới (Network Fee):</span><span class="num fw-500">${fmt.number(fee, d)} ${a.coin}</span></div>
        ${limitRow}
        <div class="wl-summary__row wl-summary__row--total"><span>Số tiền thực nhận:</span><span class="num">${fmt.number(receive, d)} ${a.coin}</span></div>`;
    }
  }

  function setError(id, inputs, msg) {
    const el = $(id);
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
    inputs.forEach((inp) => inp && inp.classList.toggle('is-invalid', !!msg));
  }

  function validateAddress() {
    if (state.mode === 'bank') return '';
    const net = wdNet();
    const v = $('#wl-address').value.trim();
    if (!v) return 'Vui lòng nhập địa chỉ ví nhận.';
    if (!/^[A-Za-z0-9_-]+$/.test(v)) return 'Địa chỉ chứa ký tự không hợp lệ.';
    if (net.addressPrefix && !v.startsWith(net.addressPrefix)) return `Địa chỉ mạng ${net.name} phải bắt đầu bằng "${net.addressPrefix}".`;
    if (net.addressPrefix === '0x' && v.length !== 42) return 'Địa chỉ 0x phải gồm đúng 42 ký tự.';
    if (net.addressLength && net.addressPrefix !== '0x' && (v.length < 26 || v.length > 64)) return `Độ dài địa chỉ ${net.name} không hợp lệ.`;
    if (!net.addressLength && v.length < 10) return 'Địa chỉ quá ngắn.';
    if (net.memoRequired && !$('#wl-memo').value.trim()) return `Mạng ${net.name} bắt buộc nhập Memo / Tag.`;
    return '';
  }

  function validateAmount() {
    const a = wdAsset();
    const d = precision(a);
    const raw = $('#wl-amount').value;
    const amount = parseFloat(raw);
    if (!raw || !(amount > 0)) return 'Vui lòng nhập số lượng rút.';
    if (amount < currentMin()) return `Số lượng tối thiểu là ${fmt.number(currentMin(), d)} ${a.coin}.`;
    if (amount > a.available + 1e-12) return `Vượt quá số dư khả dụng (${fmt.number(a.available, d)} ${a.coin}).`;
    if (amount <= currentFee(amount)) return 'Số lượng phải lớn hơn phí rút.';
    if (amount * a.price > limitLeftUsd()) return `Vượt hạn mức rút 24 giờ còn lại (${fmt.number(limitLeftUsd(), 0)} USDT).`;
    return '';
  }

  function validateAuth() {
    const pin = $('#wl-pin').value, otp = $('#wl-2fa').value;
    if (!/^\d{6}$/.test(pin)) return 'Mã PIN ví phải gồm 6 chữ số.';
    if (!/^\d{6}$/.test(otp)) return 'Mã 2FA phải gồm 6 chữ số.';
    return '';
  }

  function refreshAmount(showErr) {
    renderSummary();
    $$('#wl-pcts button').forEach((b) => b.classList.remove('is-active'));
    if (showErr) setError('#wl-amount-err', [$('#wl-amount')], validateAmount());
  }

  function renderWithdraw() {
    $$('[data-mode]').forEach((el) => el.classList.toggle('hidden', el.dataset.mode !== state.mode));
    $$('#wl-mode [data-value]').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.mode));
    renderCoinButton();
    renderCoinList();
    renderNetworks();
    renderBanks();
    renderAmountMeta();
    renderSummary();
  }

  function selectWdCoin(coin) {
    const a = assetOf(coin);
    state.wdCoin = coin;
    state.wdNet = a.defaultNetwork;
    $('#wl-address').value = '';
    $('#wl-memo').value = '';
    $('#wl-amount').value = '';
    setError('#wl-address-err', [$('#wl-address')], '');
    setError('#wl-amount-err', [$('#wl-amount')], '');
    renderWithdraw();
  }

  function closeMenus(except) {
    ['#wl-coinsel', '#wl-book', '#wl-depnet'].forEach((sel) => {
      const el = $(sel);
      if (el !== except) {
        el.classList.remove('is-open');
        const btn = el.querySelector('[aria-expanded]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
  function toggleMenu(sel) {
    const el = $(sel);
    closeMenus(el);
    const open = el.classList.toggle('is-open');
    const btn = el.querySelector('[aria-expanded]');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    return open;
  }

  function bindWithdraw() {
    ui.bindTabs($('#wl-mode'), (v) => {
      state.mode = v;
      $('#wl-amount').value = '';
      ['#wl-address-err', '#wl-amount-err'].forEach((id) => setError(id, [], ''));
      renderWithdraw();
    });

    $('#wl-coin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (toggleMenu('#wl-coinsel')) {
        $('#wl-coin-search').value = '';
        renderCoinList();
        $('#wl-coin-search').focus();
      }
    });
    $('#wl-coinsel .wl-coinsel__menu').addEventListener('click', (e) => e.stopPropagation());
    $('#wl-coin-search').addEventListener('input', renderCoinList);
    $('#wl-coin-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = $('#wl-coin-list [data-coin]'); if (first) first.click(); }
    });
    $('#wl-coin-list').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-coin]');
      if (!opt) return;
      closeMenus();
      selectWdCoin(opt.dataset.coin);
    });

    $('#wl-nets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-net]');
      if (!btn || btn.dataset.net === wdNet().key) return;
      state.wdNet = btn.dataset.net;
      renderNetworks();
      renderAmountMeta();
      if ($('#wl-address').value && validateAddress()) $('#wl-address').value = '';
      setError('#wl-address-err', [$('#wl-address')], '');
      refreshAmount(!!$('#wl-amount').value);
    });

    $('#wl-banks').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bank]');
      if (!btn) return;
      state.bankId = btn.dataset.bank;
      renderBanks();
    });

    $('#wl-book-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#wl-book'); });
    $('#wl-book-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('[data-addr]');
      if (!item) return;
      $('#wl-address').value = item.dataset.addr;
      closeMenus();
      setError('#wl-address-err', [$('#wl-address')], validateAddress());
    });
    $('#wl-scan').addEventListener('click', () => ui.toast('Quét QR cần quyền truy cập camera — tính năng đang phát triển', 'info'));
    $('#wl-paste').addEventListener('click', async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) throw new Error('empty');
        $('#wl-address').value = text;
        setError('#wl-address-err', [$('#wl-address')], validateAddress());
      } catch (err) {
        ui.toast('Không đọc được clipboard. Hãy dán thủ công (Ctrl+V).', 'error');
        $('#wl-address').focus();
      }
    });
    $('#wl-address').addEventListener('input', () => setError('#wl-address-err', [$('#wl-address')], ''));
    $('#wl-address').addEventListener('blur', () => { if ($('#wl-address').value) setError('#wl-address-err', [$('#wl-address')], validateAddress()); });

    $('#wl-amount').addEventListener('input', () => refreshAmount(true));
    $('#wl-max').addEventListener('click', () => {
      const a = wdAsset();
      $('#wl-amount').value = floorTo(a.available, precision(a)).toFixed(precision(a));
      refreshAmount(true);
    });
    $('#wl-pcts').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pct]');
      if (!btn) return;
      const a = wdAsset();
      const d = precision(a);
      $('#wl-amount').value = floorTo((a.available * Number(btn.dataset.pct)) / 100, d).toFixed(d);
      refreshAmount(true);
      btn.classList.add('is-active');
    });
    ['#wl-pin', '#wl-2fa'].forEach((sel) => $(sel).addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      setError('#wl-auth-err', [$('#wl-pin'), $('#wl-2fa')], '');
    }));

    $('#wl-submit').addEventListener('click', () => {
      const addrErr = validateAddress();
      const amtErr = validateAmount();
      const authErr = validateAuth();
      setError('#wl-address-err', [$('#wl-address')], addrErr);
      setError('#wl-amount-err', [$('#wl-amount')], amtErr);
      setError('#wl-auth-err', [authErr.includes('PIN') ? $('#wl-pin') : null, authErr.includes('2FA') ? $('#wl-2fa') : null], authErr);
      if (addrErr || amtErr || authErr) {
        ui.toast(addrErr || amtErr || authErr, 'error');
        return;
      }
      openConfirm();
    });
  }

  /* ---------- Modal xác nhận ---------- */
  function buildOrder() {
    const a = wdAsset();
    const d = precision(a);
    const amount = parseFloat($('#wl-amount').value);
    const fee = currentFee(amount);
    const receive = amount - fee;
    if (state.mode === 'bank') {
      const acc = W.bank.accounts.find((x) => x.id === state.bankId);
      return {
        a, amount, fee, receive, d,
        rows: [
          ['Hình thức', 'Chuyển khoản Ngân hàng'],
          ['Ngân hàng nhận', `${acc.bank} •••• ${acc.number.slice(-4)}`],
          ['Chủ tài khoản', acc.holder],
          ['Số lượng rút', `${fmt.number(amount, 2)} USDT`],
          ['Phí xử lý', `${fmt.number(fee, 2)} USDT`],
          ['Tỷ giá', `1 USDT = ${W.bank.rateVnd.toLocaleString('en-US')} VNĐ`],
        ],
        total: fmtVNDot(receive * W.bank.rateVnd),
        record: {
          type: 'withdraw', title: 'Rút tiền VNĐ', sub: `Chuyển khoản ${acc.bank} •••• ${acc.number.slice(-4)}`,
          amount: Math.round(receive * W.bank.rateVnd), unit: 'VNĐ', decimals: 0, note: `(${fmt.number(amount, 2)} USDT)`,
          txid: 'NX-VN' + String(Math.floor(1e6 + Math.random() * 9e6)),
        },
      };
    }
    const net = wdNet();
    const memo = $('#wl-memo').value.trim();
    const rows = [
      ['Coin', `${a.coin} — ${a.name}`],
      ['Mạng lưới', net.label],
      ['Địa chỉ nhận', $('#wl-address').value.trim()],
    ];
    if (net.memoRequired) rows.push(['Memo / Tag', memo]);
    rows.push(['Số lượng rút', `${fmt.number(amount, d)} ${a.coin}`], ['Phí mạng lưới', `${fmt.number(fee, d)} ${a.coin}`], ['Thời gian dự kiến', net.eta]);
    return {
      a, amount, fee, receive, d, rows,
      total: `${fmt.number(receive, d)} ${a.coin}`,
      record: {
        type: 'withdraw', title: `Rút tiền ${a.coin}`, sub: `Mạng ${net.name}`,
        amount, unit: a.coin, decimals: d,
        txid: (net.addressPrefix === '0x' ? '0x' : '') + randHex(net.addressPrefix === '0x' ? 62 : 64),
      },
    };
  }

  let pendingOrder = null;
  function openConfirm() {
    pendingOrder = buildOrder();
    $('#wl-modal-body').innerHTML = `<div class="wl-confirm">
      ${pendingOrder.rows.map(([k, v]) => `<div class="wl-confirm__row"><span>${esc(k)}</span><span class="num">${esc(v)}</span></div>`).join('')}
      <div class="wl-confirm__row wl-confirm__total"><span>Số tiền thực nhận</span><span class="num">${esc(pendingOrder.total)}</span></div>
      <p class="wl-confirm__note">${icon('warning', 'icon-14')} Lệnh rút không thể huỷ sau khi gửi lên mạng lưới. Vui lòng kiểm tra kỹ địa chỉ và mạng lưới.</p>
    </div>`;
    $('#wl-modal').classList.add('is-open');
    $('#wl-modal-ok').focus();
  }
  function closeConfirm() {
    $('#wl-modal').classList.remove('is-open');
    pendingOrder = null;
  }

  function submitOrder() {
    if (!pendingOrder) return;
    const { a, amount, record, d } = pendingOrder;
    const usd = amount * a.price;
    a.available = Math.max(0, +(a.available - amount).toFixed(8));
    a.total = Math.max(0, +(a.total - amount).toFixed(8));
    W.overview.totalUsd = Math.max(0, W.overview.totalUsd - usd);
    W.limits.usedUsd += usd;
    const rec = { ...record, id: 'n' + Date.now(), time: nowStr(), status: 'pending', isNew: true };
    history.unshift(rec);
    closeConfirm();
    ui.toast(`Đã gửi lệnh rút ${fmt.number(amount, d)} ${a.coin}. Đang xử lý…`, 'success');

    $('#wl-amount').value = '';
    $('#wl-pin').value = '';
    $('#wl-2fa').value = '';
    renderAll();
    setTimeout(() => {
      rec.status = 'success';
      rec.isNew = false;
      renderHistory();
      ui.toast(`${rec.title} thành công · TxID ${shortTx(rec.txid)}`, 'success');
    }, 6000);
  }

  function bindModal() {
    $('#wl-modal').addEventListener('click', (e) => {
      if (e.target.id === 'wl-modal' || e.target.closest('[data-close]')) closeConfirm();
    });
    $('#wl-modal-ok').addEventListener('click', submitOrder);
  }

  /* ---------- 2b. Deposit ---------- */
  function depNet() { return netOf(assetOf(state.depCoin), state.depNet); }

  function renderDeposit() {
    const a = assetOf(state.depCoin);
    const net = depNet();
    const d = precision(a);
    $('#wl-depnet-btn').innerHTML = `<span>${esc(net.name)} Active</span>${icon('expand_more', 'icon-14')}`;
    $('#wl-depnet-menu').innerHTML = `
      <p class="wl-label" style="margin-bottom:6px">Coin nạp</p>
      <div class="wl-depnet__coins">${W.assets.map((x) =>
        `<button type="button" class="wl-depnet__coin${x.coin === a.coin ? ' is-active' : ''}" data-dcoin="${esc(x.coin)}">${esc(x.coin)}</button>`).join('')}</div>
      <p class="wl-label" style="margin-bottom:6px">Mạng lưới</p>
      ${a.networks.map((n) => `<button type="button" class="wl-depnet__net${n.key === net.key ? ' is-active' : ''}" data-dnet="${esc(n.key)}">
        <span><span class="fw-600">${esc(n.name)}</span> <span class="c-muted">${esc(n.chain)}</span></span><span class="c-muted t-label-sm">${esc(n.eta)}</span>
      </button>`).join('')}`;

    $('#wl-qr').innerHTML = qrSVG(`${a.coin}:${net.key}:${net.depositAddress}`);
    $('#wl-dep-label').textContent = `Địa chỉ nạp ${a.coin} (${net.name})`;
    $('#wl-dep-address').textContent = net.depositAddress;
    $('#wl-dep-address').title = net.depositAddress;
    $('#wl-dep-memo-wrap').classList.toggle('hidden', !net.memo);
    $('#wl-dep-memo').textContent = net.memo || '';

    const busy = net.status === 'busy';
    $('#wl-netinfo').innerHTML = `
      <div><span>Trạng thái mạng lưới:</span><span class="${busy ? 'wl-busy' : 'wl-ok'}"><span class="dot dot--sm" style="background:currentColor"></span>${busy ? 'Tắc nghẽn nhẹ' : 'Hoạt động bình thường'}</span></div>
      <div><span>Xác nhận khối yêu cầu:</span><span class="num">${net.confirmations} Xác nhận</span></div>
      <div><span>Nạp tiền tối thiểu:</span><span class="num">${fmt.number(net.minDeposit, d)} ${esc(a.coin)}</span></div>`;

    $('#wl-warn').innerHTML = `${icon('warning', 'icon-20')}<p><strong>Lưu ý quan trọng:</strong> Chỉ nạp ${esc(a.coin)} qua mạng <u>${esc(net.label)}</u> vào địa chỉ trên.${net.memo ? ' Bắt buộc điền đúng <u>Memo / Tag</u>, thiếu Memo sẽ không được ghi có.' : ''} Nạp nhầm mạng hoặc sai coin có thể dẫn đến việc mất mát tài sản vĩnh viễn không thể khôi phục.</p>`;
  }

  function setDepCoin(coin) {
    state.depCoin = coin;
    state.depNet = assetOf(coin).defaultNetwork;
    renderDeposit();
  }

  function bindCopy(btnSel, getText, label) {
    $(btnSel).addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const textEl = btn.querySelector('span:last-child');
      copyText(getText()).then(() => {
        btn.classList.add('is-done');
        textEl.textContent = 'Đã chép!';
        ui.toast(`Đã sao chép ${label}`, 'success');
        setTimeout(() => { btn.classList.remove('is-done'); textEl.textContent = 'Sao chép'; }, 2000);
      }).catch(() => ui.toast('Không thể sao chép, vui lòng chọn và sao chép thủ công', 'error'));
    });
  }

  function bindDeposit() {
    $('#wl-depnet-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#wl-depnet'); });
    $('#wl-depnet-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      const c = e.target.closest('[data-dcoin]');
      const n = e.target.closest('[data-dnet]');
      if (c) { setDepCoin(c.dataset.dcoin); $('#wl-depnet').classList.add('is-open'); }
      if (n) { state.depNet = n.dataset.dnet; renderDeposit(); closeMenus(); }
    });
    bindCopy('#wl-copy', () => depNet().depositAddress, 'địa chỉ nạp');
    bindCopy('#wl-copy-memo', () => depNet().memo || '', 'Memo / Tag');
  }

  /* ---------- 3. Asset table ---------- */
  function renderAssetTabs() {
    const el = $('#wl-asset-tabs');
    el.innerHTML = W.assetTabs.map((t) =>
      `<button type="button" role="tab" class="${t.key === state.assetTab ? 'is-active' : ''}" data-value="${esc(t.key)}">${esc(t.label)}</button>`).join('');
    ui.bindTabs(el, (v) => { state.assetTab = v; renderAssets(); });
  }

  function renderAssets() {
    const q = state.assetQuery.trim().toUpperCase();
    const list = W.assets.map((x) => assetOf(x.coin)).filter((a) => {
      if (state.assetTab !== 'all' && a.category !== state.assetTab) return false;
      if (state.hideSmall && a.total * a.price < 1) return false;
      return !q || a.coin.includes(q) || a.name.toUpperCase().includes(q);
    });
    $('#wl-asset-rows').innerHTML = list.length ? list.map((a) => {
      const usd = a.total * a.price;
      const unit = a.coin !== 'USDT';
      const total = fmt.number(a.total, a.decimals) + (a.unitOnTotal ? ' ' + a.coin : '');
      const avail = fmt.number(a.available, a.decimals) + (unit && a.available > 0 ? ' ' + a.coin : '');
      const tradeHref = `${href('trade')}?symbol=${a.coin === 'USDT' ? 'BTC' : a.coin}USDT`;
      return `<tr data-coin="${esc(a.coin)}">
        <td><div class="wl-asset">${coinAvatar(a)}<div class="flex col"><span class="wl-asset__code">${esc(a.coin)}</span><span class="wl-asset__name">${esc(a.name)}</span></div></div></td>
        <td class="text-right num fw-600">${m(total)}</td>
        <td class="text-right num ${a.available > 0 ? 'c-secondary' : 'c-muted'}">${m(avail)}</td>
        <td class="text-right num c-muted hide-xs">${m(fmt.number(a.locked, a.lockedDecimals))}</td>
        <td class="text-right num fw-700${usd > 0 ? '' : ' c-muted'}">${m(fmt.usd(usd))}</td>
        <td class="text-right"><div class="wl-actions">
          <button type="button" class="wl-act wl-act--dep" data-act="deposit">Nạp</button>
          ${a.available > 0 ? '<button type="button" class="wl-act wl-act--wd" data-act="withdraw">Rút</button>' : ''}
          <a class="wl-act wl-act--trade" href="${esc(tradeHref)}">Giao dịch</a>
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6"><div class="wl-empty">Không có tài sản phù hợp</div></td></tr>';
  }

  function bindAssets() {
    $('#wl-asset-search').addEventListener('input', (e) => { state.assetQuery = e.target.value; renderAssets(); });
    $('#wl-hide-small').addEventListener('change', (e) => { state.hideSmall = e.target.checked; renderAssets(); });
    $('#wl-asset-rows').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const coin = btn.closest('tr').dataset.coin;
      if (btn.dataset.act === 'deposit') {
        setDepCoin(coin);
        jumpTo('deposit');
      } else {
        state.mode = 'chain';
        selectWdCoin(coin);
        jumpTo('withdraw', '#wl-amount');
      }
    });
  }

  /* ---------- 4. History ---------- */
  function renderHistoryTabs() {
    const el = $('#wl-history-tabs');
    el.innerHTML = W.historyTabs.map((t) =>
      `<button type="button" role="tab" class="${t.key === state.histTab ? 'is-active' : ''}" data-value="${esc(t.key)}">${esc(t.label)}</button>`).join('');
    ui.bindTabs(el, (v) => { state.histTab = v; renderHistory(); });
  }

  function renderHistory() {
    const list = history.filter((h) => state.histTab === 'all' || h.type === state.histTab);
    $('#wl-history-rows').innerHTML = list.length ? list.map((h) => {
      const out = h.type === 'withdraw';
      const st = W.statusLabels[h.status] || W.statusLabels.pending;
      return `<tr class="${h.isNew ? 'wl-row-new' : ''}">
        <td><div class="wl-txtype">
          <span class="wl-txtype__icon wl-txtype__icon--${out ? 'out' : 'in'}">${icon(out ? 'arrow_outward' : 'south_west', 'icon-16')}</span>
          <div><span class="wl-txtype__title">${esc(h.title)}</span><span class="wl-txtype__sub">${esc(h.sub)}</span></div>
        </div></td>
        <td class="t-data fw-700 num ${out ? 'c-error' : 'c-secondary'}">${out ? '-' : '+'}${m(fmt.number(h.amount, h.decimals))} ${esc(h.unit)}${h.note ? ` <span class="c-muted" style="font-size:12px;font-weight:400">${esc(h.note)}</span>` : ''}</td>
        <td class="t-data c-muted num hide-xs"><div class="wl-txid"><span title="${esc(h.txid)}">${esc(shortTx(h.txid))}</span><button type="button" title="Sao chép" aria-label="Sao chép TxID" data-tx="${esc(h.txid)}">${icon('content_copy', 'icon-14')}</button></div></td>
        <td class="t-data c-muted num hide-sm">${esc(h.time)}</td>
        <td class="text-right"><span class="wl-status wl-status--${esc(st.tone)}">${esc(st.label)}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5"><div class="wl-empty">Chưa có giao dịch nào</div></td></tr>';
  }

  function bindHistory() {
    $('#wl-history-rows').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tx]');
      if (!btn) return;
      copyText(btn.dataset.tx)
        .then(() => ui.toast('Đã sao chép mã giao dịch', 'success'))
        .catch(() => ui.toast('Không thể sao chép', 'error'));
    });
  }

  /* ---------- Chung ---------- */
  let commonRef = null;
  function renderAll() {
    renderHero(commonRef);
    renderWithdraw();
    renderAssets();
    renderHistory();
  }

  function bindGlobal() {
    $('#wl-toggle-balance').addEventListener('click', () => {
      state.masked = !state.masked;
      renderHero(commonRef);
      renderCoinButton();
      renderCoinList();
      renderAmountMeta();
      renderAssets();
      renderHistory();
    });
    $$('[data-jump]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.jump === 'deposit') jumpTo('deposit');
      else jumpTo('withdraw', '#wl-amount');
    }));
    document.addEventListener('click', () => closeMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeMenus();
      if ($('#wl-modal').classList.contains('is-open')) closeConfirm();
    });
    $('#wl-history-link').href = href('history');
    $('#wl-history-all').href = href('history');
  }

  Nexus.boot(['wallet.json'], ({ common, data }) => {
    W = JSON.parse(JSON.stringify(data.wallet));
    commonRef = common;
    W.assets.forEach((a) => { assets[a.coin] = a; });
    history = W.history.slice();

    const def = W.withdrawDefaults;
    state.wdCoin = def.coin;
    state.wdNet = assetOf(def.coin).defaultNetwork;
    state.depCoin = 'USDT';
    state.depNet = assetOf('USDT').defaultNetwork;
    state.bankId = (W.bank.accounts.find((b) => b.default) || W.bank.accounts[0]).id;
    $('#wl-address').value = def.address;
    $('#wl-amount').value = def.amount;

    renderAssetTabs();
    renderHistoryTabs();
    renderAll();
    renderDeposit();
    bindGlobal();
    bindWithdraw();
    bindDeposit();
    bindAssets();
    bindHistory();
    bindModal();
    applyQuery();
  });

  /* ?action=deposit|withdraw|transfer & ?coin=XXX (liên kết từ profile.html) */
  function applyQuery() {
    const params = new URLSearchParams(location.search);
    const action = (params.get('action') || '').toLowerCase();
    const coin = (params.get('coin') || '').toUpperCase();
    const hasCoin = !!assets[coin];
    if (action === 'withdraw') {
      if (hasCoin) selectWdCoin(coin);
      setTimeout(() => jumpTo('withdraw', '#wl-amount'), 150);
    } else if (action === 'deposit' || action === 'transfer') {
      if (hasCoin) setDepCoin(coin);
      setTimeout(() => jumpTo('deposit'), 150);
      if (action === 'transfer') ui.toast('Chuyển ví nội bộ đang được phát triển — đã mở Cổng Nạp', 'info');
    } else if (hasCoin) {
      selectWdCoin(coin);
      setDepCoin(coin);
    }
  }
})();
