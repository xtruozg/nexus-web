/* ==========================================================================
   Nexus core: tải mock JSON, render app shell, helpers định dạng & DOM.
   Mỗi trang khai báo <body data-page="..." data-shell="app|bare" data-dock>
   rồi gọi Nexus.boot(['file.json', ...], render) trong script riêng.
   ========================================================================== */
(function () {
  'use strict';

  const DATA_DIR = 'data/';
  const cache = new Map();

  /* ---------- Data ---------- */
  function loadJSON(name) {
    if (!cache.has(name)) {
      cache.set(name, fetch(DATA_DIR + name, { cache: 'no-cache' }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${name}`);
        return res.json();
      }));
    }
    return cache.get(name);
  }

  /* ---------- Format ---------- */
  function fmtNumber(value, digits = 2, locale = 'en-US') {
    return Number(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function fmtUSD(value, digits = 2) {
    return '$' + fmtNumber(value, digits);
  }
  function fmtVND(value) {
    return Math.round(value).toLocaleString('en-US') + ' ₫';
  }
  function fmtCompact(value) {
    const abs = Math.abs(value);
    if (abs >= 1e12) return (value / 1e12).toFixed(3).replace(/\.?0+$/, '') + 'T';
    if (abs >= 1e9) return (value / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return Math.round(value / 1e6) + 'M';
    if (abs >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(value);
  }
  function fmtPercent(value, digits = 2, signed = true) {
    const s = Number(value).toFixed(digits) + '%';
    return signed && value > 0 ? '+' + s : s;
  }
  /* Kiểu số VN dùng dấu chấm phân tách nghìn (vd 2.000 USD) */
  function fmtDot(value) {
    return Number(value).toLocaleString('de-DE');
  }
  /* Số chữ số thập phân hợp lý theo độ lớn giá */
  function priceDigits(price) {
    if (price >= 1000) return 2;
    if (price >= 1) return 2;
    return 4;
  }

  /* ---------- DOM ---------- */
  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function icon(name, cls = '') {
    return `<span class="icon ${cls}" aria-hidden="true">${name}</span>`;
  }
  function deltaChip(value, digits = 2) {
    const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    const arrow = value > 0 ? 'arrow_drop_up' : value < 0 ? 'arrow_drop_down' : 'remove';
    return `<span class="chip chip--${dir}">${icon(arrow, 'icon-14')}${fmtPercent(value, digits)}</span>`;
  }

  /* Sparkline SVG từ mảng số — vẽ đường + vùng tô mờ */
  function sparkline(points, opts = {}) {
    const w = opts.width || 100, h = opts.height || 30, pad = 2;
    const min = Math.min(...points), max = Math.max(...points);
    const range = max - min || 1;
    const step = w / (points.length - 1);
    const xy = points.map((p, i) => [i * step, h - pad - ((p - min) / range) * (h - pad * 2)]);
    let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
      const cx = (x0 + x1) / 2;
      d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    const up = opts.trend ? opts.trend === 'up' : points[points.length - 1] >= points[0];
    const color = opts.color || (up ? 'var(--secondary)' : 'var(--error)');
    return `<svg class="${opts.cls || 'spark'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path d="${d} L${w},${h} L0,${h} Z" fill="${color}" fill-opacity="0.08"/>
      <path d="${d}" stroke="${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function toast(message, type = 'info') {
    let stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const ico = { success: 'check_circle', error: 'error', info: 'info' }[type] || 'info';
    const color = { success: 'c-secondary', error: 'c-error', info: 'c-primary' }[type] || 'c-primary';
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `${icon(ico, 'icon-18 ' + color)}<span>${escapeHTML(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* Gắn hành vi segmented/tabs: chỉ đổi class is-active, gọi onChange(value) */
  function bindTabs(container, onChange) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn || !container.contains(btn)) return;
      $$('[data-value]', container).forEach((b) => b.classList.toggle('is-active', b === btn));
      onChange && onChange(btn.dataset.value, btn);
    });
  }

  /* ---------- Shell ---------- */
  let routes = {};
  function href(key) {
    return routes[key] || '#';
  }

  const LOGO_SVG = `<svg class="brand__logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z" stroke="#f59e0b" stroke-width="2"/>
    <path d="M16 8.5 22.5 12.25v7.5L16 23.5 9.5 19.75v-7.5z" fill="#f59e0b" fill-opacity="0.18" stroke="#ffc174" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="2.6" fill="#ffc174"/>
  </svg>`;

  function renderHeader(common, page) {
    const u = common.user;
    const navItems = (common.mainNavByPage && common.mainNavByPage[page]) || common.mainNav;
    const nav = navItems.map((n) => {
      const active = n.key === page;
      return `<a class="main-nav__link${active ? ' is-active' : ''}" href="${href(n.key)}"${active ? ' aria-current="page"' : ''}>${escapeHTML(n.label)}</a>`;
    }).join('');
    const langs = common.languages.map((l, i) =>
      `<button type="button" class="dropdown__item${i === 0 ? ' is-active' : ''}" data-lang="${l.code}"><span class="t-body-md">${l.flag}</span><span>${escapeHTML(l.label)}</span></button>`
    ).join('');
    const menu = common.userMenu.map((m) =>
      `<a class="dropdown__item${m.danger ? ' dropdown__item--danger' : ''}" href="${href(m.key)}">${icon(m.icon, 'icon-18 ' + (m.danger ? 'c-error' : m.accent ? 'c-primary' : 'c-muted'))}<span class="${m.danger ? '' : 'c-on-surface'}">${escapeHTML(m.label)}</span></a>`
    ).join('');

    return `<header class="app-header">
      <div class="app-header__inner">
        <div class="app-header__left">
          <a class="brand" href="${href('markets')}">${LOGO_SVG}
            <div class="brand__text"><span class="brand__name">${escapeHTML(common.brand.name)}</span><span class="brand__sub">${escapeHTML(common.brand.sub)}</span></div>
          </a>
          <nav class="main-nav" aria-label="Điều hướng chính">${nav}</nav>
        </div>
        <div class="app-header__right">
          <div class="dropdown" data-dropdown>
            <button type="button" class="lang-btn" aria-haspopup="true">${icon('language', 'icon-18 c-primary')}<span class="hide-xs num" data-lang-current>${common.languages[0].code}</span>${icon('expand_more', 'icon-16 c-muted')}</button>
            <div class="dropdown__menu">${langs}</div>
          </div>
          <a class="btn btn--primary t-headline-sm" style="padding:4px 12px;border-radius:var(--radius-xs);box-shadow:var(--shadow-vip);font-size:15px;line-height:20px;font-weight:600" href="${href('deposit')}">${icon('account_balance_wallet', 'icon-18')}<span class="hide-xs">Nạp tiền</span></a>
          <div class="dropdown" data-dropdown>
            <button type="button" class="avatar-btn" aria-haspopup="true" aria-label="Tài khoản"><img class="avatar" src="${escapeHTML(u.avatar)}" alt="Ảnh đại diện" onerror="this.style.visibility='hidden'"></button>
            <div class="dropdown__menu" style="min-width:14rem">
              <div class="dropdown__head">
                <p class="t-label-sm upper tracking-wide c-muted">Tài khoản VIP ${u.vipLevel}</p>
                <p class="t-data c-primary fw-600 truncate">${escapeHTML(u.email)}</p>
              </div>
              ${menu}
            </div>
          </div>
        </div>
      </div>
    </header>`;
  }

  function renderFooter(common) {
    const links = common.footer.links.map((l) =>
      `<a href="${l.key ? href(l.key) : l.href}">${escapeHTML(l.label)}</a>`).join('');
    return `<footer class="app-footer"><div class="app-footer__inner">
      <div class="flex items-center gap-sm"><span class="t-headline-sm c-primary fw-700">${escapeHTML(common.brand.footerName)}</span><span class="t-body-sm c-muted">${escapeHTML(common.footer.copyright)}</span></div>
      <div class="app-footer__links">${links}</div>
    </div></footer>`;
  }

  function navActiveKey(page) {
    return page === 'wallet' || page === 'history' ? 'profile-settings' : page;
  }

  function renderMobileNav(common, page) {
    const active = navActiveKey(page);
    const items = common.mobileNav.map((n) => {
      if (n.fab) {
        return `<a class="mobile-nav__link mobile-nav__link--fab" href="${href(n.key)}"><div class="mobile-nav__fab">${icon(n.icon, 'icon-26')}</div><span>${escapeHTML(n.label)}</span></a>`;
      }
      const on = n.key === active;
      return `<a class="mobile-nav__link${on ? ' is-active' : ''}" href="${href(n.key)}"${on ? ' aria-current="page"' : ''}>${icon(n.icon, 'icon-22')}<span>${escapeHTML(n.label)}</span></a>`;
    }).join('');
    return `<nav class="mobile-nav" aria-label="Điều hướng di động">${items}</nav>`;
  }

  function renderDock(common, page) {
    const active = navActiveKey(page);
    const items = common.mobileNav.map((n) => {
      if (n.fab) {
        return `<a class="dock__link dock__link--fab" href="${href(n.key)}"><div class="dock__fab">${icon(n.icon, 'icon-24')}</div><span>${escapeHTML(n.label)}</span></a>`;
      }
      const on = n.key === active;
      return `<a class="dock__link${on ? ' is-active' : ''}" href="${href(n.key)}">${icon(n.dockIcon || n.icon, 'icon-20' + (on ? ' icon--fill' : ''))}<span>${escapeHTML(n.label)}</span></a>`;
    }).join('');
    return `<div class="dock-wrap"><div class="container"><nav class="dock">${items}</nav></div></div>`;
  }

  function bindShell() {
    // Dropdown: click để mở trên thiết bị cảm ứng, click ra ngoài để đóng
    $$('[data-dropdown]').forEach((dd) => {
      const trigger = dd.querySelector('button');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        $$('[data-dropdown].is-open').forEach((o) => o !== dd && o.classList.remove('is-open'));
        dd.classList.toggle('is-open');
      });
    });
    document.addEventListener('click', () => $$('[data-dropdown].is-open').forEach((o) => o.classList.remove('is-open')));
    $$('[data-lang]').forEach((btn) => btn.addEventListener('click', () => {
      $$('[data-lang]').forEach((b) => b.classList.toggle('is-active', b === btn));
      const cur = $('[data-lang-current]');
      if (cur) cur.textContent = btn.dataset.lang;
      toast(`Đã chuyển ngôn ngữ: ${btn.textContent.trim()}`, 'success');
    }));
    // Link chưa có trang ("#") → thông báo thay vì nhảy lên đầu trang
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href="#"]');
      if (!a) return;
      e.preventDefault();
      toast('Tính năng đang được phát triển', 'info');
    });
  }

  function mountShell(common) {
    const body = document.body;
    const page = body.dataset.page;
    const shell = body.dataset.shell || 'app';
    routes = common.routes;
    const main = $('main') || body;
    main.classList.add('app-main');

    if (shell === 'app') {
      main.insertAdjacentHTML('beforebegin', renderHeader(common, page));
      if (body.hasAttribute('data-dock')) main.insertAdjacentHTML('beforeend', renderDock(common, page));
      main.insertAdjacentHTML('afterend', renderFooter(common) + renderMobileNav(common, page));
      bindShell();
    }
  }

  function showLoadError(err) {
    const main = $('main') || document.body;
    const isFile = location.protocol === 'file:';
    main.insertAdjacentHTML('afterbegin', `<div class="load-error">
      <p class="t-headline-sm c-error" style="margin-bottom:8px">Không tải được dữ liệu mock</p>
      <p class="c-muted">${escapeHTML(err.message)}</p>
      ${isFile ? '<p class="c-muted" style="margin-top:8px">Trình duyệt chặn <code>fetch()</code> khi mở file trực tiếp. Hãy chạy <code>start.bat</code> (hoặc <code>npx serve .</code>) rồi mở <code>http://localhost:5500</code>.</p>' : ''}
    </div>`);
    console.error(err);
  }

  /**
   * Khởi động trang: tải common.json + các file dữ liệu riêng, dựng shell, gọi render.
   * render nhận object { common, data: { <tên file không đuôi>: json } }.
   */
  async function boot(files, render) {
    try {
      const [common, ...rest] = await Promise.all(['common.json', ...files].map(loadJSON));
      const data = {};
      files.forEach((f, i) => { data[f.replace(/\.json$/, '')] = rest[i]; });
      mountShell(common);
      await render({ common, data });
      if (location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    } catch (err) {
      showLoadError(err);
    }
  }

  window.Nexus = {
    boot, loadJSON, href,
    fmt: { number: fmtNumber, usd: fmtUSD, vnd: fmtVND, compact: fmtCompact, percent: fmtPercent, dot: fmtDot, priceDigits },
    ui: { icon, deltaChip, sparkline, toast, bindTabs, escapeHTML },
    $, $$,
  };
})();
