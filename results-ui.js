// Renders the Raw Results / Interpreted Results sub-tabs inside the Results
// page. Depends on Assessment, Biomech, Interpretation, RawStore already
// being loaded, and on a `$` (getElementById) + `escapeHtml` helper being
// present in the enclosing page scope (passed in via ResultsUI.init).
(function (global) {
  let $, escapeHtml, currentTrialName = null, rawCache = null, replayState = null;

  // ---- Small render helpers ----
  function metricGrid(items) {
    return `<div class="metric-grid">${items.map(([label, value, flag]) => `<div class="metric-card${flag ? ' flag' : ''}"><small>${escapeHtml(label)}</small><b>${value == null ? '—' : escapeHtml(String(value))}</b></div>`).join('')}</div>`;
  }
  function fmt(v, unit = '', d = 1) { return v == null ? '—' : `${v.toFixed(d)}${unit}`; }

  // ---- Hand-rolled canvas time-series chart with hover + click-to-seek ----
  function drawChart(canvas, seriesList, { onSeek, yLabel = '' } = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const allPts = seriesList.flatMap(s => s.samples || []);
    const allT = allPts.map(p => p.t);
    const allV = allPts.map(p => p.value).filter(v => v != null);
    if (!allT.length || !allV.length) { ctx.fillStyle = '#94a3b8'; ctx.font = '12px system-ui'; ctx.fillText('No data available for this trial.', 10, h / 2); return; }
    const tMin = 0, tMax = Math.max(...allT, 1);
    const vMin = Math.min(...allV), vMax = Math.max(...allV);
    const vRange = (vMax - vMin) || 1;
    const pad = { l: 46, r: 12, t: 10, b: 22 };
    const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    const xOf = t => pad.l + (t - tMin) / (tMax - tMin || 1) * plotW;
    const yOf = v => pad.t + plotH - (v - vMin) / vRange * plotH;
    ctx.strokeStyle = '#e6e9ee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(pad.l + plotW, pad.t + plotH); ctx.stroke();
    ctx.fillStyle = '#707c8c'; ctx.font = '10px system-ui';
    ctx.fillText(vMax.toFixed(1), 2, pad.t + 8); ctx.fillText(vMin.toFixed(1), 2, pad.t + plotH);
    ctx.fillText('0s', pad.l, h - 6); ctx.fillText(tMax.toFixed(0) + 's', pad.l + plotW - 18, h - 6);
    if (yLabel) { ctx.save(); ctx.translate(10, pad.t + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(yLabel, 0, 0); ctx.restore(); }
    seriesList.forEach(s => {
      ctx.strokeStyle = s.color || '#0f9488'; ctx.lineWidth = 1.6; ctx.beginPath();
      let started = false;
      (s.samples || []).forEach(p => { if (p.value == null) { started = false; return; } const x = xOf(p.t), y = yOf(p.value); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
      ctx.stroke();
    });
    canvas._chartMeta = { xOf, tMin, tMax, pad, plotW };
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const t = Math.max(tMin, Math.min(tMax, tMin + (px - pad.l) / plotW * (tMax - tMin)));
      canvas.title = `t=${t.toFixed(2)}s`;
      if (onSeek) onSeek(t, false);
    };
    canvas.onclick = e => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const t = Math.max(tMin, Math.min(tMax, tMin + (px - pad.l) / plotW * (tMax - tMin)));
      if (onSeek) onSeek(t, true);
    };
  }
  function chartCard(title, seriesList, unit) {
    const id = `chart-${Math.random().toString(36).slice(2)}`;
    setTimeout(() => { const c = $(id); if (c) drawChart(c, seriesList, { onSeek: (t, click) => { if (click) seekReplay(t); }, yLabel: unit }); }, 0);
    return `<div class="chart-block"><small>${escapeHtml(title)}</small><canvas id="${id}" width="640" height="150" style="width:100%;height:150px"></canvas></div>`;
  }
  function swayPathCard(points) {
    const id = `chart-${Math.random().toString(36).slice(2)}`;
    setTimeout(() => {
      const canvas = $(id); if (!canvas) return;
      const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!points.length) { ctx.fillStyle = '#94a3b8'; ctx.fillText('No data', 10, h / 2); return; }
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const rangeX = (maxX - minX) || 1, rangeY = (maxY - minY) || 1, pad = 16;
      const xOf = x => pad + (x - minX) / rangeX * (w - 2 * pad), yOf = y => pad + (y - minY) / rangeY * (h - 2 * pad);
      ctx.strokeStyle = '#0f9488'; ctx.lineWidth = 1.4; ctx.beginPath();
      points.forEach((p, i) => { const x = xOf(p.x), y = yOf(p.y); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.fillStyle = '#f2b134'; ctx.beginPath(); ctx.arc(xOf(xs[0]), yOf(ys[0]), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5f7e'; ctx.beginPath(); ctx.arc(xOf(xs[xs.length - 1]), yOf(ys[ys.length - 1]), 4, 0, Math.PI * 2); ctx.fill();
    }, 0);
    return `<div class="chart-block"><small>Sway path (2D, stabilometry-style; green=start, red=end)</small><canvas id="${id}" width="300" height="240" style="width:100%;max-width:300px;height:240px;background:#fbfbfc;border-radius:10px"></canvas></div>`;
  }

  // ---- Interpreted Results ----
  function regionSection(title, bodyHtml, openByDefault) {
    return `<details class="region-section"${openByDefault ? ' open' : ''}><summary>${escapeHtml(title)}</summary>${bodyHtml}</details>`;
  }

  function renderInterpretedView(container, record) {
    const r = record.interpreted;
    if (!r) { container.innerHTML = '<p>No interpreted data for this trial (interpretation failed or trial predates this feature).</p>'; return; }
    const o = r.whole_body_overview;
    let html = '';
    html += `<div class="metric-grid overview-grid">${metricGrid([
      ['Trial', r.trial_name.replace(/_/g, ' ')],
      ['Duration', `${o.duration_seconds}s`],
      ['Tracking quality', `${o.tracking_quality} (${Math.round((o.tracking_quality_fraction ?? 0) * 100)}%)`, o.tracking_quality === 'unreliable'],
      ['Overall sway', fmt(o.overall_sway, ' units', 3)],
      ['Max trunk lean', fmt(o.max_trunk_lean, '°')],
      ['Pelvic tilt range', fmt(o.pelvic_tilt_range, '°')],
      ['Left knee ROM', fmt(o.left_knee_rom, '°')],
      ['Right knee ROM', fmt(o.right_knee_rom, '°')],
      ['Foot corrections', o.foot_corrections_total],
      ['Asymmetry flagged', o.major_asymmetry_flagged ? 'Yes' : 'No', o.major_asymmetry_flagged],
    ])}</div>`;
    html += `<div class="movement-summary"><strong>Movement Summary</strong><ul>${(r.movement_summary || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`;

    html += regionSection('Balance & Stability', metricGrid([
      ['Total sway path', fmt(r.balance_stability.total_sway_path, ' units', 3)],
      ['Sway velocity', fmt(r.balance_stability.sway_velocity, ' units/s', 3)],
      ['Max ML excursion', fmt(r.balance_stability.max_excursion_ml, ' units', 3)],
      ['Max AP excursion', fmt(r.balance_stability.max_excursion_ap, ' units', 3)],
      ['Sway area', fmt(r.balance_stability.sway_area, ' units²', 4)],
    ]) + chartCard('Mediolateral sway over time', [{ samples: r.balance_stability.mediolateral_sway.samples, color: '#0f9488' }], 'normalized units')
      + chartCard('Anterior/posterior sway over time', [{ samples: r.balance_stability.anterior_posterior_sway.samples, color: '#f2b134' }], 'normalized units')
      + swayPathCard(r.balance_stability.body_center_path), true);

    html += regionSection('Head & Neck', metricGrid([
      ['Mean head tilt', fmt(r.head_neck.mean_tilt, '°')], ['Range', fmt(r.head_neck.range, '°')], ['Variability', fmt(r.head_neck.std, '°')],
    ]) + `<p style="font-size:.82rem">${escapeHtml(r.head_neck.confidence_note)}</p>` + chartCard('Head tilt over time', [{ samples: r.head_neck.head_tilt.samples }], 'degrees'));

    html += regionSection('Shoulders', metricGrid([
      ['Mean tilt', fmt(r.shoulders.mean_tilt, '°')], ['Max left tilt', fmt(r.shoulders.max_left_tilt, '°')], ['Max right tilt', fmt(r.shoulders.max_right_tilt, '°')],
      ['Range', fmt(r.shoulders.range, '°')], ['Variability', fmt(r.shoulders.std, '°')],
    ]) + chartCard('Shoulder tilt over time', [{ samples: r.shoulders.shoulder_tilt.samples }], 'degrees'));

    html += regionSection('Trunk', metricGrid([
      ['Mean lean', fmt(r.trunk.mean_lean, '°')], ['Max deviation', fmt(r.trunk.max_deviation, '°')], ['Direction', r.trunk.dominant_direction],
      ['Range', fmt(r.trunk.range, '°')], ['Variability', fmt(r.trunk.std, '°')], ['Time of max', fmt(r.trunk.timestamp_of_max, 's')],
    ]) + `<p style="font-size:.82rem">${escapeHtml(r.trunk.camera_view_note)}</p>` + chartCard('Trunk lean over time', [{ samples: r.trunk.trunk_lean.samples }], 'degrees'));

    html += regionSection('Pelvis / Hips', metricGrid([
      ['Mean pelvic tilt', fmt(r.pelvis_hips.mean_tilt, '°')], ['Peak left drop', fmt(r.pelvis_hips.peak_left_drop, '°')], ['Peak right drop', fmt(r.pelvis_hips.peak_right_drop, '°')],
      ['Range', fmt(r.pelvis_hips.range, '°')], ['Variability', fmt(r.pelvis_hips.std, '°')],
    ]) + chartCard('Pelvic tilt over time', [{ samples: r.pelvis_hips.pelvic_tilt.samples }], 'degrees')
      + chartCard('Hip-thigh-trunk angle (estimate)', [{ samples: r.pelvis_hips.left_hip_angle.samples, color: '#0f9488' }, { samples: r.pelvis_hips.right_hip_angle.samples, color: '#f2b134' }], 'degrees'));

    function legSection(side, leg) {
      return regionSection(`${side === 'left' ? 'Left' : 'Right'} Leg`, metricGrid([
        ['Mean knee angle', fmt(leg.knee.mean_angle, '°')], ['Knee ROM', fmt(leg.knee.angle_range, '°')],
        ['Peak medial deviation', fmt(leg.knee.peak_medial_deviation, ' units', 3)], ['Peak lateral deviation', fmt(leg.knee.peak_lateral_deviation, ' units', 3)],
        ['Foot corrections', leg.ankle.correction_count], ['Tracking confidence', fmt((leg.knee.tracking_confidence ?? 0) * 100, '%', 0)],
      ]));
    }
    html += legSection('left', r.left_leg) + legSection('right', r.right_leg);

    function kneeDetail(side, knee) {
      return `<div class="split-col"><strong>${side === 'left' ? 'Left' : 'Right'} Knee</strong>${metricGrid([
        ['Mean', fmt(knee.mean_angle, '°')], ['Min', fmt(knee.min_angle, '°')], ['Max', fmt(knee.max_angle, '°')], ['Range', fmt(knee.angle_range, '°')],
        ['Peak medial dev.', fmt(knee.peak_medial_deviation, '', 3)], ['Peak lateral dev.', fmt(knee.peak_lateral_deviation, '', 3)],
        ['Time of peak dev.', fmt(knee.timestamp_of_peak_deviation, 's')], ['Variability', fmt(knee.variability, '', 3)],
      ])}${chartCard('Knee angle over time', [{ samples: knee.knee_angle.samples }], 'degrees')}${chartCard('Knee alignment (medial/lateral) over time', [{ samples: knee.knee_alignment.samples }], 'normalized units')}<p style="font-size:.78rem">${escapeHtml(knee.label)}</p></div>`;
    }
    html += regionSection('Knees', `<div class="split-row">${kneeDetail('left', r.left_knee)}${kneeDetail('right', r.right_knee)}</div>`);

    function ankleDetail(side, a) {
      const unavailable = !a.angle_available ? `<p class="warn" style="font-size:.82rem">${escapeHtml(a.unavailable_reason)}</p>` : '';
      return `<div class="split-col"><strong>${side === 'left' ? 'Left' : 'Right'} Ankle/Foot</strong>${metricGrid([['Corrections', a.correction_count], ['Tracking confidence', fmt((a.tracking_confidence ?? 0) * 100, '%', 0)]])}${unavailable}${a.angle_available ? chartCard('Ankle angle over time', [{ samples: a.ankle_angle.samples }], 'degrees') : ''}</div>`;
    }
    html += regionSection('Ankles / Feet', `<div class="split-row">${ankleDetail('left', r.ankles_feet.left)}${ankleDetail('right', r.ankles_feet.right)}</div>${metricGrid([['Mean stance width', fmt(r.ankles_feet.stance_width.mean, ' units', 3)]])}`);

    html += regionSection('Symmetry', `
      <table class="summary-table"><thead><tr><th>Measurement</th><th>Left</th><th>Right</th><th>Difference</th><th>Symmetry index</th></tr></thead><tbody>
      <tr><td>Min knee angle (flexion)</td><td>${fmt(r.symmetry.knee_flexion.left, '°')}</td><td>${fmt(r.symmetry.knee_flexion.right, '°')}</td><td>${fmt(r.symmetry.knee_flexion.difference, '°')}</td><td>${fmt(r.symmetry.knee_flexion.symmetry_index, '%')}</td></tr>
      <tr><td>Knee range of motion</td><td>${fmt(r.symmetry.knee_rom.left, '°')}</td><td>${fmt(r.symmetry.knee_rom.right, '°')}</td><td>${fmt(r.symmetry.knee_rom.difference, '°')}</td><td>${fmt(r.symmetry.knee_rom.symmetry_index, '%')}</td></tr>
      <tr><td>Foot corrections</td><td>${r.symmetry.foot_corrections.left}</td><td>${r.symmetry.foot_corrections.right}</td><td>${r.symmetry.foot_corrections.difference}</td><td>—</td></tr>
      </tbody></table>`);

    html += regionSection('Events Timeline', r.events_timeline.length ? `<ul class="events-list">${r.events_timeline.map(e => `<li><button class="event-jump" data-t="${e.timestamp_seconds}">${e.timestamp_seconds.toFixed(1)}s</button> — ${escapeHtml(e.description)}</li>`).join('')}</ul>` : '<p>No notable events detected in this trial.</p>');

    html += regionSection('Trial-Thirds Trend', `
      <table class="summary-table"><thead><tr><th>Metric</th><th>Early (0–${r.thirds_analysis.windows.early[1].toFixed(1)}s)</th><th>Middle</th><th>Late (${r.thirds_analysis.windows.late[0].toFixed(1)}–${r.thirds_analysis.windows.late[1].toFixed(1)}s)</th></tr></thead><tbody>
      ${Object.entries(r.thirds_analysis.metrics).map(([name, w]) => `<tr><td>${escapeHtml(name.replace(/_/g, ' '))}</td><td>mean ${fmt(w.early.mean, '', 3)}, std ${fmt(w.early.std, '', 3)}</td><td>mean ${fmt(w.middle.mean, '', 3)}, std ${fmt(w.middle.std, '', 3)}</td><td>mean ${fmt(w.late.mean, '', 3)}, std ${fmt(w.late.std, '', 3)}</td></tr>`).join('')}
      </tbody></table>`);

    html += regionSection('Measurement Quality', metricGrid([
      ['Overall tracking quality', `${Math.round((r.measurement_quality.overall ?? 0) * 100)}% (${r.measurement_quality.tier})`, r.measurement_quality.tier === 'unreliable'],
      ['Frames excluded', `${r.measurement_quality.excludedFrames} / ${r.measurement_quality.totalFrames}`],
      ['Normalization reference', r.normalization.scale_reference],
      ['Camera view', r.camera_orientation],
    ]) + `<table class="summary-table"><thead><tr><th>Region</th><th>Reliable frames</th></tr></thead><tbody>${Object.entries(r.measurement_quality.byRegion).map(([k, v]) => `<tr><td>${escapeHtml(k.replace(/_/g, ' '))}</td><td>${Math.round((v ?? 0) * 100)}%</td></tr>`).join('')}</tbody></table>`);

    html += regionSection('Trial Comparison', renderComparisonSection());
    html += regionSection('Progress Over Time', renderProgressSection(r.trial_name, o));

    container.innerHTML = html;
    container.querySelectorAll('.event-jump').forEach(btn => btn.onclick = () => seekReplay(+btn.dataset.t));
  }

  function renderComparisonSection() {
    const trials = currentAssessment?.trials || {};
    const eo = trials.double_leg_eyes_open?.interpreted, ec = trials.double_leg_eyes_closed?.interpreted;
    const cmp1 = (eo && ec) ? Interpretation.calculateEyesOpenClosedComparison(eo, ec, 'Double-leg') : null;
    const roEo = trials.right_leg_eyes_open?.interpreted, roEc = trials.right_leg_eyes_closed?.interpreted;
    const cmp2 = (roEo && roEc) ? Interpretation.calculateEyesOpenClosedComparison(roEo, roEc, 'Right single-leg') : null;
    const loEo = trials.left_leg_eyes_open?.interpreted, loEc = trials.left_leg_eyes_closed?.interpreted;
    const cmp3 = (loEo && loEc) ? Interpretation.calculateEyesOpenClosedComparison(loEo, loEc, 'Left single-leg') : null;
    const cmpLR = (trials.right_leg_eyes_open?.interpreted && trials.left_leg_eyes_open?.interpreted) ? Interpretation.calculateLeftRightSingleLegComparison(trials.left_leg_eyes_open.interpreted, trials.right_leg_eyes_open.interpreted) : null;
    function row(label, c) { if (!c) return `<tr><td>${escapeHtml(label)}</td><td colspan="3">Not enough trials completed yet.</td></tr>`; return `<tr><td>${escapeHtml(label)}</td><td>Open: ${fmt(c.sway_open, ' units', 3)}</td><td>Closed: ${fmt(c.sway_closed, ' units', 3)}</td><td>Change: ${c.sway_change_percent == null ? '—' : (c.sway_change_percent > 0 ? '+' : '') + c.sway_change_percent + '%'}</td></tr>`; }
    let html = `<table class="summary-table"><thead><tr><th>Comparison</th><th colspan="3">Sway (total path)</th></tr></thead><tbody>${row('Double-leg: open vs closed', cmp1)}${row('Right single-leg: open vs closed', cmp2)}${row('Left single-leg: open vs closed', cmp3)}</tbody></table>`;
    if (cmpLR) html += `<p style="margin-top:8px">Left vs right single-leg sway (eyes open): Left = ${fmt(cmpLR.sway_left, ' units', 3)}, Right = ${fmt(cmpLR.sway_right, ' units', 3)}. Left corrections: ${cmpLR.corrections_left}, Right corrections: ${cmpLR.corrections_right}.</p>`;
    return html;
  }

  function renderProgressSection(trialName, overview) {
    const history = (() => { try { return JSON.parse(localStorage.getItem('assessment-history') || '[]'); } catch { return []; } })();
    const priorOverviews = history.map(h => h.assessment?.trials?.find(t => t.trial_name === trialName)?.interpreted?.whole_body_overview).filter(Boolean);
    if (!priorOverviews.length) return '<p>No previous sessions with this trial yet. Progress comparisons will appear here once you complete more than one full assessment.</p>';
    const baseline = priorOverviews[0], previous = priorOverviews[priorOverviews.length - 1];
    const vsBaseline = Interpretation.compareToBaseline(overview, baseline);
    const vsPrevious = Interpretation.compareToBaseline(overview, previous);
    function line(cmp, label) { if (!cmp) return ''; return `<li>Overall sway change ${escapeHtml(label)}: ${fmt(cmp.overall_sway_change, ' units', 3)}. Max trunk lean change: ${fmt(cmp.max_trunk_lean_change, '°')}. Pelvic tilt range change: ${fmt(cmp.pelvic_tilt_range_change, '°')}. Foot corrections change: ${cmp.foot_corrections_change ?? '—'}.</li>`; }
    return `<ul>${line(vsBaseline, 'vs. baseline (first recorded session)')}${line(vsPrevious, 'vs. previous session')}</ul><p style="font-size:.8rem">Changes are reported as measured differences only; whether a change represents improvement depends on the specific metric and is for the clinician to judge.</p>`;
  }

  // ---- Raw Results ----
  async function renderRawView(container, record) {
    container.innerHTML = '<p>Loading raw data…</p>';
    const raw = await RawStore.loadRawTrial(record.trial_id).catch(() => null);
    if (!raw || !raw.cameraFrames?.length) { container.innerHTML = '<p>No raw data stored for this trial (it may predate this feature, or storage may be unavailable in this browser).</p>'; return; }
    rawCache = raw;
    const frames = raw.cameraFrames;
    const landmarkNames = Object.keys(frames[0].landmarks);

    let html = `
      <div class="button-row secondary-row" style="margin-bottom:6px">
        <button id="raw-export-csv" class="outline">Export CSV</button>
        <button id="raw-export-json" class="outline">Export JSON</button>
      </div>
      <div class="replay-panel">
        <div class="stage" id="replay-stage" style="max-width:360px;aspect-ratio:3/3.3"><canvas id="replay-canvas" width="480" height="540" style="width:100%;height:100%"></canvas></div>
        <div class="replay-controls">
          <button id="replay-back" class="outline">⏮</button>
          <button id="replay-play" class="outline">▶ Play</button>
          <button id="replay-fwd" class="outline">⏭</button>
          <input id="replay-scrub" type="range" min="0" max="${frames.length - 1}" value="0" style="flex:1">
          <select id="replay-speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
          <span id="replay-time">0.00s / frame 0</span>
        </div>
      </div>
      <div class="raw-filters">
        <label>Body point <select id="raw-filter-point"><option value="">All</option>${landmarkNames.map(n => `<option value="${n}">${n.replace(/_/g, ' ')}</option>`).join('')}</select></label>
        <label>Axis <select id="raw-filter-axis"><option value="">X/Y/Z/Confidence</option><option value="x">X only</option><option value="y">Y only</option><option value="z">Z only</option><option value="confidence">Confidence only</option></select></label>
        <label>Min confidence <input id="raw-filter-confidence" type="number" min="0" max="1" step="0.05" value="0"></label>
        <label>Chart point <select id="raw-chart-point">${landmarkNames.map(n => `<option value="${n}"${n === 'left_knee' ? ' selected' : ''}>${n.replace(/_/g, ' ')}</option>`).join('')}</select></label>
      </div>
      <div id="raw-chart-holder"></div>
      <div class="table-wrap"><table class="summary-table raw-table" id="raw-table"><thead></thead><tbody></tbody></table></div>
      <p style="font-size:.78rem">Raw coordinates are exactly as the pose model output them (normalized image coordinates 0–1, not spatially calibrated). Frame count: ${frames.length}. Phone samples: ${raw.phoneSamples?.length || 0}.</p>
    `;
    container.innerHTML = html;

    function renderTable() {
      const point = $('raw-filter-point').value, axis = $('raw-filter-axis').value, minConf = parseFloat($('raw-filter-confidence').value) || 0;
      const points = point ? [point] : landmarkNames;
      const axes = axis ? [axis] : ['x', 'y', 'z', 'confidence'];
      const thead = $('raw-table').querySelector('thead'), tbody = $('raw-table').querySelector('tbody');
      let cols = ['Frame', 'Time (s)'];
      for (const p of points) for (const ax of axes) cols.push(`${p.replace(/_/g, ' ')} ${ax}`);
      thead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      const rows = frames.map((f, i) => {
        let show = true;
        if (minConf > 0) show = points.some(p => (f.landmarks[p]?.confidence ?? 0) >= minConf);
        if (!show) return null;
        let cells = [i, f.timestamp_seconds.toFixed(3)];
        for (const p of points) for (const ax of axes) { const v = f.landmarks[p]?.[ax]; cells.push(v == null ? '—' : (typeof v === 'number' ? v.toFixed(4) : v)); }
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      }).filter(Boolean);
      tbody.innerHTML = rows.slice(0, 500).join('') + (rows.length > 500 ? `<tr><td colspan="${cols.length}">…and ${rows.length - 500} more frames (showing first 500; export CSV for the full set).</td></tr>` : '');
    }
    function renderRawChart() {
      const point = $('raw-chart-point').value;
      const series = ['x', 'y', 'z', 'confidence'].map((ax, i) => ({ samples: frames.map(f => ({ t: f.timestamp_seconds, value: f.landmarks[point]?.[ax] ?? null })), color: ['#0f9488', '#f2b134', '#7c8798', '#ff5f7e'][i] }));
      $('raw-chart-holder').innerHTML = chartCard(`${point.replace(/_/g, ' ')}: X (teal), Y (yellow), Z (gray), Confidence (pink)`, series, '');
    }
    $('raw-filter-point').onchange = renderTable; $('raw-filter-axis').onchange = renderTable; $('raw-filter-confidence').oninput = renderTable;
    $('raw-chart-point').onchange = renderRawChart;
    renderTable(); renderRawChart();

    $('raw-export-json').onclick = () => downloadFile(`${record.trial_name}-raw.json`, JSON.stringify(raw, null, 2), 'application/json');
    $('raw-export-csv').onclick = () => {
      const header = ['frame', 'time_s', ...landmarkNames.flatMap(n => [`${n}_x`, `${n}_y`, `${n}_z`, `${n}_confidence`])];
      const rows = frames.map((f, i) => [i, f.timestamp_seconds, ...landmarkNames.flatMap(n => { const p = f.landmarks[n] || {}; return [p.x, p.y, p.z, p.confidence]; })].join(','));
      downloadFile(`${record.trial_name}-raw.csv`, [header.join(','), ...rows].join('\n'), 'text/csv');
    };

    setupReplay(frames);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Skeleton replay ----
  const POSE_EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31], [24, 26], [26, 28], [28, 30], [28, 32], [0, 11], [0, 12]];

  function setupReplay(frames) {
    replayState = { frames, index: 0, playing: false, speed: 1, timer: null };
    drawReplayFrame(0);
    $('replay-scrub').oninput = () => { replayPause(); replayState.index = +$('replay-scrub').value; drawReplayFrame(replayState.index); };
    $('replay-play').onclick = () => replayState.playing ? replayPause() : replayPlay();
    $('replay-back').onclick = () => { replayPause(); replayState.index = Math.max(0, replayState.index - 1); drawReplayFrame(replayState.index); };
    $('replay-fwd').onclick = () => { replayPause(); replayState.index = Math.min(frames.length - 1, replayState.index + 1); drawReplayFrame(replayState.index); };
    $('replay-speed').onchange = () => { replayState.speed = +$('replay-speed').value; };
  }
  function replayPlay() {
    replayState.playing = true; $('replay-play').textContent = '⏸ Pause';
    const step = () => {
      if (!replayState.playing) return;
      replayState.index++;
      if (replayState.index >= replayState.frames.length) { replayPause(); return; }
      drawReplayFrame(replayState.index);
      const dt = Math.max(16, 33 / replayState.speed);
      replayState.timer = setTimeout(step, dt);
    };
    step();
  }
  function replayPause() { replayState.playing = false; clearTimeout(replayState.timer); const btn = $('replay-play'); if (btn) btn.textContent = '▶ Play'; }
  function drawReplayFrame(index) {
    const frame = replayState.frames[index]; if (!frame) return;
    $('replay-scrub').value = index;
    $('replay-time').textContent = `${frame.timestamp_seconds.toFixed(2)}s / frame ${index}`;
    const canvas = $('replay-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0c1116'; ctx.fillRect(0, 0, w, h);
    const names = Object.keys(frame.landmarks);
    const byIdx = {}; for (const n of names) byIdx[Assessment.LANDMARK_INDEX[n]] = frame.landmarks[n];
    ctx.strokeStyle = '#0f9488'; ctx.lineWidth = 3;
    for (const [a, b] of POSE_EDGES) { const pa = byIdx[a], pb = byIdx[b]; if (pa?.x != null && pb?.x != null) { ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke(); } }
    ctx.fillStyle = '#f2b134';
    for (const n of names) { const p = frame.landmarks[n]; if (p?.x != null) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2); ctx.fill(); } }
  }
  function seekReplay(t) {
    if (!replayState) return;
    replayPause();
    let best = 0, bestDiff = Infinity;
    replayState.frames.forEach((f, i) => { const diff = Math.abs(f.timestamp_seconds - t); if (diff < bestDiff) { bestDiff = diff; best = i; } });
    replayState.index = best; drawReplayFrame(best);
    $('replay-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- Public entry points ----
  function populateTrialSelect(selectEl, assessment) {
    const done = Assessment.TRIALS.filter(t => assessment.trials[t.trial_name]?.status === 'completed');
    selectEl.innerHTML = done.map(t => `<option value="${t.trial_name}">${escapeHtml(t.label)}</option>`).join('') || '<option value="">No completed trials yet</option>';
    if (done.length && !done.some(t => t.trial_name === currentTrialName)) currentTrialName = done[0].trial_name;
    if (currentTrialName) selectEl.value = currentTrialName;
  }

  global.ResultsUI = {
    init(deps) { $ = deps.$; escapeHtml = deps.escapeHtml; },
    populateTrialSelect,
    setCurrentTrial(name) { currentTrialName = name; },
    getCurrentTrial() { return currentTrialName; },
    renderInterpretedView, renderRawView,
  };
})(typeof window !== 'undefined' ? window : globalThis);
