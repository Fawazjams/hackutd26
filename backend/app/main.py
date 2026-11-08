from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import agent, backlog, planner, prices, simulate

app = FastAPI(title="HackUTD 2026 maintenance planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (prices.router, backlog.router, simulate.router, planner.router, agent.router):
    app.include_router(r)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
