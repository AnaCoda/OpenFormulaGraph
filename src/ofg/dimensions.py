"""Dimensional consistency checking.

Not a units library — a 7-vector of exponents over the SI base dimensions
(mass, length, time, current, temperature, amount, luminous intensity) plus
about fifty lines of arithmetic. Checking an equation means walking its
expression tree and asserting every additive term ends up with the same
vector. That catches a wrong exponent or a wrong variable; it can't catch a
missing constant factor or a flipped sign, which is what `checks` is for.
"""

from __future__ import annotations

from fractions import Fraction

import sympy

from ofg.model import Equation, Quantity

BASE_DIMS = ("M", "L", "T", "I", "Theta", "N", "J")

Vector = tuple[Fraction, ...]

ZERO: Vector = tuple(Fraction(0) for _ in BASE_DIMS)


class DimensionError(ValueError):
    """An equation's additive terms don't share a dimension vector."""


def vector_from_dict(dimension: dict[str, int]) -> Vector:
    unknown = set(dimension) - set(BASE_DIMS)
    if unknown:
        raise DimensionError(f"unknown base dimension(s): {sorted(unknown)}")
    return tuple(Fraction(dimension.get(d, 0)) for d in BASE_DIMS)


def _add(a: Vector, b: Vector) -> Vector:
    return tuple(x + y for x, y in zip(a, b))


def _scale(a: Vector, k: Fraction) -> Vector:
    return tuple(x * k for x in a)


def dim_of(expr: sympy.Expr, symbol_quantities: dict[str, Quantity]) -> Vector:
    """The dimension vector of a sub-expression, or raise DimensionError."""
    if expr.is_Symbol:
        quantity = symbol_quantities.get(expr.name)
        if quantity is None:
            raise DimensionError(f"no quantity known for symbol '{expr.name}'")
        return vector_from_dict(quantity.dimension)

    if expr.is_Number:
        return ZERO

    if expr.is_Add:
        vectors = [dim_of(term, symbol_quantities) for term in expr.args]
        first = vectors[0]
        for term, vec in zip(expr.args[1:], vectors[1:]):
            if vec != first:
                raise DimensionError(
                    f"inconsistent additive terms: {expr.args[0]} has "
                    f"dimension {first} but {term} has dimension {vec}"
                )
        return first

    if expr.is_Mul:
        total = ZERO
        for factor in expr.args:
            total = _add(total, dim_of(factor, symbol_quantities))
        return total

    if expr.is_Pow:
        base, exponent = expr.args
        if not exponent.is_number or not exponent.is_real:
            raise DimensionError(f"non-numeric exponent in {expr}: {exponent}")
        return _scale(dim_of(base, symbol_quantities), Fraction(exponent))

    raise DimensionError(f"don't know how to check dimensions of: {expr} "
                          f"({type(expr).__name__})")


def check_equation(equation: Equation, quantities: dict[str, Quantity]) -> Vector:
    """Return the equation's shared dimension vector, or raise DimensionError."""
    symbol_quantities = {
        name: quantities[var.quantity] for name, var in equation.variables.items()
    }
    try:
        return dim_of(equation.expr, symbol_quantities)
    except DimensionError as exc:
        raise DimensionError(f"{equation.id}: {exc}") from exc
