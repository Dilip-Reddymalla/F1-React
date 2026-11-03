"""Monte Carlo race engine.

Combines the two prior models into ONE coherent finish:

    DNF model    -> P(DNF) per driver  (do they finish?)
    Ranking model -> expected finishing position per driver (strength)

For each simulated race:
    1. Each driver survives with probability 1 - P(DNF).
    2. Survivors are ordered by strength (expected position), plus Gaussian
       noise to reflect that races are not deterministic.
    3. Survivors take the finishing positions 1..k; the rest are DNF.

After thousands of simulations we get a valid probability distribution over
P1..P20 for every driver (a race has exactly one winner), the winner
probability, and expected positions. This is what the website will show.
"""
import numpy as np
import pandas as pd


def monte_carlo(drivers, p_dnf, exp_finish, n_sims=10000, sigma=1.0, seed=42):
    """Simulate races and return per-driver position/winner statistics.

    Parameters
    ----------
    drivers : array-like of driver names (length n)
    p_dnf : array-like, P(DNF) per driver
    exp_finish : array-like, expected finishing position per driver (strength)
    n_sims : int
    sigma : float, noise around strength (race randomness)
    seed : int

    Returns
    -------
    list of dicts, one per driver, with:
        driver, dnf_prob, win_prob, expected_finish, expected_rank,
        positions -> {P1: prob, ..., Pn: prob}
    """
    p = np.asarray(p_dnf, dtype=float)
    e = np.asarray(exp_finish, dtype=float)
    n = len(p)
    rng = np.random.default_rng(seed)

    # Survivals and noisy strengths.
    surv = rng.random((n_sims, n)) >= p[None, :]
    speed = -e[None, :] + rng.normal(0.0, sigma, (n_sims, n))
    speed = np.where(surv, speed, -np.inf)

    # Rank survivors within each simulated race (highest speed -> P1).
    order = np.argsort(-speed, axis=1)
    pos = np.empty_like(order, dtype=float)
    pos[np.arange(n_sims)[:, None], order] = np.arange(1, n + 1, dtype=float)[None, :]
    pos = np.where(surv, pos, np.nan)  # NaN where DNF

    results = []
    for j in range(n):
        col = pos[:, j]
        survived = surv[:, j]

        dnf_prob = float((~survived).mean())

        # Winner probability = fraction of sims where this driver is P1.
        win_prob = float((col == 1).sum() / n_sims)

        # Position distribution over 1..n (ignore DNF rows).
        distribution = {}
        for k in range(1, n + 1):
            prob = float((col == k).mean())
            if prob > 0:
                distribution[f"P{k}"] = round(prob, 4)

        exp_finish_val = (float(np.nanmean(col)) if survived.any() else None)
        exp_rank = float(np.where(survived, col, n + 1).mean())

        results.append({
            "driver": drivers[j],
            "dnf_prob": round(dnf_prob, 4),
            "win_prob": round(win_prob, 4),
            "expected_finish": (round(exp_finish_val, 2) if exp_finish_val is not None else None),
            "expected_rank": round(exp_rank, 2),
            "positions": distribution,
        })
    return results


def summarize_engine(results):
    """Sort engine results by expected_rank (P1 first)."""
    return sorted(results, key=lambda r: r["expected_rank"])
