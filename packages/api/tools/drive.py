"""Drive tools — search, read, and list files from Google Drive."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("tools.drive")


@dataclass
class DriveFile:
    id: str
    name: str
    mime_type: str = ""
    owner: str = ""
    last_modified: str = ""
    url: str = ""


@dataclass
class SearchResult:
    files: list[DriveFile] = field(default_factory=list)
    query: str = ""


@dataclass
class ReadResult:
    name: str = ""
    content: str = ""
    mime_type: str = ""
    truncated: bool = False
    error: str | None = None
    char_count: int = 0


def _to_drive_file(raw: dict[str, Any]) -> DriveFile:
    return DriveFile(
        id=raw.get("id", ""),
        name=raw.get("name", "Untitled"),
        mime_type=raw.get("mime_type", ""),
        owner=raw.get("owner", ""),
        last_modified=raw.get("last_modified", ""),
        url=raw.get("url", ""),
    )


def _normalize(text: str) -> set[str]:
    return set(re.split(r"[\s_\-./]+", re.sub(r"\.\w{1,5}$", "", text.lower())))


async def drive_search(agent_id: str, query: str, limit: int = 10) -> SearchResult:
    """Search Drive files by name. Empty query returns recent files."""
    from integrations.workspace.adapters import _has_real_connection, list_drive_files

    if not await _has_real_connection(agent_id):
        return SearchResult(query=query)

    try:
        files = await list_drive_files(agent_id)
    except Exception:
        log.exception("drive_search failed for agent %s", agent_id)
        return SearchResult(query=query)

    if not query:
        result = SearchResult(files=[_to_drive_file(f) for f in files[:limit]], query="")
        log.info("[drive.search] agent=%s query=(recent) found=%d", agent_id[:8], len(result.files))
        return result

    q_lower = query.lower()
    q_words = _normalize(query)
    scored: list[tuple[float, dict[str, Any]]] = []
    for f in files:
        name = f.get("name", "")
        name_bare = re.sub(r"\.\w{1,5}$", "", name.lower())
        if name_bare in q_lower or q_lower in name_bare:
            scored.append((100, f))
            continue
        name_words = _normalize(name)
        overlap = name_words & q_words
        if overlap:
            scored.append((len(overlap), f))

    scored.sort(key=lambda x: -x[0])
    matched = [_to_drive_file(f) for _, f in scored[:limit]]
    log.info("[drive.search] agent=%s query=%r found=%d", agent_id[:8], query, len(matched))
    return SearchResult(files=matched, query=query)


async def drive_read(agent_id: str, file_id: str) -> ReadResult:
    """Read a Drive file's text content."""
    from integrations.workspace.adapters import _has_real_connection, read_drive_file_content

    if not await _has_real_connection(agent_id):
        return ReadResult(error="Google Drive is not connected.")

    try:
        raw = await read_drive_file_content(agent_id, file_id)
    except Exception:
        log.exception("drive_read failed for agent %s file %s", agent_id[:8], file_id)
        return ReadResult(error="Failed to read file from Drive.")

    content = raw.get("content", "")
    error = raw.get("error")
    result = ReadResult(
        name=raw.get("name", ""),
        content=content,
        mime_type=raw.get("mime_type", ""),
        truncated=raw.get("truncated", False),
        error=error,
        char_count=len(content),
    )
    log.info(
        "[drive.read] agent=%s file=%s chars=%d truncated=%s error=%s",
        agent_id[:8], result.name, result.char_count, result.truncated, result.error,
    )
    return result


def format_search_for_llm(result: SearchResult) -> str:
    """Format search results as context for the LLM."""
    if not result.files:
        if result.query:
            return f'DRIVE SEARCH for "{result.query}": No matching files found.'
        return "DRIVE: No files found in Drive."
    lines = []
    label = f'DRIVE SEARCH for "{result.query}"' if result.query else "RECENT DRIVE FILES"
    lines.append(f"{label} ({len(result.files)} results):")
    for f in result.files:
        owner_str = f" (owner: {f.owner})" if f.owner else ""
        mod_str = f", modified: {f.last_modified}" if f.last_modified else ""
        lines.append(f"  - {f.name}{owner_str}{mod_str}")
    return "\n".join(lines)


def format_read_for_llm(result: ReadResult) -> str:
    """Format file content as context for the LLM."""
    if result.error:
        return f"DRIVE FILE '{result.name}': {result.error}"
    trunc = " (truncated to 32KB)" if result.truncated else ""
    return (
        f"DRIVE FILE CONTENT — \"{result.name}\" ({result.mime_type}){trunc}:\n"
        f"--- BEGIN FILE ---\n{result.content}\n--- END FILE ---\n"
        f"Source: Google Drive · {result.name}"
    )
