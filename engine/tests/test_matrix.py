"""The computed matrix against the published one.

The published side is parsed from the downloaded README, so if that file changes upstream
these fail loudly rather than drifting.
"""
from __future__ import annotations

import hashlib

from isolate.matrix import ANOMALIES, FIXTURES, PUBLISHED, compute_matrix, disagreements

EXPECTED_SHA = {
    "README.md": "cf27c4cd39fae02f2d5ce080d522925071ae9033a8f6b835b888719a3535fb77",
    "postgres.md": "95664f4ea4fe951026db067ec4fcb47df7fe5a80202f1a634b0f96990ce8713b",
    "mysql.md": "bb0c593188f1053e11f56bb8ff0d665e640ad47be9b57ba51a3157dd05c50b84",
}


class TestFixtures:
    def test_hermitage_sources_are_unchanged(self):
        """the oracle must be the file the expectations were written against"""
        for name, expected in EXPECTED_SHA.items():
            raw = (FIXTURES / name).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == expected, f"{name} changed upstream"


class TestPublishedTable:
    def test_parses_every_row_it_should(self):
        assert ("PostgreSQL", "read committed") in PUBLISHED
        assert ("PostgreSQL", "serializable") in PUBLISHED
        assert ("MySQL/InnoDB", "repeatable read") in PUBLISHED

    def test_postgres_read_committed_row_matches_the_file(self):
        row = PUBLISHED[("PostgreSQL", "read committed")]
        assert row["G0"] is True
        assert row["G1c"] is True
        assert row["PMP"] is False
        assert row["G2"] is False

    def test_conditional_marks_become_none(self):
        """R/O is not a yes or a no, so it must not be flattened into one"""
        row = PUBLISHED[("MySQL/InnoDB", "repeatable read")]
        assert row["PMP"] is None
        assert row["G-single"] is None

    def test_every_row_covers_all_ten_anomalies(self):
        for key, row in PUBLISHED.items():
            assert set(row) == set(ANOMALIES), key


class TestComputedMatrix:
    def test_agrees_with_the_published_table_everywhere(self):
        """the headline claim. every comparable cell reproduces kleppmann's result"""
        assert disagreements() == []

    def test_covers_seven_rows(self):
        assert len(compute_matrix()) == 7

    def test_every_row_has_ten_cells(self):
        for row in compute_matrix():
            assert [c.anomaly for c in row.cells] == ANOMALIES

    def test_postgres_serializable_prevents_everything(self):
        row = next(
            r for r in compute_matrix() if r.engine == "PostgreSQL" and r.label == "serializable"
        )
        assert all(c.computed for c in row.cells)

    def test_read_uncommitted_prevents_almost_nothing(self):
        row = next(r for r in compute_matrix() if r.label == "read uncommitted")
        prevented = [c.anomaly for c in row.cells if c.computed]
        assert prevented == ["G0"]

    def test_mysql_repeatable_read_allows_lost_update(self):
        """the divergence the project exists to show"""
        row = next(
            r
            for r in compute_matrix()
            if r.engine == "MySQL/InnoDB" and r.label == "repeatable read"
        )
        p4 = next(c for c in row.cells if c.anomaly == "P4")
        assert p4.computed is False
        assert p4.published is False

    def test_postgres_repeatable_read_prevents_lost_update(self):
        row = next(
            r
            for r in compute_matrix()
            if r.engine == "PostgreSQL" and r.label == "repeatable read"
        )
        p4 = next(c for c in row.cells if c.anomaly == "P4")
        assert p4.computed is True

    def test_the_two_engines_disagree_on_lost_update(self):
        rows = {(r.engine, r.label): r for r in compute_matrix()}
        pg = next(
            c for c in rows[("PostgreSQL", "repeatable read")].cells if c.anomaly == "P4"
        )
        my = next(
            c for c in rows[("MySQL/InnoDB", "repeatable read")].cells if c.anomaly == "P4"
        )
        assert pg.computed != my.computed

    def test_every_cell_names_the_scenario_that_produced_it(self):
        for row in compute_matrix():
            for cell in row.cells:
                assert cell.scenario_id
