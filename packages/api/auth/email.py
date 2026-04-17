"""Email delivery — thin wrapper around Resend with a console fallback.

When RESEND_API_KEY is unset, we log the sign-in URL to stdout and tell
the caller `sent=False`. Tests and local dev run in this mode. Set the
key in production and emails go out via Resend's HTTP API.
"""

import logging
from dataclasses import dataclass

import httpx

from config import settings

log = logging.getLogger("auth.email")


@dataclass
class EmailResult:
    sent: bool
    # True in dev mode when no provider is configured — the router can
    # surface the URL to the admin for inspection. Never expose to the
    # public API in production.
    dev_url: str | None = None


def _html_body(name: str | None, invite_url: str, expires_minutes: int) -> str:
    display_name = (name or "there").split(" ")[0]
    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0B0A0C;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#E8E4DC;">
    <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
        <div style="width:28px;height:28px;border-radius:6px;background:#8B1E2F;display:flex;align-items:center;justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6"/>
          </svg>
        </div>
        <span style="font-size:14px;font-weight:600;color:#F5F0E6;letter-spacing:-0.01em;">Ravenhill</span>
      </div>
      <h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:26px;line-height:1.2;color:#F5F0E6;margin:0 0 12px 0;">
        Sign in to Ravenhill, {display_name}.
      </h1>
      <p style="font-size:15px;line-height:1.55;color:#8A8A92;margin:0 0 24px 0;">
        Click the button below to sign in. The link is good for {expires_minutes} minutes and can be used once.
      </p>
      <a href="{invite_url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#8B1E2F;color:#F5F0E6;font-weight:500;text-decoration:none;font-size:14px;">Sign in &rarr;</a>
      <p style="font-size:12px;color:#4A4A52;line-height:1.55;margin-top:32px;">
        If you didn&rsquo;t ask to sign in, you can ignore this email. No account is created until you click.
      </p>
      <p style="font-size:11px;color:#4A4A52;line-height:1.55;margin-top:28px;font-family:monospace;word-break:break-all;">
        {invite_url}
      </p>
    </div>
  </body>
</html>"""


async def send_signin_email(
    to: str,
    name: str | None,
    invite_url: str,
) -> EmailResult:
    """Deliver a self-serve sign-in link. Returns whether we actually sent."""
    api_key = settings.resend_api_key.strip()
    expires_minutes = settings.signin_ttl_minutes

    if not api_key:
        # Dev fallback — log to stdout. The router decides whether to
        # surface the URL back to the client (only in APP_ENV=development).
        log.warning(
            "[auth.email] RESEND_API_KEY unset — logging sign-in URL instead. "
            "to=%s url=%s",
            to, invite_url,
        )
        return EmailResult(sent=False, dev_url=invite_url)

    body = _html_body(name, invite_url, expires_minutes)
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": "Sign in to Ravenhill",
                "html": body,
            },
        )
    if res.status_code >= 400:
        log.error(
            "[auth.email] Resend rejected send. status=%s body=%s",
            res.status_code,
            res.text[:500],
        )
        # Keep the URL out of the response — log it for the admin only.
        log.info("[auth.email] fallback sign-in url for %s: %s", to, invite_url)
        raise RuntimeError(f"resend_send_failed_{res.status_code}")
    return EmailResult(sent=True, dev_url=None)
