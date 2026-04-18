"""Google Workspace integration router — Calendar, Drive, Gmail.

Follows the same fallback pattern as `integrations.google_meet`: when no OAuth
tokens are available, endpoints return representative seed data so the
frontend stays demo-ready. When the user connects their Google account, the
endpoints call the real Google APIs (reusing credentials from `google_meet`).
"""
