from ofg.dimensions import check_equation
from ofg.model import load_graph

GRAPH = load_graph()


def test_all_equations_are_dimensionally_consistent():
    for eq in GRAPH.equations.values():
        # raises DimensionError if any additive term disagrees
        check_equation(eq, GRAPH.quantities)
