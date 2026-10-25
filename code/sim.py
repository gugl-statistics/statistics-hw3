"""
Homework 3 - penetration score as a sum of i.i.d. increments.
Reference simulations (numpy + scipy). Run:  python3 sim.py
m attackers, each one attacks the n systems in sequence; X_i = score on system i.
"""
import numpy as np, json
from scipy import stats

rng = np.random.default_rng(2026)
P = 0.3                                   # Bernoulli success probability used in the report

def increments(model, n, m):
    if model == "bern": return (rng.random((m, n)) < P).astype(np.int8)
    return np.where(rng.random((m, n)) < 0.5, 1, -1).astype(np.int8)

def final_sums(model, n, m):
    # same distribution as summing the increments, but much faster for big n:
    # Bernoulli: S_n ~ Bin(n, p);  Rademacher: S_n = 2*Bin(n, 1/2) - n
    if model == "bern": return rng.binomial(n, P, m).astype(float)
    return 2.0 * rng.binomial(n, 0.5, m) - n

out = {}
# ---- sanity check: step-by-step vs shortcut (n=1000, m=5000)
for model in ["bern", "rad"]:
    a = increments(model, 1000, 5000).sum(axis=1, dtype=np.int64)
    b = final_sums(model, 1000, 5000)
    print(model, "step-by-step mean/var", a.mean(), a.var(ddof=1), " shortcut", b.mean(), b.var(ddof=1),
          " KS p-value", stats.ks_2samp(a, b).pvalue)

NS = [10, 100, 1000, 10000, 100000]
M = 10000
mu = {"bern": P, "rad": 0.0}; sig2 = {"bern": P*(1-P), "rad": 1.0}
for model in ["bern", "rad"]:
    rows = []
    for n in NS:
        S = final_sums(model, n, M)
        A, Z = S / n, S / np.sqrt(n)
        std = (S - n*mu[model]) / np.sqrt(n*sig2[model])         # standardized
        row = dict(n=n,
                   S_mean=S.mean(), S_var=S.var(ddof=1),
                   A_mean=A.mean(), A_var=A.var(ddof=1),
                   Z_mean=Z.mean(), Z_var=Z.var(ddof=1))
        for eps in [0.1, 0.05, 0.01]:
            row[f"p_eps_{eps}"] = float(np.mean(np.abs(A - mu[model]) > eps))
        # KS distance of standardized sum from N(0,1)
        row["ks"] = float(stats.kstest(std, "norm").statistic)
        # exact KS distance (from the exact binomial cdf, no sampling noise)
        k = np.arange(n + 1)
        pp = P if model == "bern" else 0.5
        vals = (k - n*pp) / np.sqrt(n*pp*(1-pp))
        cdf_hi = stats.binom.cdf(k, n, pp); cdf_lo = cdf_hi - stats.binom.pmf(k, n, pp)
        Phi = stats.norm.cdf(vals)
        row["ks_exact"] = float(max(np.max(np.abs(cdf_hi - Phi)), np.max(np.abs(cdf_lo - Phi))))
        # best attacker (max over m) of the average score, for a few m
        for mm in [1, 10, 100, 1000, 10000]:
            row[f"best_{mm}"] = float(np.mean([A[rng.choice(M, mm, replace=False)].max() for _ in range(50)])) if mm < M else float(A.max())
        rows.append(row)
        print(model, n, {k_: round(v, 5) if isinstance(v, float) else v for k_, v in row.items()})
    out[model] = rows

# CLT for Rademacher at small n: skewness / kurtosis are 0 / -2/n exactly
json.dump(out, open("results.json", "w"), indent=1)

# also write the numbers used by the web page
with open("../js/results.js", "w") as f:
    f.write("// Python results (code/sim.py): p = %.1f, m = %d attackers per n\n" % (P, M))
    f.write("const PY = " + json.dumps(out) + ";\n")
