from __future__ import annotations

import sqlglot
from sqlglot import expressions as exp

_CACHE: dict[str, exp.Expression] = {}


class PredicateError(ValueError):
    pass


def parse_predicate(text: str) -> exp.Expression:
    if text in _CACHE:
        return _CACHE[text]
    try:
        tree = sqlglot.parse_one(f"select 1 where {text}", read="postgres")
    except Exception as err:
        raise PredicateError(f"cannot parse predicate: {text}") from err
    where = tree.args.get("where")
    if where is None:
        raise PredicateError(f"predicate has no condition: {text}")
    condition: exp.Expression = where.this
    _CACHE[text] = condition
    return condition


def matches(text: str, key: str, value: int) -> bool:
    """Evaluate a where clause against one row of the two column test table."""
    return _eval(parse_predicate(text), {"id": int(key), "value": value})


def _eval(node: exp.Expression, row: dict[str, int]) -> bool:
    match node:
        case exp.And():
            return _eval(node.this, row) and _eval(node.expression, row)
        case exp.Or():
            return _eval(node.this, row) or _eval(node.expression, row)
        case exp.Not():
            return not _eval(node.this, row)
        case exp.Paren():
            return _eval(node.this, row)
        case exp.EQ():
            return _num(node.this, row) == _num(node.expression, row)
        case exp.NEQ():
            return _num(node.this, row) != _num(node.expression, row)
        case exp.GT():
            return _num(node.this, row) > _num(node.expression, row)
        case exp.GTE():
            return _num(node.this, row) >= _num(node.expression, row)
        case exp.LT():
            return _num(node.this, row) < _num(node.expression, row)
        case exp.LTE():
            return _num(node.this, row) <= _num(node.expression, row)
        case exp.In():
            targets = [_num(e, row) for e in node.expressions]
            return _num(node.this, row) in targets
    raise PredicateError(f"unsupported predicate expression: {node.sql()}")


def _num(node: exp.Expression, row: dict[str, int]) -> int:
    match node:
        case exp.Column():
            name = node.name.lower()
            if name not in row:
                raise PredicateError(f"unknown column: {node.name}")
            return row[name]
        case exp.Literal() if node.is_int:
            return int(node.this)
        case exp.Neg():
            return -_num(node.this, row)
        case exp.Paren():
            return _num(node.this, row)
        case exp.Mod():
            return _num(node.this, row) % _num(node.expression, row)
        case exp.Add():
            return _num(node.this, row) + _num(node.expression, row)
        case exp.Sub():
            return _num(node.this, row) - _num(node.expression, row)
        case exp.Mul():
            return _num(node.this, row) * _num(node.expression, row)
    raise PredicateError(f"unsupported expression: {node.sql()}")
