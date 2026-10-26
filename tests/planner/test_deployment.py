"""Exercise the hosted entry point over real HTTP, without Docker or a provider."""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from planner.api import create_app


def test_external_database_does_not_require_writing_to_source_tree(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'external.db'}")

    def read_only_source(*args, **kwargs):
        raise PermissionError("Application source is read-only")

    monkeypatch.setattr(Path, "mkdir", read_only_source)
    app = create_app(api_token="")
    with TestClient(app) as client:
        assert client.get("/api/scenarios").json()["data"]


def test_hosting_entrypoint_serves_frontend_api_and_guard_on_provider_port(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    root = Path(__file__).resolve().parents[2]
    child = subprocess.Popen(
        [sys.executable, "-m", "planner.serve"],
        cwd=root,
        env={
            **os.environ,
            "PORT": str(port),
            "DATABASE_URL": f"sqlite:///{tmp_path / 'hosted.db'}",
            "PLANNER_API_TOKEN": "hosting-test-only-token",
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        with httpx.Client(
            base_url=f"http://127.0.0.1:{port}", trust_env=False
        ) as client:
            deadline = time.monotonic() + 12
            while True:
                try:
                    health = client.get("/api/health")
                    if health.status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                if time.monotonic() >= deadline or child.poll() is not None:
                    raise AssertionError("Hosted application did not become healthy")
                time.sleep(0.05)
            assert health.json()["authentication_required"] is True
            page = client.get("/")
            assert page.status_code == 200 and 'id="root"' in page.text
            assert client.get("/api/scenarios").status_code == 401
            assert client.get(
                "/api/scenarios",
                headers={"Authorization": "Bearer hosting-test-only-token"},
            ).json()["data"]
    finally:
        child.terminate()
        try:
            child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.communicate()
