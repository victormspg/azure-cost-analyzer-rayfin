"""Validate the ACA Fabric Data Agent for executive-narrative generation.

Prereqs:  pip install openai azure-identity   (uses your `az login` session)
Run:      python scripts/test_data_agent.py

If the scope 401s, try SCOPE = "https://analysis.windows.net/powerbi/api/.default".
"""

import os
import time
import uuid
import typing as t

from azure.identity import AzureCliCredential
from openai import OpenAI
from openai._models import FinalRequestOptions
from openai._types import Omit
from openai._utils import is_given

BASE_URL = os.environ.get("ACA_DATA_AGENT_BASE_URL") or (
    "https://api.fabric.microsoft.com/v1/workspaces/"
    "<WORKSPACE_ID>/dataagents/"
    "<DATA_AGENT_ID>/aiassistant/openai"
)
SCOPE = "https://api.fabric.microsoft.com/.default"

# Grounding figures from the validated CFO DAX (exec-summary-kpis.dax).
QUESTION = (
    "Write a concise, board-ready executive summary (3 sentences) of this month's "
    "Azure cost posture for a CFO, based on the AzureCostAnalyzer semantic model. "
    "Figures: Total Effective Cost = 2253.76, Untagged share of cost = 75.68%, "
    "Total Savings = 1.68, Savings rate = 0.07%, Effective Cost YoY = 0%. "
    "Emphasize that the high untagged share is a governance risk that blocks chargeback."
)

token = AzureCliCredential().get_token(SCOPE).token


class FabricOpenAI(OpenAI):
    def __init__(self, api_version: str = "2024-05-01-preview", **kwargs: t.Any) -> None:
        self.api_version = api_version
        default_query = kwargs.pop("default_query", {})
        default_query["api-version"] = self.api_version
        super().__init__(api_key="fabric", base_url=BASE_URL, default_query=default_query, **kwargs)

    def _prepare_options(self, options: FinalRequestOptions) -> None:
        headers: dict[str, "str | Omit"] = (
            {**options.headers} if is_given(options.headers) else {}
        )
        options.headers = headers
        headers["Authorization"] = f"Bearer {token}"
        headers.setdefault("Accept", "application/json")
        headers.setdefault("ActivityId", str(uuid.uuid4()))
        return super()._prepare_options(options)


def main() -> None:
    client = FabricOpenAI()
    assistant = client.beta.assistants.create(model="not used")
    thread = client.beta.threads.create()
    client.beta.threads.messages.create(thread_id=thread.id, role="user", content=QUESTION)
    run = client.beta.threads.runs.create(thread_id=thread.id, assistant_id=assistant.id)

    terminal = {"completed", "failed", "cancelled", "requires_action"}
    start = time.time()
    while run.status not in terminal:
        if time.time() - start > 180:
            raise TimeoutError(f"Run polling timed out (last status={run.status})")
        time.sleep(2)
        run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        print("status:", run.status)

    print("\nFinal status:", run.status)
    print("=" * 60)
    for m in client.beta.threads.messages.list(thread_id=thread.id, order="asc"):
        for c in m.content:
            if getattr(c, "type", "") == "text":
                print(f"\n[{m.role}]\n{c.text.value}")


if __name__ == "__main__":
    main()
