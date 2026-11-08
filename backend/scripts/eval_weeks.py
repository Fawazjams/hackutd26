"""Many-week evaluation (Elix-style proof): does "optimized never overheats and beats ASAP" hold on
weeks we did not design?

Run from backend/:  .venv/Scripts/python scripts/eval_weeks.py --n 100
Each seed builds a random backlog (seeded, so every run is identical). On ~40% of seeds we PLANT a
pair of cooling jobs in neighboring zones that both open Mon 08:00: the answer key says ASAP should
overheat on those weeks. The planner never sees the answer key.
All task values and the thermal model are ASSUMED (config.py); this proves robustness inside our
own sim, not in a real hall.
"""
import argparse
import random
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent import EQUIPMENT, lookup_equipment  # noqa: E402
from app.config import COOLING_ZONES, HOURS  # noqa: E402
from app.planner import make_plan  # noqa: E402
from app.schemas import Task, Window  # noqa: E402
from app.simulate import simulate_plan  # noqa: E402

NAMES = sorted(n for n in EQUIPMENT if not n.startswith(("PDU-", "Fiber trunk")))  # drop aliases
OUT = Path(__file__).resolve().parents[2] / "docs" / "EVAL.md"


def _windows(rng: random.Random) -> list[Window]:
    kind = rng.choice(["week", "weekdays", "two_days"])
    if kind == "week":
        return [Window(start_hour=0, end_hour=HOURS)]
    if kind == "weekdays":
        return [Window(start_hour=d * 24 + 8, end_hour=d * 24 + 20) for d in range(5)]
    return [Window(start_hour=d * 24, end_hour=d * 24 + 24) for d in sorted(rng.sample(range(7), 2))]


def _task(tid: str, eq_name: str, rng: random.Random, windows: list[Window] | None = None) -> Task:
    eq = lookup_equipment(eq_name)
    return Task(id=tid, name=f"{eq['equipment']} maintenance", equipment=eq["equipment"],
                duration_hrs=rng.randint(2, 6), racks_affected=eq["racks"], zone=eq["zone"],
                risk_growth_per_day=round(rng.uniform(0.005, 0.02), 4),
                allowed_windows=windows or _windows(rng))


def week(seed: int) -> tuple[list[Task], bool]:
    rng = random.Random(seed)
    tasks: list[Task] = []
    planted = rng.random() < 0.4
    if planted:
        i = rng.randrange(len(COOLING_ZONES) - 1)  # zone i and its neighbor i+1
        w = [Window(start_hour=8, end_hour=HOURS)]
        tasks.append(_task("T1", f"CRAC-{i + 1}", rng, w))
        tasks.append(_task("T2", f"CDU-{i + 2}", rng, w))
    pool = [n for n in NAMES if n not in {t.equipment for t in tasks}]
    for name in rng.sample(pool, rng.randint(5, 7) - len(tasks)):
        tasks.append(_task(f"T{len(tasks) + 1}", name, rng))
    return tasks, planted


def run(n: int) -> dict:
    rows = []
    for seed in range(1, n + 1):
        tasks, planted = week(seed)
        lookup = {t.id: t for t in tasks}
        r = {"seed": seed, "planted": planted}
        for s in ("asap", "optimized"):
            p = make_plan(tasks, "cloud", s)
            r[s] = {"overheats": sum(v.kind == "overheat" for v in simulate_plan(p, lookup).violations),
                    "total": p.total_cost, "heat_cost": p.overheat_cost, "unscheduled": len(p.unscheduled),
                    "items": {i.task_id for i in p.items}}
        rows.append(r)
    same = [r for r in rows if r["asap"]["items"] == r["optimized"]["items"]]  # like-for-like weeks
    sav = [r["asap"]["total"] - r["optimized"]["total"] for r in same]
    sav_ex = [(r["asap"]["total"] - r["asap"]["heat_cost"]) - r["optimized"]["total"] for r in same]
    planted = [r for r in rows if r["planted"]]
    return {
        "weeks": n,
        "opt_overheat_weeks": sum(r["optimized"]["overheats"] > 0 for r in rows),
        "asap_overheat_weeks": sum(r["asap"]["overheats"] > 0 for r in rows),
        "planted": len(planted),
        "planted_caught": sum(r["asap"]["overheats"] > 0 for r in planted),
        "unplanted_asap_overheat": sum(r["asap"]["overheats"] > 0 for r in rows if not r["planted"]),
        "like_for_like": len(same),
        "opt_cheaper_pct": round(100 * sum(s > 0 for s in sav) / len(sav), 1) if sav else 0.0,
        "median_saving": round(statistics.median(sav), 2) if sav else 0.0,
        "median_saving_ex_heat": round(statistics.median(sav_ex), 2) if sav_ex else 0.0,
        "unsched_asap": sum(r["asap"]["unscheduled"] for r in rows),
        "unsched_opt": sum(r["optimized"]["unscheduled"] for r in rows),
    }


def table(s: dict) -> str:
    rows = [
        ("Weeks tested (seeds 1..N)", s["weeks"]),
        ("Optimized weeks with any overheat", f"{s['opt_overheat_weeks']} of {s['weeks']}"),
        ("ASAP weeks with any overheat", f"{s['asap_overheat_weeks']} of {s['weeks']}"),
        ("Planted weeks where ASAP overheated (answer key)", f"{s['planted_caught']} of {s['planted']}"),
        ("Unplanted weeks where ASAP overheated anyway", s["unplanted_asap_overheat"]),
        ("Like-for-like weeks (both plans schedule the same jobs)", s["like_for_like"]),
        ("Optimized cheaper than ASAP (like-for-like)", f"{s['opt_cheaper_pct']}%"),
        ("Median saving per week (like-for-like)", f"${s['median_saving']:,.2f}"),
        ("Median saving excluding ASAP overheat cost", f"${s['median_saving_ex_heat']:,.2f}"),
        ("Jobs left unscheduled, ASAP / optimized", f"{s['unsched_asap']} / {s['unsched_opt']}"),
    ]
    return "| Measure | Result |\n|---|---|\n" + "\n".join(f"| {a} | {b} |" for a, b in rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args()
    t0 = time.perf_counter()
    s = run(a.n)
    secs = time.perf_counter() - t0
    t = table(s)
    print(t)
    print(f"\n({secs:.1f} s)")
    if not a.no_write:
        OUT.write_text(DOC.format(table=t, n=a.n))
        print(f"wrote {OUT}")


DOC = """# Many-week evaluation

Regenerate: `cd backend && .venv/Scripts/python scripts/eval_weeks.py --n {n}` (seeded: same numbers every run).

## Why
The demo shows one seeded week ("0 overheats vs 5"). A judge can say that week was designed for ASAP to fail.
This evaluation tests the claims on weeks we did not design, in the style of Elix's planted-anomaly proof.

## Method
- **What varies (per seed):** 5-7 jobs drawn from the equipment catalog (CRAC, CDU, PDU, fiber, UPS), each with a
  random duration (2-6 h), failure-risk growth (0.5-2%/day) and allowed window (whole week, weekdays 08-20, or 2 random days).
- **Planted problems (answer key):** on about 40% of seeds we add a CRAC job and a CDU job in *neighboring* cooling
  zones, both allowed from Mon 08:00. If they overlap, the zones lose backup cooling. The answer key says ASAP should
  overheat on these weeks. The planner never reads the answer key.
- **What is fixed:** the hall (40 racks, 4 zones), real-data H100 price forecast, seeded utilization, the cost model
  and the thermal model.
- **For each week:** run ASAP and optimized (cloud mode), simulate both hour by hour, count overheat zone-hours,
  total cost and unscheduled jobs. Savings are only compared on weeks where both plans schedule the same jobs.

## Results
{table}

## Limits (say these out loud)
- Every week runs on our **assumed** thermal and cost model (`app/config.py`). This proves the planner is reliable
  *inside our simulation*, not in a real hall.
- "Optimized never overheats" is expected by construction: the optimizer checks every slot against the simulator.
  The informative numbers are the ASAP catch rate, the savings and the unscheduled jobs.
- Most of the saving is ASAP's overheats priced as unplanned outages at an **assumed** rate; the
  "excluding overheat cost" row shows what timing alone saves.
"""

if __name__ == "__main__":
    main()
