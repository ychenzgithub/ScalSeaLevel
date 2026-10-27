/* SoCal El Niño Sea Level Outlook - interactive charts.
   Data: window.SL_DATA (data/sl_data.js) and window.SL_GEO (data/sl_geo.js),
   both written by analysis/build_site_data.py. Library: d3 v7.
   All lengths in the data are centimetres; they are converted for display only. */
(function () {
  'use strict';
  const D = window.SL_DATA;
  const G = window.SL_GEO;
  if (!D || !G || !window.d3) {
    const p = document.createElement('p');
    p.style.padding = '16px';
    p.textContent = 'The data files did not load. Keep the data and assets folders next to index.html.';
    document.body.prepend(p);
    return;
  }

  // ------------------------------------------------------------------ basics
  const $ = (id) => document.getElementById(id);
  const YEARS = D.years;
  const Y0 = YEARS[0];
  const YI = (Y) => Y - Y0;
  const NDJ = D.roni;
  const GAUGE = Object.fromEntries(D.gauges.map((g) => [g.id, g]));
  const CAT_IDS = D.cats.map((c) => c.id);
  const CAT_LABEL = Object.fromEntries(D.cats.map((c) => [c.id, c.label]));
  const CAT_SHORT = { lnS: ['Mod.–strong', 'La Niña'], lnW: ['Weak', 'La Niña'], neu: ['Neutral', ''], enWM: ['Weak–mod.', 'El Niño'], enS: ['Strong', 'El Niño'], enVS: ['Very strong', 'El Niño'] };
  const catOf = (x) => (x == null ? null : x <= -1 ? 'lnS' : x <= -0.5 ? 'lnW' : x < 0.5 ? 'neu' : x < 1.5 ? 'enWM' : x < 2 ? 'enS' : 'enVS');
  const catVar = (c) => `var(--c-${c})`;
  const FC = D.forecast;
  const REGION_MEMBERS = ['sd', 'lj', 'la', 'sm', 'sb'];
  const GAUGE_LABEL = {
    reg: 'Southern California average', sd: 'San Diego (since 1906)', lj: 'La Jolla (since 1924)', la: 'Los Angeles (since 1923)',
    sm: 'Santa Monica (since 1933)', sb: 'Santa Barbara (since 1973)', nb: 'Newport Beach (1955–1993)', lb: 'Long Beach, Terminal Island (1963–1990)',
    ri: 'Rincon Island (1962–1990)', ph: 'Platform Harvest (1992–2020)', en: 'Ensenada, Mexico (1956–1990)',
  };
  // nearest gauge with hourly data / tide predictions, for charts the selected gauge cannot provide
  const HOURLY_FOR = { reg: 'sd', en: 'sd' };
  const ACTIVE_FOR = { reg: 'sd', nb: 'la', lb: 'la', ri: 'sb', ph: 'sb', en: 'sd' };
  const MEAS_OPT = { djf: 'Winter average (Dec–Feb)', ndjfm: 'November–March average', peak: 'Highest month (Oct–Mar)', hmax: 'Highest water of the winter (Nov–Mar)' };
  const MEAS_PHRASE = {
    djf: 'winter (December–February) sea level', ndjfm: 'November–March sea level',
    peak: 'highest monthly sea level between October and March', hmax: 'highest water of the winter (November–March)',
  };
  const MEAS_SHORT = { djf: 'Dec–Feb average', ndjfm: 'Nov–Mar average', peak: 'highest month, Oct–Mar', hmax: 'highest water, Nov–Mar' };

  const state = {
    gauge: 'reg', measure: 'djf', period: 'modern', mu: FC.ndj_median, sigma: FC.ndj_sigma, extrap: 'continue',
    units: 'in', alt: 0, altRel: false, hov: '1997', top: 'obs', fall: true,
  };

  const f0 = d3.format('.0f');
  const f1 = d3.format('.1f');
  const f2 = d3.format('.2f');
  const pct = (p) => (p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : f0(100 * p) + '%');
  const signed = (v, f = f2) => (v >= 0 ? '+' : '−') + f(Math.abs(v));
  const sLabel = (Y) => `${Y - 1}–${String(Y).slice(2)}`;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const oneIn = (p) => (p < 0.02 ? 'fewer than 1 in 50' : p > 0.5 ? `${pct(p)} of` : `about 1 in ${Math.round(1 / p)}`);
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const gName = (id = state.gauge) => (id === 'reg' ? 'Southern California (five-gauge average)' : GAUGE[id].name);
  const gAt = (id = state.gauge) => (id === 'reg' ? 'across Southern California' : `at ${GAUGE[id].name}`);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const OCT_THROUGH = D.so_far.reg ? +D.so_far.reg.through.slice(8) : null;   // last day of preliminary October data
  const octLab = ` 2026, Oct 1–${OCT_THROUGH} (preliminary)`;

  // ------------------------------------------------------------------ units
  const US = () => state.units === 'in';
  const isWL = (mk = state.measure) => mk === 'hmax';
  // anomalies: inches or cm. water levels above MHHW: feet or cm. tide heights above MLLW: feet or metres.
  const toA = (cm) => (cm == null ? null : US() ? cm / 2.54 : cm);
  const toW = (cm) => (cm == null ? null : US() ? cm / 30.48 : cm);
  const toT = (cm) => (cm == null ? null : US() ? cm / 30.48 : cm / 100);
  const conv = (cm, mk = state.measure) => (isWL(mk) ? toW(cm) : toA(cm));
  const uA = () => (US() ? 'in' : 'cm');
  const uW = () => (US() ? 'ft' : 'cm');
  const uT = () => (US() ? 'ft' : 'm');
  const unit = (mk = state.measure) => (isWL(mk) ? uW() : uA());
  const numA = (cm) => { const v = toA(cm); return US() ? f1(v) : f0(v); };
  const numW = (cm) => { const v = toW(cm); return US() ? f2(v) : f0(v); };
  const numT = (cm) => { const v = toT(cm); return US() ? f1(v) : f2(v); };
  const fA = (cm, sign = true) => (cm == null || !isFinite(cm) ? '–' : `${sign ? (cm >= 0 ? '+' : '−') : ''}${numA(Math.abs(cm))} ${uA()}`);
  const fW = (cm) => (cm == null || !isFinite(cm) ? '–' : `${cm < 0 ? '−' : ''}${numW(Math.abs(cm))} ${uW()}`);
  const fT = (cm) => (cm == null || !isFinite(cm) ? '–' : `${numT(cm)} ${uT()}`);
  const fmt = (cm, mk = state.measure) => (isWL(mk) ? fW(cm) : fA(cm));
  const fmtBare = (cm, mk = state.measure) => (isWL(mk) ? numW(cm) : (cm >= 0 ? '+' : '−') + numA(Math.abs(cm)));
  const wlSuffix = (mk = state.measure) => (isWL(mk) ? ' above MHHW' : '');
  const both = (cm) => (US() ? `${numA(Math.abs(cm))} in (${f0(Math.abs(cm))} cm)` : `${f0(Math.abs(cm))} cm (${f1(Math.abs(cm) / 2.54)} in)`);

  // ------------------------------------------------------------------ model and Monte Carlo
  function model(g = state.gauge, mk = state.measure, per = state.period) {
    const M = D.models[g] && D.models[g][mk];
    if (!M) return null;
    return M[per] || M.modern || M.long;
  }
  const hasMeasure = (g, mk) => !!(D.models[g] && D.models[g][mk] && (D.models[g][mk].modern || D.models[g][mk].long));
  // gauge whose hourly record stands in for the selected one when it has none, or too few winters for the chart
  const hourlyFor = (g, ok) => (ok(g) ? g : HOURLY_FOR[g] || ACTIVE_FOR[g] || 'sd');
  function bootSets(m, k = 5) {
    if (!m._B) {
      const b = m.boot, B = [];
      for (let i = 0; i + k - 1 < b.length; i += k) B.push(b.slice(i, i + k));
      m._B = B;
    }
    return m._B;
  }
  const canFall = (g = state.gauge, mk = state.measure, per = state.period) => { const m = model(g, mk, per); return !!(m && m.fz); };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const u = mulberry32(seed);
    let spare = null;
    function norm() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let a, b, s;
      do { a = 2 * u() - 1; b = 2 * u() - 1; s = a * a + b * b; } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spare = b * m;
      return a * m;
    }
    return { u, norm };
  }
  // Draws of the winter value: El Niño strength ~ N(mu, sigma), a bootstrap parameter set, then normal scatter.
  // With useFall, the model also uses this fall's (Sep-Oct 2026) sea level, a known number.
  function simulate(m, mu, sigma, extrap, N = 20000, seed = 20261026, useFall = false) {
    const F = useFall && m.fz ? m.fz : null;
    const rng = makeRng(seed), B = F ? bootSets(F, 6) : bootSets(m), out = new Float64Array(N);
    const z = F ? F.z_now : 0, k = F ? 4 : 3;
    for (let i = 0; i < N; i++) {
      const x = mu + sigma * rng.norm();
      const xe = extrap === 'hold' ? Math.min(Math.max(x, m.xmin), m.xmax) : x;
      const p = B[Math.floor(rng.u() * B.length)];
      const mean = p[0] + p[1] * Math.min(xe, 0) + p[2] * Math.max(xe, 0) + (F ? p[3] * z : 0);
      const s = Math.exp(p[k] + p[k + 1] * (x >= 0.5 ? 1 : 0));
      out[i] = mean + s * rng.norm();
    }
    out.sort();
    return out;
  }
  const quant = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const fracAbove = (s, t) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < t) lo = mid + 1; else hi = mid; } return 1 - lo / s.length; };

  const simCache = new Map();
  function sims(g = state.gauge, mk = state.measure, per = state.period, extrap = state.extrap, mu = state.mu, sigma = state.sigma, fall = state.fall) {
    const m = model(g, mk, per);
    const useFall = fall && !!m.fz;
    const key = [g, mk, per, extrap, mu.toFixed(3), sigma.toFixed(3), useFall].join('|');
    if (!simCache.has(key)) {
      if (simCache.size > 80) simCache.clear();
      const out = simulate(m, mu, sigma, extrap, 20000, 20261026, useFall);
      // October is part of the Oct-Mar window, so the season's highest month is at least October's value
      const sf = D.so_far[g];
      if (mk === 'peak' && sf && sf.oct_anom != null) for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], sf.oct_anom);
      simCache.set(key, out);
    }
    return simCache.get(key);
  }
  // records to compare this fall against (2026 excluded)
  function pastMax(g, months) {
    const M = D.monthly[g]; if (!M) return null;
    const [y0, m0] = M.t0.split('-').map(Number);
    let best = null;
    const byYear = {};
    M.v.forEach((v, i) => { const t = y0 * 12 + m0 - 1 + i, y = Math.floor(t / 12), mo = (t % 12) + 1; if (v == null || y >= 2026 || !months.includes(mo)) return; (byYear[y] = byYear[y] || []).push([mo, v]); });
    Object.entries(byYear).forEach(([y, arr]) => {
      if (months.length === 12) arr.forEach(([mo, v]) => { if (!best || v > best.v) best = { v, y: +y, m: mo }; });
      else if (arr.length === months.length) { const v = d3.mean(arr, (d) => d[1]); if (!best || v > best.v) best = { v, y: +y }; }
    });
    return best;
  }
  const ALLM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const bandCache = new Map();
  function bands(g = state.gauge, mk = state.measure, per = state.period, extrap = state.extrap) {
    const key = [g, mk, per, extrap].join('|');
    if (!bandCache.has(key)) {
      const m = model(g, mk, per);
      const xs = d3.range(-2.6, 3.801, 0.1);
      bandCache.set(key, xs.map((x, i) => {
        const s = simulate(m, x, 0, extrap, 1500, 1000 + i);
        return { x, q10: quant(s, 0.1), q25: quant(s, 0.25), q50: quant(s, 0.5), q75: quant(s, 0.75), q90: quant(s, 0.9) };
      }));
    }
    return bandCache.get(key);
  }
  function series(g = state.gauge, mk = state.measure, per = state.period) {
    const P = D.seas[g][mk], m = model(g, mk, per), rows = [];
    if (!P || !m) return rows;
    for (let i = 0; i < YEARS.length; i++) {
      const Y = YEARS[i], v = P[i], x = NDJ[i];
      if (v == null || x == null || Y < m.y0 || Y > m.y1) continue;
      rows.push({ Y, x, v, cat: catOf(x), off: Y >= 1951, oni: D.oni[i] });
    }
    return rows;
  }
  const periodLabel = (m) => `${sLabel(m.y0)} to ${sLabel(m.y1)}`;
  // hourly times are stored in UTC; show the Pacific Standard Time date
  const pstDate = (t, f = '%b %-d, %Y') => d3.utcFormat(f)(new Date(Date.parse(t.replace(' ', 'T') + ':00Z') - 8 * 3600e3));

  // flood thresholds (above MHHW, cm) for the selected gauge; the region uses the average of its gauges
  function floodOf(g = state.gauge) {
    if (GAUGE[g] && GAUGE[g].flood) return GAUGE[g].flood;
    const fs = REGION_MEMBERS.map((k) => GAUGE[k].flood).filter(Boolean);
    return { minor: d3.mean(fs, (f) => f.minor), moderate: d3.mean(fs, (f) => f.moderate), major: d3.mean(fs, (f) => f.major), source: 'average of the five gauges' };
  }
  function thresholds(mk = state.measure, g = state.gauge, rows) {
    const rec = rows.reduce((a, b) => (b.v > a.v ? b : a), rows[0]);
    if (isWL(mk)) {
      const F = floodOf(g);
      return [
        { lab: `Reaches NOAA's minor flood level (${fW(F.minor)} above MHHW)`, t: F.minor },
        { lab: `Reaches the moderate flood level (${fW(F.moderate)} above MHHW)`, t: F.moderate },
        { lab: `Tops the highest since ${sLabel(rows[0].Y).slice(0, 4)} (${fW(rec.v)}, ${sLabel(rec.Y)}, at today's sea level)`, t: rec.v, rec: true },
      ];
    }
    const t1 = US() ? 4 * 2.54 : 10, t2 = US() ? 8 * 2.54 : 20;
    return [
      { lab: 'Higher than normal', t: 0 },
      { lab: `At least ${both(t1)} above normal`, t: t1 },
      { lab: `At least ${both(t2)} above normal`, t: t2 },
      { lab: `Highest since ${rows[0].Y - 1} (beat ${fA(rec.v)}, ${sLabel(rec.Y)})`, t: rec.v, rec: true },
    ];
  }

  // ------------------------------------------------------------------ chart scaffolding
  function prep(id, height, label) {
    const el = $(id);
    const w = Math.max(260, Math.floor(el.clientWidth));
    el.replaceChildren();
    const svg = d3.select(el).append('svg').attr('width', w).attr('height', height).attr('viewBox', `0 0 ${w} ${height}`).attr('role', 'img');
    if (label) svg.attr('aria-label', label);
    return { el, svg, w, h: height };
  }
  function styleAxis(g, grid = false) {
    g.selectAll('.domain').style('stroke', 'var(--axis)');
    g.selectAll('.tick line').style('stroke', grid ? 'var(--rule)' : 'var(--axis)');
    g.selectAll('.tick text').style('fill', 'var(--muted)').style('font-size', '11px').style('font-family', 'var(--font-display)');
    return g;
  }
  function unitTop(y, n, u, sign = false) {
    const t = y.ticks(n), top = t[t.length - 1];
    const lab = (d) => (sign && d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d);
    return (d) => (d === top ? `${lab(d)} ${u}` : lab(d));
  }
  function yGrid(svg, y, x0, x1, ticks) {
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', x0).attr('x2', x1).attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .style('stroke', 'var(--rule)').style('stroke-width', 1);
  }
  function text(g, x, y, str, opts = {}) {
    const t = g.append('text').attr('x', x).attr('y', y).text(str)
      .style('font-family', 'var(--font-display)').style('font-size', (opts.size || 11) + 'px')
      .style('fill', opts.fill || 'var(--muted)').style('font-weight', opts.weight || 500);
    if (opts.anchor) t.attr('text-anchor', opts.anchor);
    if (opts.baseline) t.attr('dominant-baseline', opts.baseline);
    if (opts.halo) t.style('paint-order', 'stroke').style('stroke', 'var(--surface)').style('stroke-width', 3).style('stroke-linejoin', 'round');
    return t;
  }
  function barPath(x, base, w, top, r = 2) {
    // a bar from base to top (top may lie below base for negative values), rounded at the far end
    const h = Math.abs(base - top);
    if (h <= 0.5) return `M${x},${base}h${w}v-0.5h${-w}Z`;
    r = Math.min(r, w / 2, h);
    if (top < base) return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
    return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top - r}V${base}Z`;
  }
  function diverging(stops, domain) {
    return d3.scaleDiverging(d3.interpolateRgbBasis(stops)).domain(domain).clamp(true);
  }
  const divStops = () => [css('--sst-c2'), css('--sst-c1'), css('--div-mid'), css('--sst-w1'), css('--sst-w2')];

  // tooltip
  const tip = $('tip');
  function showTip(evt, title, rows) {
    tip.replaceChildren();
    if (title) { const t = document.createElement('div'); t.className = 'tip-title'; t.textContent = title; tip.append(t); }
    for (const r of rows) {
      const d = document.createElement('div'); d.className = 'tip-row';
      if (r.color) { const k = document.createElement('span'); k.className = 'tip-key'; k.style.background = r.color; d.append(k); }
      const v = document.createElement('strong'); v.textContent = r.value;
      const l = document.createElement('span'); l.textContent = r.label || '';
      d.append(v, l); tip.append(d);
    }
    tip.hidden = false;
    const pad = 14, rect = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.chart')) hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });

  function legendCats(id, cats = CAT_IDS) {
    const el = $(id); el.replaceChildren();
    for (const c of cats) {
      const s = document.createElement('span'); const i = document.createElement('i');
      i.style.background = catVar(c); s.append(i, document.createTextNode(CAT_LABEL[c])); el.append(s);
    }
  }
  function cell(row, txt, cls) { const c = row.insertCell(); c.textContent = txt; if (cls) c.className = cls; return c; }
  function head(tbl, labels, numeric) {
    const hr = tbl.createTHead().insertRow();
    labels.forEach((t, i) => { const th = document.createElement('th'); th.textContent = t; if (numeric(i)) th.className = 'n'; hr.append(th); });
  }

  // monthly anomaly lookup
  const monthIdx = (t0, ym) => { const [a, b] = t0.split('-').map(Number), [c, d] = ym.split('-').map(Number); return (c - a) * 12 + (d - b); };
  function anomAt(g, y, m) { // m 1..12
    const M = D.monthly[g]; if (!M) return null;
    const i = monthIdx(M.t0, `${y}-${String(m).padStart(2, '0')}`);
    return i >= 0 && i < M.v.length ? M.v[i] : null;
  }
  const lastMonth = (g) => { const M = D.monthly[g]; let i = M.v.length - 1; while (i > 0 && M.v[i] == null) i--; const [a, b] = M.t0.split('-').map(Number); const t = a * 12 + b - 1 + i; return { y: Math.floor(t / 12), m: (t % 12) + 1, v: M.v[i] }; };

  // ------------------------------------------------------------------ hero stripes with the sea level line
  function renderStripes() {
    const el = $('stripes');
    const w0 = el.clientWidth;
    const h = w0 < 560 ? 132 : 164;
    const { svg, w } = prep('stripes', h, 'El Niño–La Niña strength each winter since 1906 with the 2026–27 forecast, and winter sea level at the selected gauge');
    const yrs = YEARS.filter((Y) => NDJ[YI(Y)] != null && Y >= 1907);
    const top = 34, bottom = 22;
    const fcW = Math.max(12, w * 0.02), gap = Math.max(8, w * 0.012);
    const x = d3.scaleBand().domain(yrs).range([0, w - fcW - gap]);
    const color = diverging(divStops(), [-2.6, 0, 2.6]);
    svg.append('g').selectAll('rect').data(yrs).join('rect')
      .attr('x', (Y) => x(Y)).attr('y', top).attr('width', x.bandwidth() + 0.5).attr('height', h - top - bottom)
      .style('fill', (Y) => color(NDJ[YI(Y)])).style('opacity', 0.9);
    const fx = w - fcW;
    svg.append('rect').attr('x', fx).attr('y', top).attr('width', fcW).attr('height', h - top - bottom).attr('rx', 2)
      .style('fill', color(state.mu)).style('stroke', 'var(--fc)').style('stroke-width', 2.5);
    text(svg, w, top - 20, w < 560 ? '2026–27' : '2026–27 forecast', { anchor: 'end', fill: 'var(--fc-text)', weight: 700, size: 12 });
    svg.append('line').attr('x1', fx + fcW / 2).attr('x2', fx + fcW / 2).attr('y1', top - 16).attr('y2', top).style('stroke', 'var(--fc)').style('stroke-width', 1);
    // sea level line (winter average) for the selected gauge
    const lg = state.gauge, lmk = 'djf';
    const P = D.seas[lg][lmk] || [];
    const pts = yrs.map((Y) => ({ Y, v: P[YI(Y)] })).filter((d) => d.v != null);
    const yv = d3.scaleLinear().domain([-12, 16]).range([h - bottom - 4, top + 4]).clamp(true);
    const line = d3.line().defined((d) => d.v != null).x((d) => x(d.Y) + x.bandwidth() / 2).y((d) => yv(d.v)).curve(d3.curveMonotoneX);
    const full = yrs.map((Y) => ({ Y, v: P[YI(Y)] == null ? null : P[YI(Y)] }));
    svg.append('line').attr('x1', 0).attr('x2', w - fcW - gap).attr('y1', yv(0)).attr('y2', yv(0)).style('stroke', 'var(--surface)').style('stroke-width', 1).style('stroke-dasharray', '2 3').style('opacity', 0.9);
    svg.append('path').datum(full).attr('d', line).style('fill', 'none').style('stroke', 'var(--surface)').style('stroke-width', 4.5).style('stroke-linejoin', 'round');
    svg.append('path').datum(full).attr('d', line).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 1.8).style('stroke-linejoin', 'round');
    // projected winter (median) as a dot on the forecast stripe
    const mProj = model(lg, lmk);
    if (mProj) {
      const s = sims(lg, lmk);
      const med = quant(s, 0.5);
      svg.append('circle').attr('cx', fx + fcW / 2).attr('cy', yv(med)).attr('r', 4.5).style('fill', 'var(--ink)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    }
    // hover
    const hit = svg.append('rect').attr('x', 0).attr('y', top).attr('width', w).attr('height', h - top - bottom).style('fill', 'transparent');
    hit.on('pointermove', (e) => {
      const [px] = d3.pointer(e);
      if (px > fx - gap / 2) {
        const s = mProj ? sims(lg, lmk) : null;
        showTip(e, '2026–27 forecast', [{ value: signed(state.mu) + ' °C', label: ` ± ${f2(state.sigma)} (Nov–Jan RONI)` },
          ...(s ? [{ value: fA(quant(s, 0.5)), label: ` projected Dec–Feb sea level, ${gName(lg)}` }] : [])]);
        return;
      }
      const i = Math.max(0, Math.min(yrs.length - 1, Math.floor(px / x.step())));
      const Y = yrs[i], v = NDJ[YI(Y)], sl = P[YI(Y)];
      showTip(e, sLabel(Y), [{ value: signed(v) + ' °C', label: ' ' + CAT_LABEL[catOf(v)] + (Y < 1951 ? ' (reconstructed)' : '') },
        { value: sl == null ? 'no data' : fA(sl), label: sl == null ? '' : ` Dec–Feb sea level, ${gName(lg)}` }]);
    }).on('pointerleave', hideTip);
    const marks = [[1983, '1982–83'], [1998, '1997–98'], [2016, '2015–16']];
    marks.forEach(([Y, lab]) => {
      if (x(Y) == null) return;
      const cx = x(Y) + x.bandwidth() / 2;
      svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', top - 5).attr('y2', top).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
      text(svg, cx, top - 8, w < 560 ? "'" + String(Y - 1).slice(2) : lab, { anchor: 'middle', fill: 'var(--ink-2)', size: 11 });
    });
    [1910, 1930, 1950, 1970, 1990, 2010].filter((t) => x(t) != null).forEach((t) => text(svg, x(t) + x.bandwidth() / 2, h - 6, String(t), { anchor: 'middle', size: 11 }));
    text(svg, 2, top - 8, w < 560 ? '' : `Line: Dec–Feb sea level, ${gName(lg)}`, { size: 11, fill: 'var(--ink)', weight: 600 });
  }

  // ------------------------------------------------------------------ strength ruler (as in the rain site)
  function renderRuler() {
    const el = $('ruler');
    const narrow = el.clientWidth < 560;
    const evs = [];
    for (let i = 0; i < YEARS.length; i++) if (YEARS[i] >= 1951 && NDJ[i] >= 1.4) evs.push({ Y: YEARS[i], x: NDJ[i] });
    const { svg, w, h } = prep('ruler', narrow ? 176 : 160, 'Forecast distribution of El Niño strength with past El Niño winters marked');
    const ml = 14, mr = 14, axisY = 96;
    const x = d3.scaleLinear().domain([0.5, 3.8]).range([ml, w - mr]);
    const bandsDef = [[0.5, 1, 'Weak'], [1, 1.5, 'Moderate'], [1.5, 2, 'Strong'], [2, 2.5, narrow ? 'V. strong' : 'Very strong'], [2.5, 3.8, narrow ? 'Beyond record' : 'Beyond any since 1950']];
    bandsDef.forEach(([a, b, lab], i) => {
      svg.append('rect').attr('x', x(a)).attr('y', 16).attr('width', x(b) - x(a)).attr('height', axisY - 16).style('fill', i % 2 ? 'var(--wash)' : 'transparent');
      text(svg, (x(a) + x(b)) / 2, 11, lab, { anchor: 'middle', size: 10.5 });
    });
    const s = Math.max(state.sigma, 0.001);
    const xs = d3.range(0.5, 3.801, 0.01);
    const yd = (p) => axisY - 4 - p * 60;
    if (state.sigma >= 0.02) {
      svg.append('path').datum(xs.map((v) => [v, Math.exp(-0.5 * ((v - state.mu) / s) ** 2)]))
        .attr('d', d3.area().x((d) => x(d[0])).y0(axisY).y1((d) => yd(d[1])).curve(d3.curveBasis))
        .style('fill', 'var(--fc-wash-2)').style('stroke', 'var(--fc)').style('stroke-width', 2);
    }
    svg.append('line').attr('x1', x(state.mu)).attr('x2', x(state.mu)).attr('y1', yd(1) - 2).attr('y2', axisY).style('stroke', 'var(--fc)').style('stroke-width', 2.5);
    text(svg, Math.min(Math.max(x(state.mu), 40), w - 40), yd(1) - 7, signed(state.mu) + ' °C', { anchor: 'middle', fill: 'var(--fc-text)', weight: 750, size: 13, halo: true });
    styleAxis(svg.append('g').attr('transform', `translate(0,${axisY})`).call(d3.axisBottom(x).tickValues([0.5, 1, 1.5, 2, 2.5, 3, 3.5]).tickFormat((d) => signed(d, f1)).tickSize(4)));
    const items = [{ x: FC.ndj_q05, lab: 'NOAA 5%', noaa: true }, { x: FC.ndj_q95, lab: 'NOAA 95%', noaa: true }, ...evs.map((e) => ({ x: e.x, lab: sLabel(e.Y), Y: e.Y }))].sort((a, b) => a.x - b.x);
    const rows = [];
    const rowY = (r) => axisY + 32 + r * 14;
    items.forEach((it) => {
      const px = x(it.x), wlab = it.lab.length * 6.2 + 8;
      let r = 0;
      while (rows[r] != null && rows[r] > px - wlab / 2) r++;
      rows[r] = px + wlab / 2; it.r = r; it.px = px;
    });
    const g = svg.append('g');
    items.forEach((it) => {
      const col = it.noaa ? 'var(--fc)' : catVar(catOf(it.x));
      g.append('line').attr('x1', it.px).attr('x2', it.px).attr('y1', axisY - 10).attr('y2', rowY(it.r) - 10).style('stroke', it.noaa ? 'var(--fc)' : 'var(--ink-2)').style('stroke-width', 1).style('opacity', 0.6);
      g.append('circle').attr('cx', it.px).attr('cy', axisY - 10).attr('r', 4.5).style('fill', col).style('stroke', 'var(--surface)').style('stroke-width', 1.5);
      text(g, it.px, rowY(it.r), it.lab, { anchor: 'middle', size: 11, fill: it.noaa ? 'var(--fc-text)' : 'var(--ink-2)', weight: it.noaa ? 650 : 550 });
      const hit = g.append('rect').attr('x', it.px - 24).attr('y', axisY - 22).attr('width', 48).attr('height', rowY(it.r) - axisY + 26)
        .style('fill', 'transparent').style('cursor', 'pointer').attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', `Set El Niño strength to ${signed(it.x)} °C (${it.lab})`);
      const choose = () => setMu(it.x);
      hit.on('click', choose).on('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } })
        .on('pointermove', (e) => showTip(e, it.noaa ? it.lab : sLabel(it.Y), [{ value: signed(it.x) + ' °C', label: it.noaa ? ' NOAA forecast percentile' : ' ' + CAT_LABEL[catOf(it.x)] }, { value: '', label: 'Select to use this strength' }]))
        .on('pointerleave', hideTip);
    });
    const hh = Math.max(h, rowY(rows.length - 1) + 8);
    svg.attr('height', hh).attr('viewBox', `0 0 ${w} ${hh}`);
  }
  function renderPresets() {
    const el = $('presets'); el.replaceChildren();
    const ps = [['NOAA median', FC.ndj_median], ['NOAA low (5%)', FC.ndj_q05], ['NOAA high (95%)', FC.ndj_q95], ['Model peak (NMME)', FC.nmme_rel_peak],
      ['Like 1997–98', NDJ[YI(1998)]], ['Like 1982–83', NDJ[YI(1983)]], ['Like 2015–16', NDJ[YI(2016)]], ['Moderate El Niño', 1.25]];
    for (const [lab, v] of ps) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      b.textContent = `${lab} ${signed(v)}`; b.addEventListener('click', () => setMu(v)); el.append(b);
    }
  }

  // ------------------------------------------------------------------ outlook
  function outlookStats() {
    const m = model(), s = sims(), rows = series();
    const th = thresholds(state.measure, state.gauge, rows);
    const n = rows.length;
    return {
      m, s, rows, th,
      q10: quant(s, 0.1), q25: quant(s, 0.25), med: quant(s, 0.5), q75: quant(s, 0.75), q90: quant(s, 0.9),
      p: th.map((t) => fracAbove(s, t.t)), c: th.map((t) => (t.rec ? 1 / n : rows.filter((r) => r.v >= t.t).length / n)),
      rec: rows.reduce((a, b) => (b.v > a.v ? b : a), rows[0]),
    };
  }

  function renderLede() {
    const sf = D.so_far.reg, pm = pastMax('reg', ALLM);
    if (!sf || !pm) return;
    $('lede-now').textContent = sf.oct_anom > pm.v
      ? ` This October the sea along Southern California has been running about ${US() ? f0(sf.oct_anom / 2.54) + ' inches' : f0(sf.oct_anom) + ' cm'} above normal, higher than in any month in a century of tide-gauge records.`
      : '';
  }
  function renderTiles(st) {
    if (OCT_THROUGH) $('stamp').textContent = `Tide-gauge data through October ${OCT_THROUGH}, 2026 (October preliminary) · NOAA El Niño outlook issued October 8, 2026`;
    const g = state.gauge;
    // sea level now: the selected gauge if it is still running, otherwise the regional average
    const nowG = D.so_far[g] ? g : 'reg';
    const sf = D.so_far[nowG];
    const lm = lastMonth(nowG);
    $('t-now-label').textContent = `Sea level now, ${nowG === 'reg' ? 'Southern California' : GAUGE[nowG].name}`;
    if (sf) {
      const pm = pastMax(nowG, ALLM);
      $('t-now').textContent = fA(sf.oct_anom);
      $('t-now-note').textContent = `October 1–${+sf.through.slice(8)} average (preliminary), compared with normal for the season. ${MONTHS[lm.m - 1]} ${lm.y}: ${fA(lm.v)}.` +
        (pm && sf.oct_anom > pm.v ? ` No earlier month came close: the record was ${fA(pm.v)}, in ${MONTHS[pm.m - 1]} ${pm.y}.` : '') + (nowG !== g ? ' The selected gauge is no longer running.' : '');
    } else {
      $('t-now').textContent = fA(lm.v);
      $('t-now-note').textContent = `${MONTHS[lm.m - 1]} ${lm.y}, compared with normal for the season.`;
    }
    $('t-rec-label').textContent = `Highest on record, ${MEAS_SHORT[state.measure]}`;
    $('t-rec').textContent = fmt(st.rec.v);
    $('t-rec-note').textContent = `${sLabel(st.rec.Y)} ${gAt()}${wlSuffix()}${isWL() ? ', adjusted to today’s sea level' : ', after removing the long-term rise'}. Records since ${sLabel(st.m.y0)}.`;
    $('t-proj-label').textContent = `Projected 2026–27, ${MEAS_SHORT[state.measure]}`;
    $('t-proj').textContent = fmt(st.med);
    $('t-proj-note').textContent = `Middle estimate for ${state.gauge === 'reg' ? 'the five-gauge average' : gName()}${wlSuffix()}. 8 in 10 range ${fmtBare(st.q10)} to ${fmt(st.q90)}. ${isWL() ? '' : 'Normal is 0.'}`;
  }

  function renderOutlook(st) {
    const g = state.gauge, mk = state.measure;
    const { m, rows } = st;
    const above = rows.filter((r) => r.v > st.med).length;
    const rank = above + 1;
    let v;
    if (isWL(mk)) {
      const F = floodOf(g);
      const mllw = GAUGE[g] && GAUGE[g].datums ? (GAUGE[g].datums.MHHW - GAUGE[g].datums.MLLW) : null;
      v = `With El Niño at ${signed(state.mu)} °C (± ${f2(state.sigma)}), the middle estimate for the highest water of the winter ${gAt(g)} is ${fW(st.med)} above Mean Higher High Water` +
        (mllw != null ? ` (${fT(st.med + mllw)} above the tide-table zero, MLLW)` : '') + `, at today's sea level. ` +
        `The chance of reaching NOAA's minor flood level is ${pct(st.p[0])}, compared with ${pct(st.c[0])} of past winters adjusted to today's sea level. ` +
        `The 8‑in‑10 range runs from ${fW(st.q10)} to ${fW(st.q90)}, because the peak depends on whether a storm arrives at the top of a king tide.`;
      void F;
    } else {
      const lean = st.p[1] >= 0.8 ? 'strongly points to' : st.p[1] >= 0.5 ? 'points to' : st.p[0] >= 0.6 ? 'leans toward' : 'does not clearly favor';
      v = `With El Niño at ${signed(state.mu)} °C (± ${f2(state.sigma)}), history ${lean} a ${MEAS_PHRASE[mk]} well above normal ${gAt(g)}. ` +
        `The middle estimate is ${fA(st.med)}, which would ${rank === 1 ? 'be the highest' : `rank ${ordinal(rank)} highest`} of ${rows.length + 1} winters since ${rows[0].Y - 1}. ` +
        `The chance of at least ${both(st.th[1].t)} above normal is ${pct(st.p[1])}, compared with ${pct(st.c[1])} in a typical winter. ` +
        `Still, ${oneIn(1 - st.p[0])} winters like this would end up no higher than normal.`;
    }
    const mf = st.m.fz;
    if (mf) {
      const alt = sims(state.gauge, state.measure, state.period, state.extrap, state.mu, state.sigma, !state.fall);
      const pf = pastMax(g, [9, 10]);
      const beyond = pf && mf.z_now > pf.v ? `, higher than in any earlier fall (the previous high, ${fA(pf.v)}, was in ${pf.y}), so the model is reaching beyond past experience` : '';
      v += state.fall
        ? ` This projection also uses this fall's sea level, a September–October average of ${fA(mf.z_now)}${beyond}. From the El Niño forecast alone, the middle estimate would be ${fmt(quant(alt, 0.5))}.`
        : ` Sea level this fall is already ${fA(mf.z_now)} (September–October average)${beyond}. Adding it to the model moves the middle estimate to ${fmt(quant(alt, 0.5))}.`;
    }
    const sfo = D.so_far[g];
    if (state.measure === 'peak' && sfo) v += ` October alone is already ${fA(sfo.oct_anom)} (preliminary), so the season's highest month will be at least that.`;
    $('verdict').textContent = v;
    const sfx = isWL() ? ' above MHHW' : ' above normal';
    $('b-med').replaceChildren(document.createTextNode(fmt(st.med) + ' '));
    const sm = document.createElement('small'); sm.textContent = isWL() ? 'above MHHW' : 'above normal'; $('b-med').append(sm);
    $('b-med-s').textContent = isWL() ? `At today's sea level. Median past winter: ${fW(d3.median(rows, (r) => r.v))}` : `${both(st.med)}${sfx}`;
    $('b-iqr').textContent = `${fmtBare(st.q25)} to ${fmt(st.q75)}`;
    $('b-iqr-s').textContent = isWL() ? 'Half of projected winters fall in this range' : 'Half of projected winters fall in this range';
    $('b-80').textContent = `${fmtBare(st.q10)} to ${fmt(st.q90)}`;
    $('b-80-s').textContent = `Typical past winter: ${fmt(d3.median(rows, (r) => r.v))}`;

    const box = $('meters'); box.replaceChildren();
    st.th.forEach((t, i) => {
      const row = document.createElement('div'); row.className = 'meter';
      const l = document.createElement('div'); l.className = 'ml'; l.textContent = t.lab;
      const tr = document.createElement('div'); tr.className = 'track';
      tr.setAttribute('role', 'img'); tr.setAttribute('aria-label', `${pct(st.p[i])} projected, ${pct(st.c[i])} in a typical winter`);
      const fl = document.createElement('div'); fl.className = 'fill'; fl.style.width = (100 * st.p[i]).toFixed(1) + '%';
      const cl = document.createElement('div'); cl.className = 'clim'; cl.style.left = `calc(${(100 * st.c[i]).toFixed(1)}% - 1px)`;
      tr.append(fl, cl);
      const vv = document.createElement('div'); vv.className = 'mv'; vv.textContent = pct(st.p[i]);
      const note = document.createElement('div'); note.className = 'mn'; note.textContent = `Typical winter: ${pct(st.c[i])}`;
      row.append(l, tr, vv, note); box.append(row);
    });
    const ag = ACTIVE_FOR[g] || g;
    const ho = GAUGE[ag] && GAUGE[ag].htf_outlook;
    const nh = $('noaa-htf');
    if (ho) {
      nh.hidden = false;
      nh.textContent = `For comparison, NOAA's own high tide flooding outlook for May ${ho.year} to April ${ho.year + 1} projects ${ho.low}–${ho.high} days at or above the minor flood level at ${GAUGE[ag].name}, from a trend plus El Niño method (issued ${ho.date}).`;
    } else nh.hidden = true;

    renderRanked(st);
    renderDensity(st);
    renderSensitivity(st);
  }

  function renderRanked(st) {
    const rows = st.rows.slice().sort((a, b) => a.v - b.v);
    const el = $('ranked');
    const H = el.clientWidth < 520 ? 260 : 320;
    const { svg, w, h } = prep('ranked', H, 'Past winters sorted from lowest to highest with the 2026–27 projected range');
    const ml = 46, mr = 10, mt = 12, mb = 26;
    const c = (v) => conv(v);
    const lo = Math.min(0, c(rows[0].v), c(st.q10)), hi = Math.max(c(rows[rows.length - 1].v), c(st.q90));
    const x = d3.scaleBand().domain(rows.map((r) => r.Y)).range([ml, w - mr]).paddingInner(0.18);
    const y = d3.scaleLinear().domain([lo - 0.04 * (hi - lo), hi + 0.06 * (hi - lo)]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(unitTop(y, 5, unit(), !isWL())).tickSize(0).tickPadding(6))).select('.domain').remove();
    svg.append('rect').attr('x', ml).attr('width', w - ml - mr).attr('y', y(c(st.q90))).attr('height', y(c(st.q10)) - y(c(st.q90))).style('fill', 'var(--fc-wash)');
    svg.append('rect').attr('x', ml).attr('width', w - ml - mr).attr('y', y(c(st.q75))).attr('height', y(c(st.q25)) - y(c(st.q75))).style('fill', 'var(--fc-wash-2)');
    const bw = Math.min(24, x.bandwidth()), off = (x.bandwidth() - bw) / 2;
    svg.append('g').selectAll('path').data(rows).join('path')
      .attr('d', (r) => barPath(x(r.Y) + off, y(0), bw, y(c(r.v)), Math.min(3, bw / 2)))
      .style('fill', (r) => catVar(r.cat))
      .on('pointermove', (e, r) => showTip(e, sLabel(r.Y), [{ value: fmt(r.v), label: wlSuffix() }, { value: signed(r.x) + ' °C', label: ' ' + CAT_LABEL[r.cat], color: catVar(r.cat) }]))
      .on('pointerleave', hideTip);
    svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
    if (isWL()) {
      const F = floodOf();
      svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(toW(F.minor))).attr('y2', y(toW(F.minor))).style('stroke', 'var(--flood)').style('stroke-width', 1.5).style('stroke-dasharray', '5 3');
      text(svg, w - mr - 4, y(toW(F.minor)) - 5, 'NOAA minor flood level', { anchor: 'end', size: 11, fill: 'var(--flood)', weight: 650, halo: true });
    }
    svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(c(st.med))).attr('y2', y(c(st.med))).style('stroke', 'var(--fc)').style('stroke-width', 2.5);
    const below = rows.filter((r) => r.v < st.med).length;
    const rank = rows.length - below + 1;
    const xr = below < rows.length ? x(rows[below].Y) - (x.step() * x.paddingInner()) / 2 : w - mr;
    svg.append('circle').attr('cx', xr).attr('cy', y(c(st.med))).attr('r', 5).style('fill', 'var(--fc)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    text(svg, ml + 6, y(c(st.med)) - 7, `2026–27 middle estimate ${fmt(st.med)}`, { fill: 'var(--fc-text)', weight: 700, size: 12, halo: true });
    if (!isWL()) text(svg, ml + 6, y(0) - 5, 'Normal', { fill: 'var(--ink-2)', size: 11, halo: true });
    text(svg, ml, h - 8, 'Lowest', { size: 11 });
    text(svg, w - mr, h - 8, 'Highest', { anchor: 'end', size: 11 });
    $('rank-sub').textContent = `${gName()}, ${MEAS_SHORT[state.measure]}${isWL() ? ' (above MHHW, at today’s sea level)' : ''}: every winter from ${periodLabel(st.m)}, lowest to highest, colored by that winter's El Niño–La Niña state. The middle estimate would ${rank === 1 ? 'be the highest' : `rank ${ordinal(rank)} highest`} of ${rows.length + 1}. Dark teal band: middle 50%; light band: 8 in 10.`;
  }

  function kde(values, grid, bw) {
    const out = new Float64Array(grid.length);
    const c = 1 / (bw * Math.sqrt(2 * Math.PI));
    for (let j = 0; j < values.length; j++) {
      const v = values[j];
      for (let i = 0; i < grid.length; i++) { const z = (grid[i] - v) / bw; out[i] += c * Math.exp(-0.5 * z * z); }
    }
    return Array.from(out, (v) => v / values.length);
  }
  function renderDensity(st) {
    const { svg, w, h } = prep('density', 230, 'Probability of each value for the 2026–27 projection and for all past winters');
    const ml = 12, mr = 12, mt = 10, mb = 30;
    const vals = st.rows.map((r) => conv(r.v));
    const sub = []; for (let i = 0; i < st.s.length; i += 8) sub.push(conv(st.s[i]));
    const lo = Math.min(d3.min(vals), quant(sub, 0.005)), hi = Math.max(d3.max(vals), quant(sub, 0.995));
    const pad = 0.08 * (hi - lo);
    const x = d3.scaleLinear().domain([lo - pad, hi + pad]).nice().range([ml, w - mr]);
    const [a, b] = x.domain();
    const grid = d3.range(a, b, (b - a) / 160);
    const bwH = 1.06 * d3.deviation(vals) * Math.pow(vals.length, -0.2);
    const dH = kde(vals, grid, bwH);
    const bwP = 1.06 * d3.deviation(sub) * Math.pow(sub.length, -0.2);
    const dP = kde(sub, grid, bwP);
    const y = d3.scaleLinear().domain([0, Math.max(d3.max(dH), d3.max(dP)) * 1.08]).range([h - mb, mt]);
    const area = d3.area().x((d, i) => x(grid[i])).y0(y(0)).y1((d) => y(d)).curve(d3.curveBasis);
    const line = d3.line().x((d, i) => x(grid[i])).y((d) => y(d)).curve(d3.curveBasis);
    svg.append('path').datum(dH).attr('d', area).style('fill', 'var(--wash)');
    svg.append('path').datum(dH).attr('d', line).style('fill', 'none').style('stroke', 'var(--ink-2)').style('stroke-width', 1.5);
    svg.append('path').datum(dP).attr('d', area).style('fill', 'var(--fc-wash-2)');
    svg.append('path').datum(dP).attr('d', line).style('fill', 'none').style('stroke', 'var(--fc)').style('stroke-width', 2);
    const ref = isWL() ? toW(floodOf().minor) : 0;
    if (ref >= a && ref <= b) {
      svg.append('line').attr('x1', x(ref)).attr('x2', x(ref)).attr('y1', mt).attr('y2', y(0)).style('stroke', isWL() ? 'var(--flood)' : 'var(--ink-2)').style('stroke-width', 1).style('stroke-dasharray', isWL() ? '4 3' : null);
      text(svg, x(ref) + 4, mt + 10, isWL() ? 'Minor flood' : 'Normal', { size: 11, fill: isWL() ? 'var(--flood)' : 'var(--ink-2)', halo: true });
    }
    styleAxis(svg.append('g').attr('transform', `translate(0,${y(0)})`).call(d3.axisBottom(x).ticks(6).tickSize(4)));
    text(svg, w - mr, h - 2, isWL() ? `${uW()} above MHHW` : `${uA()} above normal`, { anchor: 'end', size: 10.5 });
    const hit = svg.append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', y(0) - mt).style('fill', 'transparent');
    const cross = svg.append('line').attr('y1', mt).attr('y2', y(0)).style('stroke', 'var(--axis)').style('opacity', 0);
    hit.on('pointermove', (e) => {
      const [px] = d3.pointer(e); const vu = x.invert(px);
      const vcm = isWL() ? (US() ? vu * 30.48 : vu) : (US() ? vu * 2.54 : vu);
      cross.attr('x1', px).attr('x2', px).style('opacity', 1);
      const pP = fracAbove(st.s, vcm), pH = st.rows.filter((r) => r.v > vcm).length / st.rows.length;
      showTip(e, `Higher than ${fmt(vcm)}${wlSuffix()}`, [{ value: pct(pP), label: ' 2026–27 projection', color: 'var(--fc)' }, { value: pct(pH), label: ' of past winters', color: 'var(--ink-2)' }]);
    }).on('pointerleave', () => { hideTip(); cross.style('opacity', 0); });
  }

  function renderSensitivity(st) {
    const tbl = $('sens'); tbl.replaceChildren();
    const t1 = st.th[isWL() ? 0 : 1];
    const colLab = isWL() ? 'Minor flood' : `≥ ${fA(t1.t)}`;
    head(tbl, ['Approach', 'Middle', '8‑in‑10 range', colLab], (i) => i > 0);
    const body = tbl.createTBody();
    const combos = [['modern', 'continue', false], ['modern', 'hold', false], ['long', 'continue', false], ['long', 'hold', false], ['modern', 'continue', true], ['long', 'continue', true]];
    for (const [per, ex, fl] of combos) {
      const m = model(state.gauge, state.measure, per);
      if (!m || (per === 'long' && D.models[state.gauge][state.measure].long == null)) continue;
      if (fl && !m.fz) continue;
      const s = sims(state.gauge, state.measure, per, ex, state.mu, state.sigma, fl);
      const row = body.insertRow();
      const cur = per === state.period && ex === state.extrap && fl === (state.fall && !!m.fz);
      if (cur) row.className = 'main';
      cell(row, `${per === 'modern' ? 'Since 1951' : `Full record (${m.y0 - 1}–)`}, ${ex === 'continue' ? 'trend continues' : 'no extra rise past record strength'}${fl ? `, plus this fall's sea level (${fA(m.fz.z_now)})` : ''}${cur ? ' (shown above)' : ''}`);
      cell(row, fmt(quant(s, 0.5)), 'n');
      cell(row, `${fmtBare(quant(s, 0.1))} to ${fmt(quant(s, 0.9))}`, 'n');
      cell(row, pct(fracAbove(s, t1.t)), 'n');
    }
    const strong = st.rows.filter((r) => r.x >= 1.5).sort((a, b) => a.v - b.v);
    if (strong.length) {
      const vals = strong.map((r) => r.v);
      const k = strong.filter((r) => r.v >= t1.t).length;
      const row = body.insertRow();
      cell(row, `History only: the ${strong.length} strong El Niño winters, ${periodLabel(st.m)}`);
      cell(row, fmt(d3.median(vals)), 'n');
      cell(row, `${fmtBare(vals[0])} to ${fmt(vals[vals.length - 1])} (all)`, 'n');
      cell(row, `${k} of ${strong.length}`, 'n');
    }
  }

  // ------------------------------------------------------------------ king tides
  function renderKing() {
    const kg = ACTIVE_FOR[state.gauge] || state.gauge;
    const K = D.kingtides[kg];
    const Gk = GAUGE[kg];
    if (!K || !Gk.datums) return;
    const per = state.period;
    const s = sims(kg, 'ndjfm', per);
    const qa = { q10: quant(s, 0.1), q50: quant(s, 0.5), q90: quant(s, 0.9) };
    const off = K.offset;             // rise since the 1983-2001 epoch (cm)
    const dmh = Gk.datums.MHHW - Gk.datums.MLLW;
    const F = Gk.flood;
    const minorT = F.minor + dmh, modT = F.moderate + dmh;   // above MLLW
    const days = K.t.map((t, i) => ({ t: new Date(t.replace(' ', 'T')), ts: t, tide: K.h[i] }));
    const exp = (d, q) => d.tide + off + qa[q];
    const octA = D.so_far[kg] ? D.so_far[kg].oct_anom : null;      // scenario: the sea stays as high as this October
    const pers = (d) => d.tide + off + octA;
    const el = $('king-chart');
    const { svg, w, h } = prep('king-chart', el.clientWidth < 560 ? 260 : 300, `Daily highest predicted tide at ${Gk.name}, November 2026 to March 2027, with sea level rise and El Niño added`);
    const ml = 46, mr = 12, mt = 14, mb = 26;
    const x = d3.scaleTime().domain([new Date('2026-11-01T00:00'), new Date('2027-04-01T00:00')]).range([ml, w - mr]);
    const ylo = d3.min(days, (d) => d.tide) - 15, yhi = Math.max(d3.max(days, (d) => Math.max(exp(d, 'q90'), octA != null ? pers(d) : -1e9)), modT) + 8;
    const y = d3.scaleLinear().domain([toT(ylo), toT(yhi)]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(unitTop(y, 5, uT())).tickSize(0).tickPadding(6))).select('.domain').remove();
    styleAxis(svg.append('g').attr('transform', `translate(0,${h - mb})`).call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat('%b')).tickSize(4)));
    const hl = (v, col, lab, dash) => {
      svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(toT(v))).attr('y2', y(toT(v))).style('stroke', col).style('stroke-width', 1.4).style('stroke-dasharray', dash || null);
      text(svg, w - mr - 2, y(toT(v)) - 4, lab, { anchor: 'end', size: 10.5, fill: col, weight: 650, halo: true });
    };
    hl(dmh, 'var(--ink-2)', w < 560 ? 'MHHW' : 'MHHW (average higher high tide, 1983–2001)', '2 3');
    hl(minorT, 'var(--flood)', 'NOAA minor flood level', '5 3');
    hl(modT, 'var(--flood)', 'Moderate flood level');
    // band: 8-in-10 range of tide + rise + El Niño; points: middle estimate
    const bw = Math.max(1, (w - ml - mr) / days.length - 0.6);
    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('x', (d) => x(d.t) - bw / 2).attr('width', bw).attr('y', (d) => y(toT(exp(d, 'q90')))).attr('height', (d) => Math.max(1, y(toT(exp(d, 'q10'))) - y(toT(exp(d, 'q90')))))
      .style('fill', 'var(--fc-wash-2)');
    svg.append('path').datum(days).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(toT(d.tide))).curve(d3.curveMonotoneX)).style('fill', 'none').style('stroke', 'var(--tide)').style('stroke-width', 1.4);
    svg.append('path').datum(days).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(toT(exp(d, 'q50')))).curve(d3.curveMonotoneX)).style('fill', 'none').style('stroke', 'var(--fc)').style('stroke-width', 2);
    if (octA != null) svg.append('path').datum(days).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(toT(pers(d)))).curve(d3.curveMonotoneX)).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 1.3).style('stroke-dasharray', '4 3');
    const cross = svg.append('line').attr('y1', mt).attr('y2', h - mb).style('stroke', 'var(--axis)').style('opacity', 0);
    const bis = d3.bisector((d) => d.t).center;
    svg.append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', h - mb - mt).style('fill', 'transparent')
      .on('pointermove', (e) => {
        const [px] = d3.pointer(e); const d = days[bis(days, x.invert(px))];
        cross.attr('x1', x(d.t)).attr('x2', x(d.t)).style('opacity', 1);
        showTip(e, d3.timeFormat('%a %b %-d, %Y · %-I:%M %p')(d.t), [
          { value: fT(d.tide), label: ' tide table (above MLLW)', color: 'var(--tide)' },
          { value: fT(exp(d, 'q50')), label: ` with sea level rise and El Niño (8 in 10: ${numT(exp(d, 'q10'))}–${fT(exp(d, 'q90'))})`, color: 'var(--fc)' },
          ...(octA != null ? [{ value: fT(pers(d)), label: ' if the sea stays as high as this October', color: 'var(--ink)' }] : []),
          { value: fT(minorT), label: ' NOAA minor flood level', color: 'var(--flood)' }]);
      })
      .on('pointerleave', () => { cross.style('opacity', 0); hideTip(); });
    const leg = $('king-legend'); leg.replaceChildren();
    [['line', 'var(--tide)', 'Tide table (highest tide each day)'], ['line', 'var(--fc)', 'Plus sea level rise and El Niño, middle estimate'], ['band', 'var(--fc-wash-2)', '8‑in‑10 range'],
      ...(octA != null ? [['dash', 'var(--ink)', `If the sea stays as high as this October (${fA(octA)})`]] : [])].forEach(([cls, col, lab]) => {
      const sp = document.createElement('span'); const i = document.createElement('i'); i.className = cls;
      if (cls === 'dash') i.style.borderColor = col; else i.style.background = col;
      sp.append(i, document.createTextNode(lab)); leg.append(sp);
    });
    const alt = kg !== state.gauge ? ` (${state.gauge === 'reg' ? 'the regional average has no tide predictions of its own' : `${gName()} has no tide predictions`}, so ${GAUGE[kg].name} is shown)` : '';
    $('king-title').textContent = `Daily highest tide at ${Gk.name}, November 2026 to March 2027`;
    $('king-intro').textContent = `Tide tables are calculated from the average sea level of 1983–2001. Since then the sea at ${Gk.name} has risen about ${both(off)}, and this winter El Niño is likely to add about ${both(qa.q50)} more (middle estimate for the November–March average). Both ride on top of every high tide in the table.` +
      (octA != null ? ` Monthly sea level changes slowly, so the November and December king tides could see something closer to this October's ${fA(octA)}; the dashed line shows that case.` : '');
    $('king-sub').textContent = `Heights above Mean Lower Low Water (MLLW), the zero of NOAA tide tables${alt}. Weather can add more on any given day: a storm surge of several inches, and waves on open beaches.`;
    // table of the highest tides
    const topd = days.slice().sort((a, b) => b.tide - a.tide).slice(0, 10).sort((a, b) => a.t - b.t);
    const tbl = $('king-table'); tbl.replaceChildren();
    head(tbl, ['Date and time', 'Tide table', '+ rise since 1983–2001', '+ El Niño (middle)', 'Expected (8 in 10)', ...(octA != null ? ['If as high as October'] : []), 'Compared with NOAA minor flood level'], (i) => i > 0 && i < (octA != null ? 6 : 5));
    const tb = tbl.createTBody();
    topd.forEach((d) => {
      const tr = tb.insertRow();
      cell(tr, d3.timeFormat('%a %b %-d, %-I:%M %p')(d.t), 'nw');
      cell(tr, fT(d.tide), 'n');
      cell(tr, fA(off), 'n');
      cell(tr, fA(qa.q50), 'n');
      cell(tr, `${fT(exp(d, 'q50'))} (${numT(exp(d, 'q10'))}–${numT(exp(d, 'q90'))})`, 'n');
      if (octA != null) cell(tr, fT(pers(d)), 'n');
      const c = tr.insertCell(); const pill = document.createElement('span');
      const gap = minorT - exp(d, 'q50');
      if (gap <= 0) { pill.className = 'pill flood'; pill.textContent = `Above it by ${fA(-gap, false)}${pers(d) >= modT ? '; moderate if October persists' : ''}`; }
      else if (exp(d, 'q90') >= minorT || (octA != null && pers(d) >= minorT)) { pill.className = 'pill hi'; pill.textContent = `Within reach: ${fA(gap, false)} below`; }
      else { pill.className = 'pill'; pill.textContent = `${fA(gap, false)} below`; }
      c.append(pill);
    });
    // where this winter sits in the 18.6-year tide cycle
    const tm = Gk.tide_max || [];
    const cur = tm.find((r) => r[0] === 2027);
    if (cur && tm.length > 20) {
      const sorted = tm.filter((r) => r[0] <= 2027).map((r) => r[1]).sort((a, b) => b - a);
      const rk = sorted.indexOf(cur[1]) + 1;
      const peak = tm.reduce((a, b) => (b[1] > a[1] ? b : a));
      const top3 = tm.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map((r) => sLabel(r[0])).join(', ');
      void peak;
      $('king-foot').textContent = `From the tide alone, this winter's highest predicted tide at ${Gk.name}, ${fW(cur[1])} above MHHW, ranks ${ordinal(rk)} of the ${sorted.length} winters since 1979–80, so the astronomical tides themselves are not unusually high this year; the extra height comes from the sea. Predicted king tides rise and fall over 4.4‑year and 18.6‑year lunar cycles [25]; the highest predicted winters in 1980–2029 are ${top3}. Predicted tides come from NOAA's harmonic constants; times are local.`;
    } else $('king-foot').textContent = 'Predicted tides come from NOAA’s harmonic constants; times are local.';
  }

  // ------------------------------------------------------------------ history: gauge map and inventory
  function renderGaugeMap() {
    const M = G.socal;
    const el = $('gmap'); el.replaceChildren();
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${M.w} ${M.h}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Map of Southern California tide gauges');
    const sc = M.w / ((M.bb[2] - M.bb[0]) * M.kx);
    const P = (lon, lat) => [(lon - M.bb[0]) * M.kx * sc, (M.bb[3] - lat) * sc];
    svg.append('rect').attr('width', M.w).attr('height', M.h).style('fill', 'var(--sea)');
    svg.append('path').attr('d', M.land).style('fill', 'var(--land)').style('stroke', 'var(--axis)').style('stroke-width', 0.8);
    const inv = D.inventory.filter((d) => d.lon >= M.bb[0] && d.lon <= M.bb[2] && d.lat >= M.bb[1] && d.lat <= M.bb[3]);
    const rad = d3.scaleSqrt().domain([0, 1450]).range([3, 17]);
    const g = svg.append('g');
    const selId = state.gauge;
    inv.slice().sort((a, b) => b.n - a.n).forEach((d) => {
      const [cx, cy] = P(d.lon, d.lat);
      const active = d.last && d.last >= '2026-01';
      const used = d.used;
      const c = g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rad(d.n))
        .style('fill', active ? 'var(--fc)' : used ? 'var(--surface)' : 'var(--surface)').style('fill-opacity', active ? 0.85 : 1)
        .style('stroke', used ? (active ? 'var(--surface)' : 'var(--fc)') : 'var(--muted)').style('stroke-width', used ? 2 : 1.2)
        .style('cursor', used ? 'pointer' : 'default');
      if (used === selId) g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rad(d.n) + 4).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 2).style('pointer-events', 'none');
      c.on('pointermove', (e) => showTip(e, d.name, [{ value: `${d.first ? d.first.slice(0, 4) : '–'}–${d.last ? d.last.slice(0, 4) : '–'}`, label: ` · ${d.n} months of data` },
        { value: d.src, label: used ? ' · used in this analysis (select to show)' : d.n < 120 ? ' · too short to analyze' : ' · not used' }]))
        .on('pointerleave', hideTip)
        .on('click', () => { if (used) setGauge(used); });
    });
    const labs = { 9410170: 'San Diego', 9410230: 'La Jolla', 9410660: 'Los Angeles', 9410840: 'Santa Monica', 9411340: 'Santa Barbara', 9410580: 'Newport Beach', 9410680: 'Long Beach', 9411270: 'Rincon Island', 9411406: 'Platform Harvest', 795: 'Ensenada' };
    // label placement: [dx sign (1 right, -1 left), dy in px]
    const place = { 'San Diego': [1, 6], 'La Jolla': [1, -4], 'Newport Beach': [1, 8], 'Long Beach': [1, -10], 'Los Angeles': [1, 18],
      'Santa Monica': [-1, -6], 'Santa Barbara': [1, -16], 'Rincon Island': [1, 18], 'Platform Harvest': [0, 34], Ensenada: [1, 6] };
    inv.forEach((d) => {
      const lab = labs[d.code]; if (!lab) return;
      const [cx, cy] = P(d.lon, d.lat);
      const [sx, dy] = place[lab] || [1, 4];
      // sx 0: label directly below the dot, starting just left of it (the dot sits near the map's left edge)
      const lx = sx === 0 ? Math.max(4, cx - 20) : cx + sx * (rad(d.n) + 6);
      text(svg, lx, cy + dy, lab, { anchor: sx < 0 ? 'end' : 'start', size: 25, fill: 'var(--ink)', weight: 650, halo: true }).style('stroke-width', 5);
    });
    text(svg, P(-120.6, 33.0)[0], P(-120.6, 33.0)[1], 'Pacific Ocean', { size: 24, fill: 'var(--muted)', weight: 500 });
    // inventory table
    const tbl = $('inv-table'); tbl.replaceChildren();
    head(tbl, ['Gauge', 'Source', 'Years', 'Months', 'Used here'], (i) => i === 3);
    const tb = tbl.createTBody();
    D.inventory.slice().sort((a, b) => b.n - a.n).forEach((d) => {
      const tr = tb.insertRow();
      if (d.used && d.used === state.gauge) tr.className = 'sel';
      cell(tr, d.name); cell(tr, d.src);
      cell(tr, d.first ? `${d.first.slice(0, 4)}–${d.last.slice(0, 4)}` : 'no monthly means');
      cell(tr, String(d.n), 'n');
      cell(tr, d.used ? 'Yes' : d.n < 120 ? 'Too short' : 'No');
    });
    const nAll = D.inventory.length, nUsed = D.inventory.filter((d) => d.used).length;
    const months = d3.sum(D.inventory, (d) => d.n);
    $('inv-sub').textContent = `${nAll} gauges with ${d3.format(',')(months)} months of sea level between them. The ${nUsed} with at least 15 winters are analyzed here; most others ran for a few months during surveys.`;
  }

  // ------------------------------------------------------------------ history: scatter
  function renderScatter(st) {
    const el = $('scatter');
    const H = el.clientWidth < 560 ? 320 : 400;
    const { svg, w, h } = prep('scatter', H, `Winter sea level versus El Niño strength ${gAt()}`);
    const ml = 48, mr = 14, mt = 22, mb = 40;
    const rows = st.rows, m = st.m;
    const bd = bands();
    const c = (v) => conv(v);
    const lo = Math.min(d3.min(rows, (r) => c(r.v)), d3.min(bd, (d) => c(d.q10))), hi = Math.max(d3.max(rows, (r) => c(r.v)), c(st.q90), d3.max(bd.filter((d) => d.x <= 3.0), (d) => c(d.q90)));
    const x = d3.scaleLinear().domain([-2.6, 3.8]).range([ml, w - mr]);
    const y = d3.scaleLinear().domain([lo - 0.05 * (hi - lo), hi + 0.05 * (hi - lo)]).nice().range([h - mb, mt]);
    svg.append('clipPath').attr('id', 'clip-sc').append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', h - mb - mt);
    yGrid(svg, y, ml, w - mr, y.ticks(6));
    svg.append('rect').attr('x', x(m.xmax)).attr('y', mt).attr('width', x(3.8) - x(m.xmax)).attr('height', h - mb - mt).style('fill', 'var(--wash)').style('opacity', 0.7);
    text(svg, w - mr - 4, h - mb - 6, w < 560 ? 'Beyond record' : `Stronger than any El Niño, ${sLabel(m.y0)} to ${sLabel(m.y1)}`, { anchor: 'end', size: 10.5, fill: 'var(--ink-2)', halo: true });
    svg.append('rect').attr('x', x(state.mu - state.sigma)).attr('width', Math.max(2, x(state.mu + state.sigma) - x(state.mu - state.sigma))).attr('y', mt).attr('height', h - mb - mt).style('fill', 'var(--fc-wash)');
    svg.append('line').attr('x1', x(state.mu)).attr('x2', x(state.mu)).attr('y1', mt).attr('y2', h - mb).style('stroke', 'var(--fc)').style('stroke-width', 2);
    text(svg, x(state.mu), mt - 6, '2026–27 forecast', { anchor: 'middle', size: 11, fill: 'var(--fc-text)', weight: 700 });
    const gb = svg.append('g').attr('clip-path', 'url(#clip-sc)');
    const ar = (a, b) => d3.area().x((d) => x(d.x)).y0((d) => y(c(d[a]))).y1((d) => y(c(d[b]))).curve(d3.curveMonotoneX);
    gb.append('path').datum(bd).attr('d', ar('q10', 'q90')).style('fill', 'var(--ink-2)').style('opacity', 0.09);
    gb.append('path').datum(bd).attr('d', ar('q25', 'q75')).style('fill', 'var(--ink-2)').style('opacity', 0.12);
    const inR = bd.filter((d) => d.x <= m.xmax + 1e-9), outR = bd.filter((d) => d.x >= m.xmax - 0.1);
    const ln = d3.line().x((d) => x(d.x)).y((d) => y(c(d.q50))).curve(d3.curveMonotoneX);
    gb.append('path').datum(inR).attr('d', ln).style('fill', 'none').style('stroke', 'var(--ink-2)').style('stroke-width', 2);
    gb.append('path').datum(outR).attr('d', ln).style('fill', 'none').style('stroke', 'var(--ink-2)').style('stroke-width', 2).style('stroke-dasharray', '5 4');
    if (isWL()) {
      const F = floodOf();
      svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(toW(F.minor))).attr('y2', y(toW(F.minor))).style('stroke', 'var(--flood)').style('stroke-width', 1.4).style('stroke-dasharray', '5 3');
      text(svg, ml + 4, y(toW(F.minor)) - 5, 'NOAA minor flood level', { size: 10.5, fill: 'var(--flood)', weight: 650, halo: true });
    } else {
      svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ink-2)').style('stroke-width', 1).style('opacity', 0.6);
      text(svg, ml + 4, y(0) - 5, 'Normal', { size: 10.5, fill: 'var(--ink-2)', halo: true });
    }
    styleAxis(svg.append('g').attr('transform', `translate(0,${h - mb})`).call(d3.axisBottom(x).tickValues([-2, -1, 0, 1, 2, 3]).tickFormat((d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d)).tickSize(4)));
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(unitTop(y, 6, unit(), !isWL())).tickSize(0).tickPadding(6))).select('.domain').remove();
    text(svg, x(-2.5), h - 6, '← La Niña', { size: 11, fill: 'var(--c-lnS)', weight: 650 });
    text(svg, w - mr, h - 6, 'El Niño →', { anchor: 'end', size: 11, fill: 'var(--c-enS)', weight: 650 });
    text(svg, (ml + w - mr) / 2, h - 6, 'Nov–Jan relative Niño‑3.4 (°C)', { anchor: 'middle', size: 11 });
    const pts = rows.map((r) => ({ ...r, cx: x(r.x), cy: y(c(r.v)) }));
    svg.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', (d) => d.cx).attr('cy', (d) => d.cy).attr('r', 4.5)
      .style('fill', (d) => (d.off ? catVar(d.cat) : 'var(--surface)'))
      .style('stroke', (d) => (d.off ? 'var(--surface)' : catVar(d.cat))).style('stroke-width', (d) => (d.off ? 1.5 : 2));
    const top = pts.slice().sort((a, b) => b.v - a.v).slice(0, 2).map((d) => d.Y);
    const labYears = new Set([1983, 1998, 2016, ...top]);
    const placed = [];
    pts.filter((d) => labYears.has(d.Y)).sort((a, b) => a.cy - b.cy).forEach((d) => {
      let ly = d.cy - 8;
      const lx = d.cx > w - 90 ? d.cx - 8 : d.cx + 8;
      for (const p of placed) if (Math.abs(p.x - lx) < 60 && Math.abs(p.y - ly) < 12) ly = p.y + 13;
      placed.push({ x: lx, y: ly });
      text(svg, lx, ly, sLabel(d.Y), { anchor: d.cx > w - 90 ? 'end' : 'start', size: 11, fill: 'var(--ink-2)', weight: 600, halo: true });
    });
    const del = d3.Delaunay.from(pts, (d) => d.cx, (d) => d.cy);
    const ring = svg.append('circle').attr('r', 8).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 1.5).style('opacity', 0);
    svg.append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', h - mb - mt).style('fill', 'transparent')
      .on('pointermove', (e) => {
        const [px, py] = d3.pointer(e); const d = pts[del.find(px, py)];
        if (!d || Math.hypot(d.cx - px, d.cy - py) > 28) { ring.style('opacity', 0); hideTip(); return; }
        ring.attr('cx', d.cx).attr('cy', d.cy).style('opacity', 1);
        showTip(e, sLabel(d.Y), [{ value: fmt(d.v), label: wlSuffix() + (isWL() ? ', at today’s sea level' : ' above normal') },
          { value: signed(d.x) + ' °C', label: ` ${CAT_LABEL[d.cat]}${d.off ? '' : ' (reconstructed index)'}`, color: catVar(d.cat) },
          ...(d.oni != null ? [{ value: signed(d.oni) + ' °C', label: ' traditional ONI' }] : [])]);
      })
      .on('pointerleave', () => { ring.style('opacity', 0); hideTip(); });
    $('scatter-title').textContent = isWL() ? 'Highest water versus El Niño strength' : 'Winter sea level versus El Niño strength';
    $('scatter-sub').textContent = `Each dot is one winter ${gAt()}, ${MEAS_SHORT[state.measure]}${isWL() ? ' above MHHW, adjusted to today’s sea level' : ', compared with normal'}, winters ${periodLabel(m)}. Rank correlation ${f2(m.rho)}. The dashed line extends the model beyond the strongest El Niño in this record.`;
  }

  // ------------------------------------------------------------------ history: categories strip
  function renderCats(st) {
    const el = $('cats');
    const H = el.clientWidth < 420 ? 300 : 320;
    const { svg, w, h } = prep('cats', H, 'Winter values by El Niño–La Niña category');
    const ml = 44, mr = 8, mt = 22, mb = 40;
    const c = (v) => conv(v);
    const rows = st.rows;
    const lo = Math.min(0, d3.min(rows, (r) => c(r.v))), hi = d3.max(rows, (r) => c(r.v));
    const x = d3.scaleBand().domain(CAT_IDS).range([ml, w - mr]).padding(0.12);
    const y = d3.scaleLinear().domain([lo - 0.05 * (hi - lo), hi + 0.05 * (hi - lo)]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    const ref = isWL() ? floodOf().minor : 0;
    svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(c(ref))).attr('y2', y(c(ref))).style('stroke', isWL() ? 'var(--flood)' : 'var(--ink-2)').style('stroke-width', 1).style('stroke-dasharray', isWL() ? '5 3' : null);
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(unitTop(y, 5, unit(), !isWL())).tickSize(0).tickPadding(6))).select('.domain').remove();
    const hash = (Y) => { const t = Math.sin(Y * 12.9898) * 43758.5453; return t - Math.floor(t); };
    const g = svg.append('g');
    for (const ct of CAT_IDS) {
      const rs = rows.filter((r) => r.cat === ct);
      const cx = x(ct) + x.bandwidth() / 2, jw = x.bandwidth() * 0.32;
      g.selectAll(null).data(rs).join('circle')
        .attr('cx', (r) => cx + (hash(r.Y) - 0.5) * 2 * jw).attr('cy', (r) => y(c(r.v))).attr('r', 3.8)
        .style('fill', (r) => (r.off ? catVar(ct) : 'var(--surface)')).style('stroke', (r) => (r.off ? 'var(--surface)' : catVar(ct))).style('stroke-width', (r) => (r.off ? 1.2 : 1.8))
        .on('pointermove', (e, r) => showTip(e, sLabel(r.Y), [{ value: fmt(r.v), label: wlSuffix() }, { value: signed(r.x) + ' °C', label: ' ' + CAT_LABEL[ct], color: catVar(ct) }]))
        .on('pointerleave', hideTip);
      if (rs.length) {
        const md = d3.median(rs, (r) => c(r.v));
        g.append('line').attr('x1', cx - x.bandwidth() * 0.38).attr('x2', cx + x.bandwidth() * 0.38).attr('y1', y(md)).attr('y2', y(md)).style('stroke', 'var(--ink)').style('stroke-width', 2.5).style('stroke-linecap', 'round');
        const k = rs.filter((r) => r.v > ref).length;
        text(g, cx, mt - 8, `${k} of ${rs.length}`, { anchor: 'middle', size: 10.5, fill: 'var(--ink-2)', weight: 600 });
      }
      const [a, b] = CAT_SHORT[ct];
      text(g, cx, h - mb + 15, a, { anchor: 'middle', size: 10.5 });
      if (b) text(g, cx, h - mb + 28, b, { anchor: 'middle', size: 10.5 });
    }
    text(svg, ml - 4, mt - 8, isWL() ? 'flooded:' : 'above normal:', { anchor: 'end', size: 10, fill: 'var(--muted)' });
    $('cats-sub').textContent = isWL()
      ? `Each dot is one winter's highest water${wlSuffix()}, at today's sea level. The bar marks each category's median; the dashed line is NOAA's minor flood level.`
      : 'Each dot is one winter, compared with normal. The bar marks each category’s median.';
    // takeaway
    const strong = rows.filter((r) => r.x >= 1.5), oth = rows.filter((r) => r.x < 0.5), ln = rows.filter((r) => r.x <= -0.5);
    const box = $('takeaway'); box.replaceChildren();
    const add = (tag, str) => { const e = document.createElement(tag); e.textContent = str; box.append(e); return e; };
    add('strong', `${gName()}, ${MEAS_SHORT[state.measure]}, winters ${periodLabel(st.m)}`);
    const word = isWL() ? 'reached the minor flood level' : 'were above normal';
    if (strong.length) {
      const k = strong.filter((r) => r.v > ref).length;
      const lo2 = strong.reduce((a, b) => (b.v < a.v ? b : a)), hi2 = strong.reduce((a, b) => (b.v > a.v ? b : a));
      add('p', `Strong and very strong El Niño winters: ${k} of ${strong.length} ${word}. Median ${fmt(d3.median(strong, (r) => r.v))}, ranging from ${fmt(lo2.v)} (${sLabel(lo2.Y)}) to ${fmt(hi2.v)} (${sLabel(hi2.Y)}).`);
    }
    if (oth.length) add('p', `Winters without El Niño: ${oth.filter((r) => r.v > ref).length} of ${oth.length} ${word}, median ${fmt(d3.median(oth, (r) => r.v))}.`);
    if (ln.length) add('p', `La Niña winters alone: ${ln.filter((r) => r.v > ref).length} of ${ln.length} ${word}, median ${fmt(d3.median(ln, (r) => r.v))}.`);
    add('p', isWL()
      ? 'Past winters are shifted up by the rise in sea level since then, so they are comparable with 2026–27.'
      : 'Normal is the level expected for the season after removing the long-term rise, so about half of all winters are above normal.').className = 'small';
  }

  // ------------------------------------------------------------------ history: winter by winter
  function renderTS(st) {
    const rows = st.rows;
    const el = $('ts');
    const H = el.clientWidth < 560 ? 230 : 280;
    const { svg, w, h } = prep('ts', H, `Winter values by year ${gAt()}, with the 2026–27 projection`);
    const ml = 46, mr = 12, mt = 16, mb = 26;
    const c = (v) => conv(v);
    const yrs = d3.range(st.m.y0, st.m.y1 + 1);
    const x = d3.scaleBand().domain([...yrs, 'gap', 'gap2', 2027]).range([ml, w - mr]).paddingInner(0.15);
    const lo = Math.min(0, d3.min(rows, (r) => c(r.v)), c(st.q10)), hi = Math.max(d3.max(rows, (r) => c(r.v)), c(st.q90));
    const y = d3.scaleLinear().domain([lo - 0.04 * (hi - lo), hi + 0.06 * (hi - lo)]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(unitTop(y, 5, unit(), !isWL())).tickSize(0).tickPadding(6))).select('.domain').remove();
    const bw = Math.min(24, x.bandwidth()), off = (x.bandwidth() - bw) / 2;
    svg.append('g').selectAll('path').data(rows).join('path')
      .attr('d', (r) => barPath(x(r.Y) + off, y(0), bw, y(c(r.v)), Math.min(3, bw / 2)))
      .style('fill', (r) => catVar(r.cat))
      .on('pointermove', (e, r) => showTip(e, sLabel(r.Y), [{ value: fmt(r.v), label: wlSuffix() }, { value: signed(r.x) + ' °C', label: ' ' + CAT_LABEL[r.cat], color: catVar(r.cat) }]))
      .on('pointerleave', hideTip);
    svg.append('line').attr('x1', ml).attr('x2', x(st.m.y1) + x.bandwidth()).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
    if (isWL()) {
      const F = floodOf();
      svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(toW(F.minor))).attr('y2', y(toW(F.minor))).style('stroke', 'var(--flood)').style('stroke-width', 1.2).style('stroke-dasharray', '5 3');
    }
    const cx = x(2027) + x.bandwidth() / 2, bwid = Math.max(10, Math.min(22, x.bandwidth() * 3));
    const g = svg.append('g');
    g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(c(st.q90))).attr('y2', y(c(st.q10))).style('stroke', 'var(--fc)').style('stroke-width', 2);
    g.append('rect').attr('x', cx - bwid / 2).attr('width', bwid).attr('y', y(c(st.q75))).attr('height', y(c(st.q25)) - y(c(st.q75))).attr('rx', 2).style('fill', 'var(--fc-wash-2)').style('stroke', 'var(--fc)').style('stroke-width', 1.5);
    g.append('line').attr('x1', cx - bwid / 2 - 3).attr('x2', cx + bwid / 2 + 3).attr('y1', y(c(st.med))).attr('y2', y(c(st.med))).style('stroke', 'var(--fc)').style('stroke-width', 3);
    g.append('rect').attr('x', cx - 18).attr('width', 36).attr('y', y(c(st.q90)) - 6).attr('height', y(c(st.q10)) - y(c(st.q90)) + 12).style('fill', 'transparent')
      .on('pointermove', (e) => showTip(e, '2026–27 projection', [{ value: fmt(st.med), label: ' middle estimate' }, { value: `${fmtBare(st.q25)} to ${fmt(st.q75)}`, label: ' middle 50%' }, { value: `${fmtBare(st.q10)} to ${fmt(st.q90)}`, label: ' 8 in 10' }]))
      .on('pointerleave', hideTip);
    text(svg, cx, h - 8, '2026–27', { anchor: 'end', size: 11, fill: 'var(--fc-text)', weight: 700 });
    const step = yrs.length > 100 ? 20 : 10;
    yrs.filter((Y) => (Y - 1) % step === 0 && x(2027) - x(Y) > 60).forEach((Y) => text(svg, x(Y) + x.bandwidth() / 2, h - 8, String(Y - 1), { anchor: 'middle', size: 11 }));
    $('ts-sub').textContent = `${gName()}, ${MEAS_SHORT[state.measure]}${isWL() ? ' above MHHW at today’s sea level' : ' compared with normal'}, winters ${periodLabel(st.m)}. Bars are colored by that winter's El Niño–La Niña state; the teal box at right is the 2026–27 projection (box: middle 50%, whiskers: 8 in 10).`;
    legendCats('cat-legend-1'); legendCats('cat-legend-2');
    const tbl = $('season-table'); tbl.replaceChildren();
    head(tbl, ['Winter', 'Nov–Jan RONI', 'Category', isWL() ? `Highest water (${uW()} above MHHW, today's level)` : `Sea level (${uA()} vs normal)`], (i) => i === 1 || i > 2);
    const tb = tbl.createTBody();
    rows.slice().reverse().forEach((r) => {
      const tr = tb.insertRow();
      cell(tr, sLabel(r.Y)); cell(tr, signed(r.x) + (r.off ? '' : '*'), 'n'); cell(tr, CAT_LABEL[r.cat]); cell(tr, fmtBare(r.v), 'n');
    });
    const cap = tbl.createCaption(); cap.className = 'small'; cap.style.textAlign = 'left'; cap.style.captionSide = 'bottom';
    cap.textContent = '* El Niño index reconstructed from ERSSTv5 (before 1951).';
  }

  // ------------------------------------------------------------------ this event: monthly trajectories
  function eventYears(g) {
    const out = [];
    for (let i = 0; i < YEARS.length; i++) if (YEARS[i] >= 1951 && NDJ[i] >= 1.5) out.push(YEARS[i] - 1);
    out.push(2023);
    return out.filter((y0) => { let n = 0; for (let k = 0; k < 18; k++) { const yy = y0 + Math.floor(k / 12), mm = (k % 12) + 1; if (anomAt(g, yy, mm) != null) n++; } return n >= 12; });
  }
  function renderTraj() {
    const g = state.gauge;
    const el = $('traj');
    const H = el.clientWidth < 560 ? 300 : 360;
    const { svg, w, h } = prep('traj', H, `Monthly sea level through past strong El Niños and 2026 ${gAt()}`);
    const ml = 46, mr = 16, mt = 18, mb = 42;
    const n = 18;
    const x = d3.scalePoint().domain(d3.range(n)).range([ml, w - mr]);
    const evs = eventYears(g).map((y0) => ({ y0, label: `${y0}–${String(y0 + 1).slice(2)}`, v: d3.range(n).map((k) => anomAt(g, y0 + Math.floor(k / 12), (k % 12) + 1)) }));
    const cur = d3.range(n).map((k) => (k < 9 ? anomAt(g, 2026, k + 1) : null));
    const sf = D.so_far[g];
    const oct = sf ? sf.oct_anom : null;
    const sD = model(g, 'djf') ? sims(g, 'djf') : null;
    const proj = sD ? { q10: quant(sD, 0.1), q25: quant(sD, 0.25), q50: quant(sD, 0.5), q75: quant(sD, 0.75), q90: quant(sD, 0.9) } : null;
    const all = evs.flatMap((e) => e.v).concat(cur, [oct], proj ? [proj.q90, proj.q10] : []).filter((v) => v != null);
    const y = d3.scaleLinear().domain([toA(Math.min(-8, d3.min(all))), toA(Math.max(20, d3.max(all)))]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(6));
    svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(unitTop(y, 6, uA(), true)).tickSize(0).tickPadding(6))).select('.domain').remove();
    const narrow = w < 560;
    d3.range(n).forEach((i) => { if (!narrow || i % 2 === 0) text(svg, x(i), h - mb + 15, MONTHS[i % 12], { anchor: 'middle', size: 10.5 }); });
    text(svg, x(0), h - 6, 'Year 0 (e.g. 1997, 2026)', { size: 10.5, fill: 'var(--ink-2)' });
    text(svg, x(12), h - 6, 'Year 1', { size: 10.5, fill: 'var(--ink-2)' });
    // the Dec-Feb window
    svg.append('rect').attr('x', x(11) - x.step() / 2).attr('width', x.step() * 3).attr('y', mt).attr('height', h - mb - mt).style('fill', 'var(--wash)').style('opacity', 0.6);
    const line = d3.line().defined((d) => d != null).x((d, i) => x(i)).y((d) => y(toA(d))).curve(d3.curveMonotoneX);
    const hi = new Set([1982, 1997, 2015]);
    const gl = svg.append('g');
    evs.forEach((ev) => gl.append('path').datum(ev.v).attr('d', line).style('fill', 'none').style('stroke', 'var(--ink-2)').style('stroke-width', hi.has(ev.y0) ? 1.9 : 1.2).style('opacity', hi.has(ev.y0) ? 0.8 : 0.28));
    const placed = [];
    evs.filter((e) => hi.has(e.y0)).forEach((ev) => {
      let bi = 0; ev.v.forEach((v, i) => { if (v != null && (ev.v[bi] == null || v > ev.v[bi])) bi = i; });
      let ly = y(toA(ev.v[bi])) - 8;
      for (const p of placed) if (Math.abs(p - ly) < 12) ly = p - 13;
      placed.push(ly);
      text(gl, x(bi) + (bi > n / 2 ? 6 : -6), ly, ev.label, { anchor: bi > n / 2 ? 'start' : 'end', size: 11, fill: 'var(--ink-2)', weight: 650, halo: true });
    });
    if (proj) {
      const cx = x(12), bw = Math.min(26, x.step() * 0.9);
      svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(toA(proj.q90))).attr('y2', y(toA(proj.q10))).style('stroke', 'var(--fc)').style('stroke-width', 2);
      svg.append('rect').attr('x', cx - bw / 2).attr('width', bw).attr('y', y(toA(proj.q75))).attr('height', y(toA(proj.q25)) - y(toA(proj.q75))).attr('rx', 2).style('fill', 'var(--fc-wash-2)').style('stroke', 'var(--fc)').style('stroke-width', 1.5);
      svg.append('line').attr('x1', cx - bw / 2 - 3).attr('x2', cx + bw / 2 + 3).attr('y1', y(toA(proj.q50))).attr('y2', y(toA(proj.q50))).style('stroke', 'var(--fc)').style('stroke-width', 3);
      text(svg, cx + bw / 2 + 6, y(toA(proj.q50)) + 4, narrow ? 'Dec–Feb' : 'Projected Dec–Feb', { size: 11, fill: 'var(--fc-text)', weight: 700, halo: true });
    }
    svg.append('path').datum(cur).attr('d', line).style('fill', 'none').style('stroke', 'var(--fc)').style('stroke-width', 3.2);
    const lastI = cur.reduce((a, v, i) => (v != null ? i : a), -1);
    svg.append('g').selectAll('circle').data(cur.map((v, i) => ({ v, i })).filter((d) => d.v != null)).join('circle')
      .attr('cx', (d) => x(d.i)).attr('cy', (d) => y(toA(d.v))).attr('r', 3.5).style('fill', 'var(--fc)').style('stroke', 'var(--surface)').style('stroke-width', 1.5);
    if (oct != null && lastI === 8) {
      svg.append('line').attr('x1', x(8)).attr('x2', x(9)).attr('y1', y(toA(cur[8]))).attr('y2', y(toA(oct))).style('stroke', 'var(--fc)').style('stroke-width', 2.5).style('stroke-dasharray', '3 3');
      svg.append('circle').attr('cx', x(9)).attr('cy', y(toA(oct))).attr('r', 4.5).style('fill', 'var(--surface)').style('stroke', 'var(--fc)').style('stroke-width', 2.5);
    }
    if (lastI >= 0) {
      const lx = oct != null && lastI === 8 ? 9 : lastI, lv = oct != null && lastI === 8 ? oct : cur[lastI];
      text(svg, x(lx) + 8, y(toA(lv)) - 10, `2026: ${fA(lv)}${lx === 9 ? ' (Oct to date)' : ''}`, { anchor: 'start', size: 11.5, fill: 'var(--fc-text)', weight: 750, halo: true });
    }
    const leg = $('traj-legend'); leg.replaceChildren();
    [['line', 'var(--fc)', '2026 so far'], ['ring', null, 'October to date (preliminary)'], ['line', 'var(--ink-2)', 'Past strong El Niños'], ['band', 'var(--fc-wash-2)', 'Projected Dec–Feb (box: middle 50%, whiskers: 8 in 10)']].forEach(([cls, col, lab]) => {
      if (cls === 'ring' && oct == null) return;
      const sp = document.createElement('span'); const i = document.createElement('i'); i.className = cls; if (col) i.style.background = col; if (cls === 'ring') i.style.borderColor = 'var(--fc)'; sp.append(i, document.createTextNode(lab)); leg.append(sp);
    });
    const cross = svg.append('line').attr('y1', mt).attr('y2', h - mb).style('stroke', 'var(--axis)').style('opacity', 0);
    svg.append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', h - mb - mt).style('fill', 'transparent')
      .on('pointermove', (e) => {
        const [px] = d3.pointer(e);
        const i = Math.max(0, Math.min(n - 1, Math.round((px - ml) / x.step())));
        cross.attr('x1', x(i)).attr('x2', x(i)).style('opacity', 1);
        const rowsT = [];
        if (cur[i] != null) rowsT.push({ value: fA(cur[i]), label: ' 2026', color: 'var(--fc)' });
        else if (i === 9 && oct != null) rowsT.push({ value: fA(oct), label: octLab, color: 'var(--fc)' });
        evs.map((ev) => ({ ev, v: ev.v[i] })).filter((d) => d.v != null).sort((a, b) => b.v - a.v).forEach((d) => rowsT.push({ value: fA(d.v), label: ' ' + d.ev.label, color: 'var(--ink-2)' }));
        showTip(e, `${MONTHS[i % 12]} of year ${i < 12 ? 0 : 1}`, rowsT);
      })
      .on('pointerleave', () => { cross.style('opacity', 0); hideTip(); });
    const s26 = anomAt(g, 2026, 9);
    const base = 'In the very strong El Niños of 1982–83 and 1997–98, Southern California’s sea level began climbing in late summer or early fall and stayed high into spring.';
    if (s26 != null) {
      const comp = [1997, 1982, 2015].map((yy) => [yy, anomAt(g, yy, 9)]).filter((d) => d[1] != null).map(([yy, v]) => `September ${yy} (${fA(v)})`);
      const list = comp.length > 1 ? `${comp.slice(0, -1).join(', ')} and ${comp[comp.length - 1]}` : comp.join('');
      $('event-intro').textContent = `${base} So far 2026 is on the same path: ${gAt(g)}, September 2026 averaged ${fA(s26)} above normal, compared with ${list}` +
        `${oct != null ? `. October 1–${OCT_THROUGH} averaged ${fA(oct)} (preliminary)` : ''}. September 2015 was raised by both the developing El Niño and a marine heat wave off the coast.` +
        (() => { const pm = pastMax(g, ALLM); return oct != null && pm && oct > pm.v ? ` This October is the highest of any month ${g === 'reg' ? 'in the regional average' : 'at this gauge'} since ${GAUGE[g] ? GAUGE[g].first.slice(0, 4) : '1923'}; the previous monthly record was ${fA(pm.v)}, in ${MONTHS[pm.m - 1]} ${pm.y}.` : ''; })();
    } else $('event-intro').textContent = `${base} This gauge has no 2026 data; choose a running gauge to compare.`;
    $('traj-title').textContent = `Sea level, month by month, ${gAt(g)}`;
    $('traj-sub').textContent = `Monthly sea level compared with normal, from January of each El Niño year to the following June. Gray: strong El Niños since 1951 (relative index +1.5 °C or more) and 2023–24. The shaded columns are December–February.`;
  }

  // ------------------------------------------------------------------ satellite map
  let altCoast = null;
  function renderAltButtons() {
    const seg = $('seg-alt'); seg.replaceChildren();
    G.alt.maps.forEach((mp, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = mp.label.replace(/ \(to .*\)/, '');
      b.setAttribute('aria-pressed', String(i === state.alt));
      b.addEventListener('click', () => { state.alt = i; [...seg.children].forEach((c, j) => c.setAttribute('aria-pressed', String(j === i))); renderAlt(); });
      seg.append(b);
    });
  }
  function renderAlt() {
    const A = G.alt;
    $('alt-canvas').closest('figure').hidden = !A.maps.length;
    if (!A.maps.length) return;
    const mp = A.maps[state.alt];
    const cv = $('alt-canvas');
    const W = Math.max(260, cv.parentElement.clientWidth);
    const lon0 = 180, lon1 = 290, lat0 = -30.5, lat1 = 60.5;
    const sc = W / (lon1 - lon0), H = Math.round((lat1 - lat0) * sc);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, W, H);
    const lim = US() ? 12 : 30;
    const color = diverging(divStops(), [-lim, 0, lim]);
    const shift = state.altRel ? mp.mean : 0;  // cm
    const X = (lon) => (lon - lon0) * sc, Y = (lat) => (lat1 - lat) * sc;
    for (let i = 0; i < A.lat.length; i++) {
      for (let j = 0; j < A.lon.length; j++) {
        const v = mp.grid[i][j];
        if (v == null) continue;
        ctx.fillStyle = color(toA(v / 10 - shift));
        ctx.fillRect(X(A.lon[j] - 0.5), Y(A.lat[i] + 0.5), sc + 0.6, sc + 0.6);
      }
    }
    if (!altCoast) altCoast = new Path2D(A.coast);
    ctx.save(); ctx.translate(0, Y(60.5)); ctx.scale(sc, sc);
    ctx.fillStyle = css('--land'); ctx.strokeStyle = css('--axis'); ctx.lineWidth = 0.8 / sc;
    ctx.fill(altCoast); ctx.stroke(altCoast);
    ctx.restore();
    ctx.font = `500 ${W < 560 ? 9 : 11}px ${css('--font-display') || 'sans-serif'}`;
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
    [[0, 'Equator'], [30, '30°N'], [-20, '20°S']].forEach(([la, lab]) => ctx.fillText(lab, 4, Y(la) - 3));
    [[180, '180°'], [210, '150°W'], [240, '120°W'], [270, '90°W']].forEach(([lo, lab]) => { ctx.textAlign = 'center'; ctx.fillText(lab, X(lo), H - 5); });
    // Southern California marker
    ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(242.8), Y(33.2), 6, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = css('--ink'); ctx.textAlign = 'right'; ctx.font = `600 ${W < 560 ? 10 : 12}px ${css('--font-display') || 'sans-serif'}`;
    ctx.fillText('Southern California', X(242.8) - 10, Y(33.2) + 4);
    $('alt-lo').textContent = `−${lim} ${uA()}`; $('alt-hi').textContent = `+${lim} ${uA()}`;
    $('alt-cap').textContent = `${mp.label}. Average over the map: ${fA(mp.mean)}${state.altRel ? ' (subtracted)' : ''}. Source: ${mp.source}.`;
    cv.setAttribute('aria-label', `Satellite sea surface height anomaly map, ${mp.label}.`);
    cv.onpointermove = (e) => {
      const r = cv.getBoundingClientRect(); const lon = lon0 + (e.clientX - r.left) / sc, lat = lat1 - (e.clientY - r.top) / sc;
      const i = Math.round(lat - A.lat[0]), j = Math.round(lon - A.lon[0]);
      if (i < 0 || j < 0 || i >= A.lat.length || j >= A.lon.length || mp.grid[i][j] == null) { hideTip(); return; }
      const la = A.lat[i], lo = A.lon[j];
      showTip(e, `${Math.abs(Math.round(la))}°${la >= 0 ? 'N' : 'S'}, ${Math.round(360 - lo)}°W`, [{ value: fA(mp.grid[i][j] / 10 - shift), label: state.altRel ? ' minus the map-wide rise' : ' vs 1993–2009' }]);
    };
    cv.onpointerleave = hideTip;
    const c = $('alt-legend'), lctx = c.getContext('2d');
    for (let i = 0; i < c.width; i++) { lctx.fillStyle = color(-lim + (2 * lim * i) / (c.width - 1)); lctx.fillRect(i, 0, 1, c.height); }
  }

  // ------------------------------------------------------------------ timing: monthly composites and lag correlation
  function renderMonthly() {
    const g = state.gauge;
    const m = model(g, 'djf');
    const y0 = state.period === 'modern' ? Math.max(1951, m.y0) : m.y0;
    const mon = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    const groups = [
      { lab: 'Very strong El Niño', col: catVar('enVS'), test: (x) => x >= 2 },
      { lab: 'Strong El Niño', col: catVar('enS'), test: (x) => x >= 1.5 && x < 2 },
      { lab: 'Weak–moderate El Niño', col: catVar('enWM'), test: (x) => x >= 0.5 && x < 1.5 },
      { lab: 'Neutral', col: catVar('neu'), test: (x) => x > -0.5 && x < 0.5 },
      { lab: 'La Niña', col: catVar('lnS'), test: (x) => x <= -0.5 },
    ];
    groups.forEach((gr) => {
      const acc = mon.map(() => []);
      YEARS.forEach((Y, i) => {
        if (Y < y0 || NDJ[i] == null || !gr.test(NDJ[i])) return;
        mon.forEach((mm, k) => { const v = anomAt(g, mm >= 7 ? Y - 1 : Y, mm); if (v != null) acc[k].push(v); });
      });
      gr.n = d3.max(acc, (a) => a.length) || 0;
      gr.mean = acc.map((a) => (a.length >= 2 ? d3.mean(a) : null));
    });
    const gs = groups.filter((gr) => gr.n >= 2);
    const cur = mon.map((mm, k) => (k < 3 ? anomAt(g, 2026, mm) : k === 3 && D.so_far[g] ? D.so_far[g].oct_anom : null));
    const leg = $('monthly-legend'); leg.replaceChildren();
    gs.forEach((gr) => { const s = document.createElement('span'); const i = document.createElement('i'); i.className = 'line'; i.style.background = gr.col; s.append(i, document.createTextNode(`${gr.lab} (${gr.n})`)); leg.append(s); });
    { const s = document.createElement('span'); const i = document.createElement('i'); i.className = 'line'; i.style.background = 'var(--fc)'; s.append(i, document.createTextNode('2026 so far')); leg.append(s); }
    const el = $('monthly');
    const { svg, w, h } = prep('monthly', el.clientWidth < 420 ? 240 : 270, `Average monthly sea level by El Niño–La Niña group ${gAt(g)}`);
    const ml = 44, mr = 10, mt = 14, mb = 24;
    const x = d3.scalePoint().domain(d3.range(12)).range([ml, w - mr]).padding(0.3);
    const vals = gs.flatMap((gr) => gr.mean).concat(cur).filter((v) => v != null);
    const y = d3.scaleLinear().domain([toA(d3.min(vals)) - 0.5, toA(d3.max(vals)) + 0.5]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(unitTop(y, 5, uA(), true)).tickSize(0).tickPadding(6))).select('.domain').remove();
    mon.forEach((mm, i) => text(svg, x(i), h - 6, w < 420 ? MONTHS[mm - 1][0] : MONTHS[mm - 1], { anchor: 'middle', size: 10.5 }));
    const line = d3.line().defined((d) => d != null).x((d, i) => x(i)).y((d) => y(toA(d))).curve(d3.curveMonotoneX);
    gs.slice().reverse().forEach((gr) => {
      svg.append('path').datum(gr.mean).attr('d', line).style('fill', 'none').style('stroke', gr.col).style('stroke-width', 2);
      svg.append('g').selectAll('circle').data(gr.mean.map((v, i) => ({ v, i })).filter((d) => d.v != null)).join('circle').attr('cx', (d) => x(d.i)).attr('cy', (d) => y(toA(d.v))).attr('r', 3)
        .style('fill', gr.col).style('stroke', 'var(--surface)').style('stroke-width', 1.5);
    });
    svg.append('path').datum(cur).attr('d', line).style('fill', 'none').style('stroke', 'var(--fc)').style('stroke-width', 3);
    svg.append('g').selectAll('circle').data(cur.map((v, i) => ({ v, i })).filter((d) => d.v != null)).join('circle').attr('cx', (d) => x(d.i)).attr('cy', (d) => y(toA(d.v))).attr('r', 3.6)
      .style('fill', (d) => (d.i === 3 ? 'var(--surface)' : 'var(--fc)')).style('stroke', (d) => (d.i === 3 ? 'var(--fc)' : 'var(--surface)')).style('stroke-width', 2);
    const cross = svg.append('line').attr('y1', mt).attr('y2', h - mb).style('stroke', 'var(--axis)').style('opacity', 0);
    svg.append('rect').attr('x', ml).attr('y', mt).attr('width', w - ml - mr).attr('height', h - mb - mt).style('fill', 'transparent')
      .on('pointermove', (e) => {
        const [px] = d3.pointer(e); const i = Math.max(0, Math.min(11, Math.round((px - x(0)) / x.step())));
        cross.attr('x1', x(i)).attr('x2', x(i)).style('opacity', 1);
        showTip(e, MONTHS[mon[i] - 1], [...(cur[i] != null ? [{ value: fA(cur[i]), label: i === 3 ? octLab : ' 2026', color: 'var(--fc)' }] : []),
          ...gs.map((gr) => ({ value: gr.mean[i] == null ? '–' : fA(gr.mean[i]), label: ' ' + gr.lab, color: gr.col }))]);
      })
      .on('pointerleave', () => { cross.style('opacity', 0); hideTip(); });
    $('monthly-sub').textContent = `${gName()}, July ${y0 - 1} to June ${m.y1}, plus 2026–27 so far. Average sea level in each month from July to June, grouped by that winter's El Niño–La Niña state (number of winters in parentheses), compared with normal.`;
  }
  function renderLag() {
    const g = state.gauge;
    const L = D.lags, C = D.lagcorr[g];
    const { svg, w, h } = prep('lag', 230, `Correlation between monthly sea level ${gAt(g)} and the El Niño index at different lags`);
    const ml = 40, mr = 10, mt = 14, mb = 34;
    const x = d3.scaleBand().domain(L).range([ml, w - mr]).padding(0.2);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(C)), 1]).nice().range([h - mb, mt]);
    yGrid(svg, y, ml, w - mr, y.ticks(5));
    styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(6))).select('.domain').remove();
    const best = L[C.indexOf(d3.max(C))];
    svg.append('g').selectAll('path').data(L.map((l, i) => ({ l, c: C[i] })).filter((d) => d.c != null)).join('path')
      .attr('d', (d) => barPath(x(d.l), y(0), x.bandwidth(), y(d.c), 2))
      .style('fill', (d) => (d.l === best ? 'var(--fc)' : 'var(--axis)'))
      .on('pointermove', (e, d) => showTip(e, d.l === 0 ? 'Same month' : d.l > 0 ? `Sea level ${d.l} month${d.l > 1 ? 's' : ''} after the index` : `Sea level ${-d.l} month${d.l < -1 ? 's' : ''} before the index`, [{ value: f2(d.c), label: ' correlation' }]))
      .on('pointerleave', hideTip);
    L.forEach((l) => { if (l % 3 === 0) text(svg, x(l) + x.bandwidth() / 2, h - mb + 14, String(l), { anchor: 'middle', size: 10.5 }); });
    text(svg, (ml + w - mr) / 2, h - 4, 'Months that sea level lags the El Niño index', { anchor: 'middle', size: 10.5, fill: 'var(--ink-2)' });
    $('lag-sub').textContent = `Correlation between monthly sea level ${gAt(g)} and the relative Niño‑3.4 index (3‑month average) some months earlier, 1951–2026. The highest correlation, ${f2(d3.max(C))}, comes at ${best === 0 ? 'no lag' : `a lag of ${best} month${best > 1 ? 's' : ''}`}: the coast responds within weeks.`;
  }

  // ------------------------------------------------------------------ timing: extremes
  function renderExtremes() {
    const pid = hourlyFor(state.gauge, (g) => D.extremes[g] && hasMeasure(g, 'hmax'));
    const E = D.extremes[pid];
    const P = GAUGE[pid];
    if (!E) return;
    const m = model(pid, 'hmax');
    const F = P.flood;
    const groups = [
      { id: 'ln', lab: ['La Niña', ''], test: (x) => x <= -0.5, col: catVar('lnS') },
      { id: 'neu', lab: ['Neutral', ''], test: (x) => x > -0.5 && x < 0.5, col: catVar('neu') },
      { id: 'enWM', lab: ['Weak–mod.', 'El Niño'], test: (x) => x >= 0.5 && x < 1.5, col: catVar('enWM') },
      { id: 'enS', lab: ['Strong+', 'El Niño'], test: (x) => x >= 1.5, col: catVar('enVS') },
    ];
    const pts = [];
    YEARS.forEach((Y, i) => {
      if (Y < m.y0 || Y > m.y1 || E.hmax[i] == null || NDJ[i] == null) return;
      const gr = groups.find((gg) => gg.test(NDJ[i]));
      pts.push({ Y, x: NDJ[i], h: E.hmax[i], days: E.days_minor[i], t: E.t[i], tide: E.tide[i], bg: E.bg[i], surge: E.surge[i], g: gr });
    });
    const hash = (Y) => { const t = Math.sin(Y * 78.233) * 43758.5453; return t - Math.floor(t); };
    function strip(id, key, title, conv2, fmtv, ref) {
      const { svg, w, h } = prep(id, 210, title);
      const ml = 40, mr = 30, mt = 26, mb = 36;
      const x = d3.scaleBand().domain(groups.map((gg) => gg.id)).range([ml, w - mr]).padding(0.15);
      const vals = pts.map((p) => conv2(p[key]));
      const y = d3.scaleLinear().domain([key === 'days' ? 0 : d3.min(vals) - 0.05 * (d3.max(vals) - d3.min(vals)), Math.max(d3.max(vals), ref != null ? conv2(ref) : -Infinity) * 1.05 || 1]).nice().range([h - mb, mt]);
      yGrid(svg, y, ml, w - mr, y.ticks(4));
      styleAxis(svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(6))).select('.domain').remove();
      text(svg, 0, 12, title, { size: 12, fill: 'var(--ink)', weight: 700 });
      if (ref != null) {
        svg.append('line').attr('x1', ml).attr('x2', w - mr).attr('y1', y(conv2(ref))).attr('y2', y(conv2(ref))).style('stroke', 'var(--flood)').style('stroke-width', 1.3).style('stroke-dasharray', '5 3');
        text(svg, w - mr + 2, y(conv2(ref)) + 4, 'minor', { size: 10, fill: 'var(--flood)', weight: 650 });
      }
      groups.forEach((gg) => {
        const ps = pts.filter((p) => p.g === gg), cx = x(gg.id) + x.bandwidth() / 2, jw = x.bandwidth() * 0.3;
        if (ps.length) {
          const mean = d3.mean(ps, (p) => conv2(p[key]));
          svg.append('line').attr('x1', cx - x.bandwidth() * 0.36).attr('x2', cx + x.bandwidth() * 0.36).attr('y1', y(mean)).attr('y2', y(mean)).style('stroke', 'var(--ink)').style('stroke-width', 2.5).style('stroke-linecap', 'round');
          text(svg, cx + x.bandwidth() * 0.38 + 3, y(mean) + 4, fmtv(mean), { size: 10.5, fill: 'var(--ink)', weight: 700, anchor: 'start', halo: true });
        }
        svg.append('g').selectAll('circle').data(ps).join('circle')
          .attr('cx', (p) => cx + (hash(p.Y) - 0.5) * 2 * jw).attr('cy', (p) => y(conv2(p[key]))).attr('r', 3.4)
          .style('fill', gg.col).style('stroke', 'var(--surface)').style('stroke-width', 1).style('opacity', 0.85)
          .on('pointermove', (e, p) => showTip(e, sLabel(p.Y), [
            key === 'days' ? { value: `${p.days} days`, label: ' at or above the minor flood level' } : { value: fW(p.h), label: ' above MHHW at today’s sea level' },
            ...(key === 'days' || !p.t ? [] : [{ value: pstDate(p.t), label: ' (date of the peak)' }]),
            { value: signed(p.x) + ' °C', label: ' ' + CAT_LABEL[catOf(p.x)], color: gg.col }]))
          .on('pointerleave', hideTip);
        text(svg, cx, h - mb + 14, gg.lab[0], { anchor: 'middle', size: 10.5 });
        if (gg.lab[1]) text(svg, cx, h - mb + 27, gg.lab[1], { anchor: 'middle', size: 10.5 });
      });
    }
    strip('ext1', 'h', `Highest water of the winter (${uW()} above MHHW)`, toW, (v) => (US() ? f2(v) : f0(v)), F.minor);
    strip('ext2', 'days', 'Days at or above the minor flood level', (v) => v, (v) => f1(v));
    $('ext-sub').textContent = `${P.name}${pid !== state.gauge ? (state.gauge === 'reg' ? ' (the regional average has no hourly record of its own)' : ' (the nearest gauge with a long hourly record)') : ''}, November–March, winters ${periodLabel(m)}, every winter adjusted to today's sea level. Dots are winters; bars and numbers show group averages. NOAA's minor flood level here is ${fW(F.minor)} above MHHW.`;
  }
  function renderTop() {
    const pid = hourlyFor(state.gauge, (g) => !!D.top[g]);
    const T = D.top[pid];
    const P = GAUGE[pid];
    if (!T) return;
    const L = T[state.top];
    const tbl = $('top-table'); tbl.replaceChildren();
    head(tbl, ['Date', state.top === 'obs' ? 'As measured' : 'At 2026–27 level', 'What made it', 'El Niño that year', state.top === 'obs' ? 'At 2026–27 level' : 'As measured'], (i) => i === 1 || i === 4);
    const tb = tbl.createTBody();
    const maxv = d3.max(L, (e) => Math.max(e.obs, e.adj));
    const dmh = P.datums.MHHW - P.datums.MLLW;
    L.forEach((e) => {
      const tr = tb.insertRow();
      cell(tr, pstDate(e.t), 'nw');
      const main = state.top === 'obs' ? e.obs : e.adj, other = state.top === 'obs' ? e.adj : e.obs;
      cell(tr, `${fW(main)}`, 'n').title = `${fT(main + dmh)} above MLLW`;
      const c = tr.insertCell();
      const bar = document.createElement('div'); bar.className = 'cbar';
      const parts = [['tide', e.tide, 'var(--tide)', 'Tide above MHHW'], ['bg', e.bg, 'var(--bg)', 'Higher sea that month (vs tide table)'], ['surge', e.surge, 'var(--surge)', 'Storm surge (hours)']];
      parts.forEach(([, v, col]) => { if (v == null || v <= 0) return; const s = document.createElement('span'); s.style.width = `${(100 * v) / maxv}%`; s.style.background = col; bar.append(s); });
      bar.title = parts.map(([, v, , lab]) => `${lab}: ${v == null ? '–' : fW(v)}`).join(' · ');
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', bar.title);
      c.append(bar);
      const cs = tr.insertCell(); cs.className = 'nw';
      const xv = e.x != null ? e.x : e.Y === 2027 ? state.mu : null;
      if (xv != null) {
        const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = catVar(catOf(xv));
        cs.append(sw, document.createTextNode(`${sLabel(e.Y)} · ${e.x != null ? signed(e.x, f1) + ' °C' : 'forecast ' + signed(xv, f1) + ' °C'}`));
        cs.title = e.x != null ? CAT_LABEL[catOf(e.x)] : 'El Niño forecast for this winter';
      }
      cell(tr, fW(other), 'n');
    });
    const nEN = L.filter((e) => (e.x != null ? e.x : e.Y === 2027 ? state.mu : -9) >= 0.5).length;
    const nSummer = L.filter((e) => { const mo = +e.t.slice(5, 7); return mo >= 5 && mo <= 9; }).length;
    $('top-title').textContent = `The 10 highest water levels at ${P.name}`;
    $('top-sub').textContent = `Hourly water levels since ${P.hourly ? P.hourly[0] : ''}, above MHHW, at least 3 days apart${pid !== state.gauge ? ` (at ${P.name}; ${state.gauge === 'reg' ? 'the regional average has no hourly record of its own' : `the nearest gauge with hourly data to ${gName()}`})` : ''}. ${nEN} of the 10 came during El Niño years and ${nSummer} on summer king tides. Hover a bar for its parts: the predicted tide, how much higher the sea stood that month than the tide table assumes, and the storm surge of the moment.`;
  }

  // ------------------------------------------------------------------ along the coast: map and Hovmöller
  function renderCoastMap() {
    const M = G.pacific;
    const S = D.coast.stations;
    const el = $('pmap'); el.replaceChildren();
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${M.w} ${M.h}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Map of tide gauges along the Pacific coast of the Americas colored by winter sea level in strong El Niños');
    const sc = M.w / (M.bb[2] - M.bb[0]);
    const P = (lon, lat) => [(lon - M.bb[0]) * sc, (M.bb[3] - lat) * sc];
    svg.append('rect').attr('width', M.w).attr('height', M.h).style('fill', 'var(--sea)');
    svg.append('path').attr('d', M.land).style('fill', 'var(--land)').style('stroke', 'var(--axis)').style('stroke-width', 0.6);
    const lim = US() ? 10 : 25;
    const color = diverging(divStops(), [-lim, 0, lim]);
    const g = svg.append('g');
    S.filter((s) => s.strong != null && s.lat != null).forEach((s) => {
      const [cx, cy] = P(s.lon, s.lat);
      const soc = REGION_MEMBERS.includes(s.id);
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', soc ? 7.5 : 6.5).style('fill', color(toA(s.strong))).style('stroke', soc ? 'var(--ink)' : 'var(--surface)').style('stroke-width', soc ? 1.6 : 1.2)
        .on('pointermove', (e) => showTip(e, `${s.name}, ${s.country}`, [{ value: fA(s.strong), label: ` average in ${s.nstrong} strong El Niño winters` },
          ...(s.vstrong != null ? [{ value: fA(s.vstrong), label: ` very strong only (${s.nvstrong})` }] : []),
          ...(s.slope != null ? [{ value: `${fA(s.slope)} per °C`, label: `, correlation ${f2(s.corr)}` }] : []),
          { value: `${s.first}–${s.last.slice(0, 4)}`, label: ' record' }]))
        .on('pointerleave', hideTip);
    });
    [['Peru', -80.5, -9], ['Ecuador', -79, -1.5], ['Mexico', -103, 24], ['Southern California', -114, 33.5], ['Oregon and Washington', -118.5, 45], ['Alaska', -150, 63.5], ['Chile', -69.5, -29]].forEach(([lab, lo, la]) => {
      const [x, y] = P(lo, la);
      if (y > 4 && y < M.h) text(svg, x, y, lab, { size: 12, fill: 'var(--ink-2)', weight: 600, halo: true });
    });
    $('pmap-lo').textContent = `−${lim} ${uA()}`; $('pmap-hi').textContent = `+${lim} ${uA()}`;
    const c = $('pmap-legend'), ctx = c.getContext('2d');
    for (let i = 0; i < c.width; i++) { ctx.fillStyle = color(-lim + (2 * lim * i) / (c.width - 1)); ctx.fillRect(i, 0, 1, c.height); }
  }
  function renderHovButtons() {
    const seg = $('seg-hov'); seg.replaceChildren();
    D.coast.events.forEach((y0) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = String(y0);
      b.textContent = y0 === 2026 ? '2026 so far' : `${y0}–${String(y0 + 1).slice(2)}`;
      b.setAttribute('aria-pressed', String(String(y0) === state.hov));
      b.addEventListener('click', () => { state.hov = String(y0); [...seg.children].forEach((cc) => cc.setAttribute('aria-pressed', String(cc === b))); renderHov(); });
      seg.append(b);
    });
  }
  function renderHov() {
    const y0 = +state.hov;
    const S = D.coast.stations, Hv = D.coast.hov[state.hov];
    const rows = S.map((s, i) => ({ s, v: Hv[i] })).filter((r) => r.v);
    const el = $('hov');
    const rowH = el.clientWidth < 560 ? 9 : 10;
    const ml = 108, mr = 8, mt = 8, mb = 28;
    const H = mt + mb + rows.length * rowH;
    const { svg, w, h } = prep('hov', H, `Monthly sea level anomalies along the Pacific coast, ${y0}–${y0 + 1}`);
    const n = 18;
    const x = d3.scaleBand().domain(d3.range(n)).range([ml, w - mr]).paddingInner(0.04);
    const y = (i) => h - mb - (i + 1) * rowH;
    const lim = US() ? 10 : 25;
    const color = diverging(divStops(), [-lim, 0, lim]);
    const g = svg.append('g');
    rows.forEach((r, i) => {
      r.v.forEach((v, k) => {
        if (v == null) return;
        g.append('rect').attr('x', x(k)).attr('y', y(i)).attr('width', x.bandwidth()).attr('height', rowH - 1).style('fill', color(toA(v)))
          .on('pointermove', (e) => showTip(e, `${r.s.name}, ${r.s.country}`, [{ value: fA(v), label: ` ${MONTHS[k % 12]} ${y0 + Math.floor(k / 12)}` }]))
          .on('pointerleave', hideTip);
      });
      const soc = REGION_MEMBERS.includes(r.s.id);
      const show = soc || i % 2 === 0 || rows.length < 26;
      if (show) text(svg, ml - 5, y(i) + rowH - 2, r.s.name, { anchor: 'end', size: rowH < 10 ? 9 : 10, fill: soc ? 'var(--ink)' : 'var(--muted)', weight: soc ? 700 : 500 });
    });
    d3.range(n).forEach((k) => { if (k % 3 === 0) text(svg, x(k) + x.bandwidth() / 2, h - mb + 13, MONTHS[k % 12], { anchor: 'middle', size: 10 }); });
    text(svg, x(0), h - 3, String(y0), { size: 10, fill: 'var(--ink-2)', weight: 600 });
    text(svg, x(12), h - 3, String(y0 + 1), { size: 10, fill: 'var(--ink-2)', weight: 600 });
    $('hov-lo').textContent = `−${lim} ${uA()}`; $('hov-hi').textContent = `+${lim} ${uA()}`;
    const c = $('hov-legend'), ctx = c.getContext('2d');
    for (let i = 0; i < c.width; i++) { ctx.fillStyle = color(-lim + (2 * lim * i) / (c.width - 1)); ctx.fillRect(i, 0, 1, c.height); }
    $('hov-title').textContent = y0 === 2026 ? 'Month by month, south to north: 2026 so far' : `Month by month, south to north: ${y0}–${String(y0 + 1).slice(2)}`;
  }

  // ------------------------------------------------------------------ case files
  function renderCases(st) {
    const m = st.m;
    const hind = m.hind.filter((r) => r[1] >= 1.5).sort((a, b) => b[1] - a[1]);
    const tbl = $('cases-table'); tbl.replaceChildren();
    head(tbl, ['Winter', 'Strength (RONI)', 'Traditional ONI', 'Observed', 'Model said (middle, 8 in 10)', 'Outcome'], (i) => i > 0 && i < 5);
    const tb = tbl.createTBody();
    hind.forEach(([Y, x, obs, q10, q50, q90]) => {
      const tr = tb.insertRow();
      const oni = D.oni[YI(Y)];
      [sLabel(Y), signed(x) + (Y < 1951 ? '*' : ''), oni == null ? '–' : signed(oni), fmt(obs), `${fmt(q50)} (${fmtBare(q10)} to ${fmtBare(q90)})`].forEach((t, i) => cell(tr, t, i > 0 ? 'n' : ''));
      const c = tr.insertCell(); const pill = document.createElement('span');
      if (obs > q90) { pill.className = 'pill hi'; pill.textContent = 'Higher than range'; }
      else if (obs < q10) { pill.className = 'pill lo'; pill.textContent = 'Lower than range'; }
      else { pill.className = 'pill in'; pill.textContent = 'Inside range'; }
      c.append(pill);
    });
    const all = m.hind;
    const k = all.filter((r) => r[6] >= 0.1 && r[6] <= 0.9).length;
    $('cases-title').textContent = `Strong El Niño winters ${gAt()}, ${MEAS_SHORT[state.measure]}`;
    $('cases-sub').textContent = `Winters with a November–January relative index of +1.5 °C or more, winters ${periodLabel(m)}, strongest first. “Model said” is the leave-one-out hindcast from El Niño strength alone${isWL() ? '; values are above MHHW at today’s sea level' : ''}.${hind.some((r) => r[0] < 1951) ? ' * Index reconstructed from ERSSTv5.' : ''}`;
    const share = all.length ? k / all.length : 0;
    $('cases-foot').textContent = all.length ? `Across all ${all.length} El Niño winters with an index of +1.0 °C or more in this record, ${k} landed inside the model's 8‑in‑10 range (${pct(share)}). ` +
      (share < 0.72 ? 'A well-calibrated method would capture about 8 in 10, so treat the ranges on this page as a lower bound on the real uncertainty.' : 'That is close to the 8 in 10 a well-calibrated method should capture.') : '';
  }

  // ------------------------------------------------------------------ methods and bound text
  function renderMethods(st) {
    const sk = st.m.skill;
    const p = (v) => (v == null ? '–' : `${v >= 0 ? '' : '−'}${f0(Math.abs(100 * v))}%`);
    $('val-text').textContent = `Leave-one-out cross-validation compares the model with a climatology that ignores El Niño, using the continuous ranked probability score (CRPS) [21]. For ${gName()}, ${MEAS_SHORT[state.measure]}, winters ${periodLabel(st.m)}, the skill over climatology is ${p(sk.all)} across all winters, ${p(sk.en)} in El Niño winters and ${p(sk.strong)} in strong El Niño winters. Positive numbers mean the model beats climatology. For comparison, the same test gives roughly 5–10% for Southern California winter rainfall on the companion page: the sea follows El Niño far more closely than rain does.`;
    document.querySelectorAll('[data-bind="recon-r"]').forEach((e) => { e.textContent = d3.format('.3f')(D.meta.recon.r); });
    document.querySelectorAll('[data-bind="nboot"]').forEach((e) => { e.textContent = String(D.meta.nboot); });
    document.querySelectorAll('[data-bind="win"]').forEach((e) => { e.textContent = String(D.meta.win); });
    const rg = ACTIVE_FOR[state.gauge] || state.gauge;
    const Gr = GAUGE[rg];
    if (Gr && Gr.rise_since) {
      const rs = Gr.rise_since;
      $('cav-rise').textContent = `The baseline sea level at ${Gr.name} is about ${both(rs['1983'])} higher than in the winter of 1982–83 and ${both(rs['1998'])} higher than in 1997–98, a trend of ${f1(Gr.trend_recent)} mm a year over the last 19 years. The same El Niño boost now lands on that higher starting point. The “at 2026–27 sea level” figures on this page add the rise back in; tide tables do not.`;
    }
    const dj = series(state.gauge, 'djf', 'modern');
    const strongW = dj.filter((r) => r.x >= 1.5);
    const w16 = dj.find((r) => r.Y === 2016), w98 = dj.find((r) => r.Y === 1998);
    if (strongW.length >= 3) {
      const lo = strongW.reduce((a, b) => (b.v < a.v ? b : a)), hi = strongW.reduce((a, b) => (b.v > a.v ? b : a));
      $('cav-spread').textContent = `The response depends on how much of El Niño's warmth reaches the coast through the ocean and on how stormy the winter is. ${gAt().replace(/^./, (c) => c.toUpperCase())}, strong El Niño winters have ranged from ${fA(lo.v)} (${sLabel(lo.Y)}) to ${fA(hi.v)} (${sLabel(hi.Y)}) in December–February.` +
        (w16 && w98 ? ` 1997–98 and 2015–16 were almost equally strong, yet the winter sea stood ${fA(w98.v)} and ${fA(w16.v)} above normal.` : '');
    }
    const lb = GAUGE.lb;
    if (lb) $('cav-land').textContent = `Tide gauges record relative sea level, so sinking or rising land shows up as sea level change. Terminal Island in Long Beach sank several meters as oil was pumped from beneath it in the mid-1900s; its gauge shows sea level falling ${f1(Math.abs(lb.trend_full))} mm a year in ${lb.first.slice(0, 4)}–${lb.last.slice(0, 4)}, while every neighboring gauge shows it rising. This analysis removes each gauge's long-term trend, which takes out slow land motion but keeps the year-to-year swings that El Niño causes.`;
  }

  // ------------------------------------------------------------------ controls and update loop
  function setMu(v) {
    state.mu = Math.round(v * 100) / 100;
    $('mu').value = String(Math.min(3.8, Math.max(0.5, state.mu)));
    syncOutputs();
    schedule('fc');
  }
  function syncOutputs() {
    $('mu-out').textContent = signed(state.mu) + ' °C';
    $('sigma-out').textContent = '± ' + f2(state.sigma) + ' °C';
  }
  function checkMeasure() {
    const sel = $('measure');
    [...sel.options].forEach((o) => { o.disabled = !hasMeasure(state.gauge, o.value); });
    if (!hasMeasure(state.gauge, state.measure)) { state.measure = 'djf'; sel.value = 'djf'; }
    const ok = canFall();
    const fb = $('seg-fall').querySelector('[data-v="1"]');
    fb.disabled = !ok;
    fb.title = ok ? '' : 'Only for gauges with data in fall 2026';
    const on = ok && state.fall;   // state.fall keeps the reader's preference when a gauge cannot use it
    [...$('seg-fall').querySelectorAll('button')].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === (on ? '1' : '0'))));
  }
  // One place to change the gauge: the picker at the top, the settings-bar menu and the gauge map all call this.
  function setGauge(id) {
    if (!GAUGE[id] || !D.models[id]) return;
    state.gauge = id;
    $('gauge').value = id;
    syncGaugeList();
    checkMeasure();
    schedule('all');
  }
  // The picker at the top of the page lists every gauge by city, with the years it covers.
  function buildGaugeList() {
    const box = $('gauge-list');
    if (!box) return;
    const short = { reg: 'Regional average', lb: 'Long Beach', en: 'Ensenada, Mexico' };
    const years = (g) => (g.kind === 'active' || g.kind === 'region' ? `since ${g.first.slice(0, 4)}` : `${g.first.slice(0, 4)}–${g.last.slice(0, 4)}`);
    const groups = [['Running today', ['reg', 'sd', 'lj', 'la', 'sm', 'sb']], ['Past records only', ['nb', 'lb', 'ri', 'ph', 'en']]];
    for (const [lab, ids] of groups) {
      const grp = document.createElement('div'); grp.className = 'gp-group';
      const h = document.createElement('p'); h.className = 'gp-lab'; h.textContent = lab; grp.append(h);
      const grid = document.createElement('div'); grid.className = 'gp-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', lab);
      ids.filter((id) => GAUGE[id] && D.models[id]).forEach((id) => {
        const g = GAUGE[id];
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gp-btn'; b.dataset.g = id; b.title = g.sub || '';
        b.innerHTML = `<span class="nm"></span><span class="yr"></span>`;
        b.querySelector('.nm').textContent = short[id] || g.name;
        b.querySelector('.yr').textContent = years(g);
        b.addEventListener('click', () => setGauge(id));
        grid.append(b);
      });
      grp.append(grid);
      box.append(grp);
    }
    syncGaugeList();
  }
  function syncGaugeList() {
    document.querySelectorAll('#gauge-list .gp-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === state.gauge)));
    const g = GAUGE[state.gauge], el = $('gp-sel');
    if (!el || !g) return;
    el.textContent = g.kind === 'region' ? `Showing the ${g.sub.charAt(0).toLowerCase() + g.sub.slice(1)}.`
      : `Showing ${g.name}: ${g.sub.replace(' (retired)', '')}, monthly records ${g.first.slice(0, 4)}–${g.last.slice(0, 4)}.` +
        (g.kind === 'retired' ? ' This gauge has been retired.' : g.kind === 'mexico' ? ' No later data in this record.' : '');
  }
  function initControls() {
    const sel = $('gauge');
    const groups = [['Region', ['reg']], ['Running gauges', ['sd', 'lj', 'la', 'sm', 'sb']], ['Retired gauges', ['nb', 'lb', 'ri', 'ph']], ['Baja California', ['en']]];
    for (const [lab, ids] of groups) {
      const og = document.createElement('optgroup'); og.label = lab;
      ids.filter((id) => GAUGE[id] && D.models[id]).forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = GAUGE_LABEL[id] || GAUGE[id].name; o.title = GAUGE[id].sub || ''; og.append(o); });
      sel.append(og);
    }
    sel.value = state.gauge;
    sel.addEventListener('change', () => setGauge(sel.value));
    buildGaugeList();
    const ms = $('measure');
    Object.keys(D.measures).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = MEAS_OPT[k] || D.measures[k].label; ms.append(o); });
    ms.value = state.measure;
    ms.addEventListener('change', () => { state.measure = ms.value; checkMeasure(); schedule('all'); });
    $('mu').addEventListener('input', (e) => { state.mu = +e.target.value; syncOutputs(); schedule('fc'); });
    $('sigma').addEventListener('input', (e) => { state.sigma = +e.target.value; syncOutputs(); schedule('fc'); });
    $('reset').addEventListener('click', () => { state.sigma = FC.ndj_sigma; $('sigma').value = String(state.sigma); setMu(FC.ndj_median); });
    const seg = (id, key, conv2 = (v) => v, scope = 'all', after) => {
      const el = $(id);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
        state[key] = conv2(b.dataset.v);
        [...el.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (after) after(); else schedule(scope);
      });
    };
    seg('seg-period', 'period');
    seg('seg-extrap', 'extrap');
    seg('seg-fall', 'fall', (v) => v === '1', 'all', () => { checkMeasure(); schedule('all'); });
    seg('seg-units', 'units');
    seg('seg-altrel', 'altRel', (v) => v === '1', 'none', renderAlt);
    seg('seg-top', 'top', (v) => v, 'none', renderTop);
    $('mu').value = String(state.mu); $('sigma').value = String(state.sigma);
    syncOutputs();
    renderPresets();
    renderAltButtons();
    renderHovButtons();
    checkMeasure();
  }

  const pending = new Set();
  let raf = 0;
  function schedule(scope) { pending.add(scope); if (!raf) raf = requestAnimationFrame(flush); }
  function flush() {
    raf = 0;
    const all = pending.has('all');
    pending.clear();
    const st = outlookStats();
    renderTiles(st);
    renderLede();
    renderStripes();
    renderRuler();
    renderOutlook(st);
    renderKing();
    renderScatter(st);
    renderTS(st);
    renderTraj();
    if (all) {
      renderGaugeMap();
      renderCats(st);
      renderAlt();
      renderMonthly();
      renderLag();
      renderExtremes();
      renderTop();
      renderCoastMap();
      renderHov();
      renderCases(st);
      renderMethods(st);
    }
  }

  initControls();
  schedule('all');
  let lastW = window.innerWidth;
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 4) { lastW = window.innerWidth; schedule('all'); } }, 160);
  });
  const rerender = () => schedule('all');
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender); } catch (e) { /* older browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
