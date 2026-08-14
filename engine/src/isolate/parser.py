"""SQL text to operations, for the composer's text input.

Only the subset the engine models is accepted. Anything else is rejected by name rather
than half understood, because a statement that parses into the wrong operation produces a
plausible wrong trace.
"""
from __future__ import annotations

import sqlglot
from sqlglot import expressions as exp
from sqlglot.errors import ParseError as SqlglotParseError

from isolate.predicates import PredicateError, matches, parse_predicate
from isolate.types import Operation, OpKind

TABLE = "test"


class ParseError(ValueError):
    pass


def parse_sql(txn: int, sql: str) -> list[Operation]:
    operations: list[Operation] = []
    for statement in _split(sql):
        operations.append(_one(txn, statement))
    if not operations:
        raise ParseError("no statement found")
    return operations


def _split(sql: str) -> list[str]:
    return [s.strip() for s in sql.split(";") if s.strip()]


def _one(txn: int, statement: str) -> Operation:
    lowered = statement.lower().strip()

    if lowered.startswith("begin") or lowered.startswith("start transaction"):
        return Operation(txn=txn, kind=OpKind.BEGIN)
    if lowered == "commit":
        return Operation(txn=txn, kind=OpKind.COMMIT)
    if lowered in ("abort", "rollback"):
        return Operation(txn=txn, kind=OpKind.ABORT)
    if lowered.startswith("set transaction"):
        raise ParseError(
            "set the isolation level with the selector, not in SQL: " + statement
        )

    try:
        tree = sqlglot.parse_one(statement, read="postgres")
    except SqlglotParseError as err:
        raise ParseError(f"cannot parse: {statement}") from err
    if tree is None:
        raise ParseError(f"cannot parse: {statement}")

    match tree:
        case exp.Select():
            return _select(txn, tree, statement)
        case exp.Update():
            return _update(txn, tree, statement)
        case exp.Insert():
            return _insert(txn, tree, statement)
        case exp.Delete():
            return _delete(txn, tree, statement)
    raise ParseError(f"unsupported statement: {statement}")


def _check_table(node: exp.Expression, statement: str) -> None:
    table = node.find(exp.Table)
    if table is not None and table.name.lower() != TABLE:
        raise ParseError(f"only the {TABLE} table exists, not {table.name}")


def _where_text(node: exp.Expression) -> str | None:
    where = node.args.get("where")
    if where is None:
        return None
    rendered: str = where.this.sql(dialect="postgres")
    return rendered


def _single_key(condition: str | None) -> str | None:
    """A where clause of exactly `id = <n>` addresses one row, anything else is a predicate."""
    if condition is None:
        return None
    try:
        tree = parse_predicate(condition)
    except PredicateError as err:
        raise ParseError(str(err)) from err
    if not isinstance(tree, exp.EQ):
        return None
    left, right = tree.this, tree.expression
    addresses_id = isinstance(left, exp.Column) and left.name.lower() == "id"
    if addresses_id and isinstance(right, exp.Literal) and right.is_int:
        return str(int(right.this))
    return None


def _select(txn: int, tree: exp.Select, statement: str) -> Operation:
    _check_table(tree, statement)
    condition = _where_text(tree)
    if condition is None:
        return Operation(txn=txn, kind=OpKind.PREDICATE_READ, predicate="1 = 1")
    key = _single_key(condition)
    if key is not None:
        return Operation(txn=txn, kind=OpKind.READ, key=key)
    _validate(condition)
    return Operation(txn=txn, kind=OpKind.PREDICATE_READ, predicate=condition)


def _update(txn: int, tree: exp.Update, statement: str) -> Operation:
    _check_table(tree, statement)
    assignments = tree.args.get("expressions") or []
    if len(assignments) != 1:
        raise ParseError("update one column at a time, and only the value column")
    assignment = assignments[0]
    if not isinstance(assignment, exp.EQ):
        raise ParseError(f"cannot parse assignment: {assignment.sql()}")
    column = assignment.this
    if not isinstance(column, exp.Column) or column.name.lower() != "value":
        raise ParseError("only the value column can be updated")

    target = assignment.expression
    if not (isinstance(target, exp.Literal) and target.is_int):
        raise ParseError(
            f"the new value must be a plain number, not {target.sql()}. "
            "expressions like value + 10 are not modelled"
        )
    value = int(target.this)

    condition = _where_text(tree)
    if condition is None:
        raise ParseError("an update needs a where clause")
    key = _single_key(condition)
    if key is not None:
        return Operation(txn=txn, kind=OpKind.WRITE, key=key, value=value)
    _validate(condition)
    return Operation(txn=txn, kind=OpKind.PREDICATE_WRITE, value=value, predicate=condition)


def _insert(txn: int, tree: exp.Insert, statement: str) -> Operation:
    _check_table(tree, statement)
    values = tree.find(exp.Values)
    if values is None:
        raise ParseError("insert needs a values clause")
    tuples = values.expressions
    if len(tuples) != 1:
        raise ParseError("insert one row at a time")
    items = tuples[0].expressions
    if len(items) != 2:
        raise ParseError("insert needs exactly id and value")
    if not all(isinstance(i, exp.Literal) and i.is_int for i in items):
        raise ParseError("id and value must both be plain numbers")
    return Operation(
        txn=txn, kind=OpKind.INSERT, key=str(int(items[0].this)), value=int(items[1].this)
    )


def _delete(txn: int, tree: exp.Delete, statement: str) -> Operation:
    _check_table(tree, statement)
    condition = _where_text(tree)
    if condition is None:
        raise ParseError("a delete needs a where clause")
    key = _single_key(condition)
    if key is not None:
        return Operation(txn=txn, kind=OpKind.DELETE, key=key)
    _validate(condition)
    return Operation(txn=txn, kind=OpKind.PREDICATE_DELETE, predicate=condition)


def _validate(condition: str) -> None:
    """Reject a predicate the evaluator cannot handle, at parse time rather than at run."""
    try:
        parse_predicate(condition)
        # run it once against a sample row, so an unsupported operator is caught here
        # rather than at execution time deep inside a schedule
        matches(condition, "1", 10)
    except PredicateError as err:
        raise ParseError(f"unsupported where clause: {condition}") from err
