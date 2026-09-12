import pytest

from ofg.model import load_graph
from ofg.solve import check_passes

GRAPH = load_graph()

CASES = [
    (eq.id, check)
    for eq in GRAPH.equations.values()
    for check in eq.checks
]


@pytest.mark.parametrize("equation_id,check", CASES, ids=[c[0] for c in CASES])
def test_check(equation_id, check):
    equation = GRAPH.equations[equation_id]
    assert check_passes(equation, check), f"{equation_id}: {check}"
