from __future__ import annotations

import pytest

from isolate.parser import ParseError, parse_sql
from isolate.types import OpKind


def one(sql: str, txn: int = 1):
    ops = parse_sql(txn, sql)
    assert len(ops) == 1
    return ops[0]


class TestTransactionControl:
    def test_begin(self):
        assert one("begin").kind is OpKind.BEGIN

    def test_start_transaction(self):
        assert one("start transaction").kind is OpKind.BEGIN

    def test_commit(self):
        assert one("commit").kind is OpKind.COMMIT

    def test_rollback_is_abort(self):
        assert one("rollback").kind is OpKind.ABORT

    def test_set_isolation_is_rejected_with_a_useful_message(self):
        with pytest.raises(ParseError, match="selector"):
            parse_sql(1, "set transaction isolation level serializable")


class TestSelect:
    def test_by_primary_key_is_an_item_read(self):
        op = one("select * from test where id = 1")
        assert op.kind is OpKind.READ
        assert op.key == "1"

    def test_without_a_where_clause_is_a_full_scan(self):
        op = one("select * from test")
        assert op.kind is OpKind.PREDICATE_READ
        assert op.predicate == "1 = 1"

    def test_with_an_expression_is_a_predicate_read(self):
        op = one("select * from test where value % 3 = 0")
        assert op.kind is OpKind.PREDICATE_READ
        assert "value" in (op.predicate or "")

    def test_in_list_is_a_predicate_read(self):
        op = one("select * from test where id in (1,2)")
        assert op.kind is OpKind.PREDICATE_READ


class TestUpdate:
    def test_by_primary_key_is_an_item_write(self):
        op = one("update test set value = 11 where id = 1")
        assert op.kind is OpKind.WRITE
        assert op.key == "1"
        assert op.value == 11

    def test_by_predicate_is_a_predicate_write(self):
        op = one("update test set value = 12 where value = 10")
        assert op.kind is OpKind.PREDICATE_WRITE
        assert op.value == 12

    def test_without_a_where_clause_is_rejected(self):
        with pytest.raises(ParseError, match="where"):
            parse_sql(1, "update test set value = 11")

    def test_relative_update_is_rejected_by_name(self):
        """value = value + 10 appears in hermitage but the engine does not model it"""
        with pytest.raises(ParseError, match="plain number"):
            parse_sql(1, "update test set value = value + 10 where id = 1")

    def test_updating_the_id_column_is_rejected(self):
        with pytest.raises(ParseError, match="value column"):
            parse_sql(1, "update test set id = 5 where id = 1")


class TestInsertAndDelete:
    def test_insert(self):
        op = one("insert into test (id, value) values (3, 30)")
        assert op.kind is OpKind.INSERT
        assert op.key == "3"
        assert op.value == 30

    def test_delete_by_primary_key(self):
        op = one("delete from test where id = 1")
        assert op.kind is OpKind.DELETE
        assert op.key == "1"

    def test_delete_by_predicate(self):
        op = one("delete from test where value = 20")
        assert op.kind is OpKind.PREDICATE_DELETE

    def test_delete_without_a_where_clause_is_rejected(self):
        with pytest.raises(ParseError, match="where"):
            parse_sql(1, "delete from test")

    def test_multi_row_insert_is_rejected(self):
        with pytest.raises(ParseError, match="one row"):
            parse_sql(1, "insert into test (id, value) values (3, 30), (4, 40)")


class TestRejections:
    def test_another_table_is_named_in_the_error(self):
        with pytest.raises(ParseError, match="accounts"):
            parse_sql(1, "select * from accounts where id = 1")

    def test_gibberish_is_rejected(self):
        with pytest.raises(ParseError):
            parse_sql(1, "this is not sql at all !!")

    def test_unsupported_function_is_rejected(self):
        with pytest.raises(ParseError):
            parse_sql(1, "select * from test where upper(value) = 'X'")

    def test_empty_input_is_rejected(self):
        with pytest.raises(ParseError, match="no statement"):
            parse_sql(1, "   ")


class TestMultipleStatements:
    def test_semicolons_split_into_several_operations(self):
        ops = parse_sql(2, "begin; select * from test where id = 1; commit")
        assert [o.kind for o in ops] == [OpKind.BEGIN, OpKind.READ, OpKind.COMMIT]
        assert all(o.txn == 2 for o in ops)

    def test_a_hermitage_line_parses_end_to_end(self):
        ops = parse_sql(1, "update test set value = 11 where id = 1; commit;")
        assert [o.kind for o in ops] == [OpKind.WRITE, OpKind.COMMIT]
