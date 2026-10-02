"""Live dashboard updates over WebSocket (API.md §10.1).

Single-process hub: fine for the prototype. Running several backend workers would need a
shared broker (e.g. Redis pub/sub) so every worker sees every event.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Viewer:
    """What a connected staff member is allowed to see (same rules as API.md §6.1)."""

    user_id: int
    role: str
    department: str | None
    ward_id: int | None

    def can_see(self, department: str | None, ward_id: int | None) -> bool:
        if self.role == "officer":
            return department == self.department
        if self.role == "ward_rep":
            return ward_id == self.ward_id
        return self.role in ("mayor", "admin")


class DashboardHub:
    def __init__(self) -> None:
        self._connections: dict[WebSocket, Viewer] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        # The event loop only keeps weak references to tasks; hold them until they finish.
        self._tasks: set[asyncio.Task] = set()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Remember the server's event loop so sync routes (worker threads) can publish."""
        self._loop = loop

    async def connect(self, websocket: WebSocket, viewer: Viewer) -> None:
        await websocket.accept()
        self._connections[websocket] = viewer

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    async def _broadcast(
        self, message: dict[str, Any], department: str | None, ward_id: int | None
    ):
        for websocket, viewer in list(self._connections.items()):
            if not viewer.can_see(department, ward_id):
                continue
            try:
                await websocket.send_json(message)
            except Exception:  # client went away mid-send
                self.disconnect(websocket)

    def publish(
        self, event: str, data: dict[str, Any], *, department: str | None, ward_id: int | None
    ) -> None:
        """Send an event to every dashboard allowed to see it. Safe to call from any thread."""
        if self._loop is None or not self._connections:
            return
        message = {"event": event, "data": data, "at": datetime.now(UTC).isoformat()}
        coroutine = self._broadcast(message, department, ward_id)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            task = running.create_task(coroutine)
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        else:
            asyncio.run_coroutine_threadsafe(coroutine, self._loop)


hub = DashboardHub()
