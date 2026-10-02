"""WS /ws/dashboard — live events for the municipal dashboard (API.md §10.1)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import APIError
from app.core.security import decode_token, load_active_user
from app.services.realtime import Viewer, hub

router = APIRouter(tags=["realtime"])

# Close codes the dashboard reacts to: 4401 → refresh the token and reconnect, 4403 → give up.
CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403


@router.websocket("/ws/dashboard")
async def dashboard_socket(
    websocket: WebSocket,
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Query()] = "",
):
    try:
        user = load_active_user(db, int(decode_token(token, "access")["sub"]))
    except (APIError, ValueError) as exc:
        code = getattr(exc, "code", "UNAUTHORIZED")
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason=code)
        return
    if user.role == "citizen":
        await websocket.close(code=CLOSE_FORBIDDEN, reason="FORBIDDEN")
        return

    viewer = Viewer(user.id, user.role, user.department, user.ward_id)
    db.close()  # the socket may stay open for hours; don't hold a DB connection
    await hub.connect(websocket, viewer)
    try:
        while True:
            await websocket.receive_text()  # clients may send pings; nothing else is expected
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(websocket)
