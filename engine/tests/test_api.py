from __future__ import annotations

from fastapi.testclient import TestClient

from isolate.api import app

client = TestClient(app)

G2_ITEM = {
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
}


class TestRun:
    def test_returns_one_step_per_operation(self):
        response = client.post("/api/run", json=G2_ITEM)
        assert response.status_code == 200
        assert len(response.json()["steps"]) == len(G2_ITEM["operations"])

    def test_serializable_aborts_the_second_committer(self):
        body = client.post("/api/run", json=G2_ITEM).json()
        assert body["summary"]["committed"] == [1]
        assert body["summary"]["aborted"] == [2]

    def test_steps_carry_versions_and_visibility(self):
        step = client.post("/api/run", json=G2_ITEM).json()["steps"][6]
        assert "1" in step["versions"]
        assert step["visible"]
        assert step["txns"]["1"]["snapshot_xmax"] is not None

    def test_repeatable_read_reports_the_anomaly(self):
        body = client.post(
            "/api/run",
            json={**G2_ITEM, "isolation": {"1": "repeatable_read", "2": "repeatable_read"}},
        ).json()
        assert "G2-item" in body["summary"]["anomalies"]

    def test_mixed_isolation_levels_are_allowed(self):
        response = client.post(
            "/api/run",
            json={**G2_ITEM, "isolation": {"1": "serializable", "2": "read_committed"}},
        )
        assert response.status_code == 200

    def test_custom_initial_rows(self):
        body = client.post(
            "/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "initial": [{"key": "7", "value": 70}],
                "operations": [
                    {"txn": 1, "kind": "begin"},
                    {"txn": 1, "kind": "read", "key": "7"},
                    {"txn": 1, "kind": "commit"},
                ],
            },
        ).json()
        assert body["summary"]["final"] == {"7": 70}

    def test_mysql_profile_loses_the_update_silently(self):
        body = client.post(
            "/api/run",
            json={
                "engine": "mysql",
                "isolation": {"1": "repeatable_read", "2": "repeatable_read"},
                "operations": [
                    {"txn": 1, "kind": "begin"},
                    {"txn": 2, "kind": "begin"},
                    {"txn": 1, "kind": "read", "key": "1"},
                    {"txn": 2, "kind": "read", "key": "1"},
                    {"txn": 1, "kind": "write", "key": "1", "value": 11},
                    {"txn": 2, "kind": "write", "key": "1", "value": 11},
                    {"txn": 1, "kind": "commit"},
                    {"txn": 2, "kind": "commit"},
                ],
            },
        ).json()
        assert body["summary"]["aborted"] == []


class TestValidation:
    def test_unknown_field_is_rejected_not_dropped(self):
        """extra=forbid, so a typo must be an error rather than a silent no-op"""
        response = client.post("/api/run", json={**G2_ITEM, "isolatoin": "serializable"})
        assert response.status_code == 422

    def test_unknown_operation_kind_is_rejected(self):
        response = client.post(
            "/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "operations": [{"txn": 1, "kind": "raed", "key": "1"}],
            },
        )
        assert response.status_code == 422

    def test_the_error_names_the_bad_field(self):
        response = client.post(
            "/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "operations": [{"txn": 1, "kind": "raed", "key": "1"}],
            },
        )
        assert "kind" in response.text

    def test_missing_isolation_for_a_used_transaction(self):
        response = client.post(
            "/api/run",
            json={
                "engine": "postgres",
                "isolation": {"1": "read_committed"},
                "operations": [
                    {"txn": 1, "kind": "begin"},
                    {"txn": 5, "kind": "begin"},
                ],
            },
        )
        assert response.status_code == 422
        assert "5" in response.text

    def test_unknown_engine_profile_is_rejected(self):
        response = client.post("/api/run", json={**G2_ITEM, "engine": "sqlite"})
        assert response.status_code == 422

    def test_empty_operation_list_is_rejected(self):
        response = client.post(
            "/api/run",
            json={"engine": "postgres", "isolation": {"1": "read_committed"}, "operations": []},
        )
        assert response.status_code == 422


class TestParse:
    def test_parses_a_statement(self):
        body = client.post(
            "/api/parse", json={"txn": 1, "sql": "update test set value = 11 where id = 1"}
        ).json()
        assert body["operations"] == [
            {"txn": 1, "kind": "write", "key": "1", "value": 11, "predicate": None}
        ]

    def test_parse_error_names_the_fragment(self):
        response = client.post(
            "/api/parse", json={"txn": 1, "sql": "update test set value = value + 10 where id = 1"}
        )
        assert response.status_code == 422
        assert "value + 10" in response.text

    def test_unknown_table_is_reported(self):
        response = client.post("/api/parse", json={"txn": 1, "sql": "select * from orders"})
        assert response.status_code == 422
        assert "orders" in response.text


class TestScenarios:
    def test_every_scenario_is_listed(self):
        body = client.get("/api/scenarios").json()
        assert len(body) >= 14
        assert {"G0", "G1a", "P4", "G2-item", "G2-fekete"} <= {s["id"] for s in body}

    def test_each_scenario_names_its_source(self):
        for scenario in client.get("/api/scenarios").json():
            assert scenario["source"].startswith("hermitage/")

    def test_a_listed_scenario_runs(self):
        scenario = next(s for s in client.get("/api/scenarios").json() if s["id"] == "P4")
        txns = sorted({o["txn"] for o in scenario["operations"]})
        response = client.post(
            "/api/run",
            json={
                "engine": "postgres",
                "isolation": dict.fromkeys((str(t) for t in txns), "repeatable_read"),
                "initial": [{"key": k, "value": v} for k, v in scenario["initial"].items()],
                "operations": scenario["operations"],
            },
        )
        assert response.status_code == 200
        assert response.json()["summary"]["aborted"] == [2]


class TestMatrix:
    def test_returns_every_row(self):
        body = client.get("/api/matrix").json()
        assert len(body) == 7

    def test_no_cell_disagrees_with_the_published_table(self):
        for row in client.get("/api/matrix").json():
            for cell in row["cells"]:
                assert cell["agrees"], f"{row['engine']} {row['label']} {cell['anomaly']}"

    def test_each_cell_links_to_its_scenario(self):
        ids = {s["id"] for s in client.get("/api/scenarios").json()}
        for row in client.get("/api/matrix").json():
            for cell in row["cells"]:
                assert cell["scenario_id"] in ids


class TestHealth:
    def test_health_reports_ok(self):
        assert client.get("/api/health").json()["status"] == "ok"
