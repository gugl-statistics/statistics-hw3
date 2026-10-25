// ===================================================================
// sim.js - random walks for the penetration model
// m attackers, each one goes through n systems; X_i is the score on system i.
// ===================================================================

// small seeded random generator (mulberry32), so a run can be repeated
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// mean and variance of one increment
function theory(model, p) {
  return model === "bern" ? { mu: p, s2: p * (1 - p), range: 1 } : { mu: 0, s2: 1, range: 2 };
}

// indices k (1..n) where we save the trajectory, max ~npts points
function recordPoints(n, npts = 400) {
  const out = [];
  const step = Math.max(1, n / npts);
  for (let x = 1; x <= n; x += step) out.push(Math.round(x));
  if (out[out.length - 1] !== n) out.push(n);
  return [...new Set(out)];
}

// One run: final sums for all m attackers + full (downsampled) paths for the first K
function simulate(model, p, n, m, K, seed) {
  const rng = makeRng(seed);
  const ks = recordPoints(n);
  const final = new Float64Array(m);
  const paths = [];
  for (let a = 0; a < m; a++) {
    const rec = a < K ? new Float64Array(ks.length) : null;
    let S = 0, q = 0;
    if (model === "bern") {
      for (let i = 1; i <= n; i++) {
        if (rng() < p) S++;
        if (rec !== null && i === ks[q]) rec[q++] = S;
      }
    } else {
      for (let i = 1; i <= n; i++) {
        S += rng() < 0.5 ? 1 : -1;
        if (rec !== null && i === ks[q]) rec[q++] = S;
      }
    }
    final[a] = S;
    if (rec) paths.push(rec);
  }
  return { ks, final, paths };
}

// One long run up to N, saving S_n of every attacker at the checkpoints.
// This gives all the n values from the same trajectories (like watching them grow).
function sweep(model, p, N, m, checkpoints, seed) {
  const rng = makeRng(seed);
  const data = checkpoints.map(() => new Float64Array(m));
  for (let a = 0; a < m; a++) {
    let S = 0, q = 0;
    for (let i = 1; i <= N; i++) {
      if (model === "bern") { if (rng() < p) S++; }
      else S += rng() < 0.5 ? 1 : -1;
      if (i === checkpoints[q]) data[q++][a] = S;
    }
  }
  return data;
}

// ---------- basic statistics ----------
function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function variance(a) {
  const mu = mean(a); let s = 0;
  for (const v of a) s += (v - mu) * (v - mu);
  return s / (a.length - 1);
}

// standard normal cdf (Abramowitz-Stegun 7.1.26, error < 1.5e-7)
function Phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
const phi = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

// Kolmogorov-Smirnov distance between a sample and N(0,1)
function ksDistance(z) {
  const s = Float64Array.from(z).sort();
  const m = s.length; let d = 0, i = 0;
  while (i < m) {                          // our values are discrete, so handle ties as one jump
    let j = i;
    while (j + 1 < m && s[j + 1] === s[i]) j++;
    const F = Phi(s[i]);
    d = Math.max(d, Math.abs(i / m - F), Math.abs((j + 1) / m - F));
    i = j + 1;
  }
  return d;
}

// exact KS distance of the standardized Binomial(n, q) from N(0,1)
// (no simulation, computed from the binomial pmf in log space so it doesn't underflow)
function ksExactBinomial(n, q) {
  const sd = Math.sqrt(n * q * (1 - q));
  let logp = n * Math.log(1 - q), cdf = 0, d = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) logp += Math.log((n - k + 1) / k) + Math.log(q / (1 - q));
    const pk = Math.exp(logp);
    const F = Phi((k - n * q) / sd);
    d = Math.max(d, Math.abs(cdf - F));    // just before the jump
    cdf += pk;
    d = Math.max(d, Math.abs(cdf - F));    // just after the jump
  }
  return d;
}

if (typeof module !== "undefined") module.exports = { makeRng, theory, simulate, sweep, mean, variance, Phi, ksDistance, ksExactBinomial };
