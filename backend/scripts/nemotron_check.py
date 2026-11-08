"""Nemotron on build.nvidia.com: early check (HACK.md "Tasks to check early").

Answers: which Nemotron model does reliable tool calling, does it chain several tool calls,
how slow is it, and what's the rate limit. Uses FAKE local tools (canned JSON); it never
touches our app's numbers.

Usage (from backend/):
  .venv/bin/python scripts/nemotron_check.py --list              # Nemotron models visible to your key
  .venv/bin/python scripts/nemotron_check.py                     # 3-tool loop on default candidates
  .venv/bin/python scripts/nemotron_check.py MODEL [MODEL ...]   # 3-tool loop on specific models
  .venv/bin/python scripts/nemotron_check.py --rate 45 MODEL     # burst test (uses quota!)
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

BASE_URL = "https://integrate.api.nvidia.com/v1"
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"   # backend/.env

DEFAULT_MODELS = [
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "nvidia/nvidia-nemotron-nano-9b-v2",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
]

PROMPT = "UPS-B battery swap, 3 hrs, vendor only Wed or Fri. Schedule it and check for conflicts."

SYSTEM = (
    "You are a data-center maintenance planning agent. Hours count from Monday 00:00 (0-167). "
    "Use the tools: first get_backlog, then make_plan with the new task, then simulate the plan. "
    "Never invent numbers; only report numbers the tools returned."
)

TOOLS = [
    {"type": "function", "function": {
        "name": "get_backlog",
        "description": "Return the current seeded maintenance backlog (list of tasks).",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "make_plan",
        "description": "Schedule the backlog plus extra tasks at lowest cost. Returns a plan.",
        "parameters": {"type": "object", "properties": {
            "mode": {"type": "string", "enum": ["gpu_cloud", "private"]},
            "extra_tasks": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "name": {"type": "string"}, "equipment": {"type": "string"},
                "duration_hrs": {"type": "integer"}, "zone": {"type": "string"},
                "allowed_windows": {"type": "array", "items": {"type": "object", "properties": {
                    "start_hour": {"type": "integer"}, "end_hour": {"type": "integer"}}}}},
                "required": ["id", "name", "equipment", "duration_hrs"]}}},
            "required": ["extra_tasks"]}}},
    {"type": "function", "function": {
        "name": "simulate",
        "description": "Simulate a plan hour by hour; returns violations (zone conflicts, overheats).",
        "parameters": {"type": "object", "properties": {
            "plan_id": {"type": "string", "description": "id returned by make_plan"}},
            "required": ["plan_id"]}}},
]

# Canned fake tool outputs (small, fixed).
FAKE = {
    "get_backlog": [
        {"id": "T1", "name": "CRAC-2 compressor replacement", "zone": "Z2", "duration_hrs": 6},
        {"id": "T4", "name": "UPS battery test", "zone": "Z4", "duration_hrs": 2},
    ],
    "make_plan": {"plan_id": "P1", "total_cost": 41234.56, "schedule": [
        {"task_id": "T1", "start_hour": 56, "end_hour": 62},
        {"task_id": "T7", "start_hour": 98, "end_hour": 101}]},
    "simulate": {"violations": [], "max_zone_temp_c": 27.4},
}


def load_client():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_PATH)
    except ImportError:
        pass
    key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not key:
        print(
            "NVIDIA_API_KEY not found.\n\n"
            "  1. Go to https://build.nvidia.com, sign in, open any Nemotron model page,\n"
            "     click 'Get API Key' (starts with nvapi-).\n"
            f"  2. Create {ENV_PATH} containing one line:\n"
            "       NVIDIA_API_KEY=nvapi-...\n"
            "     (backend/.env is gitignored; never commit it.)\n"
            "  3. Re-run: cd backend && .venv/bin/python scripts/nemotron_check.py --list",
            file=sys.stderr)
        sys.exit(2)
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=key)


def list_models(client) -> None:
    ids = sorted(m.id for m in client.models.list().data if "nemotron" in m.id.lower())
    print(f"{len(ids)} Nemotron models visible:")
    for i in ids:
        print("  " + i)


def run_loop(client, model: str, max_steps: int = 6) -> dict:
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": PROMPT}]
    calls, bad_json, t0 = [], 0, time.perf_counter()
    final, err = "", ""
    try:
        for _ in range(max_steps):
            resp = client.chat.completions.create(model=model, messages=msgs, tools=TOOLS,
                                                  tool_choice="auto", temperature=0, max_tokens=1024)
            m = resp.choices[0].message
            if not m.tool_calls:
                final = (m.content or "").strip()
                break
            msgs.append({"role": "assistant", "content": m.content or "",
                         "tool_calls": [tc.model_dump() for tc in m.tool_calls]})
            for tc in m.tool_calls:
                name = tc.function.name
                try:
                    json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    bad_json += 1
                calls.append(name)
                out = FAKE.get(name, {"error": f"unknown tool {name}"})
                msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(out)})
    except Exception as e:  # report, don't crash the table
        err = f"{type(e).__name__}: {e}"[:200]
    return {"model": model, "tool_calls": bool(calls), "chain": calls, "bad_json": bad_json,
            "latency_s": time.perf_counter() - t0, "final": final, "error": err}


def print_table(rows: list[dict]) -> None:
    hdr = f"{'model':<45} {'tools?':<7} {'#calls':<7} {'badJSON':<8} {'secs':<6} order"
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r['model']:<45} {('yes' if r['tool_calls'] else 'NO'):<7} {len(r['chain']):<7} "
              f"{r['bad_json']:<8} {r['latency_s']:<6.1f} {' > '.join(r['chain']) or '-'}")
    for r in rows:
        print(f"\n== {r['model']}")
        if r["error"]:
            print(f"  ERROR: {r['error']}")
        print(f"  final: {r['final'][:500] or '(none)'}")
    want = ["get_backlog", "make_plan", "simulate"]
    good = [r["model"] for r in rows if not r["error"] and not r["bad_json"]
            and all(w in r["chain"] for w in want)]
    print(f"\nModels that chained all 3 tools with valid JSON: {good or 'none'}")


def rate_test(client, model: str, n: int) -> None:
    print(f"Burst: {n} tiny requests to {model} (consumes quota)...")
    ok = limited = other = 0
    t0 = time.perf_counter()
    for _ in range(n):
        try:
            client.with_options(max_retries=0).chat.completions.create(
                model=model, messages=[{"role": "user", "content": "Say OK."}],
                temperature=0, max_tokens=4)
            ok += 1
        except Exception as e:
            if getattr(e, "status_code", None) == 429:
                limited += 1
            else:
                other += 1
    wall = time.perf_counter() - t0
    print(f"ok={ok}  429={limited}  other_errors={other}  wall={wall:.1f}s  "
          f"({ok / wall * 60:.0f} successful req/min)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Probe Nemotron tool calling + rate limit on build.nvidia.com.")
    ap.add_argument("models", nargs="*", help=f"model ids (default: {', '.join(DEFAULT_MODELS)})")
    ap.add_argument("--list", action="store_true", help="list Nemotron models visible to your key")
    ap.add_argument("--rate", type=int, metavar="N", help="burst N tiny requests to the first model (uses quota)")
    args = ap.parse_args()

    client = load_client()
    if args.list:
        list_models(client)
        return
    models = args.models or DEFAULT_MODELS
    if args.rate:
        rate_test(client, models[0], args.rate)
        return
    print_table([run_loop(client, m) for m in models])


if __name__ == "__main__":
    main()
