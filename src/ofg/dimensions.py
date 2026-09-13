"""Dimensional analysis for equations.

Every physical quantity has a dimension: an expression in terms of the SI
base quantities below. Velocity, for example, is length / time. We store
each quantity's dimension as a 7-number vector of exponents and check that
every term added together in an equation shares the same vector. That
catches a wrong exponent or a wrong variable; it can't catch a missing
constant factor or a flipped sign, which is what `checks` is for.

Background: https://en.wikipedia.org/wiki/Dimensional_analysis
"""

from __future__ import annotations

from fractions import Fraction

import sympy

from ofg.model import Equation, Quantity

# The 7 SI base units and their dimension symbols, see
# https://en.wikipedia.org/wiki/SI_base_unit
# M=mass(kg) L=length(m) T=time(s) I=electric current(A)
# Theta=thermodynamic temperature(K) N=amount of substance(mol) J=luminous intensity(cd)
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


def dim_of(expr: sympy.Basic, symbol_quantities: dict[str, Quantity]) -> Vector:
    """The dimension vector of a sub-expression, or raise DimensionError."""
    if isinstance(expr, sympy.Symbol):
        quantity = symbol_quantities.get(expr.name)
        if quantity is None:
            raise DimensionError(f"no quantity known for symbol '{expr.name}'")
        return vector_from_dict(quantity.dimension)

    if expr.is_number:
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
        if not isinstance(exponent, sympy.Rational):
            raise DimensionError(f"non-rational exponent in {expr}: {exponent}")
        return _scale(dim_of(base, symbol_quantities), Fraction(exponent.p, exponent.q))

    if expr.is_Function:
        # Transcendental functions (sin, cos, tan, log, exp, ...) only make physical sense on
        # a dimensionless argument, and always produce a dimensionless result.
        for arg in expr.args:
            arg_dim = dim_of(arg, symbol_quantities)
            if arg_dim != ZERO:
                raise DimensionError(
                    f"{expr.func}(...) requires a dimensionless argument, but {arg} has dimension {arg_dim}"
                )
        return ZERO

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
