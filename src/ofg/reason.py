"""Forward reasoning: what can be calculated from what is known.

An equation needs all but one of its variables to solve for the last one.
Repeatedly applying that rule until nothing new is learned is forward
chaining: https://en.wikipedia.org/wiki/Forward_chaining. Because each
equation requires several things to be known at once (an AND) before it
can fire, out of several equations that could apply (an OR), this is an
AND-OR search rather than a shortest-path one:
https://en.wikipedia.org/wiki/And%E2%80%93or_tree
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from ofg.model import Graph

Slot = tuple[str, str | None]  # (quantity id, role), e.g. ("velocity", "initial")


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


def forward_closure(
    graph: Graph,
    known_quantities: Iterable[str] = (),
    known_slots: Iterable[Slot] = (),
) -> ForwardResult:
    """Everything derivable from what's known, and which equation derived it.

    `known_quantities` are plain ids (role defaults to None). `known_slots`
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
