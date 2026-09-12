# OpenFormulaGraph

An open graph of equations and variables.
It can be used to answer the question: given what you know, what else is calculable, and
by which equation?

Explore the graph at https://anacoda.github.io/OpenFormulaGraph/
<img width="1918" height="974" alt="image" src="https://github.com/user-attachments/assets/4e0e11e7-5ecf-423b-b378-ee5d892100d1" />


This is a data layer upon which teaching tools like games, quizzes, etc. are
meant to be built on top of.

## Data model
Currently the graph is physics-focused.
- `data/quantities.yaml`: physical quantities (mass, force, velocity...),
  each with an SI dimension vector.
- `data/equations/*.yaml`: one equation per file, in canonical zero form
  (`expr == 0`), with its variables, a topic, a source citation, and a
  numeric `checks` fixture.

Equations aren't directional: `F = ma` is equally a way to find `m`,
computed on demand via SymPy. A variable's optional `role`
(`initial`/`final`, vector components, multiple bodies) allows the
same quantity appear more than once in an equation without ambiguity.

## Usage

Requires [uv](https://docs.astral.sh/uv/).

```bash
> uv run ofg calculable mass force time

Calculable:
  Acceleration  (via "Newton's Second Law", F = ma)
```

```bash
> uv run ofg calculable mass force time velocity

Calculable:
  Energy  (via 'Kinetic Energy', KE = \tfrac{1}{2} m v^2)
  Momentum  (via 'Linear Momentum', p = mv)
  Acceleration  (via "Newton's Second Law", F = ma)
```

## Development

```bash
uv sync
uv run pytest
```

- `tests/test_dimensions.py` checks every equation for dimensional
consistency
- `tests/test_checks.py` runs each equation's numeric
example check
- `ofg.model.load_graph` enforces that declared variables match the symbols actually used in `expr`.

## License

Code: MIT ([LICENSE](LICENSE)). Data: CC BY 4.0 ([LICENSE-DATA](LICENSE-DATA)), citing
[OpenStax College Physics 2e](https://openstax.org/details/books/college-physics-2e), which
carries the same license.
