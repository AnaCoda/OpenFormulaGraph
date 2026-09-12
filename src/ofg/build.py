"""Bundle data/ into a single dist/openformulagraph.json.

Consumers (the web explorer, or any downstream tool) fetch this one file
instead of parsing YAML. It's a plain, serializable projection of the
graph: quantities as declared, and equations with their variables and
latex. The symbolic `expr` itself doesn't survive the trip, since JSON has
no SymPy; `ofg.solve`/`ofg.dimensions` still work from the YAML directly.
"""

from __future__ import annotations

import json
import pathlib

from ofg.model import DEFAULT_DATA_DIR, Graph, load_graph

REPO_ROOT = DEFAULT_DATA_DIR.parent
DEFAULT_OUTPUT = REPO_ROOT / "dist" / "openformulagraph.json"


def to_bundle(graph: Graph) -> dict:
    return {
        "quantities": [
            {
                "id": q.id,
                "name": q.name,
                "symbol": q.symbol,
                "dimension": q.dimension,
                "si_unit": q.si_unit,
                "constant": q.constant,
                "value": q.value,
                "description": q.description,
                "links": q.links,
            }
            for q in graph.quantities.values()
        ],
        "equations": [
            {
                "id": eq.id,
                "name": eq.name,
                "latex": eq.latex,
                "topic": eq.topic,
                "variables": {
                    name: {"quantity": v.quantity, "role": v.role}
                    for name, v in eq.variables.items()
                },
                "requires": eq.requires,
                "source": eq.source,
                "description": eq.description,
                "links": eq.links,
            }
            for eq in graph.equations.values()
        ],
    }


def build(output: pathlib.Path = DEFAULT_OUTPUT) -> pathlib.Path:
    bundle = to_bundle(load_graph())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> int:
    path = build()
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
