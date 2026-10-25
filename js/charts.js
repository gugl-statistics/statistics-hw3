// ===================================================================
// charts.js - very small canvas plotting helper (lines, bars, points)
// plot(canvas, {x:[min,max], y:[min,max], xlog, ylog, xlabel, ylabel, series:[...]})
// series types:
//   {type:"line",  x:[], y:[], color, width, dash, alpha}
//   {type:"bars",  x:[], y:[], w, color, alpha}      (x = bar centers, w = bar width)
//   {type:"points",x:[], y:[], color, r}
//   {type:"fn",    f:(x)=>y, color, width, dash}     (drawn on the whole x range)
//   {type:"hline", y, color, dash}
// ===================================================================

const COLORS = {
  orange: "#ff8a1f", sky: "#5cc8f5", white: "#ffffff", grid: "rgba(255,255,255,0.09)",
  text: "#b9c6e4", bg: "#061536", grey: "#8fa3cc",
};

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((v) => v * mag).find((v) => span / v <= count) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const v = Math.pow(10, e);
    if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
  }
  return out;
}
function fmtTick(v, log) {
  if (log) {
    const e = Math.round(Math.log10(v));
    return e >= 0 && e <= 4 ? String(10 ** e) : "1e" + e;
  }
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 10000 || a < 0.001) return v.toExponential(0);
  return +v.toPrecision(4) + "";
}

function plot(canvas, o) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const L = 54, R = 12, T = 10, B = o.xlabel ? 40 : 26;
  const pw = W - L - R, ph = H - T - B;
  const tx = o.xlog ? (v) => L + (pw * (Math.log10(v) - Math.log10(o.x[0]))) / (Math.log10(o.x[1]) - Math.log10(o.x[0]))
                    : (v) => L + (pw * (v - o.x[0])) / (o.x[1] - o.x[0]);
  const ty = o.ylog ? (v) => T + ph - (ph * (Math.log10(v) - Math.log10(o.y[0]))) / (Math.log10(o.y[1]) - Math.log10(o.y[0]))
                    : (v) => T + ph - (ph * (v - o.y[0])) / (o.y[1] - o.y[0]);

  // grid + ticks
  g.font = "11px 'IBM Plex Mono', monospace";
  g.fillStyle = COLORS.text; g.strokeStyle = COLORS.grid; g.lineWidth = 1;
  const xt = o.xlog ? logTicks(o.x[0], o.x[1]) : niceTicks(o.x[0], o.x[1], o.xticks || 6);
  const yt = o.ylog ? logTicks(o.y[0], o.y[1]) : niceTicks(o.y[0], o.y[1], o.yticks || 5);
  g.textAlign = "center";
  for (const v of xt) {
    const X = tx(v);
    g.beginPath(); g.moveTo(X, T); g.lineTo(X, T + ph); g.stroke();
    g.fillText(fmtTick(v, o.xlog), X, T + ph + 15);
  }
  g.textAlign = "right";
  for (const v of yt) {
    const Y = ty(v);
    g.beginPath(); g.moveTo(L, Y); g.lineTo(L + pw, Y); g.stroke();
    g.fillText(fmtTick(v, o.ylog), L - 6, Y + 4);
  }
  if (o.xlabel) { g.textAlign = "center"; g.fillText(o.xlabel, L + pw / 2, H - 4); }
  if (o.ylabel) {
    g.save(); g.translate(12, T + ph / 2); g.rotate(-Math.PI / 2);
    g.textAlign = "center"; g.fillText(o.ylabel, 0, 0); g.restore();
  }

  // clip to the plot area
  g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
  for (const s of o.series || []) {
    g.globalAlpha = s.alpha ?? 1;
    g.strokeStyle = g.fillStyle = s.color || COLORS.sky;
    g.lineWidth = s.width || 1.5;
    g.setLineDash(s.dash || []);
    if (s.type === "line") {
      g.beginPath();
      let started = false;
      for (let i = 0; i < s.x.length; i++) {
        if (!isFinite(s.y[i]) || (o.ylog && s.y[i] <= 0)) { started = false; continue; }
        const X = tx(s.x[i]), Y = ty(s.y[i]);
        if (!started) { g.moveTo(X, Y); started = true; } else g.lineTo(X, Y);
      }
      g.stroke();
    } else if (s.type === "fn") {
      g.beginPath();
      const N = 300;
      for (let i = 0; i <= N; i++) {
        const xv = o.xlog ? Math.pow(10, Math.log10(o.x[0]) + (i / N) * (Math.log10(o.x[1]) - Math.log10(o.x[0])))
                          : o.x[0] + (i / N) * (o.x[1] - o.x[0]);
        const yv = s.f(xv);
        const X = tx(xv), Y = ty(o.ylog ? Math.max(yv, 1e-300) : yv);
        i === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
      }
      g.stroke();
    } else if (s.type === "bars") {
      const y0 = ty(o.ylog ? o.y[0] : Math.max(o.y[0], 0));
      for (let i = 0; i < s.x.length; i++) {
        const x1 = tx(s.x[i] - s.w / 2), x2 = tx(s.x[i] + s.w / 2), Y = ty(s.y[i]);
        g.fillRect(x1 + 0.5, Math.min(Y, y0), Math.max(x2 - x1 - 1, 1), Math.abs(y0 - Y));
      }
    } else if (s.type === "points") {
      for (let i = 0; i < s.x.length; i++) {
        if (!isFinite(s.y[i]) || (o.ylog && s.y[i] <= 0)) continue;
        g.beginPath(); g.arc(tx(s.x[i]), ty(s.y[i]), s.r || 3.5, 0, 2 * Math.PI); g.fill();
      }
    } else if (s.type === "hline") {
      g.beginPath(); g.moveTo(L, ty(s.y)); g.lineTo(L + pw, ty(s.y)); g.stroke();
    } else if (s.type === "vline") {
      g.beginPath(); g.moveTo(tx(s.x), T); g.lineTo(tx(s.x), T + ph); g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 1; g.setLineDash([]);
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.strokeRect(L + 0.5, T + 0.5, pw, ph);
}

// histogram helper: if the values live on a lattice with few points, one bar per value,
// otherwise ~40 equal bins. Returns density (area = 1).
function histogram(values, lattice) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const m = values.length;
  let w, start, nb;
  if (lattice && (hi - lo) / lattice <= 70) {
    w = lattice; start = lo - w / 2; nb = Math.round((hi - lo) / w) + 1;
  } else {
    nb = 40; w = (hi - lo) / nb || 1; start = lo; if (lattice) w = Math.max(lattice, Math.ceil(w / lattice) * lattice);
    nb = Math.ceil((hi - lo) / w) + 1; start = lo - w / 2;
  }
  const counts = new Array(nb).fill(0);
  for (const v of values) counts[Math.min(nb - 1, Math.max(0, Math.floor((v - start) / w)))]++;
  return { x: counts.map((_, i) => start + (i + 0.5) * w), y: counts.map((c) => c / (m * w)), w, lo, hi };
}
