"""Data Agent invoker — isolates the call to the Fabric Data Agent behind a
single, stable function: `ask(question: str) -> str`.

INVOKER_MCP (current):
    Queries the Fabric Data Agent through its native Model Context Protocol
    (MCP) endpoint: connect -> initialize session -> discover the agent's
    single tool -> call it with the question -> read back its text answer.
    See https://learn.microsoft.com/en-us/fabric/data-science/fabric-data-agent-sdk

    This replaces the OpenAI Assistants-style REST surface (create thread ->
    add message -> create run -> poll -> read last message), which is on
    Microsoft's deprecation path (retirement announced for August 2026) and
    had an unresolved bug where `tools` came back empty.

Auth:
    The Function calls the Data Agent with a fixed-identity **Service
    Principal** (ClientSecretCredential). Any app user gets answers under this
    one identity, so no per-user token is needed. Credentials come from app
    settings / local.settings.json: AAD_TENANT_ID, AAD_CLIENT_ID,
    AAD_CLIENT_SECRET -- never hardcode the secret. The SP must have workspace
    Member/Contributor + read on the Data Agent's data sources.
"""

import asyncio
import logging
import os

from azure.core.exceptions import ClientAuthenticationError
from azure.identity import ClientSecretCredential
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger("data-agent.invoker")

_WORKSPACE_ID = os.environ.get("DATA_AGENT_WORKSPACE_ID", "")
_ARTIFACT_ID = os.environ.get("DATA_AGENT_ARTIFACT_ID", "")
_SCOPE = os.environ.get("DATA_AGENT_SCOPE", "https://api.fabric.microsoft.com/.default")
_TIMEOUT_SECONDS = float(os.environ.get("DATA_AGENT_TIMEOUT_SECONDS", "90"))

# Fabric tenant that owns the Data Agent. ClientSecretCredential takes the
# tenant explicitly, so the SP token is always minted for the right tenant.
_AAD_TENANT_ID = os.environ.get("AAD_TENANT_ID", "")

_MCP_URL = f"https://api.fabric.microsoft.com/v1/mcp/workspaces/{_WORKSPACE_ID}/dataagents/{_ARTIFACT_ID}/agent"

_AAD_CLIENT_ID = os.environ.get("AAD_CLIENT_ID", "")
_AAD_CLIENT_SECRET = os.environ.get("AAD_CLIENT_SECRET", "")

# Fixed-identity Service Principal that calls the Data Agent. Reused across
# invocations. The client secret comes from app settings / local.settings.json
# (AAD_CLIENT_SECRET) -- never hardcode it.
_credential = (
    ClientSecretCredential(_AAD_TENANT_ID, _AAD_CLIENT_ID, _AAD_CLIENT_SECRET)
    if (_AAD_TENANT_ID and _AAD_CLIENT_ID and _AAD_CLIENT_SECRET)
    else None
)


class DataAgentError(Exception):
    """Raised when the Data Agent call fails. The message is safe to show to
    end users -- never put raw Data Agent/HTTP error detail in here; log it
    instead."""


def ask(question: str) -> str:
    """Ask the Fabric Data Agent a question and return its plain-text answer.

    Raises DataAgentError (user-safe message) on any failure -- config
    problems, auth failures, MCP/connection errors, or the overall timeout
    being exceeded. Full details are only ever written to logs, never
    returned to the caller.
    """
    if not _WORKSPACE_ID or not _ARTIFACT_ID:
        raise DataAgentError("data agent is not configured")

    try:
        return asyncio.run(asyncio.wait_for(_ask_async(question), timeout=_TIMEOUT_SECONDS))
    except asyncio.TimeoutError:
        raise DataAgentError("the data agent took too long to respond") from None
    except DataAgentError:
        raise
    except Exception:
        logger.exception("data agent MCP call failed")
        raise DataAgentError("the data agent is temporarily unavailable") from None


async def _ask_async(question: str) -> str:
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with streamablehttp_client(_MCP_URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # The data agent exposes a single tool. Discover it, then call it.
            tools = await session.list_tools()
            tool = tools.tools[0]
            question_arg = next(iter(tool.inputSchema["properties"]))

            result = await session.call_tool(tool.name, {question_arg: question})

            answers = [block.text for block in result.content if block.type == "text"]
            if not answers:
                raise DataAgentError("the data agent did not return an answer")
            return "\n".join(answers)


def _get_token() -> str:
    if _credential is None:
        raise DataAgentError("service principal is not configured")
    try:
        return _credential.get_token(_SCOPE).token
    except ClientAuthenticationError:
        logger.exception("failed to acquire a Data Agent token")
        raise DataAgentError("data agent auth is not configured correctly") from None

