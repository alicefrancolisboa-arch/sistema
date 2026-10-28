import importlib
import os
from pathlib import Path
from urllib.parse import urlsplit

from workers import Response, WorkerEntrypoint, wsgi

_module = None


def _binding(env, name, default=""):
    value = getattr(env, name, default)
    return default if value is None else str(value)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        global _module
        path = urlsplit(str(request.url)).path
        if path == "/":
            html = (Path(__file__).parent / "templates" / "index.html").read_text(encoding="utf-8")
            return Response(html, headers={"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})
        if not path.startswith("/api/"):
            return await self.env.ASSETS.fetch(request)
        if _module is None:
            os.environ["STORAGE_DRIVER"] = "turso"
            os.environ["DATA_DIR"] = "/tmp/aloha-casa-do-acai"
            os.environ["APP_USER"] = _binding(self.env, "APP_USER", "CASADOACAI")
            os.environ["APP_PASSWORD"] = _binding(self.env, "APP_PASSWORD", "151215")
            os.environ["TURSO_DATABASE_URL"] = _binding(self.env, "TURSO_DATABASE_URL")
            os.environ["TURSO_AUTH_TOKEN"] = _binding(self.env, "TURSO_AUTH_TOKEN")
            os.environ["GEMINI_API_KEY"] = _binding(self.env, "GEMINI_API_KEY")
            _module = importlib.import_module("app")
        return await wsgi.fetch(_module.app, request, self.env)
