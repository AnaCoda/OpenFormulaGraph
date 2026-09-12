from ofg.model import load_graph
from ofg.reason import forward_closure

GRAPH = load_graph()


def test_only_the_derivable_quantity_is_returned():
    result = forward_closure(GRAPH, known_quantities={"mass", "force", "time"})

    new_slots = {s for s in result.known if s not in {("mass", None), ("force", None), ("time", None)}}
    assert new_slots == {("acceleration", None)}

    (step,) = result.steps
    assert step.equation_id == "newtons-second-law"
    assert step.resolved == ("acceleration", None)


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
        ("displacement", None),
        ("work", None),
        ("power", None),
    }


def test_nothing_known_yields_nothing_new():
    result = forward_closure(GRAPH, known_quantities=set())
    assert result.steps == ()
