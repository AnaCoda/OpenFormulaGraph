"""Forward reasoning: what can be calculated from what is known.

An equation needs *all but one* of its variables to yield the last one — so
this is a fixed-point closure over a set, not a shortest-path search. The
same closure (see `closure` below) is what a future teaching-order feature
would run over `requires` edges instead of quantity slots; only the `needs`
function changes.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Hashable, TypeVar

from ofg.model import Graph

Slot = tuple[str, str | None]

T = TypeVar("T", bound=Hashable)


def closure(known: set[T], items: Iterable[T], needs: Callable[[T], set[T]]) -> set[T]:
    """Grow `known` by adding any item whose prerequisites are all satisfied,
    repeating until nothing new is added."""
    known = set(known)
    items = list(items)
    changed = True
    while changed:
        changed = False
        for item in items:
            if item not in known and needs(item) <= known:
                known.add(item)
                changed = True
    return known


@dataclass(frozen=True)
class Step:
    """One equation firing: it turned `resolved` from unknown to known."""

    equation_id: str
    resolved: Slot


@dataclass(frozen=True)
class ForwardResult:
    known: frozenset[Slot]
    steps: tuple[Step, ...]

    def newly_known(self, initial: set[Slot]) -> list[Slot]:
        return [slot for slot in self.known if slot not in initial]


def what_can_i_calculate(
    graph: Graph,
    known_quantities: Iterable[str] = (),
    known_slots: Iterable[Slot] = (),
) -> ForwardResult:
    """Forward AND-OR closure over quantity slots.

    Each equation is a hyperedge over its variables' (quantity, role) slots:
    once all-but-one of its slots are known, the last one becomes known too.
    Constants are pre-seeded since the solver should never try to "find" them.

    `known_quantities` are plain ids (role defaults to None); `known_slots`
    lets a caller specify a role explicitly, e.g. ("velocity", "initial").
    """
    known: set[Slot] = {(q, None) for q in known_quantities}
    known.update(known_slots)
    for quantity in graph.quantities.values():
        if quantity.constant:
            known.add((quantity.id, None))

    steps: list[Step] = []
    changed = True
    while changed:
        changed = False
        for eq in graph.equations.values():
            missing = eq.slots - known
            if len(missing) == 1:
                (slot,) = missing
                known.add(slot)
                steps.append(Step(equation_id=eq.id, resolved=slot))
                changed = True

    return ForwardResult(known=frozenset(known), steps=tuple(steps))
