"""Tests for the meetings module — transcript extraction, task CRUD, mock mode."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from agents.seed import SEED_AGENTS


# Use first seed agent for tests
AGENT_ID = str(SEED_AGENTS[0]["id"])

SAMPLE_TRANSCRIPT = """
Riley Chen: Let's discuss the marketplace redesign status.
Jordan Park: Designs are done but engineering is blocked on the Stripe API docs.
Sam Torres: Three engineers are waiting. Docs expected Thursday.
Riley Chen: Jordan, update the launch timeline. Sam, provide a sprint estimate by Friday.
Alex Kumar: I'll share the vendor contract with engineering today.
Riley Chen: Good. Let's regroup Monday.
"""


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_create_meeting_extracts_tasks(client):
    """POST /api/meetings/ should extract tasks from transcript."""
    res = await client.post("/api/meetings/", json={
        "title": "Test Sync Meeting",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })
    assert res.status_code == 200
    data = res.json()

    assert data["title"] == "Test Sync Meeting"
    assert data["status"] == "ready"
    assert data["source"] == "paste"
    assert data["summary"]  # should have a summary
    assert len(data["tasks"]) > 0  # should have extracted at least one task

    # Each task should have required fields
    for task in data["tasks"]:
        assert task["title"]
        assert task["description"]
        assert task["priority"] in ("high", "medium", "low")
        assert task["status"] == "pending"


async def test_list_meetings(client):
    """GET /api/meetings/ should return created meetings."""
    # Create a meeting first
    await client.post("/api/meetings/", json={
        "title": "List Test Meeting",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })

    res = await client.get(f"/api/meetings/?agent_id={AGENT_ID}")
    assert res.status_code == 200
    meetings = res.json()
    assert len(meetings) >= 1
    assert any(m["title"] == "List Test Meeting" for m in meetings)


async def test_get_meeting_by_id(client):
    """GET /api/meetings/{id} should return meeting with tasks."""
    create_res = await client.post("/api/meetings/", json={
        "title": "Detail Test Meeting",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })
    meeting_id = create_res.json()["id"]

    res = await client.get(f"/api/meetings/{meeting_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == meeting_id
    assert data["title"] == "Detail Test Meeting"
    assert len(data["tasks"]) > 0


async def test_get_meeting_not_found(client):
    """GET /api/meetings/{id} should return 404 for unknown ID."""
    fake_id = str(uuid.uuid4())
    res = await client.get(f"/api/meetings/{fake_id}")
    assert res.status_code == 404


async def test_update_task_status(client):
    """PATCH /api/meetings/{mid}/tasks/{tid} should update task status."""
    create_res = await client.post("/api/meetings/", json={
        "title": "Task Update Test",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })
    data = create_res.json()
    meeting_id = data["id"]
    task_id = data["tasks"][0]["id"]

    res = await client.patch(
        f"/api/meetings/{meeting_id}/tasks/{task_id}",
        json={"status": "in_progress"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"

    # Mark as done
    res2 = await client.patch(
        f"/api/meetings/{meeting_id}/tasks/{task_id}",
        json={"status": "done"},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "done"


async def test_task_help(client):
    """POST /api/meetings/{mid}/tasks/{tid}/help should return guidance."""
    create_res = await client.post("/api/meetings/", json={
        "title": "Help Test Meeting",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })
    data = create_res.json()
    meeting_id = data["id"]
    task_id = data["tasks"][0]["id"]

    res = await client.post(f"/api/meetings/{meeting_id}/tasks/{task_id}/help", json={})
    assert res.status_code == 200
    help_data = res.json()
    assert help_data["task_id"] == task_id
    assert len(help_data["response"]) > 0


async def test_delete_meeting(client):
    """DELETE /api/meetings/{id} should remove meeting and tasks."""
    create_res = await client.post("/api/meetings/", json={
        "title": "Delete Test Meeting",
        "raw_transcript": SAMPLE_TRANSCRIPT,
        "agent_id": AGENT_ID,
    })
    meeting_id = create_res.json()["id"]

    res = await client.delete(f"/api/meetings/{meeting_id}")
    assert res.status_code == 200

    # Should be gone
    res2 = await client.get(f"/api/meetings/{meeting_id}")
    assert res2.status_code == 404


async def test_google_meetings_mock(client):
    """GET /api/meetings/google/meetings should return mock data when not configured."""
    res = await client.get(f"/api/meetings/google/meetings?agent_id={AGENT_ID}")
    assert res.status_code == 200
    meetings = res.json()
    assert len(meetings) > 0
    assert meetings[0]["event_id"]
    assert meetings[0]["title"]


async def test_google_import_mock(client):
    """POST /api/meetings/google/import should work with mock data."""
    res = await client.post("/api/meetings/google/import", json={
        "agent_id": AGENT_ID,
        "calendar_event_id": "mock-event-001",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["source"] == "google_meet"
    assert data["title"] == "Marketplace Redesign Sync"
    assert len(data["tasks"]) > 0
