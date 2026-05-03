"""Lightweight server-side tool loop for chat.

Each tool wraps a real data adapter (Drive, Gmail, Calendar, Slack)
and returns structured results the LLM can ground answers in.
"""
