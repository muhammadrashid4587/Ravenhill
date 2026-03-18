"""ETO integration client — handles agent-to-agent messaging via ETO infrastructure.

ETO (eto.markets) is the inter-agent backbone:
- Messages: all agent-to-agent communication routes through ETO
- Files: transfers up to 80GB, blockchain-verified delivery
- Payments: cross-chain settlement for agent transactions

When ETO_API_KEY is set to a real key, messages are sent to the ETO API.
Otherwise, messages are processed locally and logged to the ledger.
"""

import logging

import httpx

from config import settings
from messaging.models import InterAgentMessage, MessageResponse

log = logging.getLogger("eto")

# In-memory ledger — tracks all inter-agent messages for observability.
# Phase 1 moves this to Postgres.  The ledger is always written to,
# regardless of whether ETO is live or stubbed.
message_ledger: list[dict] = []


def _eto_is_live() -> bool:
    return bool(settings.eto_api_key) and not settings.eto_api_key.startswith("your-")


class ETOClient:
    """Client for ETO messaging and file transfer APIs."""

    def __init__(self):
        self.base_url = settings.eto_api_url
        self.api_key = settings.eto_api_key
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30.0,
            )
        return self._client

    async def send_message(self, message: InterAgentMessage) -> dict:
        """Send an inter-agent message. Routes through ETO when live, local otherwise."""
        entry = {
            "message_id": str(message.message_id),
            "trace_id": str(message.trace_id),
            "type": message.type.value,
            "from_agent": str(message.from_agent),
            "to_agent": str(message.to_agent) if message.to_agent else None,
            "intent": message.intent,
            "requires_approval": message.requires_approval,
            "eto_tx_id": None,
            "status": "pending",
        }

        if _eto_is_live():
            try:
                client = self._get_client()
                resp = await client.post("/messages/send", json={
                    "message_id": str(message.message_id),
                    "type": message.type.value,
                    "from_agent": str(message.from_agent),
                    "to_agent": str(message.to_agent),
                    "intent": message.intent,
                    "payload": message.payload,
                    "trace_id": str(message.trace_id),
                })
                resp.raise_for_status()
                data = resp.json()
                entry["eto_tx_id"] = data.get("tx_id")
                entry["status"] = "delivered"
                log.info(f"[eto] Message sent via ETO: {entry['message_id']} tx={entry['eto_tx_id']}")
            except Exception as e:
                entry["status"] = "delivered_local"
                log.warning(f"[eto] ETO send failed, delivered locally: {e}")
        else:
            entry["status"] = "delivered_local"
            log.info(f"[eto] Message delivered locally: {entry['message_id']} ({message.type.value})")

        message_ledger.append(entry)
        return {
            "status": entry["status"],
            "message_id": entry["message_id"],
            "trace_id": entry["trace_id"],
            "eto_tx_id": entry["eto_tx_id"],
        }

    async def record_response(self, response: MessageResponse) -> dict:
        """Record a response to an inter-agent message."""
        entry = {
            "message_id": str(response.message_id),
            "in_reply_to": str(response.in_reply_to),
            "from_agent": str(response.from_agent),
            "status": "delivered_local",
            "eto_tx_id": None,
        }

        if _eto_is_live():
            try:
                client = self._get_client()
                resp = await client.post("/messages/respond", json={
                    "message_id": str(response.message_id),
                    "in_reply_to": str(response.in_reply_to),
                    "from_agent": str(response.from_agent),
                    "content": response.content,
                    "payload": response.payload,
                })
                resp.raise_for_status()
                data = resp.json()
                entry["eto_tx_id"] = data.get("tx_id")
                entry["status"] = "delivered"
            except Exception as e:
                log.warning(f"[eto] ETO response failed, recorded locally: {e}")

        message_ledger.append(entry)
        return entry

    async def request_file(self, from_agent: str, to_agent: str, file_description: str) -> dict:
        """Request a file transfer through ETO."""
        entry = {
            "type": "file_request",
            "from_agent": from_agent,
            "to_agent": to_agent,
            "file_description": file_description,
            "status": "pending_approval",
            "eto_tx_id": None,
        }

        if _eto_is_live():
            try:
                client = self._get_client()
                resp = await client.post("/files/request", json={
                    "from_agent": from_agent,
                    "to_agent": to_agent,
                    "description": file_description,
                })
                resp.raise_for_status()
                data = resp.json()
                entry["eto_tx_id"] = data.get("tx_id")
                log.info(f"[eto] File request via ETO: tx={entry['eto_tx_id']}")
            except Exception as e:
                log.warning(f"[eto] ETO file request failed, handled locally: {e}")

        message_ledger.append(entry)
        return entry

    async def close(self):
        if self._client:
            await self._client.aclose()


# Singleton
eto_client = ETOClient()
