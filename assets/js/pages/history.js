/* Lịch sử giao dịch & Báo cáo thuế — render từ data/history.json:
   lọc/tìm/sắp xếp/phân trang sổ cái, xuất CSV/XLS, giá vốn FIFO/LIFO/HIFO/ACB, modal biên lai & báo cáo thuế */
(function () {
  'use strict';
  const { fmt, ui, $, $$ } = Nexus;
  const { icon, escapeHTML: esc, toast } = ui;

  let D = null;
  let rows = [];
  const defaults = { tab: 'all', preset: '30d', from: '', to: '', asset: 'all', action: 'all', query: '', groups: new Set(), sort: 'time', dir: -1, sortTouched: false, page: 1, perPage: 10 };
  const state = { ...defaults, groups: new Set(), method: 'fifo', year: '2024' };
  const tax = { period: '', purpose: '', format: 'pdf' };
  let receiptRow = null;

  const TONE = { up: 'c-secondary', down: 'c-error', primary: 'c-primary', muted: 'c-muted', '': 'c-on-surface' };
  const tone = (t) => TONE[t || ''] || 'c-on-surface';
  const ico12 = (name) => `<span class="icon" style="font-size:12px" aria-hidden="true">${name}</span>`;
  const signedUsd = (v) => (v >= 0 ? '+' : '-') + fmt.usd(Math.abs(v));

  /* ---------- Ngày ---------- */
  const isoDay = (d) => d.toISOString().slice(0, 10);
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return isoDay(d);
  }
  const today = () => D.asOf.slice(0, 10);
  function presetRange(key) {
    const p = D.datePresets.find((x) => x.key === key);
    if (!p) return null;
    if (p.days) return { from: addDays(today(), -(p.days - 1)), to: today() };
    return { from: p.from, to: p.to < today() ? p.to : today() };
  }
  function rangeLabel(from, to) {
    const [fy, fm, fd] = from.split('-');
    const [ty, tm, td] = to.split('-');
    return fy === ty ? `${fd}/${fm} - ${td}/${tm}/${ty.slice(2)}` : `${fd}/${fm}/${fy.slice(2)} - ${td}/${tm}/${ty.slice(2)}`;
  }
  function applyPreset(key) {
    const r = presetRange(key);
    state.preset = key;
    state.from = r.from;
    state.to = r.to;
  }

  /* ---------- KPI ---------- */
  function currentMethod() {
    return D.costBasis.methods.find((m) => m.key === state.method);
  }
  function renderKpis() {
    const k = D.kpis;
    const m = currentMethod();
    const taxable = D.taxYears[Object.keys(D.taxYears).find((y) => D.taxYears[y].current)].taxable[state.method];
    const maxBar = Math.max(...k.volumeBars);
    const n = k.volumeBars.length, gap = 4, bw = (100 - gap * (n - 1)) / n;
    const bars = k.volumeBars.map((h, i) => {
      const fill = i < n - 3 ? 'var(--surface-highest)' : 'var(--primary)';
      const op = i === n - 3 ? 0.4 : i === n - 2 ? 0.6 : 1;
      const bh = (h / maxBar) * 20;
      return `<rect x="${(i * (bw + gap)).toFixed(2)}" y="${(20 - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="1" fill="${fill}" fill-opacity="${op}"/>`;
    }).join('');

    $('#hist-kpis').innerHTML = `
      <article class="hist-card hist-kpi">
        <div class="hist-kpi__head"><span class="hist-kpi__label">Khối lượng tích lũy YTD</span>${icon('analytics', 'icon-20 c-primary')}</div>
        <div class="hist-kpi__main">
          <div class="hist-kpi__value num">${fmt.usd(k.volumeYtd)}</div>
          <div class="hist-kpi__meta">
            <span class="hist-chip hist-chip--up">${ico12('trending_up')}${fmt.percent(k.volumeChange, 1)}</span>
            <span class="t-body-sm c-muted">so với cùng kỳ năm ${k.compareYear}</span>
          </div>
        </div>
        <svg class="hist-kpi__bars" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
      </article>
      <article class="hist-card hist-kpi">
        <div class="hist-kpi__head"><span class="hist-kpi__label">Lợi nhuận chốt ròng (PnL)</span>${icon('price_check', 'icon-20 c-secondary')}</div>
        <div class="hist-kpi__main">
          <div class="hist-kpi__value num c-secondary">${signedUsd(k.pnl)}</div>
          <div class="hist-kpi__meta">
            <span class="hist-chip hist-chip--up">${ico12('north_east')}${fmt.percent(k.pnlChange, 1)}</span>
            <span class="t-body-sm c-muted">Tỷ lệ thắng lệnh ${k.winRate}%</span>
          </div>
        </div>
        <div class="hist-kpi__progress"><div style="width:${k.pnlProgress}%"></div></div>
      </article>
      <article class="hist-card hist-kpi">
        <div class="hist-kpi__head"><span class="hist-kpi__label">Phí giao dịch &amp; Gas</span>${icon('loyalty', 'icon-20 c-primary')}</div>
        <div class="hist-kpi__main">
          <div class="hist-kpi__value num">${fmt.usd(k.fees)}</div>
          <div class="hist-kpi__meta">
            <span class="hist-chip hist-chip--vip" style="padding-inline:6px">${ico12('savings')}Tiết kiệm ${fmt.usd(k.feesSaved, 0)}</span>
            <span class="t-body-sm c-muted">${esc(k.vipDiscount)}</span>
          </div>
        </div>
        <div class="hist-kpi__foot"><span>Tỷ lệ phí Taker/Maker</span><span class="t-data c-primary fw-600">${esc(k.takerMaker)}</span></div>
      </article>
      <article class="hist-card hist-kpi">
        <div class="hist-kpi__head"><span class="hist-kpi__label">Thu nhập chịu thuế dự kiến</span>${icon('account_balance', 'icon-20 c-muted')}</div>
        <div class="hist-kpi__main">
          <div class="hist-kpi__value num" id="kpi-taxable">${fmt.usd(taxable)}</div>
          <div class="hist-kpi__meta">
            <span class="hist-chip hist-chip--neutral">${esc(m.rule)}</span>
            <span class="t-body-sm c-muted">${esc(k.taxNote)}</span>
          </div>
        </div>
        <div class="hist-kpi__foot"><span>Ước lượng thuế suất ${k.taxRate}%</span><span class="t-data c-on-surface fw-600">~${fmt.usd(taxable * k.taxRate / 100)} USD</span></div>
      </article>`;
    $('#basis-badge').textContent = m.badge;
  }

  /* ---------- Bộ lọc ---------- */
  function matches(r, skipTab) {
    if (!skipTab && state.tab !== 'all' && r.type !== state.tab) return false;
    const day = r.time.slice(0, 10);
    if (day < state.from || day > state.to) return false;
    if (state.asset !== 'all' && r.asset !== state.asset) return false;
    if (state.action !== 'all' && r.action !== state.action) return false;
    if (state.groups.size && !state.groups.has(r.group)) return false;
    const q = state.query.trim().toLowerCase().replace(/^#/, '');
    if (q && ![r.id, r.ref, r.copy, r.pair].some((v) => String(v).toLowerCase().includes(q))) return false;
    return true;
  }

  function filtered() {
    const list = rows.filter((r) => matches(r));
    const k = state.sort;
    const val = (r) => (k === 'time' ? r.time : r[k] === null || r[k] === undefined ? -Infinity : r[k]);
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return b.time.localeCompare(a.time);
      if (va === -Infinity) return 1;
      if (vb === -Infinity) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * state.dir;
    });
  }

  function renderTabs() {
    const base = rows.filter((r) => matches(r, true));
    $('#hist-tabs').innerHTML = D.tabs.map((t) => {
      const on = t.key === state.tab;
      const count = t.key === 'all' ? base.length : base.filter((r) => r.type === t.key).length;
      return `<button type="button" role="tab" aria-selected="${on}" class="hist-tabs__btn${on ? ' is-active' : ''}" data-value="${t.key}">${esc(t.label)}${on ? ` (${count})` : ''}</button>`;
    }).join('');
  }

  function renderPresets() {
    $('#date-presets').innerHTML = D.datePresets.map((p) =>
      `<button type="button" class="hist-range__preset${p.key === state.preset ? ' is-active' : ''}" data-preset="${p.key}">${esc(p.label)}</button>`).join('');
    $('#range-label').textContent = rangeLabel(state.from, state.to);
    $('#range-btn').classList.toggle('is-active', state.preset === 'custom');
    $('#range-from').value = state.from;
    $('#range-to').value = state.to;
  }

  function renderLegend() {
    $('#hist-legend').innerHTML = D.legend.map((g) => {
      const on = state.groups.has(g.key);
      const off = state.groups.size && !on;
      return `<button type="button" class="hist-legend__item${on ? ' is-on' : ''}${off ? ' is-off' : ''}" data-group="${g.key}" aria-pressed="${on}" title="Lọc theo: ${esc(g.label)}"><span class="hist-legend__dot" style="background:var(--${g.tone})"></span>${esc(g.label)}</button>`;
    }).join('');
  }

  /* ---------- Bảng ---------- */
  function methodText(s) {
    return state.method === 'fifo' ? s : String(s).replace(/FIFO/g, currentMethod().name);
  }

  function rowHTML(r) {
    const coinCls = r.coinTone === 'gold' ? 'hist-coin hist-coin--gold c-primary' : `hist-coin ${tone(r.coinTone === 'on-surface' ? '' : r.coinTone === 'secondary' ? 'up' : r.coinTone === 'error' ? 'down' : 'primary')}`;
    const p = r.pnl;
    const ref = r.explorer
      ? `<a class="hist-sub hist-ref__link" href="${esc(r.explorer)}" target="_blank" rel="noopener">${esc(r.refSub)}${ico12('open_in_new')}</a>`
      : `<div class="hist-sub">${esc(r.refSub)}</div>`;
    return `<tr data-id="${esc(r.id)}">
      <td>
        <div class="mono num nowrap">${esc(r.time)}</div>
        <div class="hist-sub">${esc(r.timeSub)}</div>
      </td>
      <td>
        <div class="hist-asset">
          <div class="${coinCls}">${esc(r.coin)}</div>
          <div>
            <div class="hist-asset__name"><span>${esc(r.pair)}</span><span class="hist-tag hist-tag--${r.tagTone}">${esc(r.tag)}</span></div>
            <div class="hist-sub">${esc(r.pairSub)}</div>
          </div>
        </div>
      </td>
      <td class="mono">
        <div>${esc(r.detail.label)} <span class="fw-600 ${tone(r.detail.tone)}">${esc(r.detail.value)}</span></div>
        <div class="hist-sub">${esc(r.detail.sub)}</div>
      </td>
      <td class="mono">
        <div class="${tone(r.fee.tone)}${r.fee.tone === 'up' ? ' fw-600' : ''}">${esc(r.fee.value)}</div>
        <div class="hist-sub ${tone(r.fee.subTone)}">${esc(r.fee.sub)}</div>
      </td>
      <td class="mono">
        <div class="${tone(p.tone)}${p.strong ? (p.tone === 'up' || p.tone === 'down' ? ' hist-pnl--strong' : ' fw-600') : p.tone === 'up' ? ' fw-600' : ''}">${esc(methodText(p.value))}</div>
        <div class="hist-sub ${tone(p.subTone)}">${esc(methodText(p.sub))}</div>
      </td>
      <td>
        <div class="hist-ref mono">
          <span class="hist-ref__id" data-copy="${esc(r.copy)}">${esc(r.ref)}</span>
          <button type="button" class="hist-ref__copy" data-copy="${esc(r.copy)}" title="Sao chép">${icon('content_copy', 'icon-14')}</button>
        </div>
        ${ref}
      </td>
      <td><span class="hist-status hist-status--${r.statusTone}">${esc(r.status)}</span></td>
      <td class="text-right"><button type="button" class="hist-receipt-btn" data-receipt="${esc(r.id)}">${icon('receipt', 'icon-14 c-primary')}<span>Xem</span></button></td>
    </tr>`;
  }

  function pageList(cur, total) {
    const set = new Set([1, total, cur - 1, cur, cur + 1]);
    if (cur <= 3) [2, 3].forEach((n) => set.add(n));
    if (cur >= total - 2) [total - 1, total - 2].forEach((n) => set.add(n));
    const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  function renderTable() {
    const list = filtered();
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / state.perPage));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.perPage;
    const slice = list.slice(start, start + state.perPage);

    $('#hist-rows').innerHTML = slice.length
      ? slice.map(rowHTML).join('')
      : `<tr><td colspan="8"><div class="empty">${icon('search_off', 'icon-24')}<p style="margin-top:6px">Không có giao dịch phù hợp với bộ lọc</p></div></td></tr>`;

    $('#pager-info').innerHTML = total
      ? `Hiển thị <strong class="num">${start + 1} - ${start + slice.length}</strong> trên tổng số <strong class="num">${total}</strong> bản ghi`
      : 'Không có bản ghi';

    const items = pageList(state.page, pages).map((n) => n === '…'
      ? '<span class="hist-page-gap num">...</span>'
      : `<button type="button" class="hist-page num${n === state.page ? ' is-active' : ''}" data-page="${n}"${n === state.page ? ' aria-current="page"' : ''}>${n}</button>`).join('');
    $('#pager-pages').innerHTML = `
      <button type="button" class="hist-page hist-page--nav" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Trang trước">${icon('chevron_left', 'icon-16')}</button>
      ${items}
      <button type="button" class="hist-page hist-page--nav" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="Trang sau">${icon('chevron_right', 'icon-16')}</button>`;

    $$('.hist-th-sort').forEach((th) => {
      const on = state.sortTouched && th.dataset.sort === state.sort;
      const old = $('.icon', th);
      if (old) old.remove();
      if (on) th.insertAdjacentHTML('beforeend', icon(state.dir < 0 ? 'arrow_downward' : 'arrow_upward', 'icon-14'));
      th.setAttribute('aria-sort', on ? (state.dir < 0 ? 'descending' : 'ascending') : 'none');
    });
  }

  function refresh() {
    renderTabs();
    renderPresets();
    renderLegend();
    renderTable();
  }

  /* ---------- Xuất tệp ---------- */
  const CSV_HEAD = ['Thời gian (UTC+7)', 'Mã lệnh', 'Phân loại', 'Hành động', 'Cặp / Tài sản', 'Nhãn', 'Chi tiết', 'Giá trị (USD)', 'Phí (USD)', 'PnL thực tế (USD)', 'Trạng thái', 'TxID / Tham chiếu'];
  function csvRow(r) {
    const tab = D.tabs.find((t) => t.key === r.type);
    const act = D.actions.find((a) => a.value === r.action);
    return [r.time, r.id, tab ? tab.label : r.type, act ? act.label : r.action, r.pair, r.tag,
      `${r.detail.label} ${r.detail.value} | ${r.detail.sub}`, r.amountUsd.toFixed(2), r.feeUsd.toFixed(2),
      r.pnlUsd === null ? '' : r.pnlUsd.toFixed(2), r.status, r.copy];
  }
  const csvCell = (v) => /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const toCSV = (matrix) => '﻿' + matrix.map((line) => line.map(csvCell).join(',')).join('\r\n');

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportLedger(kind) {
    const list = filtered();
    if (kind === 'pdf') {
      toast('Đang kết xuất bản in PDF có dấu đỏ...', 'info');
      setTimeout(() => toast(`Xuất tệp PDF hoàn tất (${list.length} bản ghi)`, 'success'), 1200);
      return;
    }
    if (!list.length) { toast('Không có dữ liệu để xuất', 'error'); return; }
    const name = `nexus-sao-ke_${state.from}_${state.to}`;
    if (kind === 'csv') {
      download(toCSV([CSV_HEAD, ...list.map(csvRow)]), name + '.csv', 'text/csv;charset=utf-8');
      toast(`Xuất dữ liệu CSV hoàn tất (${list.length} bản ghi)`, 'success');
    } else {
      // Bảng HTML mà Excel mở trực tiếp được
      const tr = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
      const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${tr(CSV_HEAD, 'th')}${list.map((r) => tr(csvRow(r), 'td')).join('')}</table></body></html>`;
      download('﻿' + html, name + '.xls', 'application/vnd.ms-excel;charset=utf-8');
      toast(`Xuất bảng tính sổ cái hoàn tất (${list.length} bản ghi)`, 'success');
    }
  }

  /* ---------- Giá vốn & phân bổ lợi nhuận ---------- */
  function renderMethods() {
    $('#hist-methods').innerHTML = D.costBasis.methods.map((m) => {
      const on = m.key === state.method;
      return `<label class="hist-method${on ? ' is-active' : ''}">
        <span class="hist-method__row"><span class="hist-method__name">${esc(m.name)}</span><input type="radio" name="cost_basis" value="${m.key}"${on ? ' checked' : ''}></span>
        <span class="hist-method__desc">${esc(m.desc)}</span>
      </label>`;
    }).join('');
    $('#hist-integrations').innerHTML = D.costBasis.integrations.map((i) =>
      `<button type="button" class="hist-sync__chip${i.accent ? ' hist-sync__chip--accent' : ''}" data-integration="${esc(i.name)}">${esc(i.name)}</button>`).join('');
  }

  function renderAlloc() {
    const y = D.taxYears[state.year];
    const total = y.quarters.reduce((s, q) => s + q.pnl, 0);
    const maxQ = Math.max(...y.quarters.map((q) => q.pnl));
    $('#year-btn').innerHTML = `${esc(y.label)}${icon('expand_more', 'icon-16')}`;
    $('#year-menu').innerHTML = Object.keys(D.taxYears).sort().reverse().map((k) =>
      `<button type="button" class="dropdown__item${k === state.year ? ' is-active' : ''}" data-year="${k}">${esc(D.taxYears[k].label)}</button>`).join('');
    const totalEl = $('#alloc-total');
    totalEl.textContent = `Tổng ${signedUsd(total)}`;
    totalEl.className = `hist-alloc__total num ${total >= 0 ? 'c-secondary' : 'c-error'}`;
    $('#alloc-bars').innerHTML = y.quarters.map((q) => {
      const pct = total ? Math.round((q.pnl / total) * 100) : 0;
      const live = q.inProgress;
      const neg = q.pnl < 0;
      const fill = live ? ' hist-qbar__fill--live' : neg ? ' hist-qbar__fill--neg' : q.pnl === maxQ ? ' hist-qbar__fill--max' : '';
      const valCls = live ? 'c-primary' : neg ? 'c-error' : q.pnl === maxQ ? 'c-secondary' : 'c-on-surface';
      return `<div class="hist-qbar">
        <span class="hist-qbar__label${live ? ' hist-qbar__label--live' : ''}">${esc(q.q)}</span>
        <div class="hist-qbar__track"><div class="hist-qbar__fill${fill}" style="width:${Math.min(100, Math.abs(pct))}%"></div></div>
        <span class="hist-qbar__value num ${valCls}">${signedUsd(q.pnl)} (${pct}%)</span>
      </div>`;
    }).join('');
  }

  /* ---------- Modal ---------- */
  function openModal(el) { el.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeModal(el) { el.classList.remove('is-open'); document.body.style.overflow = ''; }

  function renderTaxModal() {
    $('#tax-period').innerHTML = D.taxPeriods.map((p) => `<option value="${p.key}"${p.key === tax.period ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
    $('#tax-purpose').innerHTML = D.taxPurposes.map((p) =>
      `<label><input type="radio" name="tax_purpose" value="${p.key}"${p.key === tax.purpose ? ' checked' : ''}><span>${esc(p.label)}</span></label>`).join('');
    $('#tax-formats').innerHTML = D.taxFormats.map((f) =>
      `<button type="button" class="hist-format${f.key === tax.format ? ' is-active' : ''}" data-format="${f.key}">${icon(f.icon, 'icon-16')} ${esc(f.label)}</button>`).join('');
    const a = D.attestation;
    $('#tax-attest').innerHTML = `
      <div class="flex items-center gap-sm">
        ${icon('workspace_premium', 'icon-20 c-secondary')}
        <div><p class="t-label-md fw-600">${esc(a.title)}</p><p class="t-label-sm c-muted">${esc(a.note)}</p></div>
      </div>
      <span class="hist-chip hist-chip--up num" style="font-weight:700">${esc(a.price)}</span>`;
    renderTaxPreview();
  }

  /* Tính lại số liệu thuế theo kỳ + mục đích + phương pháp giá vốn */
  function taxFigures() {
    const p = D.taxPeriods.find((x) => x.key === tax.period);
    const y = D.taxYears[p.year];
    const rate = D.taxPurposes.find((x) => x.key === tax.purpose).rate;
    let taxable = y.taxable[state.method];
    let label = p.label;
    let range = { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
    if (p.quarter) {
      const q = y.quarters.find((x) => x.q === p.quarter);
      taxable = taxable * (q.pnl / y.totalPnl);
      const qi = Number(p.quarter.slice(1));
      range = { from: `${p.year}-${String(qi * 3 - 2).padStart(2, '0')}-01`, to: addDays(`${p.year}-${String(qi * 3 + 1).padStart(2, '0')}-01`, -1) };
    } else if (p.custom) {
      range = { from: state.from, to: state.to };
      const realized = rows.filter((r) => r.pnlUsd !== null && r.time.slice(0, 10) >= range.from && r.time.slice(0, 10) <= range.to);
      const gain = realized.reduce((s, r) => s + r.pnlUsd, 0);
      const fees = rows.filter((r) => r.time.slice(0, 10) >= range.from && r.time.slice(0, 10) <= range.to).reduce((s, r) => s + r.feeUsd, 0);
      const factor = y.taxable[state.method] / y.taxable.fifo;
      taxable = Math.max(0, (gain - fees) * factor);
      label = `Tùy chỉnh ${rangeLabel(range.from, range.to)}`;
    }
    return { taxable, rate, due: taxable * rate / 100, label, range, year: p.year };
  }

  function renderTaxPreview() {
    const f = taxFigures();
    $('#tax-preview').innerHTML = `
      <div class="hist-preview__cell"><span class="t-label-sm c-muted">Thu nhập chịu thuế (${esc(currentMethod().name)})</span><span class="t-data fw-700 num">${fmt.usd(f.taxable)}</span></div>
      <div class="hist-preview__cell"><span class="t-label-sm c-muted">Thuế suất áp dụng</span><span class="t-data fw-700 num">${f.rate}%</span></div>
      <div class="hist-preview__cell"><span class="t-label-sm c-muted">Thuế phải nộp ước tính</span><span class="t-data fw-700 num c-primary">${fmt.usd(f.due)}</span></div>`;
  }

  function submitTax() {
    const f = taxFigures();
    const fmtDef = D.taxFormats.find((x) => x.key === tax.format);
    closeModal($('#tax-modal'));
    if (tax.format === 'pdf') {
      toast('Báo cáo thuế đang được kết xuất và ký số...', 'info');
      setTimeout(() => toast(`Tải xuống Báo cáo Quyết toán Thuế ${f.year} thành công!`, 'success'), 1500);
      return;
    }
    const realized = rows.filter((r) => r.pnlUsd !== null && r.time.slice(0, 10) >= f.range.from && r.time.slice(0, 10) <= f.range.to);
    const summary = [
      ['Báo cáo quyết toán thuế', f.label], ['Phương pháp giá vốn', currentMethod().badge],
      ['Thu nhập chịu thuế (USD)', f.taxable.toFixed(2)], ['Thuế suất', f.rate + '%'], ['Thuế phải nộp ước tính (USD)', f.due.toFixed(2)], [],
    ];
    const head = tax.format === 'f8949'
      ? ['(a) Description', '(b) Date acquired', '(c) Date sold', '(d) Proceeds (USD)', '(e) Cost basis (USD)', '(h) Gain or loss (USD)']
      : CSV_HEAD;
    const body = realized.map((r) => tax.format === 'f8949'
      ? [`${r.pair} ${r.tag}`, 'VARIOUS', r.time.slice(0, 10), r.amountUsd.toFixed(2), (r.amountUsd - r.pnlUsd).toFixed(2), r.pnlUsd.toFixed(2)]
      : csvRow(r));
    download(toCSV([...summary, head, ...body]), `nexus-bao-cao-thue_${f.year}_${tax.format}.csv`, 'text/csv;charset=utf-8');
    toast(`Đã tải ${fmtDef.label}: ${realized.length} giao dịch chịu thuế`, 'success');
  }

  /* Mã băm hiển thị (giả lập chữ ký SHA-256) từ nội dung bản ghi */
  function pseudoHash(str) {
    let out = '';
    for (let k = 0; k < 8; k++) {
      let h = 2166136261 ^ k;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      out += (h >>> 0).toString(16).padStart(8, '0');
    }
    return out;
  }

  function openReceipt(id) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    receiptRow = r;
    const tab = D.tabs.find((t) => t.key === r.type);
    const act = D.actions.find((a) => a.value === r.action);
    const kv = [
      ['Mã tham chiếu', r.copy], ['Thời gian (UTC+7)', `${r.time} · ${r.timeSub}`], ['Phân loại', `${tab ? tab.label : r.type} · ${act ? act.label : 'Chuyển nội bộ'}`],
      ['Tài sản', `${r.pair} (${r.tag}) · ${r.pairSub}`], ['Chi tiết khớp', `${r.detail.label} ${r.detail.value}`], ['', r.detail.sub],
      ['Giá trị quy đổi', fmt.usd(r.amountUsd)], ['Phí', `${r.fee.value} · ${r.fee.sub}`],
      ['Lãi/Lỗ thực tế', `${methodText(r.pnl.value)} · ${methodText(r.pnl.sub)}`], ['Nơi xử lý', r.refSub],
    ];
    $('#receipt-body').innerHTML = `
      <div class="flex items-center justify-between gap-sm">
        <div class="hist-asset"><div class="hist-coin ${r.coinTone === 'gold' ? 'hist-coin--gold c-primary' : 'c-primary'}">${esc(r.coin)}</div><span class="t-headline-sm">${esc(r.pair)}</span><span class="hist-tag hist-tag--${r.tagTone}">${esc(r.tag)}</span></div>
        <span class="hist-status hist-status--${r.statusTone}">${esc(r.status)}</span>
      </div>
      <dl class="hist-kv num">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${r.explorer ? `<a class="btn btn--ghost" href="${esc(r.explorer)}" target="_blank" rel="noopener">${icon('open_in_new', 'icon-16')} Xem trên ${esc(r.refSub)}</a>` : ''}
      <div class="hist-sig num"><span class="c-primary fw-600">SHA-256</span> · ${pseudoHash(JSON.stringify(r))}</div>`;
    openModal($('#receipt-modal'));
  }

  function copy(val) {
    const done = () => toast('Đã sao chép mã: ' + val, 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(val).then(done, done);
    else done();
  }

  /* ---------- Sự kiện ---------- */
  function bind() {
    $('#hist-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      state.tab = b.dataset.value;
      state.page = 1;
      refresh();
    });
    $('#date-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      applyPreset(b.dataset.preset);
      state.page = 1;
      refresh();
    });
    const pop = $('#range-pop');
    $('#range-btn').addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('is-open'); });
    pop.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => pop.classList.remove('is-open'));
    $('#range-apply').addEventListener('click', () => {
      let from = $('#range-from').value, to = $('#range-to').value;
      if (!from || !to) { toast('Vui lòng chọn đủ ngày bắt đầu và kết thúc', 'error'); return; }
      if (from > to) [from, to] = [to, from];
      Object.assign(state, { preset: 'custom', from, to, page: 1 });
      pop.classList.remove('is-open');
      refresh();
    });

    $('#f-asset').addEventListener('change', (e) => { state.asset = e.target.value; state.page = 1; refresh(); });
    $('#f-action').addEventListener('change', (e) => { state.action = e.target.value; state.page = 1; refresh(); });
    let t;
    $('#f-search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.query = e.target.value; state.page = 1; refresh(); }, 150);
    });
    $('#f-reset').addEventListener('click', () => {
      Object.assign(state, { ...defaults, groups: new Set(), perPage: state.perPage });
      applyPreset(defaults.preset);
      $('#f-asset').value = 'all';
      $('#f-action').value = 'all';
      $('#f-search').value = '';
      refresh();
      toast('Đã làm mới bộ lọc', 'info');
    });
    $('#f-apply').addEventListener('click', () => {
      state.query = $('#f-search').value;
      state.page = 1;
      refresh();
      toast(`Đang lọc: ${filtered().length} bản ghi phù hợp`, 'success');
    });

    $('#hist-legend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-group]');
      if (!b) return;
      const g = b.dataset.group;
      state.groups.has(g) ? state.groups.delete(g) : state.groups.add(g);
      state.page = 1;
      refresh();
    });

    $$('.hist-th-sort').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      state.dir = state.sort === k ? -state.dir : -1;
      state.sort = k;
      state.sortTouched = true;
      state.page = 1;
      renderTable();
    }));

    $('#pager-pages').addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      renderTable();
      $('.hist-ledger').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#per-page').addEventListener('change', (e) => { state.perPage = Number(e.target.value); state.page = 1; renderTable(); });

    $('#hist-rows').addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]');
      if (c) { copy(c.dataset.copy); return; }
      const r = e.target.closest('[data-receipt]');
      if (r) openReceipt(r.dataset.receipt);
    });

    $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportLedger(b.dataset.export)));

    $('#hist-methods').addEventListener('change', (e) => {
      if (e.target.name !== 'cost_basis') return;
      state.method = e.target.value;
      renderMethods();
      renderKpis();
      renderTable();
      toast(`Đã đồng bộ lại sổ cái theo phương pháp ${currentMethod().name}`, 'success');
    });
    $('#hist-integrations').addEventListener('click', (e) => {
      const b = e.target.closest('[data-integration]');
      if (b) toast(`Đang kết nối ${b.dataset.integration}...`, 'info');
    });
    $('#api-link').addEventListener('click', () => toast('Đang kết nối API Koinly & TurboTax...', 'info'));
    $('#year-menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-year]');
      if (!b) return;
      state.year = b.dataset.year;
      renderAlloc();
    });

    // Modal thuế
    const taxModal = $('#tax-modal');
    $('#open-tax').addEventListener('click', () => {
      tax.period = D.taxPeriods.find((p) => p.year === state.year && !p.quarter && !p.custom)?.key || D.taxPeriods[0].key;
      renderTaxModal();
      openModal(taxModal);
    });
    $('#tax-period').addEventListener('change', (e) => { tax.period = e.target.value; renderTaxPreview(); });
    $('#tax-purpose').addEventListener('change', (e) => { tax.purpose = e.target.value; renderTaxPreview(); });
    $('#tax-formats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-format]');
      if (!b) return;
      tax.format = b.dataset.format;
      $$('.hist-format', taxModal).forEach((x) => x.classList.toggle('is-active', x === b));
    });
    $('#tax-submit').addEventListener('click', submitTax);

    // Modal biên lai
    $('#receipt-copy').addEventListener('click', () => receiptRow && copy(receiptRow.copy));
    $('#receipt-download').addEventListener('click', () => {
      if (!receiptRow) return;
      download(toCSV([CSV_HEAD, csvRow(receiptRow)]), `nexus-bien-lai_${receiptRow.id}.csv`, 'text/csv;charset=utf-8');
      toast('Đã tải biên lai ' + receiptRow.id, 'success');
    });

    $$('.hist-modal').forEach((m) => m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-close]')) closeModal(m);
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.hist-modal.is-open').forEach(closeModal);
    });
  }

  Nexus.boot(['history.json'], ({ data }) => {
    D = data.history;
    rows = D.transactions;
    state.method = D.costBasis.default;
    state.year = Object.keys(D.taxYears).find((y) => D.taxYears[y].current);
    tax.purpose = D.taxPurposes[0].key;
    tax.format = D.taxFormats[0].key;
    applyPreset(defaults.preset);

    $('#f-asset').innerHTML = D.assets.map((a) => `<option value="${a.value}">${esc(a.label)}</option>`).join('');
    $('#f-action').innerHTML = D.actions.map((a) => `<option value="${a.value}">${esc(a.label)}</option>`).join('');
    $('#per-page').innerHTML = D.perPageOptions.map((n) => `<option${n === state.perPage ? ' selected' : ''}>${n}</option>`).join('');
    $('#audit-note').textContent = D.auditNote;

    renderKpis();
    renderMethods();
    renderAlloc();
    refresh();
    bind();
  });
})();
