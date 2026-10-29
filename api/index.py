# Vercel serverless entry point for the FastAPI app.
# vercel.json rewrites /api/<rest> to /api/index?__path=<rest>; Vercel then hands the app the path
# "/api/index", so the original path is restored here before FastAPI routes the request.
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app as fastapi_app  # noqa: E402


async def app(scope, receive, send):
    if scope["type"] == "http" and scope["path"].rstrip("/") == "/api/index":
        query = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
        rest = next((v for k, v in query if k == "__path"), None)
        if rest is not None:
            path = "/api/" + rest.lstrip("/")
            scope = dict(scope, path=path, raw_path=path.encode(),
                         query_string=urlencode([(k, v) for k, v in query if k != "__path"]).encode())
    await fastapi_app(scope, receive, send)
