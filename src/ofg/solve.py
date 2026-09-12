"""Thin SymPy wrapper: substitute knowns, solve for one unknown.

Equations are stored in canonical zero form (`expr == 0`), which is what
`sympy.solve` wants directly.
"""

from __future__ import annotations

import sympy

from ofg.model import Equation


def solve_for(equation: Equation, given: dict[str, float], target: str) -> list[sympy.Expr]:
    """Substitute `given` values and solve the remaining expression for `target`."""
    substitutions = [(sympy.Symbol(name), sympy.nsimplify(value)) for name, value in given.items()]
    substituted = equation.expr.subs(substitutions)
    return sympy.solve(substituted, sympy.Symbol(target))


def check_passes(equation: Equation, check: dict, tol: float = 1e-9) -> bool:
    """Does this equation's `checks` entry solve to its expected value?"""
    solutions = solve_for(equation, check["given"], check["solve_for"])
    expected = check["expect"]
    return any(
        sol.is_number and abs(complex(sol) - complex(expected)) < tol for sol in solutions
    )
