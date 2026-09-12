import json

from ofg.build import to_bundle
from ofg.model import load_graph

GRAPH = load_graph()


def test_bundle_is_json_serializable_and_complete():
    bundle = to_bundle(GRAPH)
    json.dumps(bundle)  # raises if anything isn't serializable

    assert {q["id"] for q in bundle["quantities"]} == set(GRAPH.quantities)
    assert {e["id"] for e in bundle["equations"]} == set(GRAPH.equations)
