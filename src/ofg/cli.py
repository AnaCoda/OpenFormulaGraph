"""Command-line entry point: `ofg`."""

from __future__ import annotations

import argparse
import sys

from ofg.model import Graph, load_graph
from ofg.reason import Slot, forward_closure


def _slot_label(graph: Graph, slot: Slot) -> str:
    quantity_id, role = slot
    name = graph.quantities[quantity_id].name
    return f"{name} ({role})" if role else name


def cmd_calculable(args: argparse.Namespace) -> int:
    graph = load_graph()

    unknown = set(args.quantities) - set(graph.quantities)
    if unknown:
        print(f"error: unknown quantity id(s): {sorted(unknown)}", file=sys.stderr)
        print(f"known quantities: {sorted(graph.quantities)}", file=sys.stderr)
        return 1

    result = forward_closure(graph, args.quantities)

    if not result.steps:
        print("Nothing new is calculable from what you know.")
        return 0

    print("Calculable:")
    for step in result.steps:
        eq = graph.equations[step.equation_id]
        print(f"  {_slot_label(graph, step.resolved)}  (via {eq.name!r}, {eq.latex})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ofg")
    subparsers = parser.add_subparsers(dest="command", required=True)

    calculable = subparsers.add_parser(
        "calculable",
        help="Given known quantities, report what else becomes calculable.",
    )
    calculable.add_argument("quantities", nargs="+", help="quantity ids you already know, e.g. mass force time")
    calculable.set_defaults(func=cmd_calculable)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
