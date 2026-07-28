"""HTTP endpoint for the Data Agent proxy (Feature 4).

Lets the app ask natural-language questions about Azure cost and get answers
back from the published Fabric Data Agent, without ever exposing Data Agent
credentials to the browser. Same style as tag-writer/function_app.py:
manual CORS, a `_json()` helper, `auth_level=func.AuthLevel.FUNCTION` (with
the function key optional -- prefer Easy Auth in front of this Function),
and logging + try/except around anything that talks to an external service.

Auth: see the note at the top of invoker.py -- Phase 1 uses the Function's
own identity (DefaultAzureCredential); Phase 2 (pending Feature 3) will move
to On-Behalf-Of once the app exposes the signed-in user's token.
"""

import json
import logging
import time

import azure.functions as func

from invoker import DataAgentError, ask

bp = func.Blueprint()

_CORS = {
    "Access-Control-Allow-Origin": "*",  # tighten to your app origin in production
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-functions-key",
}

# --- Phase 1 rate limiting ---------------------------------------------------
# Temporary limitation: there's no per-user token yet (see Phase 2 above), so
# this is a simple *global* rate limit shared by all callers -- just enough
# to stop runaway retries from hammering the Data Agent. Replace with a
# per-user limit (keyed on the OBO token's sub/oid, never the raw token)
# once Feature 3 lands.
_RATE_LIMIT_WINDOW_SECONDS = 10
_RATE_LIMIT_MAX_CALLS = 5
_recent_calls: list[float] = []


def _rate_limited() -> bool:
    now = time.monotonic()
    cutoff = now - _RATE_LIMIT_WINDOW_SECONDS
    while _recent_calls and _recent_calls[0] < cutoff:
        _recent_calls.pop(0)
    if len(_recent_calls) >= _RATE_LIMIT_MAX_CALLS:
        return True
    _recent_calls.append(now)
    return False


def _json(obj: dict, status: int) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(obj), status_code=status, mimetype="application/json", headers=_CORS
    )


@bp.route(route="data-agent", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.FUNCTION)
def data_agent(req: func.HttpRequest) -> func.HttpResponse:
    """Ask the Fabric Data Agent a question and return its plain-text answer."""
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_CORS)

    try:
        body = req.get_json()
    except ValueError:
        return _json({"ok": False, "error": "invalid JSON body"}, 400)

    question = (body.get("userQuestion") or body.get("question") or "").strip()
    if not question:
        return _json({"ok": False, "error": "userQuestion is required"}, 400)

    if _rate_limited():
        return _json({"ok": False, "error": "too many requests, try again shortly"}, 429)

    try:
        answer = ask(question)
        return _json({"answer": answer}, 200)
    except DataAgentError as exc:
        # exc's message is already user-safe; raw detail was logged in invoker.py.
        logging.error("data-agent request failed: %s", exc)
        return _json({"ok": False, "error": str(exc)}, 502)
    except Exception:  # noqa: BLE001
        logging.exception("data-agent-proxy failure")
        return _json({"ok": False, "error": "unexpected error"}, 500)
