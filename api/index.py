# Vercel serverless entry point: exposes the FastAPI app for /api/* routes.
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app as fastapi_app  # noqa: E402


async def app(scope, receive, send):
    # TEMPORARY routing diagnostics: ?_debug=1 shows what Vercel passes to the app.
    if scope["type"] == "http" and b"_debug=1" in scope.get("query_string", b""):
        info = {k: str(scope.get(k)) for k in ("path", "raw_path", "root_path", "query_string")}
        info["headers"] = {k.decode(): v.decode() for k, v in scope["headers"] if k.startswith(b"x-") and b"auth" not in k}
        body = json.dumps(info, indent=1).encode()
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})
        return
    await fastapi_app(scope, receive, send)
