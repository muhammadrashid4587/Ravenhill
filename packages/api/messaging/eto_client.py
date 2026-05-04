"""Singularity integration client — handles agent-to-agent messaging via Singularity infrastructure.

Messages are always persisted to the database for observability.
When SINGULARITY_API_KEY is set, messages are also sent to the Singularity API.
"""

import logging

import httpx

from config import settings
from messaging.models import InterAgentMessage, MessageResponse

log = logging.getLogger("singularity")


def _singularity_is_live() -> bool:
    return bool(settings.singularity_api_key) and not settings.singularity_api_key.startswith("your-")


async def _persist_ledger_entry(entry: dict):
    """Write a ledger entry to the database."""
    import db
    from db import MessageLedgerRow

    async with db.async_session() as session:
        row = MessageLedgerRow(
            message_id=entry.get("message_id"),
            trace_id=entry.get("trace_id"),
            type=entry.get("type"),
            from_agent=entry.get("from_agent"),
            to_agent=entry.get("to_agent"),
            intent=entry.get("intent"),
            requires_approval=entry.get("requires_approval", False),
            eto_tx_id=entry.get("eto_tx_id"),
            status=entry.get("status", "pending"),
            in_reply_to=entry.get("in_reply_to"),
            content=entry.get("content"),
            payload=entry.get("payload"),
        )
        session.add(row)
        await session.commit()


class SingularityClient:
    """Client for Singularity messaging and file transfer APIs."""

    def __init__(self):
        self.base_url = settings.singularity_api_url
        self.api_key = settings.singularity_api_key
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
        """Send an inter-agent message. Routes through Singularity when live, local otherwise."""
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

        if _singularity_is_live():
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
                log.info(f"[singularity] Message sent via Singularity: {entry['message_id']}")
            except Exception as e:
                entry["status"] = "delivered_local"
                log.warning(f"[singularity] Singularity send failed, delivered locally: {e}")
        else:
            entry["status"] = "delivered_local"
            log.info(f"[singularity] Message delivered locally: {entry['message_id']}")

        await _persist_ledger_entry(entry)
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
            "content": response.content,
            "payload": response.payload,
            "status": "delivered_local",
            "eto_tx_id": None,
        }

        if _singularity_is_live():
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
                log.warning(f"[singularity] Singularity response failed, recorded locally: {e}")

        await _persist_ledger_entry(entry)
        return entry

    async def request_file(self, from_agent: str, to_agent: str, file_description: str) -> dict:
        """Request a file transfer through Singularity."""
        entry = {
            "type": "file_request",
            "from_agent": from_agent,
            "to_agent": to_agent,
            "intent": file_description,
            "status": "pending_approval",
            "eto_tx_id": None,
        }

        if _singularity_is_live():
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
                log.info(f"[singularity] File request via Singularity: tx={entry['eto_tx_id']}")
            except Exception as e:
                log.warning(f"[singularity] Singularity file request failed, handled locally: {e}")

        await _persist_ledger_entry(entry)
        return entry

    async def close(self):
        if self._client:
            await self._client.aclose()


# Singleton — variable kept as `eto_client` to avoid renaming the import everywhere.
eto_client = SingularityClient()
