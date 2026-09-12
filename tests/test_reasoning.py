from ofg.model import load_graph
from ofg.reason import what_can_i_calculate

GRAPH = load_graph()


def test_incomplete_knowns_yield_only_what_is_actually_derivable():
    """mass + force + time gives acceleration, and nothing else — the graph
    must refuse to invent a velocity or displacement it has no basis for."""
    result = what_can_i_calculate(GRAPH, known_quantities={"mass", "force", "time"})

    new_slots = {s for s in result.known if s not in {("mass", None), ("force", None), ("time", None)}}
    assert new_slots == {("acceleration", None)}

    (step,) = result.steps
    assert step.equation_id == "newtons-second-law"
    assert step.resolved == ("acceleration", None)


def test_adding_initial_velocity_unlocks_the_rest_of_the_chain():
    """Once v0 is also known, acceleration, final velocity, and displacement
    should all become calculable — and, once force and displacement are both
    known, work and power (which only need those) fall out too."""
    result = what_can_i_calculate(
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
    # but nothing resolves plain (velocity, None) or momentum/energy from it —
    # those need an unrole'd velocity, and only initial/final ones are known
    assert ("velocity", None) not in resolved
    assert ("momentum", None) not in resolved


def test_nothing_known_yields_nothing_new():
    result = what_can_i_calculate(GRAPH, known_quantities=set())
    assert result.steps == ()
