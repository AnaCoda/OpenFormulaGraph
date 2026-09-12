# OpenFormulaGraph

A small, open, machine-checkable graph of physics equations and quantities.
It answers one question: *given what you know, what else is calculable, and
by which equation?* The answer comes from structure (SymPy + a fixed-point
closure), not from a language model.

This is a data layer, not an application — games, quizzes, and tutors are
meant to be built on top of it.

## Status

Early skeleton (M0). A handful of quantities and equations, hand-loaded from
YAML, with dimensional and numeric checks, and forward reasoning over what's
known.

## Data model

- **`data/quantities.yaml`** — physical quantities (mass, force, velocity...),
  each with an SI dimension vector.
- **`data/equations/*.yaml`** — one equation per file, in canonical zero form
  (`expr == 0`), with its variables, a topic, a source citation, and a numeric
  `checks` fixture.

Equations aren't directional (`F = ma` is equally a way to find `m`, computed
on demand via SymPy), and one physical relation is one node — rearranged
forms are never stored separately. A variable's optional `role`
(`initial`/`final`, vector components, multiple bodies) is what lets the
same quantity appear more than once in an equation without ambiguity.

## Usage

```bash
pip install -e .
ofg what-can-i-calculate mass force time
```

```
Calculable:
  Acceleration  (via "Newton's Second Law", F = ma)
```

Add `velocity` to the knowns and momentum and kinetic energy also become
calculable — because now there's a mass *and* a (role-less) velocity to
compute them from.

## Development

```bash
pip install -e .
pytest
```

`tests/test_dimensions.py` checks every equation for dimensional consistency;
`tests/test_checks.py` runs each equation's numeric spot-check; loading the
graph itself (`ofg.model.load_graph`) enforces that declared variables match
the symbols actually used in `expr`.

## License

Code: MIT ([LICENSE](LICENSE)). Data (`data/`, and the eventual `dist/`
bundle): CC BY 4.0 ([LICENSE-DATA](LICENSE-DATA)), citing
[OpenStax College Physics 2e](https://openstax.org/details/books/college-physics-2e).
