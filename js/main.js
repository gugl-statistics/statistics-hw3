// ===================================================================
// main.js - connects the page controls to sim.js and charts.js
// ===================================================================
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 4) => {
  if (!isFinite(x)) return "-";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return x.toExponential(2);
  return (+x.toPrecision(d)).toLocaleString("en-US", { maximumFractionDigits: 6 });
};
const pct = (x) => (100 * x).toFixed(1) + "%";

// segmented buttons (Bernoulli / Rademacher)
function seg(id, onChange) {
  const el = $(id);
  const btns = [...el.querySelectorAll("button")];
  btns.forEach((b) => (b.onclick = () => {
    btns.forEach((x) => x.classList.toggle("on", x === b));
    onChange && onChange(b.dataset.v);
  }));
  return {
    get: () => el.querySelector("button.on").dataset.v,
    set: (v) => btns.forEach((x) => x.classList.toggle("on", x.dataset.v === v)),
  };
}

// expected maximum of m independent N(0,1) (numerical integration)
function expectedMaxNormal(m) {
  if (m === 1) return 0;
  let s = 0; const a = -8, b = 8, N = 4000, h = (b - a) / N;
  for (let i = 0; i <= N; i++) {
    const x = a + i * h, w = i === 0 || i === N ? 0.5 : 1;
    s += w * x * m * phi(x) * Math.pow(Phi(x), m - 1);
  }
  return s * h;
}

// =================================================== 2. simulator
const simModel = seg("sim-model", () => { togglePWrap("sim-p-wrap", simModel.get()); });
function togglePWrap(id, model) { $(id).style.opacity = model === "bern" ? 1 : 0.35; $(id).querySelector("input").disabled = model !== "bern"; }
$("sim-p").oninput = () => ($("sim-pv").textContent = (+$("sim-p").value).toFixed(2));
let lastSim = null;

function runSim() {
  const model = simModel.get(), p = +$("sim-p").value, n = +$("sim-n").value, m = +$("sim-m").value;
  if (n * m > 1.1e8) {
    $("sim-status").innerHTML = `<span class="bad">n·m = ${fmt(n * m)} steps is too much for the browser, please choose a smaller m (the Python tables below go up to n = 100,000).</span>`;
    return;
  }
  $("sim-status").textContent = "simulating…";
  $("sim-run").disabled = true;
  setTimeout(() => {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const t0 = performance.now();
    const r = simulate(model, p, n, m, 25, seed);
    const ms = performance.now() - t0;
    lastSim = { model, p, n, m, r };
    drawSim();
    $("sim-status").innerHTML = `${model === "bern" ? `Bernoulli, p = ${p.toFixed(2)}` : "Rademacher"} · n = ${fmt(n)} systems · m = ${fmt(m)} attackers · ` +
      `${fmt(n * m)} random steps in ${(ms / 1000).toFixed(2)} s · seed ${seed}`;
    $("sim-run").disabled = false;
  }, 30);
}
$("sim-run").onclick = runSim;

function drawSim() {
  if (!lastSim) return;
  const { model, p, n, m, r } = lastSim;
  const { mu, s2 } = theory(model, p), sd = Math.sqrt(s2);
  const ks = r.ks;
  const quantities = [
    { id: "S", f: (S, k) => S, mean: (k) => k * mu, sd: (k) => sd * Math.sqrt(k), lattice: model === "bern" ? 1 : 2, xlog: false },
    { id: "A", f: (S, k) => S / k, mean: () => mu, sd: (k) => sd / Math.sqrt(k), lattice: (model === "bern" ? 1 : 2) / n, xlog: n >= 100 },
    { id: "Z", f: (S, k) => S / Math.sqrt(k), mean: (k) => mu * Math.sqrt(k), sd: () => sd, lattice: (model === "bern" ? 1 : 2) / Math.sqrt(n), xlog: n >= 100 },
  ];
  let rows = `<tr><th>at k = n</th><th class="num">mean (sim)</th><th class="num">mean (theory)</th><th class="num">variance (sim)</th><th class="num">variance (theory)</th></tr>`;
  for (const q of quantities) {
    // ---- trajectories
    let lo = Infinity, hi = -Infinity;
    const series = [];
    r.paths.forEach((path, j) => {
      const y = Array.from(path, (S, i) => q.f(S, ks[i]));
      for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; }
      series.push({ type: "line", x: ks, y, color: j === 0 ? COLORS.orange : COLORS.sky, alpha: j === 0 ? 1 : 0.35, width: j === 0 ? 2 : 1.2 });
    });
    const first = series.shift(); series.push(first);            // draw the orange one on top
    for (const k of [ks[ks.length - 1]]) { lo = Math.min(lo, q.mean(k) - 2.2 * q.sd(k)); hi = Math.max(hi, q.mean(k) + 2.2 * q.sd(k)); }
    if (q.id === "A") { lo = model === "bern" ? 0 : -1; hi = 1; }
    series.push({ type: "fn", f: (k) => q.mean(k), color: COLORS.white, width: 1, alpha: 0.7 });
    series.push({ type: "fn", f: (k) => q.mean(k) + 2 * q.sd(k), color: COLORS.white, dash: [5, 4], width: 1.3 });
    series.push({ type: "fn", f: (k) => q.mean(k) - 2 * q.sd(k), color: COLORS.white, dash: [5, 4], width: 1.3 });
    const pad = (hi - lo) * 0.05 || 1;
    plot($("tr-" + q.id), { x: [1, n], y: [lo - pad, hi + pad], xlog: q.xlog, xlabel: q.xlog ? "k (log scale)" : "k", series });

    // ---- histogram at k = n
    const vals = Array.from(r.final, (S) => q.f(S, n));
    const h = histogram(vals, q.lattice);
    const M = q.mean(n), SD = q.sd(n);
    const x0 = Math.min(h.lo - h.w, M - 4 * SD), x1 = Math.max(h.hi + h.w, M + 4 * SD);
    const peak = Math.max(...h.y, 1 / (SD * Math.sqrt(2 * Math.PI)));
    plot($("h-" + q.id), {
      x: [x0, x1], y: [0, peak * 1.1], xticks: 5,
      series: [
        { type: "bars", x: h.x, y: h.y, w: h.w, color: COLORS.sky, alpha: 0.8 },
        { type: "fn", f: (x) => phi((x - M) / SD) / SD, color: COLORS.orange, width: 2 },
      ],
    });
    const label = { S: "S<sub>n</sub>", A: "S<sub>n</sub>/n", Z: "S<sub>n</sub>/√n" }[q.id];
    rows += `<tr><td>${label}</td><td class="num">${fmt(mean(vals))}</td><td class="num">${fmt(M)}</td><td class="num">${fmt(variance(vals))}</td><td class="num">${fmt(SD * SD)}</td></tr>`;
  }
  $("sim-table").innerHTML = rows;
}

// =================================================== 3. variance (Python results)
const varModel = seg("var-model", drawVariance);
function drawVariance() {
  const model = varModel.get(), rows = PY[model];
  const { s2 } = theory(model, 0.3);
  let t = `<tr><th class="num">n</th><th class="num">Var(S<sub>n</sub>) sim</th><th class="num">theory nσ²</th><th class="num">Var(S<sub>n</sub>/n) sim</th><th class="num">theory σ²/n</th><th class="num">Var(S<sub>n</sub>/√n) sim</th><th class="num">theory σ²</th><th class="num">mean of S<sub>n</sub>/√n</th></tr>`;
  for (const r of rows) {
    t += `<tr><td class="num">${fmt(r.n)}</td><td class="num">${fmt(r.S_var)}</td><td class="num">${fmt(r.n * s2)}</td><td class="num">${fmt(r.A_var)}</td><td class="num">${fmt(s2 / r.n)}</td>` +
         `<td class="num">${fmt(r.Z_var)}</td><td class="num">${fmt(s2)}</td><td class="num">${fmt(r.Z_mean)}</td></tr>`;
  }
  $("var-table").innerHTML = t;
  const ns = rows.map((r) => r.n);
  const all = rows.flatMap((r) => [r.S_var, r.A_var, r.Z_var]);
  plot($("var-chart"), {
    x: [5, 2e5], y: [Math.min(...all) / 3, Math.max(...all) * 3], xlog: true, ylog: true, xlabel: "n (systems)", ylabel: "variance",
    series: [
      { type: "fn", f: (n) => n * s2, color: COLORS.orange, dash: [5, 4] },
      { type: "fn", f: (n) => s2 / n, color: COLORS.sky, dash: [5, 4] },
      { type: "fn", f: () => s2, color: COLORS.white, dash: [5, 4] },
      { type: "points", x: ns, y: rows.map((r) => r.S_var), color: COLORS.orange, r: 5 },
      { type: "points", x: ns, y: rows.map((r) => r.A_var), color: COLORS.sky, r: 5 },
      { type: "points", x: ns, y: rows.map((r) => r.Z_var), color: COLORS.white, r: 5 },
    ],
  });
}

// =================================================== 4. LLN (browser sweep) + tables
const CPS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
const swModel = seg("sw-model", () => togglePWrap("sw-p-wrap", swModel.get()));
$("sw-p").oninput = () => ($("sw-pv").textContent = (+$("sw-p").value).toFixed(2));
let SW = null;

function runSweep() {
  const model = swModel.get(), p = +$("sw-p").value, m = +$("sw-m").value;
  $("sw-status").textContent = "simulating…";
  $("sw-run").disabled = true;
  setTimeout(() => {
    const seed = (Math.random() * 2 ** 32) >>> 0, t0 = performance.now();
    const data = sweep(model, p, 10000, m, CPS, seed);
    SW = { model, p, m, data, ks: null };
    $("sw-status").textContent = `${model === "bern" ? `Bernoulli, p = ${p.toFixed(2)}` : "Rademacher"} · m = ${fmt(m)} attackers, each through 10,000 systems · ` +
      `${((performance.now() - t0) / 1000).toFixed(2)} s · seed ${seed}`;
    $("sw-run").disabled = false;
    drawLLN(); computeKS(); drawCLT();
  }, 30);
}
$("sw-run").onclick = runSweep;

function drawLLN() {
  if (!SW) return;
  const eps = +$("eps").value;
  $("eps-v").textContent = eps.toFixed(3);
  const { mu, s2, range } = theory(SW.model, SW.p);
  const probs = SW.data.map((arr, i) => {
    let c = 0; const n = CPS[i];
    for (const S of arr) if (Math.abs(S / n - mu) > eps + 1e-12) c++;
    return c / arr.length;
  });
  plot($("lln-chart"), {
    x: [1, 10000], y: [0, 1.03], xlog: true, xlabel: "n (systems, log scale)", ylabel: "probability",
    series: [
      { type: "fn", f: (n) => Math.min(1, s2 / (n * eps * eps)), color: COLORS.sky, dash: [6, 4], width: 2 },
      { type: "fn", f: (n) => Math.min(1, 2 * Math.exp((-2 * n * eps * eps) / (range * range))), color: COLORS.white, dash: [2, 3], width: 2 },
      { type: "line", x: CPS, y: probs, color: COLORS.orange, width: 2 },
      { type: "points", x: CPS, y: probs, color: COLORS.orange, r: 3.5 },
    ],
  });
}
$("eps").oninput = drawLLN;

(function llnTable() {
  const B = PY.bern, R = PY.rad;
  let t = `<tr><th class="num">n</th><th class="num">Bern ε=0.1</th><th class="num">Bern ε=0.05</th><th class="num">Bern ε=0.01</th><th class="num">Rad ε=0.1</th><th class="num">Rad ε=0.05</th><th class="num">Rad ε=0.01</th></tr>`;
  B.forEach((b, i) => {
    const r = R[i];
    t += `<tr><td class="num">${fmt(b.n)}</td>` + ["0.1", "0.05", "0.01"].map((e) => `<td class="num">${b["p_eps_" + e].toFixed(4)}</td>`).join("") +
         ["0.1", "0.05", "0.01"].map((e) => `<td class="num">${r["p_eps_" + e].toFixed(4)}</td>`).join("") + "</tr>";
  });
  $("lln-table").innerHTML = t;
})();

// =================================================== 5. CLT
function standardized(i) {
  const n = CPS[i], { mu, s2 } = theory(SW.model, SW.p), sd = Math.sqrt(s2);
  return Array.from(SW.data[i], (S) => (S - n * mu) / (sd * Math.sqrt(n)));
}
function computeKS() {
  const q = SW.model === "bern" ? SW.p : 0.5;
  SW.ks = CPS.map((n, i) => ({ sim: ksDistance(standardized(i)), exact: ksExactBinomial(n, q) }));
}
function drawCLT() {
  if (!SW) return;
  const i = +$("clt-n").value, n = CPS[i];
  $("clt-nv").textContent = fmt(n);
  $("clt-model-name").textContent = SW.model === "bern" ? `Bernoulli p = ${SW.p.toFixed(2)}, Z = (S − np)/√(np(1−p))` : "Rademacher, Z = S/√n";
  const { s2 } = theory(SW.model, SW.p), sd = Math.sqrt(s2);
  const z = standardized(i);
  const lattice = (SW.model === "bern" ? 1 : 2) / (sd * Math.sqrt(n));
  const h = histogram(z, lattice);
  plot($("clt-hist"), {
    x: [-4, 4], y: [0, Math.max(0.45, ...h.y.filter((v, k) => Math.abs(h.x[k]) <= 4)) * 1.08],
    series: [
      { type: "bars", x: h.x, y: h.y, w: Math.min(h.w, 0.5), color: COLORS.sky, alpha: 0.85 },
      { type: "fn", f: phi, color: COLORS.orange, width: 2 },
    ],
  });
  // empirical cdf as a step line
  const s = Float64Array.from(z).sort(), m = s.length;
  const ex = [-4], ey = [0];
  for (let k = 0; k < m; k++) {
    if (k + 1 < m && s[k + 1] === s[k]) continue;
    ex.push(s[k], s[k]); ey.push(ey[ey.length - 1], (k + 1) / m);
  }
  ex.push(4); ey.push(1);
  plot($("clt-cdf"), {
    x: [-4, 4], y: [0, 1],
    series: [
      { type: "fn", f: Phi, color: COLORS.orange, width: 2 },
      { type: "line", x: ex, y: ey, color: COLORS.sky, width: 1.8 },
    ],
  });
  const k = SW.ks[i];
  $("clt-out").innerHTML =
    `n = ${fmt(n)} · mean of Z = ${fmt(mean(z), 3)} · variance of Z = ${fmt(variance(z), 3)}\n` +
    `KS distance: simulated <span class="k">${k.sim.toFixed(4)}</span>, exact <span class="s">${k.exact.toFixed(4)}</span>` +
    (SW.model === "rad" ? `, 0.399/√n = ${(0.3989 / Math.sqrt(n)).toFixed(4)}` : "") +
    ` · noise level for m = ${fmt(SW.m)}: about ${(0.87 / Math.sqrt(SW.m)).toFixed(4)}`;

  const rho = SW.model === "bern" ? SW.p * (1 - SW.p) * (SW.p * SW.p + (1 - SW.p) * (1 - SW.p)) : 1;
  plot($("ks-chart"), {
    x: [1, 10000], y: [3e-4, 1], xlog: true, ylog: true, xlabel: "n (systems)", ylabel: "KS distance",
    series: [
      { type: "fn", f: (n) => (0.4748 * rho) / (Math.pow(sd, 3) * Math.sqrt(n)), color: COLORS.white, dash: [5, 4] },
      { type: "hline", y: 0.87 / Math.sqrt(SW.m), color: COLORS.grey, dash: [2, 3] },
      { type: "line", x: CPS, y: SW.ks.map((v) => v.exact), color: COLORS.sky, width: 2 },
      { type: "points", x: CPS, y: SW.ks.map((v) => v.sim), color: COLORS.orange, r: 3.5 },
      { type: "points", x: [n], y: [k.sim], color: COLORS.white, r: 6 },
    ],
  });
}
$("clt-n").oninput = drawCLT;

(function ksTable() {
  let t = `<tr><th class="num">n</th><th class="num">Bernoulli sim</th><th class="num">Bernoulli exact</th><th class="num">Rademacher sim</th><th class="num">Rademacher exact</th><th class="num">0.399/√n</th></tr>`;
  PY.bern.forEach((b, i) => {
    const r = PY.rad[i];
    t += `<tr><td class="num">${fmt(b.n)}</td><td class="num">${b.ks.toFixed(4)}</td><td class="num">${b.ks_exact.toFixed(4)}</td>` +
         `<td class="num">${r.ks.toFixed(4)}</td><td class="num">${r.ks_exact.toFixed(4)}</td><td class="num">${(0.3989 / Math.sqrt(b.n)).toFixed(4)}</td></tr>`;
  });
  $("ks-table").innerHTML = t;
})();

// =================================================== 6. best attacker + defender's view
const MS = [1, 10, 100, 1000, 10000];
const MS_COL = [COLORS.grey, COLORS.sky, COLORS.white, COLORS.orange, "#ffc58a"];
const CM = MS.map(expectedMaxNormal);
const bestModel = seg("best-model", drawBest);
function drawBest() {
  const model = bestModel.get(), rows = PY[model];
  const { mu, s2 } = theory(model, 0.3), sd = Math.sqrt(s2);
  const series = [];
  MS.forEach((mm, j) => {
    series.push({ type: "fn", f: (n) => mu + (sd * CM[j]) / Math.sqrt(n), color: MS_COL[j], dash: [5, 4], width: 1.3 });
    series.push({ type: "points", x: rows.map((r) => r.n), y: rows.map((r) => r["best_" + mm]), color: MS_COL[j], r: 5 });
  });
  plot($("best-chart"), {
    x: [5, 2e5], y: model === "bern" ? [0.25, 1] : [-0.05, 1.05], xlog: true, xlabel: "n (systems)", ylabel: "best average score S_n/n",
    series,
  });
  $("best-legend").innerHTML = MS.map((mm, j) => `<span><i style="background:${MS_COL[j]}"></i>m = ${fmt(mm)} (c<sub>m</sub> = ${CM[j].toFixed(2)})</span>`).join("");
}

function drawDefender() {
  const n = Math.round(Math.pow(10, +$("dv-n").value)), m = +$("dv-m").value, p = +$("dv-p").value;
  $("dv-nv").textContent = fmt(n); $("dv-mv").textContent = m; $("dv-pv").textContent = p.toFixed(2);
  const q = 1 - Math.pow(1 - p, m);
  const sdOne = Math.sqrt(n * p * (1 - p)), cm = expectedMaxNormal(m);
  const range = (mu, sd) => `${fmt(Math.max(0, mu - 2 * sd), 4)} to ${fmt(mu + 2 * sd, 4)}`;
  $("dv-table").innerHTML =
    `<tr><th>Quantity</th><th class="num">expected</th><th class="num">≈ 95% range (normal approx.)</th></tr>` +
    `<tr><td>Systems hit by one attacker</td><td class="num">${fmt(n * p, 4)} (${pct(p)})</td><td class="num">${range(n * p, sdOne)}</td></tr>` +
    `<tr><td>Systems hit by the best of the ${m} attackers</td><td class="num">${fmt(n * p + sdOne * cm, 4)} (${pct(p + Math.sqrt(p * (1 - p) / n) * cm)})</td><td class="num">-</td></tr>` +
    `<tr><td>Total successful penetrations, all attackers</td><td class="num">${fmt(m * n * p, 4)}</td><td class="num">${range(m * n * p, Math.sqrt(m) * sdOne)}</td></tr>` +
    `<tr class="best"><td>Systems compromised by at least one attacker</td><td class="num">${fmt(n * q, 4)} (${pct(q)})</td><td class="num">${range(n * q, Math.sqrt(n * q * (1 - q)))}</td></tr>`;
}
["dv-n", "dv-m", "dv-p"].forEach((id) => ($(id).oninput = drawDefender));

// =================================================== init
togglePWrap("sim-p-wrap", "bern"); togglePWrap("sw-p-wrap", "bern");
drawVariance(); drawBest(); drawDefender();
runSim();
runSweep();
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { drawSim(); drawVariance(); drawLLN(); drawCLT(); drawBest(); }, 150);
});

const links = [...document.querySelectorAll("nav.toc a")];
const obs = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id)); });
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("main section").forEach((s) => obs.observe(s));
