"""Tool router — analyze chat messages and execute the right tools.

Manages per-session tool state (active files, search results, content
cache) so follow-up questions like "that file" or "action items" work.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from tools.drive import (
    DriveFile,
    ReadResult,
    drive_read,
    drive_search,
    format_read_for_llm,
    format_search_for_llm,
)

log = logging.getLogger("tools.router")


@dataclass
class ToolState:
    active_file_ids: list[str] = field(default_factory=list)
    active_file_names: list[str] = field(default_factory=list)
    file_content_cache: dict[str, ReadResult] = field(default_factory=dict)
    last_search_results: list[DriveFile] = field(default_factory=list)


@dataclass
class ToolExecution:
    tools_called: list[str]
    context_for_llm: str
    source_labels: list[str]
    state: ToolState
    clarification: str | None = None


_DRIVE_TRIGGERS = re.compile(
    r"(files?\b|drive\b|doc(?:ument)?s?\b|sheets?\b|slides?\b|spreadsheet|"
    r"summarize|read\b|open\b|analyze|action\s+items|key\s+points|"
    r"what(?:'?s| is| are)?\s+in\b|contents?\b|recently\s+shared|"
    r"my\s+files|shared\s+with\s+me|download|bring\b|send\b|link\b)",
    re.IGNORECASE,
)
_REFERENCE_PATTERNS = re.compile(
    r"(that\s+file|those\s+files?|the\s+file|this\s+file|"
    r"same\s+file|it\b.*(?:summarize|read|open|action|content|download|bring|send|link))",
    re.IGNORECASE,
)
_LIST_TRIGGERS = re.compile(
    r"(what\s+files|list.*files|my\s+files|recently\s+shared|"
    r"shared\s+with\s+me|files?\s+in\s+my\s+drive|show.*files)",
    re.IGNORECASE,
)
_READ_TRIGGERS = re.compile(
    r"(summarize|read|open|analyze|action\s+items|key\s+points|"
    r"what(?:'?s| is| are)?\s+in\b|contents?\s+of|tell\s+me\s+about)",
    re.IGNORECASE,
)


def _extract_file_query(message: str) -> str:
    """Try to extract a file name or search query from the message."""
    msg = message.strip()
    for prefix in [
        r"summarize\s+(?:this\s+)?(?:drive\s+)?(?:file:?\s*)?",
        r"read\s+(?:the\s+)?(?:file\s+)?(?:about\s+)?",
        r"open\s+(?:the\s+)?(?:file\s+)?(?:about\s+)?",
        r"analyze\s+(?:the\s+)?(?:file\s+)?",
        r"action\s+items\s+(?:in|from)\s+(?:the\s+)?",
        r"key\s+points\s+(?:in|from)\s+(?:the\s+)?",
        r"what(?:'?s| is| are)?\s+in\s+(?:the\s+)?(?:file\s+)?",
        r"tell\s+me\s+about\s+(?:the\s+)?(?:file\s+)?",
        r"contents?\s+of\s+(?:the\s+)?",
    ]:
        m = re.match(prefix, msg, re.IGNORECASE)
        if m:
            return msg[m.end():].strip().strip('"\'')
    return msg


async def route_tools(
    agent_id: str,
    message: str,
    state: ToolState,
    google_connected: bool,
) -> ToolExecution | None:
    """Analyze the message, execute tools, return results for LLM context.

    Returns None if no tools should fire (let the normal LLM path handle it).
    """
    if not google_connected:
        if _DRIVE_TRIGGERS.search(message):
            return ToolExecution(
                tools_called=["drive.search"],
                context_for_llm="",
                source_labels=[],
                state=state,
                clarification=(
                    "Google Drive isn't connected yet. "
                    "Connect Google in Settings → Google to let me search and read your files."
                ),
            )
        return None

    if not _DRIVE_TRIGGERS.search(message):
        return None

    tools_called: list[str] = []
    context_parts: list[str] = []
    source_labels: list[str] = []

    # --- Reference resolution: "that file", "those files" ---
    if _REFERENCE_PATTERNS.search(message) and state.active_file_ids:
        log.info("[router] resolving reference — %d active files", len(state.active_file_ids))

        # Get full file info for URLs
        full_search = await drive_search(agent_id, "", limit=50)
        file_urls: dict[str, str] = {f.id: f.url for f in full_search.files if f.url}

        for fid, fname in zip(state.active_file_ids, state.active_file_names):
            url = file_urls.get(fid, "")
            if fid in state.file_content_cache:
                read = state.file_content_cache[fid]
            else:
                read = await drive_read(agent_id, fid)
                if not read.error:
                    state.file_content_cache[fid] = read
            tools_called.append("drive.read")
            ctx = format_read_for_llm(read)
            if url:
                ctx += f"\nDrive link: {url}"
            context_parts.append(ctx)
            source_labels.append(f"Google Drive · {fname}")

        return ToolExecution(
            tools_called=tools_called,
            context_for_llm="\n\n".join(context_parts),
            source_labels=source_labels,
            state=state,
        )

    # --- List/recent files ---
    if _LIST_TRIGGERS.search(message):
        search = await drive_search(agent_id, "", limit=15)
        tools_called.append("drive.search")
        state.last_search_results = search.files
        state.active_file_ids = [f.id for f in search.files]
        state.active_file_names = [f.name for f in search.files]
        context_parts.append(format_search_for_llm(search))
        source_labels.append("Google Drive")
        return ToolExecution(
            tools_called=tools_called,
            context_for_llm="\n\n".join(context_parts),
            source_labels=source_labels,
            state=state,
        )

    # --- Search + read specific file ---
    if _READ_TRIGGERS.search(message):
        query = _extract_file_query(message)
        if not query or len(query) < 2:
            return None

        search = await drive_search(agent_id, query)
        tools_called.append("drive.search")

        if not search.files:
            state.last_search_results = []
            return ToolExecution(
                tools_called=tools_called,
                context_for_llm=format_search_for_llm(search),
                source_labels=[],
                state=state,
            )

        if len(search.files) == 1:
            f = search.files[0]
            state.active_file_ids = [f.id]
            state.active_file_names = [f.name]
            state.last_search_results = search.files

            read = await drive_read(agent_id, f.id)
            tools_called.append("drive.read")
            if not read.error:
                state.file_content_cache[f.id] = read
            context_parts.append(format_read_for_llm(read))
            source_labels.append(f"Google Drive · {f.name}")
            return ToolExecution(
                tools_called=tools_called,
                context_for_llm="\n\n".join(context_parts),
                source_labels=source_labels,
                state=state,
            )

        # Multiple matches — read the best match, list the rest
        best = search.files[0]
        state.active_file_ids = [f.id for f in search.files[:5]]
        state.active_file_names = [f.name for f in search.files[:5]]
        state.last_search_results = search.files

        read = await drive_read(agent_id, best.id)
        tools_called.append("drive.read")
        if not read.error:
            state.file_content_cache[best.id] = read
        context_parts.append(format_read_for_llm(read))
        if len(search.files) > 1:
            others = [f.name for f in search.files[1:5]]
            context_parts.append(
                f"OTHER MATCHES for \"{query}\": {', '.join(others)}"
            )
        source_labels.append(f"Google Drive · {best.name}")
        return ToolExecution(
            tools_called=tools_called,
            context_for_llm="\n\n".join(context_parts),
            source_labels=source_labels,
            state=state,
        )

    return None
