"""Load the YAML data files into dataclasses.

Two node types: quantities (mass, force, ...) and equations. Loading also
checks that every symbol used in an equation's `expr` has a matching
declared variable, and vice versa.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass, field

import sympy
import yaml
from sympy.parsing.sympy_parser import parse_expr

# repo_root/data, relative to this file (repo_root/src/ofg/model.py)
DEFAULT_DATA_DIR = pathlib.Path(__file__).resolve().parents[2] / "data"


@dataclass(frozen=True)
class Quantity:
    id: str
    name: str
    symbol: str
    dimension: dict[str, int] = field(default_factory=dict)
    si_unit: str | None = None
    constant: bool = False
    value: float | None = None


@dataclass(frozen=True)
class Variable:
    quantity: str
    role: str | None = None

    @property
    def slot(self) -> tuple[str, str | None]:
        """The (quantity, role) pair the solver keys on."""
        return (self.quantity, self.role)


@dataclass(frozen=True)
class Equation:
    id: str
    name: str
    expr: sympy.Expr
    latex: str
    variables: dict[str, Variable]
    topic: str
    requires: list[str]
    source: dict
    checks: list[dict]

    @property
    def slots(self) -> frozenset[tuple[str, str | None]]:
        return frozenset(v.slot for v in self.variables.values())


@dataclass(frozen=True)
class Graph:
    quantities: dict[str, Quantity]
    equations: dict[str, Equation]


class ModelError(ValueError):
    """A data file failed a structural check (schema/symbol agreement)."""


def load_quantities(path: pathlib.Path) -> dict[str, Quantity]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    quantities: dict[str, Quantity] = {}
    for entry in raw:
        q = Quantity(
            id=entry["id"],
            name=entry["name"],
            symbol=entry["symbol"],
            dimension=entry.get("dimension", {}),
            si_unit=entry.get("si_unit"),
            constant=entry.get("constant", False),
            value=entry.get("value"),
        )
        if q.id in quantities:
            raise ModelError(f"duplicate quantity id: {q.id}")
        quantities[q.id] = q
    return quantities


def _parse_equation_file(path: pathlib.Path) -> Equation:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))

    variables = {
        name: Variable(quantity=v["quantity"], role=v.get("role"))
        for name, v in raw["variables"].items()
    }

    symbols: dict[str, sympy.Symbol] = {str(name): sympy.Symbol(str(name)) for name in variables}
    expr = parse_expr(str(raw["expr"]), local_dict=symbols)

    declared = set(variables)
    used = {s.name for s in expr.free_symbols}
    if used != declared:
        missing = declared - used
        extra = used - declared
        detail = []
        if missing:
            detail.append(f"declared but unused: {sorted(missing)}")
        if extra:
            detail.append(f"used but undeclared: {sorted(extra)}")
        raise ModelError(f"{raw['id']}: symbol mismatch ({'; '.join(detail)})")

    return Equation(
        id=raw["id"],
        name=raw["name"],
        expr=expr,
        latex=raw.get("latex", ""),
        variables=variables,
        topic=raw["topic"],
        requires=raw.get("requires", []),
        source=raw.get("source", {}),
        checks=raw.get("checks", []),
    )


def load_equations(dir_path: pathlib.Path) -> dict[str, Equation]:
    equations: dict[str, Equation] = {}
    for path in sorted(dir_path.glob("*.yaml")):
        eq = _parse_equation_file(path)
        if eq.id in equations:
            raise ModelError(f"duplicate equation id: {eq.id}")
        equations[eq.id] = eq
    return equations


def load_graph(data_dir: pathlib.Path | None = None) -> Graph:
    data_dir = data_dir or DEFAULT_DATA_DIR
    quantities = load_quantities(data_dir / "quantities.yaml")
    equations = load_equations(data_dir / "equations")

    known_quantities = set(quantities)
    for eq in equations.values():
        for name, var in eq.variables.items():
            if var.quantity not in known_quantities:
                raise ModelError(
                    f"{eq.id}: variable '{name}' references unknown quantity "
                    f"'{var.quantity}'"
                )

    return Graph(quantities=quantities, equations=equations)
