// Fetches dist/openformulagraph.json and renders a clickable force-directed graph: click a quantity to see its equations, click an equation to see its variables.

const COLORS = {
  quantityFill: "#aab0cc",
  quantityText: "#2c3040",
  activeFill: "#4f6df5",
  linkIdle: "rgba(60,66,90,0.16)",
  linkActive: "rgba(79,109,245,0.55)",
  particle: "#4f6df5",
};

const SOURCE_NAMES = {
  "openstax-college-physics-2e": "OpenStax College Physics 2e",
};

const TOPIC_LABELS = {
  kinematics: "Kinematics",
  dynamics: "Dynamics",
  momentum: "Momentum",
  energy: "Work & Energy",
  "circular-motion": "Circular Motion",
  gravitation: "Gravitation",
  fluids: "Fluid Statics",
  waves: "Oscillatory Motion & Waves",
  electricity: "Electricity",
};

const HELP_LINKS = {
  siUnit: "https://en.wikipedia.org/wiki/International_System_of_Units",
  dimension: "https://en.wikipedia.org/wiki/Dimensional_analysis",
};

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

// Quantity/variable symbols spelled out in ASCII (data can't use raw unicode identifiers everywhere).
const GREEK = {
  lambda: "λ", lam: "λ", mu: "μ", rho: "ρ", theta: "θ", omega: "ω",
  delta: "δ", Delta: "Δ", sigma: "σ", tau: "τ", phi: "φ", psi: "ψ",
};

// Renders an ASCII-spelled Greek name as its actual glyph, e.g. "lambda" -> "λ".
function displaySymbol(symbol) {
  return GREEK[symbol] ?? symbol;
}

// Turns "v0" into "v_{0}" so it renders as a subscript like it does in the equation itself.
function symbolToLatex(symbol) {
  if (GREEK[symbol]) return GREEK[symbol];
  const match = symbol.match(/^([a-zA-Z]+)(\d+)$/);
  return match ? `${match[1]}_{${match[2]}}` : symbol;
}

function formatDimension(dimension) {
  const parts = Object.entries(dimension || {})
    .filter(([, exp]) => exp !== 0)
    .map(([base, exp]) => (exp === 1 ? base : base + String(exp).split("").map((c) => SUPERSCRIPT[c] ?? c).join("")));
  return parts.length ? parts.join("·") : "dimensionless";
}

// "kg*m/s^2" -> "kg·m/s²"; empty string (dimensionless quantities) -> "none".
function formatUnit(unit) {
  if (!unit) return "none";
  return unit
    .replace(/\*/g, "·")
    .replace(/\^(-?\d+)/g, (_, exp) => exp.split("").map((c) => SUPERSCRIPT[c] ?? c).join(""));
}

function buildGraphData(bundle) {
  const nodes = bundle.quantities
    .map((q) => ({ id: `q:${q.id}`, type: "quantity", qid: q.id, name: q.name, symbol: q.symbol, val: 3 }))
    .concat(
      bundle.equations.map((eq) => ({
        id: `e:${eq.id}`,
        type: "equation",
        eqid: eq.id,
        name: eq.name,
        latex: eq.latex,
        val: 12,
      }))
    );

  const links = [];
  for (const eq of bundle.equations) {
    for (const [symbol, v] of Object.entries(eq.variables)) {
      links.push({ source: `q:${v.quantity}`, target: `e:${eq.id}`, role: v.role, symbol });
    }
  }
  return { nodes, links };
}

// Gentle pull toward the origin so unlinked nodes (e.g. electric charge/current) don't drift off alone.
function centerPullForce(strength) {
  let nodes = [];
  function force(alpha) {
    for (const n of nodes) {
      n.vx -= n.x * strength * alpha;
      n.vy -= n.y * strength * alpha;
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

// Keeps cards and quantity labels from overlapping. Equation cards get a bigger effective
// radius the longer their name is, since that's what drives the card's actual width.
function nodeCollideForce(padding) {
  let nodes = [];
  const radiusOf = (n) => (n.type === "equation" ? 55 + n.name.length * 3.2 : 40);
  function force() {
    // Several passes per tick so overlaps resolve within the simulation's shorter, calmer settle time.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const minDist = radiusOf(a) + radiusOf(b) + padding;
          const dx = b.x - a.x || 0.01;
          const dy = b.y - a.y || 0.01;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            const move = ((minDist - dist) / dist) * 0.5;
            a.x -= dx * move;
            a.y -= dy * move;
            b.x += dx * move;
            b.y += dy * move;
          }
        }
      }
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

function explorer() {
  return {
    selected: null, // { type: 'quantity'|'equation', id } | null
    activeTab: "explore", // 'explore' | 'curriculum'
    _bundle: null,
    _graphData: null,
    _graph: null,
    _activeIds: null, // Set of graph node ids ("q:x" / "e:y"), or null = nothing dimmed

    async init() {
      // Deployed, the bundle sits next to index.html; in local dev it's one level up.
      let res = await fetch("dist/openformulagraph.json");
      if (!res.ok) res = await fetch("../dist/openformulagraph.json");
      this._bundle = await res.json();
      this._graphData = buildGraphData(this._bundle);
      this._renderGraph();
    },

    formatDimension,
    helpLinks: HELP_LINKS,

    get selectedQuantity() {
      if (this.selected?.type !== "quantity") return null;
      return this._bundle.quantities.find((q) => q.id === this.selected.id) ?? null;
    },

    get selectedEquation() {
      if (this.selected?.type !== "equation") return null;
      const eq = this._bundle.equations.find((e) => e.id === this.selected.id);
      if (!eq) return null;
      return { ...eq, katex: window.katex.renderToString(eq.latex, { throwOnError: false }) };
    },

    get curriculum() {
      if (!this._bundle) return [];
      return [...this._bundle.equations]
        .map((eq) => ({
          id: eq.id,
          name: eq.name,
          topic: eq.topic,
          section: eq.source?.section ?? "?",
          sectionNum: parseFloat(eq.source?.section ?? "0"),
          katex: window.katex.renderToString(eq.latex, { throwOnError: false }),
        }))
        .sort((a, b) => a.sectionNum - b.sectionNum);
    },

    // Curriculum list grouped by textbook topic/chapter.
    get curriculumGroups() {
      const groups = [];
      for (const eq of this.curriculum) {
        const last = groups[groups.length - 1];
        if (last && last.topic === eq.topic) last.items.push(eq);
        else groups.push({ topic: eq.topic, label: TOPIC_LABELS[eq.topic] ?? eq.topic, items: [eq] });
      }
      return groups;
    },

    get relatedEquations() {
      if (!this.selectedQuantity) return [];
      const qid = this.selectedQuantity.id;
      return this._bundle.equations
        .filter((eq) => Object.values(eq.variables).some((v) => v.quantity === qid))
        .map((eq) => {
          const variable = Object.values(eq.variables).find((v) => v.quantity === qid);
          return {
            id: eq.id,
            name: eq.name,
            katex: window.katex.renderToString(eq.latex, { throwOnError: false }),
            role: variable.role ?? "",
          };
        });
    },

    get relatedQuantities() {
      if (!this.selectedEquation) return [];
      return Object.entries(this.selectedEquation.variables).map(([symbol, v]) => {
        const q = this._bundle.quantities.find((q) => q.id === v.quantity);
        return {
          symbol,
          symbolKatex: window.katex.renderToString(symbolToLatex(symbol), { throwOnError: false }),
          qid: q.id,
          name: q.name,
          role: v.role ?? "",
          unit: formatUnit(q.si_unit),
        };
      });
    },

    sourceLabel(source) {
      if (!source) return "";
      const name = SOURCE_NAMES[source.ref] ?? source.ref;
      return `${name} §${source.section} ↗`;
    },

    selectQuantity(qid) {
      this.selected = { type: "quantity", id: qid };
      const active = new Set([`q:${qid}`]);
      for (const eq of this._bundle.equations) {
        if (Object.values(eq.variables).some((v) => v.quantity === qid)) active.add(`e:${eq.id}`);
      }
      this._activeIds = active;
      this.activeTab = "explore";
      this._refreshHighlight();
    },

    selectEquation(eqid) {
      this.selected = { type: "equation", id: eqid };
      const eq = this._bundle.equations.find((e) => e.id === eqid);
      const active = new Set([`e:${eqid}`]);
      for (const v of Object.values(eq.variables)) active.add(`q:${v.quantity}`);
      this._activeIds = active;
      this.activeTab = "explore";
      this._refreshHighlight();
    },

    clearSelection() {
      this.selected = null;
      this._activeIds = null;
      this._refreshHighlight();
    },

    _refreshHighlight() {
      for (const node of this._graphData.nodes) {
        if (node.type !== "equation" || !node._el) continue;
        const isActive = !this._activeIds || this._activeIds.has(node.id);
        node._el.classList.toggle("dim", !isActive);
        node._el.classList.toggle("highlight", isActive && !!this._activeIds);
      }
      // Re-setting graphData() would force a redraw but also reheats the whole sim; this just flags a redraw instead.
      this._graph.zoom(this._graph.zoom());
    },

    _renderGraph() {
      const self = this;
      const container = document.getElementById("graph");

      // The equation-card layer is appended after ForceGraph() runs, since it clears the container on init.
      this._graph = ForceGraph()(container)
        .graphData(this._graphData)
        .nodeId("id")
        .backgroundColor("rgba(0,0,0,0)")
        .nodeLabel((n) => n.name)
        .linkColor((l) => (self._isLinkActive(l) ? COLORS.linkActive : COLORS.linkIdle))
        .linkWidth((l) => (self._isLinkActive(l) ? 1.8 : 0.8))
        .linkDirectionalParticles((l) => (self._isLinkActive(l) ? 3 : 0))
        .linkDirectionalParticleWidth(2.4)
        .linkDirectionalParticleColor(() => COLORS.particle)
        .d3AlphaDecay(0.05)
        .d3VelocityDecay(0.45)
        .nodeCanvasObjectMode(() => "replace")
        .nodeCanvasObject((node, ctx, scale) => {
          if (node.type === "equation") return; // rendered as an HTML card instead
          const r = 9;
          const isActive = !self._activeIds || self._activeIds.has(node.id);
          const isSelected = self.selected?.type === "quantity" && self.selected.id === node.qid;
          const fill = isSelected ? COLORS.activeFill : COLORS.quantityFill;
          const alpha = isActive ? 1 : 0.28;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          if (isSelected) {
            ctx.shadowColor = fill;
            ctx.shadowBlur = 14;
          }
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(27,31,46,0.15)";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = `${Math.max(9, 11 / scale)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = isSelected ? "#ffffff" : COLORS.quantityText;
          ctx.fillText(displaySymbol(node.symbol), node.x, node.y);

          ctx.font = `${Math.max(8, 9 / scale)}px Inter, sans-serif`;
          ctx.fillStyle = COLORS.quantityText;
          ctx.fillText(node.name, node.x, node.y + r + 8);
          ctx.restore();
        })
        .onBackgroundClick(() => self.clearSelection())
        .onRenderFramePost(() => this._syncOverlays());

      this._graph.d3Force("charge").strength(-110);
      this._graph.d3Force("link").distance(70);
      this._graph.d3Force("pull", centerPullForce(0.045));
      this._graph.d3Force("collide", nodeCollideForce(24));

      this._equationLayer = document.createElement("div");
      this._equationLayer.className = "equation-layer";
      container.appendChild(this._equationLayer);

      // Real DOM click targets for every node, since canvas-based hit-testing (force-graph's default) breaks under
      // browsers that add noise to canvas pixel readback for anti-fingerprinting, e.g. Brave.
      for (const node of this._graphData.nodes) {
        const el = document.createElement("div");
        if (node.type === "equation") {
          el.className = "eq-card";
          el.innerHTML =
            `<div class="eq-card-label">${node.name}</div>` +
            window.katex.renderToString(node.latex, { throwOnError: false });
          el.addEventListener("click", () => self.selectEquation(node.eqid));
        } else {
          el.className = "q-hit";
          el.addEventListener("click", () => self.selectQuantity(node.qid));
        }
        this._equationLayer.appendChild(el);
        node._el = el;
      }

      const resize = () => {
        const rect = container.getBoundingClientRect();
        this._graph.width(rect.width).height(rect.height);
      };
      new ResizeObserver(resize).observe(container);
      resize();

      // Excludes degree-0 quantities from zoomToFit so a stray drifted node doesn't blow out the framing.
      const degree = new Map();
      for (const l of this._graphData.links) {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        degree.set(s, (degree.get(s) || 0) + 1);
        degree.set(t, (degree.get(t) || 0) + 1);
      }
      // A fixed padding can exceed a short container's own height, which forces zoomToFit
      // to zoom out to its minimum; scale padding down for smaller containers instead.
      const MIN_ZOOM = 0.6;
      this._graph.onEngineStop(() => {
        const padding = Math.max(20, Math.min(100, Math.min(this._graph.width(), this._graph.height()) * 0.15));
        // Instant so the zoom it lands on can be read back immediately below (an animated
        // zoomToFit doesn't reach its target until the transition finishes).
        this._graph.zoomToFit(0, padding, (n) => (degree.get(n.id) || 0) > 0);
        // Fitting the whole graph into a fixed-size container can shrink cards past legibility;
        // floor the zoom instead and let panning reveal what doesn't fit.
        if (this._graph.zoom() < MIN_ZOOM) this._graph.zoom(MIN_ZOOM, 300);
      });
    },

    _isLinkActive(link) {
      if (!this.selected) return false;
      const selectedGraphId = `${this.selected.type === "quantity" ? "q" : "e"}:${this.selected.id}`;
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      return sourceId === selectedGraphId || targetId === selectedGraphId;
    },

    _syncOverlays() {
      for (const node of this._graphData.nodes) {
        if (!node._el || node.x === undefined) continue;
        const { x, y } = this._graph.graph2ScreenCoords(node.x, node.y);
        node._el.style.left = `${x}px`;
        node._el.style.top = `${y}px`;
      }
    },
  };
}

window.explorer = explorer;
