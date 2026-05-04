"""HTTP-level two-org isolation test.

Sign up two separate users (each creates their own org), authenticate
as each in turn, and verify their org-scoped endpoints never leak the
other tenant's data. This is the end-to-end safety net for anything
hitting FastAPI: missing `Depends(get_current_agent_optional)`,
missing `with_org(...)`, or a forgotten `org_id=` on a new row will
all surface here as a cross-tenant leak.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from main import app


@pytest.fixture(autouse=True)
def _configure_auth():
    settings.admin_token = "test-admin-token"
    settings.session_cookie_name = "ravenhill_session"
    settings.site_url = "http://localhost:3000"
    settings.app_env = "development"
    settings.invite_ttl_days = 7
    settings.session_ttl_days = 30
    yield


def _client():
    """Fresh AsyncClient. Callers shouldn't share a client across users
    because httpx persists cookies, and `extract_session_token` reads the
    cookie before the X-Session-Token header — a second signup on the same
    client would overwrite the first user's cookie and mask the first auth."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _signup(c: AsyncClient, email: str, password: str, name: str) -> str:
    """Create an account and return the raw session token."""
    r = await c.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "name": name},
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def _auth(token: str) -> dict:
    return {"X-Session-Token": token}


async def _fresh_signup(email: str, password: str, name: str) -> str:
    """One-shot signup on a dedicated client so cookies from this signup
    don't poison subsequent calls made from a different client."""
    async with _client() as c:
        return await _signup(c, email, password, name)


@pytest.mark.asyncio
async def test_two_orgs_have_isolated_registries_and_approvals():
    """Two fresh signups land in two different orgs, and neither can see
    the other's agents, approvals, activity, or org summary."""
    token_a = await _fresh_signup("alice@org-a.example.com", "passwordA1!", "Alice")
    token_b = await _fresh_signup("bob@org-b.example.com", "passwordB2!", "Bob")

    # One client per token so each call carries only its own auth.
    async with _client() as ca, _client() as cb:
        # --- /api/orgs/me: each user sees their own org, org_role=admin ---
        org_a = (await ca.get("/api/orgs/me", headers=_auth(token_a))).json()
        org_b = (await cb.get("/api/orgs/me", headers=_auth(token_b))).json()
        assert org_a["id"] != org_b["id"], "self-serve signups must create distinct orgs"
        assert org_a["org_role"] == "admin"
        assert org_b["org_role"] == "admin"
        assert org_a["member_count"] == 1
        assert org_b["member_count"] == 1

        # --- /api/registry: caller's org only ---
        reg_a = (await ca.get("/api/registry/", headers=_auth(token_a))).json()
        reg_b = (await cb.get("/api/registry/", headers=_auth(token_b))).json()
        a_ids = {a["id"] for a in reg_a}
        b_ids = {a["id"] for a in reg_b}
        assert a_ids and b_ids, "registry should include each user's own agent"
        assert a_ids.isdisjoint(b_ids), (
            "cross-tenant leak: Alice's registry exposes Bob's agent"
        )

        # --- /api/approvals/pending: empty for both, different orgs ---
        pend_a = (await ca.get("/api/approvals/pending", headers=_auth(token_a))).json()
        pend_b = (await cb.get("/api/approvals/pending", headers=_auth(token_b))).json()
        assert pend_a == []
        assert pend_b == []

        # --- create an approval as Alice, Bob must not see it ---
        alice_agent_id = reg_a[0]["id"]
        create = await ca.post(
            "/api/approvals/request",
            headers=_auth(token_a),
            json={
                "requesting_agent": alice_agent_id,
                "owning_agent": alice_agent_id,
                "action": "share_file",
                "description": "Alice wants a doc",
                "resource": "internal.pdf",
            },
        )
        assert create.status_code == 200, create.text
        approval_id = create.json()["id"]

        pend_a2 = (await ca.get("/api/approvals/pending", headers=_auth(token_a))).json()
        assert len(pend_a2) == 1
        assert pend_a2[0]["id"] == approval_id

        pend_b2 = (await cb.get("/api/approvals/pending", headers=_auth(token_b))).json()
        assert pend_b2 == [], "Bob must not see Alice's pending approvals"

        direct = await cb.get(
            f"/api/approvals/{approval_id}", headers=_auth(token_b)
        )
        assert direct.status_code == 404, (
            "cross-tenant GET of an approval by id must 404, not leak it"
        )


@pytest.mark.asyncio
async def test_rotate_invite_code_requires_admin_and_scopes_to_org():
    """Admins can mint a share-link, and the codes are distinct per org."""
    token_a = await _fresh_signup(
        "admin@org-a.example.com", "passwordA1!", "OrgAAdmin"
    )
    token_b = await _fresh_signup(
        "admin@org-b.example.com", "passwordB2!", "OrgBAdmin"
    )

    async with _client() as ca, _client() as cb:
        rot_a = await ca.post(
            "/api/orgs/rotate-invite-code", headers=_auth(token_a)
        )
        assert rot_a.status_code == 200
        code_a = rot_a.json()["invite_code"]
        assert code_a

        rot_b = await cb.post(
            "/api/orgs/rotate-invite-code", headers=_auth(token_b)
        )
        assert rot_b.status_code == 200
        code_b = rot_b.json()["invite_code"]
        assert code_b != code_a, "rotation must yield distinct tokens across orgs"

        me_a = (await ca.get("/api/orgs/me", headers=_auth(token_a))).json()
        me_b = (await cb.get("/api/orgs/me", headers=_auth(token_b))).json()
        assert me_a["invite_code"] == code_a
        assert me_b["invite_code"] == code_b


@pytest.mark.asyncio
async def test_email_invite_places_invitee_in_inviters_org():
    """Admin issues an email invite; verifying the token makes the invitee
    a member of the admin's org — not a fresh workspace."""
    admin_token = await _fresh_signup(
        "founder@acme.example.com", "adminPass1!", "Founder"
    )

    async with _client() as ca:
        admin_org = (await ca.get("/api/orgs/me", headers=_auth(admin_token))).json()
        admin_org_id = admin_org["id"]

        # Admin issues invite for new@acme.example.com
        inv = await ca.post(
            "/api/orgs/invite",
            headers=_auth(admin_token),
            json={
                "email": "new@acme.example.com",
                "name": "New Hire",
                "role": "Member",
                "department": "General",
            },
        )
        assert inv.status_code == 200, inv.text
        invite_token = inv.json()["token"]

    # Separate client for the invitee so cookies don't cross over.
    async with _client() as cb:
        r = await cb.post("/api/auth/verify", json={"token": invite_token})
        assert r.status_code == 200, r.text
        invitee_session = r.json()["session_token"]

        invitee_org = (
            await cb.get("/api/orgs/me", headers=_auth(invitee_session))
        ).json()
        assert invitee_org["id"] == admin_org_id, (
            "email invitee must land in the admin's org, not a new workspace"
        )
        assert invitee_org["org_role"] == "member", (
            "invitees should never auto-become admin"
        )
        assert invitee_org["member_count"] == 2

    # Non-admin members must not be able to issue invites.
    async with _client() as cc:
        r = await cc.post(
            "/api/orgs/invite",
            headers=_auth(invitee_session),
            json={
                "email": "third@acme.example.com",
                "name": "Third",
                "role": "Member",
                "department": "General",
            },
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_share_link_signup_places_user_in_org():
    """Anyone with the share-link code can sign up straight into the org."""
    admin_token = await _fresh_signup(
        "owner@bigco.example.com", "adminPass1!", "Owner"
    )

    async with _client() as ca:
        rot = await ca.post(
            "/api/orgs/rotate-invite-code", headers=_auth(admin_token)
        )
        assert rot.status_code == 200
        invite_code = rot.json()["invite_code"]

        admin_org_id = (
            await ca.get("/api/orgs/me", headers=_auth(admin_token))
        ).json()["id"]

    # Public preview works before signup.
    async with _client() as cb:
        preview = await cb.get(f"/api/orgs/join/{invite_code}")
        assert preview.status_code == 200
        assert preview.json()["approval_required"] is False

        r = await cb.post(
            "/api/auth/share-link-signup",
            json={
                "invite_code": invite_code,
                "email": "joiner@bigco.example.com",
                "password": "joinerPass1!",
                "name": "Joiner",
            },
        )
        assert r.status_code == 200, r.text
        joiner_token = r.json()["session_token"]

        joiner_org = (
            await cb.get("/api/orgs/me", headers=_auth(joiner_token))
        ).json()
        assert joiner_org["id"] == admin_org_id
        assert joiner_org["org_role"] == "member"
        # Joiner is a member, not an admin — invite_code must be hidden.
        assert joiner_org["invite_code"] is None


@pytest.mark.asyncio
async def test_share_link_signup_rejects_bad_code():
    """Unknown or expired codes 404 — we don't hint at the reason."""
    async with _client() as c:
        r = await c.post(
            "/api/auth/share-link-signup",
            json={
                "invite_code": "not-a-real-code-abcdef",
                "email": "hacker@elsewhere.example.com",
                "password": "whatever1!",
                "name": "Hacker",
            },
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "invite_invalid"
