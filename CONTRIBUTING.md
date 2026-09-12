# Contributing

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
```

## Adding a quantity

Add an entry to `data/quantities.yaml`:

```yaml
- id: momentum
  name: Linear Momentum
  symbol: p
  dimension: {M: 1, L: 1, T: -1}
  si_unit: "kg*m/s"
  description: ...
  links:
    - {label: Wikipedia, url: "https://..."}
```

- `dimension` is an exponent vector over the SI base dimensions (`M`, `L`, `T`, `I`, `Theta`, `N`, `J`). Omit any dimension whose exponent is 0.
- `description`: if the quantity has a matching entry in the [OpenStax College Physics 2e glossary](https://openstax.org/books/college-physics-2e/pages/glossary), use that text verbatim. Otherwise write a short, mostly conceptual description.
- `links`: Wikipedia and, where one exists, Khan Academy.

## Adding an equation

Add a new file to `data/equations/<id>.yaml`:

```yaml
id: momentum
name: Linear Momentum
description: ...
expr: "p - m*v"
latex: "p = mv"
variables:
  p: {quantity: momentum}
  m: {quantity: mass}
  v: {quantity: velocity}
topic: momentum
requires: []
source:
  ref: openstax-college-physics-2e
  section: "8.1"
  url: "https://openstax.org/books/college-physics-2e/pages/8-1-linear-momentum-and-force"
links:
  - {label: Wikipedia, url: "https://..."}
  - {label: Khan Academy, url: "https://..."}
checks:
  - {given: {m: 2, v: 3}, solve_for: p, expect: 6}
```

- `expr` is the canonical zero form (`lhs - rhs`), not `lhs = rhs`.
- Every symbol used in `expr` must appear in `variables`, and vice versa; `ofg.model.load_graph` enforces this.
- If a quantity appears more than once in the same equation (e.g. `v` and `v0`), disambiguate with `role`: `v0: {quantity: velocity, role: initial}`.
- `source.section` should be the textbook section the equation comes from.
- `checks` needs at least one numeric example that satisfies the equation.
- `id` should match the equation's concept name directly (no `-definition` or similar suffixes).

## Verifying your change

```bash
uv run pytest
```

This checks, for every equation:
- declared variables match the symbols in `expr` (`ofg.model`)
- dimensional consistency across every additive term (`tests/test_dimensions.py`)
- the numeric `checks` fixtures solve correctly (`tests/test_checks.py`)

If you added or changed anything in `data/`, rebuild the bundle the web explorer reads from and commit the result:

```bash
uv run ofg build
```

This regenerates `dist/openformulagraph.json`.

## Explorer (web UI)

`explorer/` is a static app that reads `dist/openformulagraph.json`. To preview it locally:

```bash
uv run python -m http.server 8743
```

then open `http://localhost:8743/explorer/`.
