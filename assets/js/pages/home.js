/* Trang chủ — render từ data/markets.json, lọc/tìm/sắp xếp, giả lập giá realtime */
(function () {
  'use strict';
  const { fmt, ui, $, $$, href } = Nexus;
  const { icon, escapeHTML: esc } = ui;

  const state = { tab: 'all', query: '', sort: null, dir: -1, favOnly: false, favs: new Set(['BTC']) };
  let pairs = [];
  let usdVnd = 25400;

  function renderTicker(t) {
    $('#ticker').innerHTML = `
      <div class="ticker-bar__metrics">
        <div class="ticker-bar__item">
          <span class="dot animate-pulse"></span>
          <span class="ticker-bar__label">${esc(t.marketCap.label)}</span>
          <span class="t-data fw-600">${esc(t.marketCap.value)}</span>
          <span class="t-label-sm c-secondary ticker-bar__pill">${fmt.percent(t.marketCap.change)}</span>
        </div>
        <div class="divider-v"></div>
        <div class="ticker-bar__item">
          ${icon('analytics', 'icon-15 c-primary')}
          <span class="ticker-bar__label">${esc(t.volume.label)}</span>
          <span class="t-data c-primary fw-700">${esc(t.volume.value)}</span>
          <span class="t-label-sm c-muted">${esc(t.volume.sub)}</span>
        </div>
        <div class="divider-v"></div>
        <div class="ticker-bar__item">
          ${icon('psychology', 'icon-15 c-secondary')}
          <span class="ticker-bar__label">${esc(t.fearGreed.label)}</span>
          <span class="flex items-center ticker-bar__pill" style="gap:4px;padding:2px 4px">
            <span class="t-data fw-700 c-secondary">${t.fearGreed.value}</span>
            <span class="t-label-sm c-secondary upper">${esc(t.fearGreed.text)}</span>
          </span>
        </div>
        <div class="divider-v"></div>
        <div class="ticker-bar__item">
          <span class="ticker-bar__label">BTC Dom:</span>
          <span class="t-data">${esc(t.btcDominance)}</span>
          <span class="t-label-sm c-muted" style="margin-left:4px">ETH Gas:</span>
          <span class="t-data c-primary">${esc(t.ethGas)}</span>
        </div>
      </div>
      <div class="ticker-bar__side">
        <div class="ticker-bar__safu">
          <span class="t-label-sm upper">SAFU Vault</span>
          <span class="dot dot--sm"></span>
          <span class="t-data c-on-surface fw-600">${esc(t.safuVault)}</span>
        </div>
        <div class="flex items-center t-label-sm c-muted" style="gap:4px">
          ${icon('bolt', 'icon-14 c-primary')}
          <span>Khớp lệnh TPS: <strong class="t-data c-on-surface">${esc(t.tps)}</strong></span>
        </div>
      </div>`;
  }

  function renderTabs(tabs) {
    const el = $('#market-tabs');
    el.innerHTML = tabs.map((t) =>
      `<button type="button" role="tab" class="seg__btn${t.key === state.tab ? ' is-active' : ''}" data-value="${t.key}">${esc(t.label)}</button>`).join('');
    ui.bindTabs(el, (v) => { state.tab = v; renderRows(); });
  }

  function visiblePairs() {
    const q = state.query.trim().toUpperCase();
    let list = pairs.filter((p) => {
      if (state.favOnly && !state.favs.has(p.base)) return false;
      if (q && !(p.base.includes(q) || p.name.toUpperCase().includes(q))) return false;
      if (state.tab === 'all') return true;
      if (state.tab === 'gainers') return p.change > 0;
      return p.tags.includes(state.tab);
    });
    if (state.tab === 'gainers' && !state.sort) list = list.slice().sort((a, b) => b.change - a.change);
    if (state.sort) {
      const k = state.sort;
      list = list.slice().sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * state.dir);
    }
    return list;
  }

  function rowHTML(p) {
    const fav = state.favs.has(p.base);
    const coinTone = p.symbolColor === 'gold' ? 'coin--gold' : `tone-${p.symbolColor}`;
    const tag = p.badge
      ? `<span class="tag tag--gold">${esc(p.badge)}</span>`
      : p.leverage ? `<span class="tag">${esc(p.leverage)}</span>` : '';
    const digits = fmt.priceDigits(p.price);
    return `<tr data-base="${p.base}">
      <td>
        <div class="pair">
          <button type="button" class="pair__star${fav ? ' is-on' : ''}" data-fav="${p.base}" aria-label="Yêu thích ${p.base}">${icon('star', 'icon-16' + (fav ? ' icon--fill' : ''))}</button>
          <div class="coin ${coinTone}">${esc(p.symbol)}</div>
          <div class="flex col">
            <div class="flex items-center" style="gap:6px">
              <span class="pair__base">${p.base}</span>
              <span class="pair__quote">/${p.quote}</span>
              ${tag}
            </div>
            <span class="t-body-sm c-muted">${esc(p.name)}</span>
          </div>
        </div>
      </td>
      <td class="text-right">
        <div class="price-main num" data-price>${fmt.usd(p.price, digits)}</div>
        <div class="t-body-sm c-muted" data-vnd>≈ ${fmt.vnd(p.price * usdVnd)}</div>
      </td>
      <td class="text-right" data-change>${ui.deltaChip(p.change)}</td>
      <td class="text-right hide-xs">
        <div class="t-data">$${fmt.compact(p.volumeUsd)}</div>
        <div class="t-body-sm c-muted">${p.volumeBase.toLocaleString('en-US')} ${p.base}</div>
      </td>
      <td class="text-center hide-sm">${ui.sparkline(p.spark.map((v) => -v))}</td>
      <td class="text-right"><a class="btn btn--primary" href="${href('trade')}?symbol=${p.base}${p.quote}">Giao dịch</a></td>
    </tr>`;
  }

  function renderRows() {
    const list = visiblePairs();
    $('#market-rows').innerHTML = list.length
      ? list.map(rowHTML).join('')
      : `<tr><td colspan="6"><div class="empty">Không tìm thấy cặp giao dịch phù hợp</div></td></tr>`;
  }

  function bindMarkets() {
    $('#market-search').addEventListener('input', (e) => { state.query = e.target.value; renderRows(); });
    $('#filter-btn').addEventListener('click', (e) => {
      state.favOnly = !state.favOnly;
      e.currentTarget.classList.toggle('is-active', state.favOnly);
      ui.toast(state.favOnly ? 'Chỉ hiển thị cặp yêu thích' : 'Hiển thị tất cả cặp', 'info');
      renderRows();
    });
    $('#market-rows').addEventListener('click', (e) => {
      const star = e.target.closest('[data-fav]');
      if (!star) return;
      const b = star.dataset.fav;
      state.favs.has(b) ? state.favs.delete(b) : state.favs.add(b);
      renderRows();
    });
    $$('.th-sort').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      state.dir = state.sort === k ? -state.dir : -1;
      state.sort = k;
      renderRows();
    }));
  }

  /* Giả lập websocket: dao động giá nhỏ mỗi 2.5s, nháy xanh/đỏ */
  function startLiveTicks() {
    setInterval(() => {
      const p = pairs[Math.floor(Math.random() * pairs.length)];
      const pct = (Math.random() - 0.5) * 0.004;
      p.price = p.price * (1 + pct);
      p.change = +(p.change + pct * 100).toFixed(2);
      const row = $(`#market-rows tr[data-base="${p.base}"]`);
      if (!row) return;
      const priceEl = $('[data-price]', row);
      priceEl.textContent = fmt.usd(p.price, fmt.priceDigits(p.price));
      $('[data-vnd]', row).textContent = '≈ ' + fmt.vnd(p.price * usdVnd);
      $('[data-change]', row).innerHTML = ui.deltaChip(p.change);
      priceEl.classList.remove('flash-up', 'flash-down');
      void priceEl.offsetWidth;
      priceEl.classList.add(pct >= 0 ? 'flash-up' : 'flash-down');
    }, 2500);
  }

  function renderVip(vip, user) {
    $('#vip-banner').innerHTML = `
      <div class="vip-banner__glow vip-banner__glow--tl"></div>
      <div class="vip-banner__glow vip-banner__glow--br"></div>
      <div class="vip-banner__content">
        <div class="flex items-center gap-xs">
          ${icon('workspace_premium', 'icon-22 c-primary')}
          <span class="t-label-sm upper tracking-widest c-primary fw-700">${esc(vip.eyebrow)}</span>
        </div>
        <h2 class="t-headline-xl vip-banner__title">${esc(vip.title)}</h2>
        <p class="t-body-md c-muted">${esc(vip.desc)}</p>
      </div>
      <div class="vip-banner__actions">
        <div class="vip-banner__current">
          <span class="t-label-sm c-muted">${esc(vip.currentLabel)}</span>
          <span class="t-headline-sm c-primary fw-700">${esc(vip.currentText)}</span>
        </div>
        <a class="btn btn--primary btn--lg" href="${href('deposit')}">${icon('add_circle', 'icon-20')}<span>Nạp vốn ngay</span></a>
      </div>`;

    $('#vip-grid').innerHTML = vip.tiers.map((t) => {
      const current = t.level === user.vipLevel;
      const next = t.level === user.vipLevel + 1;
      const cls = current ? ' vip-card--current' : t.legend ? ' vip-card--legend' : '';
      const tone = t.metricTone === 'secondary' ? 'c-secondary' : 'c-primary';
      const barCls = current ? 'progress__bar--up' : '';
      let cta;
      if (current) {
        cta = `<a class="btn btn--primary vip-card__cta" href="${href('deposit')}"><span>Nạp thêm tích lũy VIP ${t.level + 1}</span>${icon('arrow_upward', 'icon-16')}</a>`;
      } else if (t.legend) {
        cta = `<a class="btn btn--primary-soft vip-card__cta" style="box-shadow:var(--shadow-lg)" href="${href('deposit')}"><span>${esc(t.cta)}</span>${icon('workspace_premium', 'icon-16')}</a>`;
      } else {
        cta = `<a class="btn btn--subtle vip-card__cta" href="${href('deposit')}" ${next ? 'data-next' : ''}><span>Nâng cấp ngay</span>${icon('chevron_right', 'icon-16')}</a>`;
      }
      return `<article class="vip-card${cls}">
        ${current ? '<div class="vip-card__ribbon">Cấp hiện tại</div>' : ''}
        ${t.legend ? '<div class="vip-card__glow"></div>' : ''}
        <div>
          <div class="vip-card__head">
            <div class="flex items-center gap-xs">
              <span class="vip-card__level">VIP ${t.level}</span>
              <span class="badge ${t.legend ? 'badge--vip-strong upper tracking-wide' : 'badge--vip'}"${current ? ' style="background:rgba(255,193,116,.2)"' : ''}>${esc(t.name)}</span>
            </div>
            ${icon(t.icon, 'vip-card__icon' + (current || t.legend ? ' vip-card__icon--on' : '') + (t.legend ? ' icon-24' : ''))}
          </div>
          <div class="vip-card__req">
            <div class="t-label-sm c-muted">Yêu cầu nạp vốn:</div>
            <div class="vip-card__amount num${current || t.legend ? ' c-primary' : ''}">${fmt.dot(t.deposit)} USD</div>
          </div>
          <div class="vip-card__bonus">
            <span class="t-body-sm c-muted">Thưởng tiền mặt:</span>
            <span class="vip-card__bonus-value num"${t.legend ? ' style="font-weight:800"' : ''}>+${fmt.dot(t.bonus)} USD</span>
          </div>
          <div class="vip-card__metric">
            <div class="vip-card__metric-row t-label-sm c-muted">
              <span>${esc(t.metricLabel)}</span>
              <span class="${tone}">${esc(t.metricValue)}</span>
            </div>
            <div class="progress"><div class="progress__bar ${barCls}" style="width:${t.progress}%"></div></div>
          </div>
        </div>
        <div class="vip-card__foot">${cta}</div>
      </article>`;
    }).join('');
  }

  function renderTrust(items) {
    $('#trust').innerHTML = items.map((t) => `
      <div class="trust__item">
        <div class="icon-tile">${icon(t.icon, 'icon-26 c-' + t.tone)}</div>
        <div>
          <h4 class="t-headline-sm">${esc(t.title)}</h4>
          <p class="t-body-sm c-muted" style="margin-top:2px">${esc(t.desc)}</p>
        </div>
      </div>`).join('');
  }

  Nexus.boot(['markets.json'], ({ common, data }) => {
    const m = data.markets;
    usdVnd = m.usdVnd;
    pairs = m.pairs.map((p) => ({ ...p }));
    renderTicker(m.ticker);
    renderTabs(m.tabs);
    renderRows();
    bindMarkets();
    renderVip(m.vip, common.user);
    renderTrust(m.trust);
    startLiveTicks();
  });
})();
