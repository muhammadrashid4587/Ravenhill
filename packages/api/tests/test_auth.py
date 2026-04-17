"""End-to-end tests for the auth module: request-access, invite, verify,
me, logout, admin gating, dev-login."""

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from main import app


# Global config fixtures — these must be set before any auth call.
@pytest.fixture(autouse=True)
def _configure_auth():
    settings.admin_token = "test-admin-token"
    settings.session_cookie_name = "ravenhill_session"
    settings.site_url = "http://localhost:3000"
    settings.app_env = "development"
    settings.invite_ttl_days = 7
    settings.session_ttl_days = 30
    yield


async def _client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ---------- /api/auth/request-access ----------


@pytest.mark.asyncio
async def test_request_access_stores_submission():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/request-access",
            json={
                "email": "visitor@example.com",
                "name": "Visitor",
                "company": "Example Inc.",
                "role": "Ops",
                "use_case": "Exploring",
            },
        )
    assert r.status_code == 200
    assert r.json()["status"] == "received"


@pytest.mark.asyncio
async def test_request_access_rejects_invalid_email():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/request-access",
            json={"email": "not-an-email"},
        )
    assert r.status_code == 422


# ---------- /api/auth/invite (admin-gated) ----------


@pytest.mark.asyncio
async def test_invite_requires_admin_token():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/invite",
            json={"email": "partner@example.com", "name": "Partner"},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_invite_rejects_wrong_admin_token():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "wrong"},
            json={"email": "partner@example.com", "name": "Partner"},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_invite_returns_url_with_token():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "test-admin-token"},
            json={
                "email": "partner@example.com",
                "name": "Partner Park",
                "role": "Head of Finance",
                "department": "Finance",
            },
        )
    assert r.status_code == 200
    data = r.json()
    assert data["invite_url"].startswith("http://localhost:3000/login/verify?token=")
    assert len(data["token"]) > 30
    assert data["expires_at"]


@pytest.mark.asyncio
async def test_invite_disabled_when_admin_token_unset():
    settings.admin_token = ""
    async with await _client() as c:
        r = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "anything"},
            json={"email": "partner@example.com", "name": "Partner"},
        )
    assert r.status_code == 404  # fail-closed: endpoint hidden


# ---------- /api/auth/verify + /me + /logout (full flow) ----------


@pytest.mark.asyncio
async def test_verify_issues_session_cookie_and_me_returns_agent():
    async with await _client() as c:
        # Admin creates an invite.
        invite_res = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "test-admin-token"},
            json={
                "email": "partner@example.com",
                "name": "Partner Park",
                "role": "Head of Finance",
                "department": "Finance",
            },
        )
        token = invite_res.json()["token"]

        # Partner verifies — should get a cookie and the agent payload.
        verify_res = await c.post("/api/auth/verify", json={"token": token})
        assert verify_res.status_code == 200
        assert "ravenhill_session" in verify_res.cookies
        data = verify_res.json()
        assert data["agent"]["email"] == "partner@example.com"
        assert data["agent"]["name"] == "Partner Park"
        assert data["agent"]["role"] == "Head of Finance"
        assert data["agent"]["departments"] == ["Finance"]

        # /me with the cookie returns the same agent.
        me_res = await c.get("/api/auth/me")
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["agent"]["email"] == "partner@example.com"

        # Logout clears the cookie and the session.
        logout_res = await c.post("/api/auth/logout")
        assert logout_res.status_code == 200

        # /me now 401s.
        me_res2 = await c.get("/api/auth/me")
        assert me_res2.status_code == 401


@pytest.mark.asyncio
async def test_verify_rejects_invalid_token():
    async with await _client() as c:
        r = await c.post("/api/auth/verify", json={"token": "does-not-exist"})
    assert r.status_code == 401
    assert r.json()["detail"] == "invite_not_found"


@pytest.mark.asyncio
async def test_verify_rejects_reused_token():
    async with await _client() as c:
        invite_res = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "test-admin-token"},
            json={"email": "p@example.com", "name": "P"},
        )
        token = invite_res.json()["token"]

        # First use succeeds.
        r1 = await c.post("/api/auth/verify", json={"token": token})
        assert r1.status_code == 200

        # Second use rejected.
        # Use a fresh client with no cookies so the test isn't confused.
        async with await _client() as c2:
            r2 = await c2.post("/api/auth/verify", json={"token": token})
        assert r2.status_code == 401
        assert r2.json()["detail"] == "invite_already_used"


@pytest.mark.asyncio
async def test_me_without_cookie_returns_401():
    async with await _client() as c:
        r = await c.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_logout_without_cookie_is_idempotent():
    async with await _client() as c:
        r = await c.post("/api/auth/logout")
    assert r.status_code == 200


# ---------- Existing agent reuse ----------


@pytest.mark.asyncio
async def test_reinvite_reuses_existing_agent():
    """Two invites for the same email should converge on the same Agent
    (not create a duplicate)."""
    async with await _client() as c:
        def invite_payload(name, role):
            return {
                "email": "same@example.com",
                "name": name,
                "role": role,
                "department": "Finance",
            }

        r1 = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "test-admin-token"},
            json=invite_payload("First Name", "Associate"),
        )
        r2 = await c.post(
            "/api/auth/invite",
            headers={"X-Admin-Token": "test-admin-token"},
            json=invite_payload("Updated Name", "Director"),
        )
        t1 = r1.json()["token"]
        t2 = r2.json()["token"]

        v1 = await c.post("/api/auth/verify", json={"token": t1})
        agent_id_1 = v1.json()["agent"]["id"]

        async with await _client() as c2:
            v2 = await c2.post("/api/auth/verify", json={"token": t2})
        agent_id_2 = v2.json()["agent"]["id"]

        assert agent_id_1 == agent_id_2
        # Latest invite's profile wins.
        assert v2.json()["agent"]["name"] == "Updated Name"
        assert v2.json()["agent"]["role"] == "Director"


# ---------- Dev-login guard ----------


@pytest.mark.asyncio
async def test_dev_login_hidden_in_production():
    settings.app_env = "production"
    async with await _client() as c:
        r = await c.post(
            "/api/auth/dev-login",
            params={"agent_id": "00000000-0000-0000-0000-000000000001"},
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_dev_login_creates_session_for_seed_agent():
    settings.app_env = "development"
    async with await _client() as c:
        # One of the conftest-seeded demo agents.
        r = await c.post(
            "/api/auth/dev-login",
            params={"agent_id": "00000000-0000-0000-0000-000000000001"},
        )
    assert r.status_code == 200
    assert "ravenhill_session" in r.cookies


# ---------- Self-serve sign-in (/api/auth/sign-in-request) ----------


async def _invite_and_verify(c, email: str, name: str):
    """Admin-invite + consume helper so an Agent exists for subsequent tests."""
    invite = await c.post(
        "/api/auth/invite",
        headers={"X-Admin-Token": "test-admin-token"},
        json={"email": email, "name": name, "role": "Ops", "department": "Ops"},
    )
    token = invite.json()["token"]
    await c.post("/api/auth/verify", json={"token": token})


@pytest.mark.asyncio
async def test_signin_request_unknown_email_returns_404():
    """Email not tied to an active Agent — frontend routes to request-access."""
    settings.resend_api_key = ""  # stay in dev-log mode
    async with await _client() as c:
        r = await c.post(
            "/api/auth/sign-in-request",
            json={"email": "never-invited@example.com"},
        )
    assert r.status_code == 404
    assert r.json()["detail"] == "email_not_admitted"


@pytest.mark.asyncio
async def test_signin_request_existing_email_returns_dev_url_in_dev():
    settings.app_env = "development"
    settings.resend_api_key = ""
    async with await _client() as c:
        await _invite_and_verify(c, "existing@example.com", "Existing User")

        # Use a fresh client so we're not carrying that verify's cookie.
        async with await _client() as c2:
            r = await c2.post(
                "/api/auth/sign-in-request",
                json={"email": "existing@example.com"},
            )

    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "logged"
    assert data["dev_url"] and "/login/verify?token=" in data["dev_url"]


@pytest.mark.asyncio
async def test_signin_request_hides_dev_url_in_production():
    settings.app_env = "production"
    settings.resend_api_key = ""
    async with await _client() as c:
        await _invite_and_verify(c, "existing2@example.com", "Existing Two")
        async with await _client() as c2:
            r = await c2.post(
                "/api/auth/sign-in-request",
                json={"email": "existing2@example.com"},
            )
    # Still succeeds; but no URL leaked to the caller.
    assert r.status_code == 200
    assert r.json()["dev_url"] is None


@pytest.mark.asyncio
async def test_signin_request_throttles_rapid_repeat():
    settings.app_env = "development"
    settings.resend_api_key = ""
    settings.signin_throttle_seconds = 60
    async with await _client() as c:
        await _invite_and_verify(c, "throttle@example.com", "Throttled")

        async with await _client() as c2:
            r1 = await c2.post(
                "/api/auth/sign-in-request",
                json={"email": "throttle@example.com"},
            )
            assert r1.status_code == 200
            r2 = await c2.post(
                "/api/auth/sign-in-request",
                json={"email": "throttle@example.com"},
            )
    assert r2.status_code == 429
    assert r2.json()["detail"] == "too_frequent"


@pytest.mark.asyncio
async def test_signin_token_consume_preserves_profile():
    """A login-only token must not overwrite the Agent's name/role on re-login."""
    settings.app_env = "development"
    settings.resend_api_key = ""
    settings.signin_throttle_seconds = 0  # disable for this test
    async with await _client() as c:
        # Admin invites with initial profile.
        await _invite_and_verify(c, "keep@example.com", "Initial Name")

        # Simulate profile edit — change the name directly via DB.
        # (In a real product, a profile API would do this; for now we
        # don't have one, but the invariant still matters.)
        from sqlalchemy import update
        import db as db_mod
        from db import AgentRow
        async with db_mod.async_session() as s:
            await s.execute(
                update(AgentRow)
                .where(AgentRow.email == "keep@example.com")
                .values(name="Renamed By User", role="Staff Engineer")
            )
            await s.commit()

        # User self-serves a login link.
        async with await _client() as c2:
            signin = await c2.post(
                "/api/auth/sign-in-request",
                json={"email": "keep@example.com"},
            )
            token = signin.json()["dev_url"].split("token=")[1]

            verify = await c2.post("/api/auth/verify", json={"token": token})
        assert verify.status_code == 200
        data = verify.json()
        # Profile preserved.
        assert data["agent"]["name"] == "Renamed By User"
        assert data["agent"]["role"] == "Staff Engineer"


@pytest.mark.asyncio
async def test_signin_request_invalid_email_returns_422():
    async with await _client() as c:
        r = await c.post(
            "/api/auth/sign-in-request",
            json={"email": "not-an-email"},
        )
    assert r.status_code == 422
