"""The API over real HTTP, against a uvicorn process.

The test client calls the app in-process and does not exercise uvicorn, JSON encoding over
the wire, or CORS. Those have their own failure modes, so this suite starts the real
server and talks to it on a socket.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import httpx2
import pytest

ENGINE = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = int(s.getsockname()[1])
    return port


@pytest.fixture(scope="module")
def server() -> Iterator[str]:
    port = _free_port()
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "isolate.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=ENGINE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            if proc.poll() is not None:
                output = proc.stdout.read() if proc.stdout else ""
                raise RuntimeError(f"server exited early:\n{output}")
            try:
                if httpx2.get(f"{base}/api/health", timeout=1.0).status_code == 200:
                    break
            except httpx2.TransportError:
                time.sleep(0.15)
        else:
            raise RuntimeError("server did not become ready")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=15)


class TestOverHttp:
    def test_health(self, server: str):
        body = httpx2.get(f"{server}/api/health", timeout=10).json()
        assert body["status"] == "ok"

    def test_runs_a_schedule(self, server: str):
        response = httpx2.post(
            f"{server}/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "serializable", "2": "serializable"},
                "operations": [
                    {"txn": 1, "kind": "begin"},
                    {"txn": 2, "kind": "begin"},
                    {"txn": 1, "kind": "read", "key": "1"},
                    {"txn": 1, "kind": "read", "key": "2"},
                    {"txn": 2, "kind": "read", "key": "1"},
                    {"txn": 2, "kind": "read", "key": "2"},
                    {"txn": 1, "kind": "write", "key": "1", "value": 11},
                    {"txn": 2, "kind": "write", "key": "2", "value": 21},
                    {"txn": 1, "kind": "commit"},
                    {"txn": 2, "kind": "commit"},
                ],
            },
            timeout=30,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["aborted"] == [2]
        assert len(body["steps"]) == 10

    def test_malformed_input_names_the_bad_field(self, server: str):
        response = httpx2.post(
            f"{server}/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "operations": [{"txn": 1, "kind": "nonsense"}],
            },
            timeout=30,
        )
        assert response.status_code == 422
        assert "kind" in response.text

    def test_matrix_agrees_with_the_published_table(self, server: str):
        rows = httpx2.get(f"{server}/api/matrix", timeout=60).json()
        assert len(rows) == 7
        for row in rows:
            for cell in row["cells"]:
                assert cell["agrees"]

    def test_scenarios_are_served(self, server: str):
        body = httpx2.get(f"{server}/api/scenarios", timeout=30).json()
        assert len(body) >= 14

    def test_parse_over_the_wire(self, server: str):
        body = httpx2.post(
            f"{server}/api/parse",
            json={"txn": 1, "sql": "select * from test where id = 2"},
            timeout=30,
        ).json()
        assert body["operations"][0]["key"] == "2"

    def test_cors_allows_the_frontend_origin(self, server: str):
        response = httpx2.options(
            f"{server}/api/run",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=30,
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_a_large_schedule_is_handled(self, server: str):
        operations = [{"txn": 1, "kind": "begin"}]
        for i in range(25):
            operations.append({"txn": 1, "kind": "write", "key": "1", "value": i})
        operations.append({"txn": 1, "kind": "commit"})
        response = httpx2.post(
            f"{server}/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "operations": operations,
            },
            timeout=60,
        )
        assert response.status_code == 200
        assert response.json()["summary"]["final"] == {"1": 24, "2": 20}
