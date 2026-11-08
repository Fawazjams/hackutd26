"""POST /request. Phase 2: Nemotron parses text -> Task, calls tools, explains. Numbers come only from tools."""
from fastapi import APIRouter
from .schemas import AgentRequest, AgentResponse

router = APIRouter(tags=["agent"])


@router.post("/request", response_model=AgentResponse)
def handle_request(req: AgentRequest) -> AgentResponse:
    # TODO(phase 2): NVIDIA_API_KEY from .env, OpenAI-compatible client at build.nvidia.com,
    # tools = get_prices, plan, simulate; re-plan if simulate reports violations.
    return AgentResponse(task=None, plan=None, explanation="Agent not wired up yet.")
