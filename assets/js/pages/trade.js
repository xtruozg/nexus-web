/* Trang giao dịch — render từ data/trade.json: ticker, biểu đồ nến SVG tự vẽ,
   sổ lệnh, form đặt lệnh (spot/futures), bảng vị thế; giả lập dữ liệu realtime */
(function () {
  'use strict';
  const { fmt, ui, $, $$, href } = Nexus;
  const { icon, escapeHTML: esc, toast } = ui;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const C = { up: '#4edea3', down: '#ff938c', ma7: '#ffc174', ma25: '#4edea3', ma99: '#ffb3ad', grid: '#242a37', gridV: '#1a202c', boll: '#8ab4f8', rsi: '#c58af9' };
  const SIDE_LABEL = { long: 'Mua / Long', short: 'Bán / Short', buy: 'Mua', sell: 'Bán', 'close-long': 'Đóng Long', 'close-short': 'Đóng Short' };
  const TYPE_LABEL = { limit: 'Giới hạn', market: 'Thị trường', stop: 'Kích hoạt (Stop)' };
  const TERM_TABS = [
    { key: 'positions', label: 'Vị thế đang mở', count: () => S.positions.length },
    { key: 'orders', label: 'Lệnh chờ khớp', count: () => S.openOrders.length },
    { key: 'orderHistory', label: 'Lịch sử đặt lệnh' },
    { key: 'tradeHistory', label: 'Lịch sử giao dịch' },
    { key: 'assets', label: 'Tài sản ký quỹ' }
  ];

  const S = {
    d: null, pairs: [], pair: null,
    mode: 'futures', otype: 'limit', lev: 20, marginMode: 'cross', avail: 0, pct: null,
    tf: '15m', inds: { ma: true, boll: false, rsi: false }, hover: null, tool: 'cursor', drawings: [], drag: null,
    bookTab: 'book', bookView: 'both', depthIdx: 0, bookFresh: true, lastDir: 1,
    term: 'positions', positions: [], openOrders: [], orderHistory: [], tradeHistory: [], assets: [],
    simStart: 0, t0: Date.now(), seq: 1, latency: 1.2
  };

  /* ---------- Helpers ---------- */
  const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '').trim());
  const roundTo = (v, step) => Math.round(v / step) * step;
  const floorTo = (v, d) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d;
  const px = (v, p = S.pair) => fmt.number(v, p.priceDigits);
  const qd = (p = S.pair) => (p.qtyDigits === 0 ? 0 : 2);
  const signed = (v, d = 2) => (v >= 0 ? '+' : '-') + fmt.number(Math.abs(v), d);
  const tone = (v) => (v >= 0 ? 'c-secondary' : 'c-error');
  const pairBy = (sym) => S.pairs.find((p) => p.symbol === sym);
  const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;
  const mmr = () => S.d.account.maintenanceMarginRate;
  function simNow() { return S.simStart + (Date.now() - S.t0); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function clock(ms, withDate) {
    const d = new Date(ms);
    const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    return withDate ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${t}` : t;
  }
  function flash(el, up) {
    if (!el) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(up ? 'flash-up' : 'flash-down');
  }
  function liqPrice(side, entry, lev) {
    return side === 'long' ? entry * (1 - 1 / lev + mmr()) : entry * (1 + 1 / lev - mmr());
  }

  /* ---------- 1. Ticker ---------- */
  function renderPairBtn() {
    const p = S.pair;
    $('#tr-pair-btn').innerHTML = `
      <span class="tr-pair__coin">${esc(p.icon)}</span>
      <span class="tr-pair__name">${esc(p.base)}/${esc(p.quote)}</span>
      <span class="tr-pair__type">${S.mode === 'spot' ? 'Spot' : 'Vĩnh cửu'}</span>
      ${icon('arrow_drop_down', 'icon-16 c-muted')}`;
    $('#tr-pair-menu').innerHTML = S.pairs.map((x) => `
      <button type="button" role="option" class="tr-pair__opt${x === p ? ' is-active' : ''}" data-symbol="${esc(x.symbol)}" aria-selected="${x === p}">
        <span><span class="tr-pair__opt-name">${esc(x.base)}</span><span class="c-muted">/${esc(x.quote)}</span> <span class="tag">${x.maxLeverage}X</span></span>
        <span class="num">${px(x.price, x)}</span>
        <span class="num ${tone(x.change)}">${fmt.percent(x.change)}</span>
      </button>`).join('');
  }

  function renderLast() {
    const p = S.pair;
    const up = p.change >= 0;
    $('#tr-last').innerHTML = `
      <span class="tr-last__px ${tone(p.change)}" id="tr-last-px">${px(p.price)}</span>
      <span class="tr-last__chg ${tone(p.change)}">${icon(up ? 'trending_up' : 'trending_down', 'icon-14')}&nbsp;${fmt.percent(p.change)}</span>`;
  }

  function fundingText(sec) {
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  }

  function renderStats() {
    const p = S.pair;
    $('#tr-stats').innerHTML = `
      <div class="tr-stat"><span class="tr-stat__k">Giá chỉ số / Đánh dấu</span><span class="tr-stat__v">${px(p.price + p.indexOff)} / ${px(p.price)}</span></div>
      <div class="tr-stat tr-stat--md"><span class="tr-stat__k">Cao 24h</span><span class="tr-stat__v">${px(p.high)}</span></div>
      <div class="tr-stat tr-stat--md"><span class="tr-stat__k">Thấp 24h</span><span class="tr-stat__v">${px(p.low)}</span></div>
      <div class="tr-stat tr-stat--xl"><span class="tr-stat__k">Khối lượng 24h (${esc(p.base)})</span><span class="tr-stat__v">${fmt.number(p.volBase, 2)} ${esc(p.base)}</span></div>
      <div class="tr-stat tr-stat--lg"><span class="tr-stat__k">Khối lượng 24h (${esc(p.quote)})</span><span class="tr-stat__v">${fmt.number(p.volQuote, 0)}</span></div>
      <div class="tr-fund" data-futures>
        <div class="tr-fund__row"><span class="tr-fund__k">Phí Funding:</span><span class="tr-fund__v num ${tone(p.funding)}">${p.funding >= 0 ? '+' : ''}${p.funding.toFixed(4)}%</span></div>
        <div class="tr-fund__row tr-fund__cd">${icon('schedule', 'icon-14')}<span id="tr-fund-cd" style="font-size:10px">${fundingText(p.fundingSec)}</span></div>
      </div>`;
  }

  function bindTicker() {
    const wrap = $('#tr-pair');
    $('#tr-pair-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const open = wrap.classList.toggle('is-open');
      $('#tr-pair-btn').setAttribute('aria-expanded', open);
    });
    $('#tr-pair-menu').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-symbol]');
      if (!opt) return;
      wrap.classList.remove('is-open');
      selectPair(opt.dataset.symbol, true);
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) wrap.classList.remove('is-open');
      const lev = $('#tr-lev');
      if (lev.classList.contains('is-open') && !lev.contains(e.target) && !e.target.closest('#tr-lev-btn')) closeLev();
    });
    ui.bindTabs($('#tr-mode-top'), (v) => setMode(v));
  }

  function selectPair(symbol, notify) {
    const p = pairBy(symbol);
    if (!p) return;
    S.pair = p;
    S.hover = null;
    S.drawings = [];
    S.bookFresh = p.symbol === S.d.pairs[0].symbol && p.ticks === 0;
    S.depthIdx = 0;
    S.lev = Math.min(S.lev, p.maxLeverage);
    const url = new URL(location.href);
    url.searchParams.set('symbol', p.symbol);
    history.replaceState(null, '', url);
    document.title = `${px(p.price)} ${p.base}/${p.quote} | Nexus Exchange`;
    $$('[data-quote]').forEach((el) => { el.textContent = p.quote; });
    $$('[data-base]').forEach((el) => { el.textContent = p.base; });
    $('#tr-price').value = px(p.price);
    $('#tr-stop').value = '';
    if (notify) {
      $('#tr-qty').value = '';
      $('#tr-tp').value = '';
      $('#tr-sl').value = '';
      S.pct = null;
      toast(`Đã chuyển sang cặp ${p.base}/${p.quote}`, 'info');
    }
    renderPairBtn(); renderLast(); renderStats();
    renderBookHead(); renderBook(); renderTrades();
    renderForm();
    drawChart();
  }

  /* ---------- 2. Biểu đồ nến (SVG) ---------- */
  function tfObj() { return S.d.timeframes.find((t) => t.key === S.tf); }

  function seriesFor() {
    const p = S.pair, tf = tfObj();
    const base = p.candles;
    const last = base[base.length - 1].c;
    if (tf.scale === 1) return base;
    const k = tf.scale;
    const f = (v) => last + (v - last) * k;
    return base.map((c) => ({ o: f(c.o), h: f(c.h), l: f(c.l), c: f(c.c), v: c.v * Math.sqrt(k) }));
  }

  function candleTimes(n) {
    const tf = tfObj();
    const ms = tf.minutes * 60000;
    const lastOpen = tf.key === '15m' ? S.lastOpen : Math.floor(simNow() / ms) * ms;
    return Array.from({ length: n }, (_, i) => lastOpen - (n - 1 - i) * ms);
  }

  function movingAvg(closes, n, i) {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += closes[j];
    return s / n;
  }

  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  let chartGeom = null;
  let rafId = 0;
  function requestDraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; drawChart(); });
  }

  function drawChart() {
    const area = $('#tr-plot');
    const svg = $('#tr-svg');
    const W = area.clientWidth, H = area.clientHeight;
    if (W < 40 || H < 40) return;
    const all = seriesFor();
    const closes = all.map((c) => c.c);
    const spacing = Math.max(12, Math.min(24, W / 30));
    const rightPad = spacing * 1.6;
    const count = Math.min(all.length, Math.floor((W - rightPad) / spacing));
    const start = all.length - count;
    const vis = all.slice(start);
    const times = candleTimes(all.length).slice(start);
    const xOf = (i) => W - rightPad - (count - 1 - i) * spacing;

    const ma = { 7: [], 25: [], 99: [] };
    vis.forEach((_, i) => [7, 25, 99].forEach((n) => ma[n].push(movingAvg(closes, n, start + i))));
    const boll = vis.map((_, i) => {
      const m = movingAvg(closes, 20, start + i);
      if (m == null) return null;
      let v = 0;
      for (let j = start + i - 19; j <= start + i; j++) v += (closes[j] - m) ** 2;
      const sd = Math.sqrt(v / 20);
      return { m, u: m + 2 * sd, l: m - 2 * sd };
    });

    let lo = Math.min(...vis.map((c) => c.l)), hi = Math.max(...vis.map((c) => c.h));
    if (S.inds.ma) [7, 25, 99].forEach((n) => ma[n].forEach((v) => { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    if (S.inds.boll) boll.forEach((b) => { if (b) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.u); } });
    const padP = (hi - lo) * 0.04 || 1;
    lo -= padP; hi += padP;
    const top = 40, bottom = H * 0.76;
    const y = (p) => top + ((hi - p) / (hi - lo)) * (bottom - top);
    const priceOf = (yy) => hi - ((yy - top) / (bottom - top)) * (hi - lo);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs>
      <linearGradient id="trVolUp" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${C.up}" stop-opacity="0.5"/><stop offset="100%" stop-color="${C.up}" stop-opacity="0.05"/></linearGradient>
      <linearGradient id="trVolDown" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${C.down}" stop-opacity="0.5"/><stop offset="100%" stop-color="${C.down}" stop-opacity="0.05"/></linearGradient>
    </defs>`;
    const frag = document.createDocumentFragment();

    // Lưới ngang
    [0.13, 0.32, 0.5, 0.68, 0.84].forEach((r) => frag.appendChild(el('line', { x1: 0, x2: W, y1: H * r, y2: H * r, stroke: C.grid, 'stroke-dasharray': '2 3' })));

    // Nhãn trục thời gian + lưới dọc
    const tf = tfObj();
    const tfMs = tf.minutes * 60000;
    const intervals = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440, 2880, 10080, 20160, 40320, 80640].map((m) => m * 60000);
    const need = tfMs * Math.ceil(80 / spacing);
    const step = intervals.find((m) => m >= need) || need;
    const axisLabels = [];
    times.forEach((t, i) => {
      if (t % step !== 0) return;
      const x = xOf(i);
      frag.appendChild(el('line', { x1: x, x2: x, y1: 0, y2: H, stroke: C.gridV, 'stroke-dasharray': '2 3' }));
      if (x > 20 && x < W - 130) {
        const d = new Date(t);
        const label = step >= 1440 * 60000 ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}` : step < 60000 ? clock(t) : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        axisLabels.push(`<span style="left:${x.toFixed(1)}px">${label}</span>`);
      }
    });
    $('#tr-axis').innerHTML = axisLabels.join('') + `<span class="tr-axis__now">${esc(clock(simNow()).slice(0, 5))} (Hiện tại)</span>`;

    // Khối lượng
    const maxV = Math.max(...vis.map((c) => c.v));
    const volH = H * 0.42;
    const bw = spacing * 0.48;
    vis.forEach((c, i) => {
      const h = (c.v / maxV) * volH;
      frag.appendChild(el('rect', { x: xOf(i) - bw / 2, y: H - h, width: bw, height: h, fill: c.c >= c.o ? 'url(#trVolUp)' : 'url(#trVolDown)' }));
    });

    // RSI(14) ở dải dưới
    if (S.inds.rsi) {
      const r0 = H * 0.8, r1 = H - 4;
      const ry = (v) => r1 - (v / 100) * (r1 - r0);
      [30, 70].forEach((v) => frag.appendChild(el('line', { x1: 0, x2: W, y1: ry(v), y2: ry(v), stroke: C.rsi, 'stroke-opacity': 0.35, 'stroke-dasharray': '3 3' })));
      const pts = [];
      vis.forEach((_, i) => {
        const gi = start + i;
        if (gi < 14) return;
        let g = 0, l = 0;
        for (let j = gi - 13; j <= gi; j++) { const d = closes[j] - closes[j - 1]; if (d > 0) g += d; else l -= d; }
        const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
        pts.push(`${xOf(i).toFixed(1)},${ry(rsi).toFixed(1)}`);
      });
      if (pts.length > 1) frag.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: C.rsi, 'stroke-width': 1.2 }));
    }

    // MA & BOLL
    const line = (vals, color, width, dash) => {
      const pts = vals.map((v, i) => (v == null ? null : `${xOf(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      if (pts.length > 1) frag.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(dash ? { 'stroke-dasharray': dash } : {}) }));
    };
    if (S.inds.boll) {
      line(boll.map((b) => b && b.u), C.boll, 1, '4 3');
      line(boll.map((b) => b && b.m), C.boll, 1);
      line(boll.map((b) => b && b.l), C.boll, 1, '4 3');
    }
    if (S.inds.ma) {
      line(ma[7], C.ma7, 1.5);
      line(ma[25], C.ma25, 1.5);
      line(ma[99], C.ma99, 1.2);
    }

    // Nến
    const cw = Math.max(3, spacing * 0.42);
    vis.forEach((c, i) => {
      const x = xOf(i);
      const color = c.c >= c.o ? C.up : C.down;
      const live = i === count - 1;
      frag.appendChild(el('line', { x1: x, x2: x, y1: y(c.h), y2: y(c.l), stroke: color, 'stroke-width': 1.5, ...(live ? { 'stroke-dasharray': '1 1' } : {}) }));
      const yb = y(Math.max(c.o, c.c));
      frag.appendChild(el('rect', { x: x - cw / 2, y: yb, width: cw, height: Math.max(1.5, y(Math.min(c.o, c.c)) - yb), rx: 1, fill: color }));
    });

    // Hình vẽ người dùng
    S.drawings.forEach((d) => {
      if (d.type === 'trend') {
        frag.appendChild(el('line', { x1: xOf(d.i1 - start), y1: y(d.p1), x2: xOf(d.i2 - start), y2: y(d.p2), stroke: C.ma7, 'stroke-width': 1.5 }));
      } else {
        const yy = y(d.p);
        const col = d.type === 'long' ? C.up : C.down;
        frag.appendChild(el('line', { x1: 0, x2: W, y1: yy, y2: yy, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '6 3' }));
        const t = el('text', { x: 8, y: yy - 4, fill: col, 'font-size': 10, 'font-weight': 600 });
        t.textContent = `${d.type === 'long' ? 'LONG' : 'SHORT'} @ ${px(d.p)}`;
        frag.appendChild(t);
      }
    });

    // Đường giá hiện tại
    const last = vis[count - 1];
    frag.appendChild(el('line', { x1: 0, x2: W, y1: y(last.c), y2: y(last.c), stroke: C.ma7, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));

    // Crosshair khi hover
    if (S.hover != null && S.hover >= start) {
      const hx = xOf(S.hover - start);
      frag.appendChild(el('line', { x1: hx, x2: hx, y1: 0, y2: H, stroke: '#a08e7a', 'stroke-opacity': 0.5, 'stroke-dasharray': '3 3' }));
    }
    svg.appendChild(frag);

    // Tag giá bên phải
    const tags = [`<div class="tr-tag tr-tag--price" style="top:${y(last.c).toFixed(1)}px">${px(last.c)}</div>`];
    if (S.inds.ma) {
      [7, 25].forEach((n) => {
        const v = ma[n][count - 1];
        if (v == null) return;
        const yy = y(v);
        if (Math.abs(yy - y(last.c)) > 18 && yy < bottom + 20) tags.push(`<div class="tr-tag" style="top:${yy.toFixed(1)}px">${px(Math.round(v))}</div>`);
      });
    }
    $('#tr-tags').innerHTML = tags.join('');

    chartGeom = { start, count, spacing, xOf, priceOf, W, rightPad, all };
    renderHud(all, closes);
  }

  function renderHud(all, closes) {
    const p = S.pair;
    const i = S.hover != null ? S.hover : all.length - 1;
    const c = all[i];
    const d = p.priceDigits === 2 ? 1 : p.priceDigits;
    const chg = c.c - c.o;
    const dir = chg >= 0 ? 'c-secondary' : 'c-error';
    const f = (v) => fmt.number(v, d);
    let html = `<div class="tr-hud__row">
      <span>Đ: <strong class="${dir}">${f(c.o)}</strong></span>
      <span>C: <strong class="c-secondary">${f(c.h)}</strong></span>
      <span>T: <strong class="c-error">${f(c.l)}</strong></span>
      <span>ĐG: <strong class="${dir}">${f(c.c)}</strong></span>
      <span class="c-primary">${chg >= 0 ? '+' : '-'}${f(Math.abs(chg))} (${fmt.percent((chg / c.o) * 100)})</span>
    </div>`;
    if (S.inds.ma) {
      const m = (n) => { const v = movingAvg(closes, n, i); return v == null ? '—' : f(v); };
      html += `<div class="tr-hud__row tr-hud__row--ma">
        <span class="c-primary">MA(7): ${m(7)}</span>
        <span class="c-secondary">MA(25): ${m(25)}</span>
        <span class="c-tertiary">MA(99): ${m(99)}</span>
      </div>`;
    }
    $('#tr-hud').innerHTML = html;
  }

  function renderChartBar() {
    $('#tr-tfs').innerHTML = S.d.timeframes.map((t) =>
      `<button type="button" class="tr-tf${t.key === S.tf ? ' is-active' : ''}" data-value="${esc(t.key)}">${esc(t.label)}</button>`).join('');
    const keys = ['ma', 'boll', 'rsi'];
    $('#tr-inds').innerHTML = S.d.indicators.map((name, i) =>
      `<button type="button" class="tr-ind${i > 0 ? ' tr-ind--md' : ''}" data-ind="${keys[i]}" aria-pressed="${S.inds[keys[i]]}">${esc(name)}</button>`).join('');
  }

  function bindChart() {
    ui.bindTabs($('#tr-tfs'), (v) => { S.tf = v; S.hover = null; drawChart(); toast(`Khung thời gian: ${v}`, 'info'); });
    $('#tr-inds').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ind]');
      if (!b) return;
      const k = b.dataset.ind;
      S.inds[k] = !S.inds[k];
      b.setAttribute('aria-pressed', S.inds[k]);
      toast(`${S.inds[k] ? 'Đã bật' : 'Đã tắt'} chỉ báo ${b.textContent}`, 'info');
      drawChart();
    });
    $('#tr-ind-btn').addEventListener('click', () => {
      const on = !(S.inds.ma || S.inds.boll || S.inds.rsi);
      S.inds = { ma: on, boll: on, rsi: on };
      $$('[data-ind]').forEach((b) => b.setAttribute('aria-pressed', on));
      toast(on ? 'Đã bật tất cả chỉ báo' : 'Đã ẩn tất cả chỉ báo', 'info');
      drawChart();
    });
    $('#tr-chart-settings').addEventListener('click', () => toast('Cài đặt biểu đồ đang được phát triển', 'info'));
    const chart = $('.tr-chart');
    $('#tr-chart-full').addEventListener('click', () => {
      const full = chart.classList.toggle('is-full');
      $('#tr-chart-full .icon').textContent = full ? 'fullscreen_exit' : 'fullscreen';
      requestDraw();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chart.classList.contains('is-full')) $('#tr-chart-full').click();
    });

    $('#tr-draw').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      if (b.dataset.tool === 'clear') {
        S.drawings = [];
        drawChart();
        toast('Đã xóa tất cả hình vẽ', 'success');
        return;
      }
      S.tool = b.dataset.tool;
      $$('[data-tool]', $('#tr-draw')).forEach((x) => x.classList.toggle('is-active', x === b));
      if (!['cursor', 'trend', 'long', 'short'].includes(S.tool)) toast(`${b.title}: đang được phát triển`, 'info');
    });

    const area = $('#tr-plot');
    const locate = (e) => {
      if (!chartGeom) return null;
      const r = area.getBoundingClientRect();
      const x = e.clientX - r.left, yy = e.clientY - r.top;
      const g = chartGeom;
      let i = Math.round((x - (g.W - g.rightPad - (g.count - 1) * g.spacing)) / g.spacing);
      i = Math.max(0, Math.min(g.count - 1, i));
      return { i: g.start + i, p: g.priceOf(yy) };
    };
    area.addEventListener('mousemove', (e) => {
      const loc = locate(e);
      if (!loc) return;
      S.hover = loc.i;
      if (S.drag) { S.drag.i2 = loc.i; S.drag.p2 = loc.p; }
      requestDraw();
    });
    area.addEventListener('mouseleave', () => { S.hover = null; requestDraw(); });
    area.addEventListener('mousedown', (e) => {
      const loc = locate(e);
      if (!loc) return;
      if (S.tool === 'trend') {
        S.drag = { type: 'trend', i1: loc.i, p1: loc.p, i2: loc.i, p2: loc.p };
        S.drawings.push(S.drag);
      } else if (S.tool === 'long' || S.tool === 'short') {
        S.drawings.push({ type: S.tool, p: loc.p });
        requestDraw();
      }
    });
    document.addEventListener('mouseup', () => { S.drag = null; });
    window.addEventListener('resize', requestDraw);
  }

  /* ---------- Sổ lệnh ---------- */
  function initBook(p) {
    const b = p.book;
    p.lv = {
      asks: b.asks.map((l) => ({ off: l.p - p.price, q: l.q, t: l.t, w: l.w })),
      bids: b.bids.map((l) => ({ off: l.p - p.price, q: l.q, t: l.t, w: l.w })),
      askBase: Math.max(0, b.asks[0].t - b.asks[0].q)
    };
  }

  function bookRows(side, n) {
    const p = S.pair;
    const stepSize = p.depthSteps[S.depthIdx];
    const src = p.lv[side];
    let rows = src.map((l) => ({ p: roundTo(p.price + l.off, p.tick), q: l.q, t: l.t, w: l.w }));
    const fresh = S.bookFresh && S.depthIdx === 0;
    if (stepSize > p.tick + 1e-12) {
      const map = new Map();
      rows.forEach((r) => {
        const k = side === 'asks' ? Math.ceil(r.p / stepSize - 1e-9) * stepSize : Math.floor(r.p / stepSize + 1e-9) * stepSize;
        const key = k.toFixed(8);
        map.set(key, { p: k, q: (map.get(key)?.q || 0) + r.q });
      });
      rows = Array.from(map.values());
    }
    rows = rows.slice(0, n);
    if (!fresh) {
      let acc = side === 'asks' ? p.lv.askBase : 0;
      rows.forEach((r) => { acc += r.q; r.t = acc; r.w = null; });
    }
    return rows;
  }

  function renderBookHead() {
    const p = S.pair;
    $('#tr-book-head').innerHTML = `<span>Giá (${esc(p.quote)})</span><span>SL (${esc(p.base)})</span><span>Tổng (${esc(p.base)})</span>`;
    $('#tr-trades-head').innerHTML = `<span>Giá (${esc(p.quote)})</span><span>SL (${esc(p.base)})</span><span>Thời gian</span>`;
    const step = p.depthSteps[S.depthIdx];
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    $('#tr-depth-label').textContent = `Độ sâu: ${step.toFixed(d)}`;
    $('#tr-depth-btn').innerHTML = `${step.toFixed(d)} ${esc(p.quote)} ${icon('unfold_more', 'icon-14')}`;
  }

  function renderBook() {
    const p = S.pair;
    const n = S.bookView === 'both' ? 6 : 12;
    const asks = bookRows('asks', n), bids = bookRows('bids', n);
    const maxT = Math.max(...asks.map((r) => r.t), ...bids.map((r) => r.t)) || 1;
    const qDigits = p.qtyDigits;
    const row = (r, side, best) => {
      const w = r.w != null ? r.w : Math.max(4, (r.t / maxT) * 90);
      return `<div class="tr-book__row" data-px="${r.p}">
        <div class="tr-book__depth-bar tr-book__depth-bar--${side}${best ? ' tr-book__depth-bar--best' : ''}" style="width:${w.toFixed(1)}%"></div>
        <span class="tr-book__px ${side === 'ask' ? 'c-error' : 'c-secondary'}">${px(r.p)}</span>
        <span class="c-on-surface">${fmt.number(r.q, qDigits)}</span>
        <span class="c-muted">${fmt.number(r.t, qDigits)}</span>
      </div>`;
    };
    $('#tr-asks').innerHTML = asks.map((r, i) => row(r, 'ask', i === 0)).join('');
    $('#tr-bids').innerHTML = bids.map((r, i) => row(r, 'bid', i === 0)).join('');
    const sp = asks.length && bids.length ? (asks[0].p - bids[0].p) / 2 : 0;
    const up = S.lastDir >= 0;
    $('#tr-spread').innerHTML = `
      <div class="tr-book__mid ${up ? 'c-secondary' : 'c-error'}"><span class="num-f">${px(p.price)}</span>${icon(up ? 'arrow_upward' : 'arrow_downward', 'icon-16')}</div>
      <div class="tr-book__sp"><span>Chênh lệch:</span><strong>${px(sp)} ${esc(p.quote)} (${((sp / p.price) * 100).toFixed(3)}%)</strong></div>`;
  }

  function renderTrades() {
    const p = S.pair;
    $('#tr-trades').innerHTML = p.trades.slice(0, 30).map((t, i) => `
      <div class="tr-book__row${i === 0 && t.fresh ? ' tr-trade-new' + (t.side === 'sell' ? ' is-sell' : '') : ''}" data-px="${t.p}">
        <span class="tr-book__px ${t.side === 'buy' ? 'c-secondary' : 'c-error'}">${px(t.p)}</span>
        <span class="c-on-surface">${fmt.number(t.q, p.qtyDigits)}</span>
        <span class="c-muted">${esc(t.time)}</span>
      </div>`).join('');
  }

  function bindBook() {
    const book = $('.tr-book');
    ui.bindTabs($('#tr-book-tabs'), (v) => {
      S.bookTab = v;
      $('#tr-book-body').classList.toggle('hidden', v !== 'book');
      $('#tr-trades-body').classList.toggle('hidden', v !== 'trades');
      $('#tr-book-views').style.visibility = v === 'book' ? '' : 'hidden';
    });
    ui.bindTabs($('#tr-book-views'), (v) => {
      S.bookView = v;
      book.classList.toggle('view-asks', v === 'asks');
      book.classList.toggle('view-bids', v === 'bids');
      renderBook();
    });
    $('#tr-depth-btn').addEventListener('click', () => {
      S.depthIdx = (S.depthIdx + 1) % S.pair.depthSteps.length;
      renderBookHead(); renderBook();
    });
    book.addEventListener('click', (e) => {
      const r = e.target.closest('[data-px]');
      if (!r || S.otype === 'market') return;
      $('#tr-price').value = px(+r.dataset.px);
      updateForm();
    });
  }

  /* ---------- Form đặt lệnh ---------- */
  function orderPrice() {
    if (S.otype === 'market') return S.pair.price;
    return num($('#tr-price').value);
  }
  function maxQty() {
    const price = orderPrice();
    if (!(price > 0)) return 0;
    const buf = 1 + S.d.account.feeBuffer;
    const raw = S.mode === 'futures' ? (S.avail * S.lev) / (price * buf) : S.avail / (price * buf);
    return floorTo(raw, qd());
  }
  function baseBalance(base) {
    const a = S.assets.find((x) => x.asset === base);
    return a ? a.available : 0;
  }

  function renderForm() {
    const p = S.pair;
    const form = $('#tr-form');
    form.classList.toggle('is-spot', S.mode === 'spot');
    $('.tr').classList.toggle('is-spot', S.mode === 'spot');
    $$('[data-value]', $('#tr-mode')).forEach((b) => b.classList.toggle('is-active', b.dataset.value === S.mode));
    $$('[data-value]', $('#tr-mode-top')).forEach((b) => b.classList.toggle('is-active', b.dataset.value === S.mode));
    $$('[data-value]', $('#tr-otype')).forEach((b) => b.classList.toggle('is-active', b.dataset.value === S.otype));
    $('#tr-margin-btn').innerHTML = `<span>${S.marginMode === 'cross' ? 'Ký quỹ Chéo (Cross)' : 'Ký quỹ Cô lập (Isolated)'}</span>${icon('arrow_drop_down', 'icon-14 c-muted')}`;
    $('#tr-lev-btn').innerHTML = `${icon('bolt', 'icon-15 c-primary')}<span>Đòn bẩy ${S.lev}x</span>${icon('arrow_drop_down', 'icon-14 c-muted')}`;
    const priceIn = $('#tr-price');
    priceIn.disabled = S.otype === 'market';
    if (S.otype === 'market') { priceIn.value = ''; priceIn.placeholder = 'Giá thị trường tốt nhất'; }
    else { priceIn.placeholder = '0.00'; if (!priceIn.value) priceIn.value = px(p.price); }
    $('#tr-stop-fld').classList.toggle('hidden', S.otype !== 'stop');
    $('#tr-buy [data-label]').textContent = S.mode === 'futures' ? 'MUA / LONG' : `MUA ${p.base}`;
    $('#tr-sell [data-label]').textContent = S.mode === 'futures' ? 'BÁN / SHORT' : `BÁN ${p.base}`;
    const v = S.d.account.vip;
    $('#tr-vip').innerHTML = `
      <div class="flex items-center" style="gap:6px">${icon('workspace_premium', 'icon-16 c-primary')}<span class="t-label-sm c-primary fw-700">VIP ${v.level}</span><span class="c-muted">${esc(v.discount)}</span></div>
      <div class="tr-vip__fee">T: <strong>${v.taker.toFixed(2)}%</strong> | M: <strong>${v.maker.toFixed(2)}%</strong></div>`;
    updateForm();
  }

  /* Cập nhật phần phụ thuộc giá/số lượng (gọi cả khi giá tick) */
  function updateForm() {
    const p = S.pair;
    const price = orderPrice();
    const qty = num($('#tr-qty').value) || 0;
    const max = maxQty();
    $('#tr-avail').textContent = `${fmt.number(S.avail, 2)} ${S.d.account.asset}`;
    $('#tr-max').textContent = S.mode === 'spot'
      ? `Tối đa: ${fmt.number(max, qd())} ${p.base} · Có: ${fmt.number(baseBalance(p.base), 4)}`
      : `Tối đa: ${fmt.number(max, qd())} ${p.base}`;
    $$('[data-value]', $('#tr-pct')).forEach((b) => b.classList.toggle('is-active', +b.dataset.value === S.pct));
    const notional = qty * (price || 0);
    const row = (k, v, cls = 'c-on-surface') => `<div class="tr-sum__row"><span>${k}</span><span class="${cls}">${v}</span></div>`;
    if (S.mode === 'futures') {
      const liq = price > 0 ? liqPrice('long', price, S.lev) : 0;
      $('#tr-sum').innerHTML =
        row('Giá trị danh nghĩa:', `${fmt.number(notional, 2)} ${p.quote}`) +
        row(`Ký quỹ ban đầu (${S.lev}x):`, `${fmt.number(notional / S.lev, 2)} ${p.quote}`, 'c-primary fw-600') +
        row('Ước tính giá thanh lý:', qty > 0 ? `${px(liq)} ${p.quote}` : '--', 'c-error fw-600');
    } else {
      const fee = notional * (S.d.account.vip.taker / 100);
      $('#tr-sum').innerHTML =
        row('Giá trị lệnh:', `${fmt.number(notional, 2)} ${p.quote}`) +
        row(`Phí ước tính (${S.d.account.vip.taker.toFixed(2)}%):`, `${fmt.number(fee, 4)} ${p.quote}`, 'c-primary fw-600') +
        row('Số dư sau lệnh mua:', `${fmt.number(Math.max(0, S.avail - notional - fee), 2)} ${p.quote}`);
    }
    const label = price > 0 ? px(price) : '--';
    $$('[data-px]', $('.tr-actions')).forEach((x) => { x.textContent = S.otype === 'market' ? `${px(p.price)}` : label; });
  }

  function markInvalid(input, bad) {
    input.closest('.tr-input, .tr-tpsl__in').classList.toggle('is-invalid', bad);
    if (bad) input.focus();
    return bad;
  }

  function submitOrder(side) {
    const p = S.pair;
    $$('.is-invalid', $('#tr-form')).forEach((x) => x.classList.remove('is-invalid'));
    const qtyIn = $('#tr-qty'), priceIn = $('#tr-price'), stopIn = $('#tr-stop');
    const qty = num(qtyIn.value);
    const price = orderPrice();
    if (S.otype !== 'market' && markInvalid(priceIn, !(price > 0))) return toast('Vui lòng nhập giá đặt lệnh hợp lệ', 'error');
    let trigger = null;
    if (S.otype === 'stop') {
      trigger = num(stopIn.value);
      if (markInvalid(stopIn, !(trigger > 0))) return toast('Vui lòng nhập giá kích hoạt', 'error');
    }
    if (markInvalid(qtyIn, !(qty > 0))) return toast('Vui lòng nhập số lượng hợp lệ', 'error');
    const isBuy = side === 'buy';
    if (S.mode === 'spot' && !isBuy) {
      const bal = baseBalance(p.base);
      if (markInvalid(qtyIn, qty > bal)) return toast(`Không đủ số dư ${p.base} (có ${fmt.number(bal, 4)})`, 'error');
    } else if (markInvalid(qtyIn, qty > maxQty() + 1e-9)) {
      return toast(`Số lượng vượt quá mức tối đa ${fmt.number(maxQty(), qd())} ${p.base}`, 'error');
    }
    let tp = null, sl = null;
    if (S.mode === 'futures' && $('#tr-tpsl-on').checked) {
      const tpIn = $('#tr-tp'), slIn = $('#tr-sl');
      tp = tpIn.value.trim() ? num(tpIn.value) : null;
      sl = slIn.value.trim() ? num(slIn.value) : null;
      const ref = price;
      if (tp != null && markInvalid(tpIn, !(tp > 0) || (isBuy ? tp <= ref : tp >= ref)))
        return toast(isBuy ? 'Giá chốt lời (TP) phải cao hơn giá vào lệnh' : 'Giá chốt lời (TP) phải thấp hơn giá vào lệnh', 'error');
      if (sl != null && markInvalid(slIn, !(sl > 0) || (isBuy ? sl >= ref : sl <= ref)))
        return toast(isBuy ? 'Giá cắt lỗ (SL) phải thấp hơn giá vào lệnh' : 'Giá cắt lỗ (SL) phải cao hơn giá vào lệnh', 'error');
    }

    const fside = S.mode === 'futures' ? (isBuy ? 'long' : 'short') : (isBuy ? 'buy' : 'sell');
    const notional = qty * price;
    const lock = S.mode === 'futures' ? notional / S.lev : (isBuy ? notional : 0);
    const marketable = S.otype === 'limit' && (isBuy ? price >= p.price : price <= p.price);
    const order = { id: `O-${58213 + S.seq++}`, time: clock(simNow(), true), symbol: p.symbol, base: p.base, type: S.otype, side: fside, price, qty, filled: 0, leverage: S.mode === 'futures' ? S.lev : null, tp, sl, trigger, lock, spot: S.mode === 'spot', marginMode: S.marginMode };

    if (S.otype === 'market' || marketable) {
      S.avail -= lock;
      fillOrder(order, S.otype === 'market' ? p.price : price);
      toast(`Đã khớp lệnh ${SIDE_LABEL[fside]} ${fmt.number(qty, qd())} ${p.base} @ ${px(S.otype === 'market' ? p.price : price)}`, 'success');
      S.term = S.mode === 'futures' ? 'positions' : 'tradeHistory';
    } else {
      S.avail -= lock;
      S.openOrders.unshift(order);
      toast(`Đã đặt lệnh ${TYPE_LABEL[S.otype]} ${SIDE_LABEL[fside]} ${fmt.number(qty, qd())} ${p.base} @ ${px(price)}`, 'success');
      S.term = 'orders';
    }
    qtyIn.value = '';
    S.pct = null;
    renderTerm();
    updateForm();
  }

  /* Khớp lệnh: futures → mở/gộp vị thế; spot → cập nhật tài sản */
  function fillOrder(o, fillPx) {
    const p = pairBy(o.symbol);
    const fee = o.qty * fillPx * (S.d.account.vip.taker / 100);
    S.orderHistory.unshift({ time: clock(simNow(), true), symbol: o.symbol, type: TYPE_LABEL[o.type], side: o.side, price: fillPx, qty: o.qty, status: 'filled' });
    if (o.side === 'close-long' || o.side === 'close-short') {
      const pos = S.positions.find((x) => x.id === o.posId);
      if (pos) closePosition(pos, fillPx, true);
      return;
    }
    S.tradeHistory.unshift({ time: clock(simNow(), true), symbol: o.symbol, side: o.side, price: fillPx, qty: o.qty, fee, pnl: 0 });
    if (o.spot) {
      const usdt = S.assets.find((a) => a.asset === 'USDT');
      let a = S.assets.find((x) => x.asset === p.base);
      if (!a) { a = { asset: p.base, balance: 0, available: 0, inOrder: 0, unrealized: 0 }; S.assets.push(a); }
      if (o.side === 'buy') {
        S.avail += o.lock - o.qty * fillPx - fee;
        a.balance += o.qty; a.available += o.qty;
      } else {
        S.avail += o.qty * fillPx - fee;
        a.balance -= o.qty; a.available -= o.qty;
      }
      if (usdt) usdt.available = S.avail;
      return;
    }
    S.avail -= fee;
    const margin = o.lock;
    const same = S.positions.find((x) => x.symbol === o.symbol && x.side === o.side);
    if (same) {
      const size = same.size + o.qty;
      same.entry = (same.entry * same.size + fillPx * o.qty) / size;
      same.size = size;
      same.margin += margin;
      same.leverage = Math.round((same.entry * size) / same.margin);
      same.liq = liqPrice(same.side, same.entry, same.leverage);
    } else {
      S.positions.unshift({
        id: `P-${1000 + S.seq++}`, symbol: o.symbol, base: o.base, side: o.side, leverage: o.leverage,
        size: o.qty, entry: fillPx, liq: liqPrice(o.side, fillPx, o.leverage), margin, marginMode: o.marginMode,
        marginRatio: +(mmr() * o.leverage * 100).toFixed(1), tp: o.tp, sl: o.sl
      });
    }
  }

  function setMode(mode) {
    if (S.mode === mode) return;
    S.mode = mode;
    S.pct = null;
    renderPairBtn(); renderStats(); renderForm();
    toast(mode === 'spot' ? 'Chế độ Giao ngay (Spot)' : 'Chế độ Hợp đồng vĩnh cửu', 'info');
  }

  /* Popover đòn bẩy */
  function levMarks(max) {
    return [1, ...[1, 2, 3, 4, 5].map((i) => Math.round((max * i) / 5))];
  }
  function syncLev(v) {
    const max = S.pair.maxLeverage;
    v = Math.max(1, Math.min(max, Math.round(v)));
    $('#tr-lev-range').value = v;
    $('#tr-lev-value').textContent = `${v}x`;
    $$('[data-lev]').forEach((b) => b.classList.toggle('is-active', +b.dataset.lev === v));
    const note = $('#tr-lev-note');
    note.textContent = v > 50
      ? `Đòn bẩy cao (${v}x) làm tăng rủi ro thanh lý. Vị thế tối đa: ${fmt.number(S.avail * v, 0)} USDT`
      : `Vị thế tối đa với ${v}x: ${fmt.number(S.avail * v, 0)} USDT`;
    note.classList.toggle('is-warn', v > 50);
    const pct = ((v - 1) / (max - 1 || 1)) * 100;
    $('#tr-lev-range').style.background = `linear-gradient(to right, var(--vip) ${pct}%, var(--surface-highest) ${pct}%)`;
  }
  function openLev() {
    const max = S.pair.maxLeverage;
    const r = $('#tr-lev-range');
    r.max = max;
    $('#tr-lev-marks').innerHTML = levMarks(max).map((m) => `<button type="button" class="tr-lev__mark" data-lev="${m}">${m}x</button>`).join('');
    syncLev(S.lev);
    $('#tr-lev').classList.add('is-open');
    $('#tr-lev-btn').setAttribute('aria-expanded', 'true');
  }
  function closeLev() {
    $('#tr-lev').classList.remove('is-open');
    $('#tr-lev-btn').setAttribute('aria-expanded', 'false');
  }

  function bindForm() {
    ui.bindTabs($('#tr-mode'), (v) => setMode(v));
    ui.bindTabs($('#tr-otype'), (v) => {
      S.otype = v;
      if (v !== 'market' && !$('#tr-price').value) $('#tr-price').value = px(S.pair.price);
      if (v === 'stop' && !$('#tr-stop').value) $('#tr-stop').value = px(S.pair.price);
      renderForm();
    });
    $('#tr-margin-btn').addEventListener('click', () => {
      S.marginMode = S.marginMode === 'cross' ? 'isolated' : 'cross';
      renderForm();
      toast(`Đã chuyển sang ${S.marginMode === 'cross' ? 'Ký quỹ Chéo (Cross)' : 'Ký quỹ Cô lập (Isolated)'}`, 'info');
    });
    $('#tr-lev-btn').addEventListener('click', () => ($('#tr-lev').classList.contains('is-open') ? closeLev() : openLev()));
    $('#tr-lev-close').addEventListener('click', closeLev);
    $('#tr-lev-range').addEventListener('input', (e) => syncLev(+e.target.value));
    $('#tr-lev-marks').addEventListener('click', (e) => { const b = e.target.closest('[data-lev]'); if (b) syncLev(+b.dataset.lev); });
    $$('[data-step]', $('#tr-lev')).forEach((b) => b.addEventListener('click', () => syncLev(+$('#tr-lev-range').value + +b.dataset.step)));
    $('#tr-lev-ok').addEventListener('click', () => {
      S.lev = +$('#tr-lev-range').value;
      closeLev();
      if (S.pct) $('#tr-qty').value = fmt.number(floorTo((maxQty() * S.pct) / 100, qd()), qd()).replace(/,/g, '');
      renderForm();
      toast(`Đã đặt đòn bẩy ${S.lev}x cho ${S.pair.symbol}`, 'success');
    });

    $('#tr-avail-add').href = href('deposit');
    $('#tr-last-btn').addEventListener('click', () => {
      if (S.otype === 'market') return;
      $('#tr-price').value = px(S.pair.price);
      updateForm();
    });
    ['#tr-price', '#tr-stop'].forEach((sel) => {
      const inp = $(sel);
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d.,]/g, ''); updateForm(); });
      inp.addEventListener('blur', () => { const v = num(inp.value); if (v > 0) inp.value = px(v); });
    });
    const qtyIn = $('#tr-qty');
    qtyIn.addEventListener('input', () => { qtyIn.value = qtyIn.value.replace(/[^\d.]/g, ''); S.pct = null; updateForm(); });
    qtyIn.addEventListener('blur', () => { const v = num(qtyIn.value); if (v > 0) qtyIn.value = v.toFixed(qd()); });
    $('#tr-pct').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      S.pct = +b.dataset.value;
      qtyIn.value = floorTo((maxQty() * S.pct) / 100, qd()).toFixed(qd());
      updateForm();
    });
    ['#tr-tp', '#tr-sl'].forEach((sel) => {
      const inp = $(sel);
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d.,]/g, ''); });
      inp.addEventListener('blur', () => { const v = num(inp.value); if (v > 0) inp.value = px(v); });
    });
    $('#tr-tpsl-on').addEventListener('change', (e) => $('.tr-tpsl').classList.toggle('is-off', !e.target.checked));
    $('#tr-buy').addEventListener('click', () => submitOrder('buy'));
    $('#tr-sell').addEventListener('click', () => submitOrder('sell'));
  }

  /* ---------- 3. Terminal ---------- */
  function posPnl(pos) {
    const mark = pairBy(pos.symbol).price;
    const pnl = (mark - pos.entry) * pos.size * (pos.side === 'long' ? 1 : -1);
    return { mark, pnl, roi: (pnl / pos.margin) * 100 };
  }

  function renderTermTabs() {
    $('#tr-term-tabs').innerHTML = TERM_TABS.map((t) => {
      const c = t.count ? `<span class="tr-term__count">${t.count()}</span>` : '';
      return `<button type="button" role="tab" class="tr-term__tab${t.key === S.term ? ' is-active' : ''}" data-value="${t.key}" aria-selected="${t.key === S.term}"><span>${esc(t.label)}</span>${c}</button>`;
    }).join('');
    const bulk = { positions: S.positions.length ? 'Đóng tất cả vị thế' : '', orders: S.openOrders.length ? 'Hủy tất cả lệnh' : '' }[S.term] || '';
    $('#tr-bulk').textContent = bulk;
  }

  function sideBadge(o) {
    const long = o.side === 'long' || o.side === 'buy' || o.side === 'close-short';
    return `<span class="tr-side tr-side--${long ? 'long' : 'short'}">${esc(SIDE_LABEL[o.side] || o.side)}</span>`;
  }

  function table(head, rows, empty) {
    return `<table class="tr-tbl"><thead><tr>${head.map((h) => `<th${h.r ? ' class="text-right"' : ''}>${h.t}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}"><div class="empty">${empty}</div></td></tr>`}</tbody></table>`;
  }

  function positionRow(pos) {
    const p = pairBy(pos.symbol);
    const { mark, pnl, roi } = posPnl(pos);
    const long = pos.side === 'long';
    return `<tr data-pos="${pos.id}">
      <td><div class="tr-sym"><span class="dot ${long ? '' : 'dot--error'}"></span><strong>${esc(pos.symbol)}</strong><span class="tr-side tr-side--${pos.side}">${long ? 'Long' : 'Short'} ${pos.leverage}x</span></div></td>
      <td><div>${fmt.number(pos.size, 2)} ${esc(pos.base)}</div><div class="tr-tbl__sub" data-k="val">≈ ${fmt.usd(pos.size * mark, 2)}</div></td>
      <td>$${px(pos.entry, p)}</td>
      <td class="c-secondary fw-600" data-k="mark">$${px(mark, p)}</td>
      <td class="c-error fw-600">$${px(pos.liq, p)}</td>
      <td><div>${fmt.number(pos.margin, 2)} USDT</div><div class="tr-tbl__sub10 c-secondary">${pos.marginMode === 'cross' ? 'Chéo' : 'Cô lập'} (${pos.marginRatio}%)</div></td>
      <td><div class="tr-pnl ${tone(pnl)}" data-k="pnl">${signed(pnl)} USDT</div><div class="tr-roi ${tone(pnl)}" data-k="roi">${icon(roi >= 0 ? 'arrow_drop_up' : 'arrow_drop_down', 'icon-14')} ${fmt.percent(roi)}</div></td>
      <td class="text-right"><div class="tr-row-btns">
        <button type="button" class="tr-rbtn" data-act="limit-close">Giới hạn</button>
        <button type="button" class="tr-rbtn tr-rbtn--vip" data-act="market-close">Thị trường</button>
        <button type="button" class="tr-ibtn" data-act="tpsl" title="Cài đặt Chốt lời &amp; Cắt lỗ">${icon('edit_square', 'icon-16')}</button>
      </div></td>
    </tr>`;
  }

  function renderTerm() {
    renderTermTabs();
    let html = '';
    if (S.term === 'positions') {
      html = table([{ t: 'Cặp hợp đồng' }, { t: 'Quy mô' }, { t: 'Giá vào lệnh' }, { t: 'Giá đánh dấu' }, { t: 'Giá thanh lý' }, { t: 'Ký quỹ (Tỷ lệ)' }, { t: 'PNL chưa thực hiện (ROI%)' }, { t: 'Đóng vị thế', r: 1 }],
        S.positions.map(positionRow), 'Không có vị thế nào đang mở');
    } else if (S.term === 'orders') {
      html = table([{ t: 'Thời gian' }, { t: 'Cặp' }, { t: 'Loại' }, { t: 'Hướng' }, { t: 'Giá' }, { t: 'Số lượng' }, { t: 'Đã khớp' }, { t: 'TP / SL' }, { t: 'Thao tác', r: 1 }],
        S.openOrders.map((o) => {
          const p = pairBy(o.symbol);
          const type = TYPE_LABEL[o.type] + (o.spot ? ' · Spot' : '') + (o.trigger ? `<div class="tr-tbl__sub">Kích hoạt: ${px(o.trigger, p)}</div>` : '');
          return `<tr data-order="${o.id}">
            <td class="c-muted">${esc(o.time)}</td>
            <td><div class="tr-sym"><strong>${esc(o.symbol)}</strong>${o.leverage ? `<span class="tag">${o.leverage}x</span>` : ''}</div></td>
            <td>${type}</td>
            <td>${sideBadge(o)}</td>
            <td>${px(o.price, p)}</td>
            <td>${fmt.number(o.qty, 2)} ${esc(o.base)}</td>
            <td>${fmt.number(o.filled, 0)}%</td>
            <td><span class="c-secondary">${o.tp ? px(o.tp, p) : '--'}</span> / <span class="c-error">${o.sl ? px(o.sl, p) : '--'}</span></td>
            <td class="text-right"><button type="button" class="tr-rbtn tr-rbtn--danger" data-act="cancel">Hủy</button></td>
          </tr>`;
        }), 'Không có lệnh chờ khớp');
    } else if (S.term === 'orderHistory') {
      const st = { filled: ['Đã khớp', 'c-secondary'], canceled: ['Đã hủy', 'c-muted'] };
      html = table([{ t: 'Thời gian' }, { t: 'Cặp' }, { t: 'Loại' }, { t: 'Hướng' }, { t: 'Giá' }, { t: 'Số lượng' }, { t: 'Trạng thái', r: 1 }],
        S.orderHistory.map((o) => {
          const p = pairBy(o.symbol);
          return `<tr><td class="c-muted">${esc(o.time)}</td><td><strong>${esc(o.symbol)}</strong></td><td>${esc(o.type)}</td><td>${sideBadge(o)}</td>
            <td>${px(o.price, p)}</td><td>${fmt.number(o.qty, 2)}</td><td class="text-right"><span class="tr-status ${st[o.status][1]}">${st[o.status][0]}</span></td></tr>`;
        }), 'Chưa có lịch sử đặt lệnh');
    } else if (S.term === 'tradeHistory') {
      html = table([{ t: 'Thời gian' }, { t: 'Cặp' }, { t: 'Hướng' }, { t: 'Giá khớp' }, { t: 'Số lượng' }, { t: 'Phí' }, { t: 'PNL đã thực hiện', r: 1 }],
        S.tradeHistory.map((t) => {
          const p = pairBy(t.symbol);
          return `<tr><td class="c-muted">${esc(t.time)}</td><td><strong>${esc(t.symbol)}</strong></td><td>${sideBadge(t)}</td><td>${px(t.price, p)}</td>
            <td>${fmt.number(t.qty, 2)}</td><td class="c-muted">${fmt.number(t.fee, 2)} USDT</td>
            <td class="text-right fw-600 ${t.pnl ? tone(t.pnl) : 'c-muted'}">${t.pnl ? signed(t.pnl) + ' USDT' : '--'}</td></tr>`;
        }), 'Chưa có giao dịch');
    } else {
      const totalPnl = S.positions.reduce((s, x) => s + posPnl(x).pnl, 0);
      html = table([{ t: 'Tài sản' }, { t: 'Số dư ví' }, { t: 'Khả dụng' }, { t: 'Ký quỹ / Trong lệnh' }, { t: 'PNL chưa thực hiện', r: 1 }],
        S.assets.map((a) => {
          const isQuote = a.asset === 'USDT';
          const used = isQuote ? S.positions.reduce((s, x) => s + x.margin, 0) + S.openOrders.reduce((s, o) => s + o.lock, 0) : a.inOrder;
          const avail = isQuote ? S.avail : a.available;
          const pnl = isQuote ? totalPnl : a.unrealized;
          return `<tr><td><div class="tr-sym"><div class="coin coin--sm coin--gold">${esc(a.asset.slice(0, 1))}</div><strong>${esc(a.asset)}</strong></div></td>
            <td>${fmt.number(isQuote ? avail + used : a.balance, isQuote ? 2 : 4)}</td><td>${fmt.number(avail, isQuote ? 2 : 4)}</td>
            <td>${fmt.number(used, isQuote ? 2 : 4)}</td><td class="text-right fw-600 ${pnl ? tone(pnl) : 'c-muted'}">${pnl ? signed(pnl) + ' USDT' : '--'}</td></tr>`;
        }), 'Không có tài sản');
    }
    $('#tr-term-table').innerHTML = html;
    renderTermFoot();
  }

  function renderTermFoot() {
    const totalPnl = S.positions.reduce((s, x) => s + posPnl(x).pnl, 0);
    const used = S.positions.reduce((s, x) => s + x.margin, 0);
    const a = S.d.account;
    $('#tr-term-foot').innerHTML = `
      <div class="tr-term__foot-l">
        <div class="flex items-center" style="gap:4px"><span>Tổng PNL vị thế:</span><span class="${tone(totalPnl)} fw-700">${signed(totalPnl)} USDT</span></div>
        <div class="flex items-center hide-xs" style="gap:4px"><span>Tổng ký quỹ đã dùng:</span><span class="c-on-surface fw-600">${fmt.number(used, 2)} USDT</span></div>
        <div class="flex items-center hide-sm" style="gap:4px"><span>Mức rủi ro tài khoản:</span><span class="c-secondary fw-600">${a.accountRisk}% (${esc(a.riskText)})</span></div>
      </div>
      <div class="tr-term__foot-r"><span class="dot"></span><span>Hệ thống khớp lệnh WebSocket: Độ trễ <span id="tr-latency">${S.latency.toFixed(1)}</span>ms (Ổn định)</span></div>`;
  }

  /* Cập nhật giá đánh dấu/PNL tại chỗ, tránh dựng lại bảng mỗi tick */
  function updatePositionsLive() {
    if (S.term !== 'positions') { renderTermFoot(); return; }
    S.positions.forEach((pos) => {
      const row = $(`tr[data-pos="${pos.id}"]`);
      if (!row) return;
      const p = pairBy(pos.symbol);
      const { mark, pnl, roi } = posPnl(pos);
      $('[data-k="mark"]', row).textContent = `$${px(mark, p)}`;
      $('[data-k="val"]', row).textContent = `≈ ${fmt.usd(pos.size * mark, 2)}`;
      const pe = $('[data-k="pnl"]', row);
      pe.textContent = `${signed(pnl)} USDT`;
      pe.className = `tr-pnl ${tone(pnl)}`;
      const re = $('[data-k="roi"]', row);
      re.className = `tr-roi ${tone(pnl)}`;
      re.innerHTML = `${icon(roi >= 0 ? 'arrow_drop_up' : 'arrow_drop_down', 'icon-14')} ${fmt.percent(roi)}`;
    });
    renderTermFoot();
  }

  function closePosition(pos, at, silent) {
    const { pnl } = posPnl(pos);
    const realized = (at - pos.entry) * pos.size * (pos.side === 'long' ? 1 : -1);
    const fee = pos.size * at * (S.d.account.vip.taker / 100);
    S.avail += pos.margin + realized - fee;
    S.positions = S.positions.filter((x) => x !== pos);
    S.openOrders = S.openOrders.filter((o) => o.posId !== pos.id);
    S.tradeHistory.unshift({ time: clock(simNow(), true), symbol: pos.symbol, side: pos.side === 'long' ? 'close-long' : 'close-short', price: at, qty: pos.size, fee, pnl: realized });
    if (!silent) S.orderHistory.unshift({ time: clock(simNow(), true), symbol: pos.symbol, type: 'Thị trường', side: pos.side === 'long' ? 'close-long' : 'close-short', price: at, qty: pos.size, status: 'filled' });
    toast(`Đã đóng ${pos.symbol} ${pos.side === 'long' ? 'Long' : 'Short'} — PNL ${signed(realized || pnl)} USDT`, realized >= 0 ? 'success' : 'error');
  }

  function cancelOrder(o, silent) {
    S.avail += o.lock;
    S.openOrders = S.openOrders.filter((x) => x !== o);
    S.orderHistory.unshift({ time: clock(simNow(), true), symbol: o.symbol, type: TYPE_LABEL[o.type], side: o.side, price: o.price, qty: o.qty, status: 'canceled' });
    if (!silent) toast(`Đã hủy lệnh ${o.id} (${o.symbol})`, 'info');
  }

  function bindTerm() {
    $('#tr-term-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      S.term = b.dataset.value;
      renderTerm();
    });
    $('#tr-bulk').addEventListener('click', () => {
      if (S.term === 'positions' && S.positions.length) {
        S.positions.slice().forEach((pos) => closePosition(pos, pairBy(pos.symbol).price));
        toast('Đã đóng tất cả vị thế', 'success');
      } else if (S.term === 'orders' && S.openOrders.length) {
        S.openOrders.slice().forEach((o) => cancelOrder(o, true));
        toast('Đã hủy tất cả lệnh chờ khớp', 'info');
      }
      renderTerm(); updateForm();
    });
    $('#tr-term-tune').addEventListener('click', () => toast('Cài đặt bảng dữ liệu đang được phát triển', 'info'));
    $('#tr-term-table').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'cancel') {
        const o = S.openOrders.find((x) => x.id === b.closest('tr').dataset.order);
        if (o) cancelOrder(o);
      } else {
        const pos = S.positions.find((x) => x.id === b.closest('tr').dataset.pos);
        if (!pos) return;
        const p = pairBy(pos.symbol);
        if (act === 'market-close') closePosition(pos, p.price);
        else if (act === 'limit-close') {
          const long = pos.side === 'long';
          const price = roundTo(p.price * (long ? 1.002 : 0.998), p.tick);
          S.openOrders.unshift({ id: `O-${58213 + S.seq++}`, time: clock(simNow(), true), symbol: pos.symbol, base: pos.base, type: 'limit', side: long ? 'close-long' : 'close-short', price, qty: pos.size, filled: 0, leverage: pos.leverage, lock: 0, posId: pos.id });
          toast(`Đã đặt lệnh đóng giới hạn ${pos.symbol} @ ${px(price, p)}`, 'success');
        } else if (act === 'tpsl') {
          if (S.pair !== p) selectPair(p.symbol, false);
          $('#tr-tpsl-on').checked = true;
          $('.tr-tpsl').classList.remove('is-off');
          $('#tr-tp').focus();
          toast(`Thiết lập TP/SL cho ${pos.symbol} trong form đặt lệnh`, 'info');
          return;
        }
      }
      renderTerm(); updateForm();
    });
  }

  /* ---------- Giả lập realtime ---------- */
  function checkOrders(p) {
    S.openOrders.slice().forEach((o) => {
      if (o.symbol !== p.symbol) return;
      const x = p.price;
      let hit = false;
      if (o.type === 'stop') hit = o.side === 'long' || o.side === 'buy' ? x >= o.trigger : x <= o.trigger;
      else if (o.side === 'long' || o.side === 'buy' || o.side === 'close-short') hit = x <= o.price;
      else hit = x >= o.price;
      if (!hit) return;
      S.openOrders = S.openOrders.filter((y) => y !== o);
      fillOrder(o, o.type === 'stop' ? x : o.price);
      if (!o.posId) toast(`Lệnh ${o.id} ${o.symbol} đã khớp @ ${px(o.price, p)}`, 'success');
      renderTerm(); updateForm();
    });
  }

  function tick() {
    S.pairs.forEach((p) => {
      const prev = p.price;
      const move = roundTo(gauss() * p.price * 0.00011, p.tick);
      p.price = Math.max(p.tick, +(p.price + move).toFixed(8));
      p.change = ((p.price / p.open24) - 1) * 100;
      p.high = Math.max(p.high, p.price);
      p.low = Math.min(p.low, p.price);
      const vq = Math.random() * 0.4 * (p.volBase / 1e5 + 0.01);
      p.volBase += vq; p.volQuote += vq * p.price;
      const c = p.candles[p.candles.length - 1];
      c.c = p.price; c.h = Math.max(c.h, p.price); c.l = Math.min(c.l, p.price); c.v += Math.random() * 6;
      p.ticks++;
      if (p === S.pair) S.lastDir = p.price > prev ? 1 : p.price < prev ? -1 : S.lastDir;
      // Sổ lệnh: dao động khối lượng
      if (p === S.pair) {
        ['asks', 'bids'].forEach((s) => p.lv[s].forEach((l) => { l.q = Math.max(0.001, +(l.q * (1 + gauss() * 0.18)).toFixed(p.qtyDigits)); }));
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          const buy = Math.random() > 0.45;
          p.trades.unshift({ p: p.price + (buy ? p.tick : 0) * (Math.random() > 0.5 ? 1 : 0), q: +(Math.random() * p.lv.bids[0].q * 0.6 + 10 ** -p.qtyDigits).toFixed(p.qtyDigits), side: buy ? 'buy' : 'sell', time: clock(simNow()), fresh: true });
        }
        p.trades.forEach((t, i) => { if (i > 1) t.fresh = false; });
        p.trades.length = Math.min(p.trades.length, 40);
      }
      checkOrders(p);
    });

    // Nến mới khi qua mốc 15 phút
    const ms = S.d.candleMinutes * 60000;
    if (simNow() >= S.lastOpen + ms) {
      S.lastOpen += ms;
      S.pairs.forEach((p) => p.candles.push({ o: p.price, h: p.price, l: p.price, c: p.price, v: 1 }));
    }

    S.bookFresh = false;
    const p = S.pair;
    const prevTxt = $('#tr-last-px') ? $('#tr-last-px').textContent : '';
    renderLast();
    if (prevTxt !== px(p.price)) flash($('#tr-last-px'), S.lastDir >= 0);
    renderStats();
    renderBook();
    if (S.bookTab === 'trades') renderTrades();
    requestDraw();
    updateForm();
    updatePositionsLive();
    document.title = `${px(p.price)} ${p.base}/${p.quote} | Nexus Exchange`;
  }

  function startLive() {
    setInterval(tick, 1200);
    setInterval(() => {
      S.pairs.forEach((p) => { p.fundingSec = p.fundingSec > 0 ? p.fundingSec - 1 : 8 * 3600; });
      const cd = $('#tr-fund-cd');
      if (cd) cd.textContent = fundingText(S.pair.fundingSec);
      if (Math.random() < 0.3) {
        S.latency = Math.max(0.8, Math.min(1.8, S.latency + (Math.random() - 0.5) * 0.3));
        const l = $('#tr-latency');
        if (l) l.textContent = S.latency.toFixed(1);
      }
    }, 1000);
  }

  /* ---------- Boot ---------- */
  Nexus.boot(['trade.json'], ({ data }) => {
    const d = data.trade;
    S.d = d;
    const [hh, mm] = d.now.split(':').map(Number);
    S.simStart = Date.UTC(2024, 5, 18, hh, mm, 0);
    const [lh, lm] = d.lastCandleOpen.split(':').map(Number);
    S.lastOpen = Date.UTC(2024, 5, 18, lh, lm, 0);
    S.t0 = Date.now();
    S.pairs = d.pairs.map((p) => {
      const x = { ...p, candles: p.candles.map((c) => ({ ...c })), trades: p.trades.map((t) => ({ ...t })), ticks: 0 };
      x.open24 = x.price / (1 + x.change / 100);
      x.indexOff = x.indexPrice - x.price;
      initBook(x);
      return x;
    });
    const a = d.account;
    S.avail = a.available;
    S.lev = a.leverage;
    S.marginMode = a.marginMode;
    S.latency = a.latencyMs;
    S.positions = d.positions.map((x) => ({ ...x }));
    S.openOrders = d.openOrders.map((o) => ({ ...o, lock: (o.price * o.qty) / o.leverage }));
    S.orderHistory = d.orderHistory.map((x) => ({ ...x }));
    S.tradeHistory = d.tradeHistory.map((x) => ({ ...x }));
    S.assets = d.assets.map((x) => ({ ...x }));
    S.tf = d.defaultTimeframe;

    const f = d.formDefaults;
    S.mode = f.mode;
    S.otype = f.orderType;
    S.pct = f.pct;
    $('#tr-qty').value = f.qty.toFixed(2);
    $('#tr-tpsl-on').checked = f.tpsl;
    $('.tr-tpsl').classList.toggle('is-off', !f.tpsl);

    const want = (new URLSearchParams(location.search).get('symbol') || '').toUpperCase();
    const first = pairBy(want) || S.pairs[0];
    if (want && !pairBy(want)) toast(`Không tìm thấy cặp ${want}, hiển thị ${first.symbol}`, 'error');
    renderChartBar();
    bindTicker(); bindChart(); bindBook(); bindForm(); bindTerm();
    selectPair(first.symbol, false);
    if (first === S.pairs[0]) {
      $('#tr-tp').value = px(f.tp, first);
      $('#tr-sl').value = px(f.sl, first);
    } else {
      $('#tr-qty').value = '';
      S.pct = null;
      updateForm();
    }
    renderTerm();
    startLive();
  });
})();
