from ofg.model import load_graph
from ofg.reason import forward_closure

GRAPH = load_graph()

# Constant quantities (e.g. g, G, k) are known unconditionally, regardless of
# what's passed to forward_closure, so tests exclude them from "newly known".
CONSTANT_SLOTS = {(q.id, None) for q in GRAPH.quantities.values() if q.constant}


def test_only_the_derivable_quantity_is_returned():
    result = forward_closure(GRAPH, known_quantities={"mass", "force", "time"})

    baseline = {("mass", None), ("force", None), ("time", None)} | CONSTANT_SLOTS
    new_slots = {s for s in result.known if s not in baseline}
    assert new_slots == {("acceleration", None), ("force", "weight"), ("impulse", None)}

    resolved = {step.resolved for step in result.steps}
    assert resolved == new_slots


def test_initial_velocity_unlocks_the_rest_of_the_chain():
    result = forward_closure(
        GRAPH,
        known_quantities={"mass", "force", "time"},
        known_slots={("velocity", "initial")},
    )

    resolved = {step.resolved for step in result.steps}
    assert resolved == {
        ("acceleration", None),
        ("velocity", "final"),
        ("velocity", "average"),
        ("displacement", None),
        ("work", None),
        ("power", None),
        ("force", "weight"),
        ("impulse", None),
    }


def test_nothing_known_yields_nothing_new():
    result = forward_closure(GRAPH, known_quantities=set())
    assert result.steps == ()
