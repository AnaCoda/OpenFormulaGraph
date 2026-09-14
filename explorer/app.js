// Fetches dist/openformulagraph.json and renders a clickable force-directed graph

const BUNDLE = (async () => {
  let res = await fetch("dist/openformulagraph.json");
  if (!res.ok) res = await fetch("../dist/openformulagraph.json");
  return res.json();
})();

const COLORS = {
  quantityFill: "#767ea8",
  quantityText: "#2c3040",
  activeFill: "#4f6df5",
  linkIdle: "rgba(45,50,74,0.32)",
  linkActive: "rgba(79,109,245,0.65)",
  linkDim: "rgba(45,50,74,0.07)",
};

const TOPIC_COLOR_PALETTE = [
  "#4f6df5", "#ca4f21", "#158466", "#d322b2", "#3d8415", "#5d50e2",
  "#a7671b", "#158384", "#db2488", "#208816", "#8550e2", "#887316",
  "#1a7da2", "#dd2c5c", "#16882b", "#a742e0", "#717b14", "#2375d7",
  "#de3535", "#16884a", "#c723d7", "#587f15",
];

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
  "rotational-motion": "Rotational Motion",
  fluids: "Fluid Statics",
  "fluid-dynamics": "Fluid Dynamics",
  thermodynamics: "Temperature, Heat & Thermodynamics",
  waves: "Oscillatory Motion & Waves",
  sound: "Sound",
  electricity: "Electricity",
  circuits: "Circuits",
  magnetism: "Magnetism",
  "electromagnetic-induction": "Electromagnetic Induction",
  optics: "Optics",
  relativity: "Special Relativity",
  "quantum-physics": "Quantum Physics",
  "nuclear-physics": "Nuclear Physics",
};

function topicColor(topic) {
  const idx = Object.keys(TOPIC_LABELS).indexOf(topic);
  return TOPIC_COLOR_PALETTE[(idx >= 0 ? idx : 0) % TOPIC_COLOR_PALETTE.length];
}

function topicLabel(topic) {
  return TOPIC_LABELS[topic] ?? topic;
}

// "#4f6df5" -> "rgba(79,109,245,0.1)", for a cluster box's tinted background.
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Below this zoom the equation cards in a cluster overlap into unreadable mush (confirmed at
// zoom ~0.22 with all 20 topics on), so the cluster collapses into one compact tile instead.
// EXPAND_ZOOM sits above COLLAPSE_ZOOM on purpose (hysteresis) so a slow scroll hovering near the
// boundary doesn't strobe between the two states every frame.
const CLUSTER_COLLAPSE_ZOOM = 0.5;
const CLUSTER_EXPAND_ZOOM = 0.58;

const HELP_LINKS = {
  siUnit: "https://en.wikipedia.org/wiki/International_System_of_Units",
  dimension: "https://en.wikipedia.org/wiki/Dimensional_analysis",
};

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const SUBSCRIPT = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };

// Quantity/variable symbols spelled out in ASCII (data can't use raw unicode identifiers everywhere).
const GREEK = {
  lambda: "λ", lam: "λ", mu: "μ", rho: "ρ", theta: "θ", omega: "ω",
  delta: "δ", Delta: "Δ", sigma: "σ", tau: "τ", phi: "φ", psi: "ψ",
  alpha: "α", beta: "β", eta: "η", epsilon: "ε",
};

function toSubscript(digits) {
  return digits.split("").map((c) => SUBSCRIPT[c] ?? c).join("");
}

// Renders an ASCII-spelled symbol as its actual glyph, e.g. "lambda" -> "λ", "epsilon0" -> "ε₀".
function displaySymbol(symbol) {
  if (GREEK[symbol]) return GREEK[symbol];
  const match = symbol.match(/^([a-zA-Z]+)(\d+)$/);
  if (!match) return symbol;
  const base = GREEK[match[1]] ?? match[1];
  return base + toSubscript(match[2]);
}

function symbolToLatex(symbol) {
  const match = symbol.match(/^([a-zA-Z]+)(\d+)$/);
  if (match) return `${GREEK[match[1]] ?? match[1]}_{${match[2]}}`;
  return GREEK[symbol] ?? symbol;
}

function formatDimension(dimension) {
  const parts = Object.entries(dimension || {})
    .filter(([, exp]) => exp !== 0)
    .map(([base, exp]) => (exp === 1 ? base : base + String(exp).split("").map((c) => SUPERSCRIPT[c] ?? c).join("")));
  return parts.length ? parts.join("·") : "dimensionless";
}

// Textbook sections look like "16.10" or "2.5" (chapter.subsection). parseFloat would
// sort "16.10" before "16.2" since it reads as the number 16.1; this instead compares
// chapter and subsection as separate integers so double-digit subsections sort correctly.
function sectionSortKey(section) {
  const [chapter, sub] = String(section ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
  return chapter * 1000 + sub;
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

// Gentle pull toward an anchor so loosely attached nodes (e.g. electric charge/current) don't drift off alone.
function centerPullForce(strength) {
  let nodes = [];
  function force(alpha) {
    for (const n of nodes) {
      if (n._clusterCenter) continue;
      const ax = n._anchor ? n._anchor.x : 0;
      const ay = n._anchor ? n._anchor.y : 0;
      n.vx += (ax - n.x) * strength * alpha;
      n.vy += (ay - n.y) * strength * alpha;
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

// Holds each node inside its assigned section's cell (see _assignClusters), so nodes from the same
// curriculum topic read as one group when several topics are in the graph.
function clusterForce(strength) {
  let nodes = [];
  let k = strength;
  function force(alpha) {
    for (const n of nodes) {
      const c = n._clusterCenter;
      if (!c) continue;
      const dx = c.x - n.x;
      const dy = c.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pull = dist > (n._clusterRadius || 0) ? k : k * 0.06;
      n.vx += dx * pull * alpha;
      n.vy += dy * pull * alpha;
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
  };
  force.strength = (v) => {
    if (v === undefined) return k;
    k = v;
    return force;
  };
  return force;
}

function measureNode(n) {
  if (n.type === "equation") {
    n._hw = (n._el?.offsetWidth || 220) / 2;
    n._hh = (n._el?.offsetHeight || 76) / 2;
  } else {
    n._hw = Math.max(30, n.name.length * 4.2);
    n._hh = 38;
  }
}

function nodeExtent(n) {
  if (n._hw === undefined) measureNode(n);
  return { hw: n._hw, hh: n._hh };
}

// Keeps cards and quantity labels from overlapping.
function nodeCollideForce(padX, padY) {
  let nodes = [];
  let order = [];
  function force() {
    if (nodes.length < 2) return;
    let widest = 0;
    for (const n of nodes) {
      if (n._hw === undefined) measureNode(n);
      if (n._hw > widest) widest = n._hw;
    }
    for (let pass = 0; pass < 4; pass++) {
      order.sort((p, q) => p.x - q.x);
      for (let i = 0; i < order.length; i++) {
        const a = order[i];
        const reach = a._hw + widest + padX;
        for (let j = i + 1; j < order.length; j++) {
          const b = order[j];
          const dx = b.x - a.x || 0.01;
          if (dx > reach) break;
          const dy = b.y - a.y || 0.01;
          const overlapX = a._hw + b._hw + padX - Math.abs(dx);
          if (overlapX <= 0) continue;
          const overlapY = a._hh + b._hh + padY - Math.abs(dy);
          if (overlapY <= 0) continue;
          const fracX = overlapX / (a._hw + b._hw + padX);
          const fracY = overlapY / (a._hh + b._hh + padY);
          if (fracX < fracY) {
            const move = (Math.sign(dx) * overlapX) / 2;
            a.x -= move;
            b.x += move;
            const avgVx = ((a.vx || 0) + (b.vx || 0)) / 2;
            a.vx = avgVx;
            b.vx = avgVx;
          } else {
            const move = (Math.sign(dy) * overlapY) / 2;
            a.y -= move;
            b.y += move;
            const avgVy = ((a.vy || 0) + (b.vy || 0)) / 2;
            a.vy = avgVy;
            b.vy = avgVy;
          }
        }
      }
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
    order = ns.slice();
  };
  return force;
}

function explorer() {
  let _bundle = null;
  let _graphData = null;
  let _graph = null;
  let _graphContainer = null;
  let _degree = null;
  let _eqKatex = null;
  let _symbolKatex = null;
  let _activeIds = null; // Set of graph node ids ("q:x" / "e:y") highlighted by the current selection, or null
  let _topicNodeIds = null; // Set of graph node ids visible under the current topic filter, or null = no filter
  let _clusterMembers = new Map(); // topic -> its equation nodes, for _syncClusterBoxes
  let _clusterBoxEls = [];
  let _clusterBoxLayer = null;
  let _equationLayer = null;
  let _defaultLinkStrength = null;
  let _selectedGraphId = null; // "q:<id>" / "e:<id>" for the current selection, or null
  let _quantityById = null;
  let _equationById = null;
  const _memo = {};

  return {
    selected: null, // { type: 'quantity'|'equation', id } | null
    curriculumCollapsed: false, // desktop: user has manually collapsed the curriculum panel
    activeTopics: new Set(), // curriculum topics currently filtering/clustering the graph
    // True once the user has panned/zoomed OR changed the topic filter, which permanently stops the
    // view auto-fitting/refitting
    _userMoved: false,
    // { cx, cy, k } | null - camera pinned by a topic-filter change, kept in place until graph settles
    _freezeView: null,
    expandedTopics: new Set(), // curriculum topics whose equation list is expanded in the panel
    sheet: null, // null | 'detail' | 'chapters' mobile bottom panes
    sheetFull: false, // true = sheet dragged/expanded past its peek height
    _sheetDrag: null,
    _loaded: false,
    _clustersCollapsed: false, // true once zoomed out past CLUSTER_COLLAPSE_ZOOM with topic clusters active

    async init() {
      _bundle = await BUNDLE;
      // KaTeX rendering (a full LaTeX parse) is not cheap; do it once per equation/symbol up front
      _eqKatex = new Map(
        _bundle.equations.map((eq) => [eq.id, window.katex.renderToString(eq.latex, { throwOnError: false })])
      );
      _symbolKatex = new Map();
      _quantityById = new Map(_bundle.quantities.map((q) => [q.id, q]));
      _equationById = new Map(_bundle.equations.map((eq) => [eq.id, eq]));
      _graphData = buildGraphData(_bundle);
      this._loaded = true;
      this.activeTopics = new Set(this.topicOrder.slice(0, 3));
      this.expandedTopics = new Set(this.activeTopics);
      this._renderGraph();
      this._applyTopicFilter();
    },

    formatDimension,
    formatUnit,
    topicColor,
    topicLabel,
    helpLinks: HELP_LINKS,

    _symbolKatexFor(symbol) {
      if (!_symbolKatex.has(symbol)) {
        _symbolKatex.set(symbol, window.katex.renderToString(symbolToLatex(symbol), { throwOnError: false }));
      }
      return _symbolKatex.get(symbol);
    },

    get selectedQuantity() {
      if (this.selected?.type !== "quantity") return null;
      return _quantityById.get(this.selected.id) ?? null;
    },

    get selectedEquation() {
      if (this.selected?.type !== "equation") return null;
      const eq = _equationById.get(this.selected.id);
      if (!eq) return null;
      return { ...eq, katex: _eqKatex.get(eq.id) };
    },

    get curriculum() {
      if (!this._loaded || !_bundle) return [];
      if (_memo.curriculum) return _memo.curriculum;
      return (_memo.curriculum = [..._bundle.equations]
        .map((eq) => ({
          id: eq.id,
          name: eq.name,
          topic: eq.topic,
          section: eq.source?.section ?? "?",
          sectionNum: sectionSortKey(eq.source?.section),
          katex: _eqKatex.get(eq.id),
        }))
        .sort((a, b) => a.sectionNum - b.sectionNum));
    },

    // Curriculum topics ordered by their earliest section, e.g. ["kinematics", "dynamics", ...].
    get topicOrder() {
      if (!this._loaded || !_bundle) return [];
      if (_memo.topicOrder) return _memo.topicOrder;
      const minSection = new Map();
      for (const eq of this.curriculum) {
        if (!minSection.has(eq.topic) || eq.sectionNum < minSection.get(eq.topic)) minSection.set(eq.topic, eq.sectionNum);
      }
      return (_memo.topicOrder = [...minSection.entries()].sort((a, b) => a[1] - b[1]).map(([topic]) => topic));
    },

    // Curriculum equations grouped by textbook topic/chapter, keyed for the panel's collapsible
    // per-topic sections (see toggleExpanded).
    get curriculumByTopic() {
      if (_memo.byTopic) return _memo.byTopic;
      const byTopic = new Map();
      if (!this._loaded) return byTopic;
      for (const eq of this.curriculum) {
        if (!byTopic.has(eq.topic)) byTopic.set(eq.topic, []);
        byTopic.get(eq.topic).push(eq);
      }
      return (_memo.byTopic = byTopic);
    },

    get relatedEquations() {
      if (!this.selectedQuantity) return [];
      const qid = this.selectedQuantity.id;
      return _bundle.equations
        .filter((eq) => Object.values(eq.variables).some((v) => v.quantity === qid))
        .map((eq) => {
          const variable = Object.values(eq.variables).find((v) => v.quantity === qid);
          return {
            id: eq.id,
            name: eq.name,
            katex: _eqKatex.get(eq.id),
            role: variable.role ?? "",
          };
        });
    },

    get relatedQuantities() {
      if (!this.selectedEquation) return [];
      return Object.entries(this.selectedEquation.variables).map(([symbol, v]) => {
        const q = _quantityById.get(v.quantity);
        return {
          symbol,
          symbolKatex: this._symbolKatexFor(symbol),
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
      _selectedGraphId = `q:${qid}`;
      const active = new Set([`q:${qid}`]);
      for (const eq of _bundle.equations) {
        if (Object.values(eq.variables).some((v) => v.quantity === qid)) active.add(`e:${eq.id}`);
      }
      _activeIds = active;
      this._refreshHighlight();
      if (this.isMobileShell()) this.openSheet("detail");
    },

    selectEquation(eqid) {
      this.selected = { type: "equation", id: eqid };
      _selectedGraphId = `e:${eqid}`;
      const eq = _bundle.equations.find((e) => e.id === eqid);
      const active = new Set([`e:${eqid}`]);
      for (const v of Object.values(eq.variables)) active.add(`q:${v.quantity}`);
      _activeIds = active;
      this._refreshHighlight();
      if (this.isMobileShell()) this.openSheet("detail");
    },

    // Toggles a curriculum topic in/out of the multi-select filter
    toggleTopic(topic) {
      this._userMoved = true;
      const next = new Set(this.activeTopics);
      const nextExpanded = new Set(this.expandedTopics);
      if (next.has(topic)) {
        next.delete(topic);
        nextExpanded.delete(topic);
      } else {
        next.add(topic);
        nextExpanded.add(topic);
      }
      this.activeTopics = next;
      this.expandedTopics = nextExpanded;
      this._applyTopicFilter();
    },

    // Expands/collapses a topic's equation list in the curriculum panel
    toggleExpanded(topic) {
      const next = new Set(this.expandedTopics);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      this.expandedTopics = next;
    },

    // Rebuilds the graph's node/link set from the active topic filter
    _applyTopicFilter() {
      const topics = this.activeTopics;
      const filtered = topics.size > 0;
      const activeEq = new Set();
      const activeQ = new Set();
      if (filtered) {
        for (const eq of _bundle.equations) {
          if (!topics.has(eq.topic)) continue;
          activeEq.add(eq.id);
          for (const v of Object.values(eq.variables)) activeQ.add(v.quantity);
        }
      }
      const nodes = filtered
        ? _graphData.nodes.filter(
            (n) => (n.type === "equation" && activeEq.has(n.eqid)) || (n.type === "quantity" && activeQ.has(n.qid))
          )
        : _graphData.nodes;
      const nodeIds = new Set(nodes.map((n) => n.id));
      const links = filtered
        ? _graphData.links.filter((l) => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return nodeIds.has(s) && nodeIds.has(t);
          })
        : _graphData.links;

      _topicNodeIds = filtered ? nodeIds : null;
      this._assignClusters(filtered ? [...topics] : []);
      this._syncForceStrengths();
      this._buildClusterBoxes();
      this._syncClusterStyles();
      this._measureNodes();
      const { x: cx, y: cy } = _graph.centerAt();
      this._freezeView = { cx, cy, k: _graph.zoom() };
      _graph.graphData({ nodes, links });
      this._reassertFreeze();
      this._holdFreezeView();
      this._refreshHighlight();
    },

    // Lays the active topics out as sections
    _assignClusters(topicList) {
      _clusterMembers = new Map(topicList.map((topic) => [topic, []]));
      for (const n of _graphData.nodes) {
        n._clusterCenter = null;
        n._clusterRadius = 0;
        n._clusterColor = null;
        n._clusterTopic = null;
        n._anchor = null;
      }
      if (!topicList.length) return;

      const byId = new Map(_graphData.nodes.map((node) => [node.id, node]));
      const eqByTopic = new Map(topicList.map((topic) => [topic, []]));
      for (const eq of _bundle.equations) {
        eqByTopic.get(eq.topic)?.push(eq);
      }

      const GAP = 160;
      const cells = topicList.map((topic) => {
        const eqs = eqByTopic.get(topic) || [];
        let area = 0;
        let widest = 180;
        for (const eq of eqs) {
          const node = byId.get(`e:${eq.id}`);
          const { hw, hh } = node ? nodeExtent(node) : { hw: 110, hh: 38 };
          area += (hw * 2 + 26) * (hh * 2 + 16);
          widest = Math.max(widest, hw * 2 + 26);
        }
        return { topic, eqs, size: Math.max(widest * 1.3, Math.sqrt(area / 0.52)) };
      });

      // Pack the cells into rows whose total shape matches the graph pane's aspect ratio
      const paneW = _graph?.width() || 1200;
      const paneH = _graph?.height() || 800;
      const aspect = Math.max(0.5, Math.min(3, paneW / Math.max(1, paneH)));
      const totalArea = cells.reduce((sum, c) => sum + (c.size + GAP) ** 2, 0);
      const targetWidth = Math.sqrt(totalArea * aspect);

      const rows = [];
      let row = [];
      let rowWidth = 0;
      for (const cell of cells) {
        const w = cell.size + GAP;
        // Overshooting the target by less than half a cell packs tighter than dropping to a new row.
        if (row.length && rowWidth + w / 2 > targetWidth) {
          rows.push(row);
          row = [];
          rowWidth = 0;
        }
        row.push(cell);
        rowWidth += w;
      }
      if (row.length) rows.push(row);

      // Equation cards are HTML overlays drawn at a fixed pixel size whatever the zoom, so the
      // layout is measured in graph units that equal screen pixels at zoom 1 (that's also what the
      // cell sizes above are in) and the view avoids zooming past 1 (see _fitView). Which means the
      // arrangement can be spread to fill the pane directly
      const rowHeights = rows.map((r) => Math.max(...r.map((c) => c.size)) + GAP);
      const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
      const totalWidth = Math.max(...rows.map((r) => r.reduce((sum, c) => sum + c.size + GAP, 0)));
      const spread = Math.max(1, Math.min(1.45,
        Math.min((paneW - 90) / Math.max(1, totalWidth), (paneH - 90) / Math.max(1, totalHeight))));

      let y = (-totalHeight / 2) * spread;
      rows.forEach((r, ri) => {
        const rowW = r.reduce((sum, c) => sum + c.size + GAP, 0);
        const cy = y + (rowHeights[ri] * spread) / 2;
        let x = (-rowW / 2) * spread;
        for (const cell of r) {
          const center = { x: x + ((cell.size + GAP) * spread) / 2, y: cy };
          x += (cell.size + GAP) * spread;
          const color = topicColor(cell.topic);
          for (const eq of cell.eqs) {
            const node = byId.get(`e:${eq.id}`);
            if (!node) continue;
            node._clusterCenter = center;
            node._clusterRadius = cell.size / 2;
            node._clusterColor = color;
            node._clusterTopic = cell.topic;
            _clusterMembers.get(cell.topic).push(node);
          }
        }
        y += rowHeights[ri] * spread;
      });

      // Anchor each quantity at the average of the section centers it links into
      const sums = new Map();
      for (const link of _graphData.links) {
        const src = typeof link.source === "object" ? link.source : byId.get(link.source);
        const tgt = typeof link.target === "object" ? link.target : byId.get(link.target);
        if (!src || !tgt) continue;
        const quantity = src.type === "quantity" ? src : tgt;
        const equation = src.type === "quantity" ? tgt : src;
        if (quantity.type !== "quantity" || !equation._clusterCenter) continue;
        let sum = sums.get(quantity);
        if (!sum) sums.set(quantity, (sum = { x: 0, y: 0, count: 0 }));
        sum.x += equation._clusterCenter.x;
        sum.y += equation._clusterCenter.y;
        sum.count++;
      }
      for (const [quantity, sum] of sums) {
        quantity._anchor = { x: sum.x / sum.count, y: sum.y / sum.count };
      }
    },

    // With sections active the link force has to give: a quantity shared between two chapters would
    // otherwise haul their cards into each other.
    _syncForceStrengths() {
      const clustered = this.activeTopics.size > 0;
      const link = _graph.d3Force("link");
      link.strength(clustered ? 0.04 : _defaultLinkStrength);
      link.distance(clustered ? 110 : 70);
      _graph.d3Force("cluster").strength(clustered ? 1.1 : 0.6);
    },

    // Creates one "container" box per active topic
    _buildClusterBoxes() {
      _clusterBoxLayer.innerHTML = "";
      _clusterBoxEls = [];
      this._clustersCollapsed = false;
      for (const topic of this.activeTopics) {
        const color = topicColor(topic);
        const box = document.createElement("div");
        box.className = "cluster-box";
        box.style.setProperty("--cluster-color", color);
        box.style.setProperty("--cluster-bg", hexToRgba(color, 0.07));
        box.style.setProperty("--cluster-bg-collapsed", hexToRgba(color, 0.16));
        const label = document.createElement("div");
        label.className = "cluster-box-label";
        label.textContent = topicLabel(topic);
        box.appendChild(label);

        const count = _bundle.equations.filter((eq) => eq.topic === topic).length;
        const summary = document.createElement("div");
        summary.className = "cluster-box-summary";
        summary.textContent = `${topicLabel(topic)} · ${count} equation${count === 1 ? "" : "s"}`;

        summary.addEventListener("click", () => {
          if (box._wasDragged) return;
          this._focusCluster(topic);
        });
        box.appendChild(summary);

        _clusterBoxLayer.appendChild(box);
        _clusterBoxEls.push({ topic, box });
        this._setupClusterDrag(topic, box, label);
      }
    },

    // Recenters/zooms the view on one cluster
    _focusCluster(topic) {
      const node = _graphData.nodes.find((n) => n._clusterTopic === topic);
      if (!node?._clusterCenter) return;
      this._userMoved = true;
      this._cancelFit();
      const { x, y } = node._clusterCenter;
      _graph.centerAt(x, y, 250).zoom(0.9, 250);
    },

    // Flips every cluster box between its normal (cards visible) and collapsed (single tile) presentation.
    _setClustersCollapsed(collapsed) {
      this._clustersCollapsed = collapsed;
      _equationLayer.classList.toggle("clusters-collapsed", collapsed);
      for (const { box } of _clusterBoxEls) box.classList.toggle("collapsed", collapsed);
    },

    // Checks the current zoom against the collapse/expand thresholds
    _updateClusterCollapse(zoom) {
      if (!this.activeTopics.size) {
        if (this._clustersCollapsed) this._setClustersCollapsed(false);
        return;
      }
      if (!this._clustersCollapsed && zoom < CLUSTER_COLLAPSE_ZOOM) this._setClustersCollapsed(true);
      else if (this._clustersCollapsed && zoom > CLUSTER_EXPAND_ZOOM) this._setClustersCollapsed(false);
    },

    _measureNodes() {
      for (const node of _graphData.nodes) measureNode(node);
    },

    // Tints each equation card's left edge to match its cluster color
    _syncClusterStyles() {
      for (const node of _graphData.nodes) {
        if (!node._el || node.type !== "equation") continue;
        node._el.style.borderLeftColor = node._clusterColor || "";
        node._el.style.borderLeftWidth = node._clusterColor ? "4px" : "";
      }
    },

    clearSelection() {
      this.selected = null;
      _selectedGraphId = null;
      _activeIds = null;
      this._refreshHighlight();
      this.closeSheet();
    },

    isMobileShell() {
      return window.matchMedia("(max-width: 1100px)").matches;
    },

    openSheet(which) {
      this.sheet = which;
      this.sheetFull = false;
    },

    closeSheet() {
      this.sheet = null;
      this.sheetFull = false;
    },

    // Drags the handle on a bottom pane between peek, full, and dismissed
    startSheetDrag(event) {
      const sheetEl = event.currentTarget.closest("aside");
      if (!sheetEl) return;
      const startY = event.clientY;
      const rect = sheetEl.getBoundingClientRect();
      const startTranslate = rect.top - window.innerHeight + rect.height; // current translateY in px (0 = full open)
      sheetEl.setPointerCapture(event.pointerId);
      sheetEl.classList.add("dragging");

      const onMove = (e) => {
        const dy = Math.max(0, startTranslate + (e.clientY - startY));
        sheetEl.style.setProperty("--sheet-y", `${dy}px`);
      };
      const onUp = (e) => {
        sheetEl.removeEventListener("pointermove", onMove);
        sheetEl.removeEventListener("pointerup", onUp);
        sheetEl.classList.remove("dragging");
        sheetEl.style.removeProperty("--sheet-y");

        const finalTranslate = Math.max(0, startTranslate + (e.clientY - startY));
        const height = rect.height || 1;
        const peekTranslate = height * 0.58;

        if (finalTranslate < peekTranslate * 0.5) {
          this.sheetFull = true;
        } else if (finalTranslate > peekTranslate * 1.25) {
          this.closeSheet();
        } else {
          this.sheetFull = false;
        }
      };
      sheetEl.addEventListener("pointermove", onMove);
      sheetEl.addEventListener("pointerup", onUp);
    },

    _refreshHighlight() {
      const topicFiltered = !!_topicNodeIds;
      for (const node of _graphData.nodes) {
        if (!node._el) continue;
        const inTopicFilter = !topicFiltered || _topicNodeIds.has(node.id);
        const isActive = !_activeIds || _activeIds.has(node.id);
        // A topic filter removes non-matching nodes from the simulation entirely (see
        // _applyTopicFilter); this just keeps their leftover DOM overlay elements out of the way.
        // A single quantity/equation selection instead just dims the rest for context.
        node._el.classList.toggle("hidden-node", !inTopicFilter);
        if (node.type === "equation") {
          node._el.classList.toggle("dim", inTopicFilter && !isActive);
          node._el.classList.toggle("highlight", inTopicFilter && isActive && !!_activeIds);
        }
      }
      // Re-setting graphData() would force a redraw but also reheats the whole sim; this just flags a redraw instead.
      _graph.zoom(_graph.zoom());
    },

    // Freezes the camera exactly where it currently sits
    _cancelFit() {
      const { x, y } = _graph.centerAt();
      _graph.centerAt(x, y, 0).zoom(_graph.zoom(), 0);
      this._freezeView = null;
    },

    _reassertFreeze() {
      const { cx, cy, k } = this._freezeView;
      _graph.centerAt(cx, cy, 0).zoom(k, 0);
    },

    _holdFreezeView() {
      const deadline = Date.now() + 1000;
      const loop = () => {
        if (!this._freezeView) return;
        this._reassertFreeze();
        if (Date.now() < deadline) requestAnimationFrame(loop);
        else this._freezeView = null;
      };
      loop();
    },

    // Measures the real content box  and solves for the zoom that makes it fill the
    // pane, so the layout spreads into whatever room it has.
    _fitView(duration = 0) {
      const paneW = _graph.width();
      const paneH = _graph.height();
      if (!paneW || !paneH) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const cards = [];
      let found = false;
      for (const node of _graphData.nodes) {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
        if (_topicNodeIds && !_topicNodeIds.has(node.id)) continue;
        // Excludes degree-0 quantities so a stray drifted node doesn't blow out the framing.
        if (_degree && !(_degree.get(node.id) > 0)) continue;
        const { hw, hh } = nodeExtent(node);
        minX = Math.min(minX, node.x - hw);
        maxX = Math.max(maxX, node.x + hw);
        minY = Math.min(minY, node.y - hh);
        maxY = Math.max(maxY, node.y + hh);
        if (node.type === "equation") cards.push({ left: node.x - hw, top: node.y - hh });
        found = true;
      }
      if (!found) return;

      // Section boxes add their own border and label around the cards.
      const margin = this.activeTopics.size ? 46 : 20;
      const availW = Math.max(60, paneW - margin * 2);
      const availH = Math.max(60, paneH - margin * 2);
      const scale = Math.min(availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY));
      const k = Math.max(1, Math.min(1.25, scale));

      // Where the view opens. If it all fits, centre it. If it doesn't, open on the equation card
      // nearest the layout's top-left
      const start = cards.reduce(
        (best, card) =>
          !best || card.left - minX + (card.top - minY) < best.left - minX + (best.top - minY) ? card : best,
        null
      ) || { left: minX, top: minY };
      const cx = maxX - minX > paneW / k ? start.left + (paneW / 2 - margin) / k : (minX + maxX) / 2;
      const cy = maxY - minY > paneH / k ? start.top + (paneH / 2 - margin) / k : (minY + maxY) / 2;
      _graph.centerAt(cx, cy, duration).zoom(k, duration);
    },

    _renderGraph() {
      const self = this;
      const container = document.getElementById("graph");
      _graphContainer = container;

      // The equation-card layer is appended after ForceGraph() runs, since it clears the container on init.
      _graph = ForceGraph()(container)
        .graphData(_graphData)
        .nodeId("id")
        .backgroundColor("rgba(0,0,0,0)")
        .nodeLabel((n) => n.name)
        .linkColor((l) => {
          if (self._isLinkActive(l)) return COLORS.linkActive;
          return self.selected ? COLORS.linkDim : COLORS.linkIdle;
        })
        .linkWidth((l) => (self._isLinkActive(l) ? 1.8 : 0.8))
        .d3AlphaDecay(0.022)
        .d3VelocityDecay(0.32)
        .nodeCanvasObjectMode(() => "replace")
        .nodeCanvasObject((node, ctx, scale) => {
          if (node.type === "equation") return; // rendered as an HTML card instead
          if (_topicNodeIds && !_topicNodeIds.has(node.id)) return; // topic filter hides it outright
          if (self._clustersCollapsed) return; // collapsed tiles stand in for every quantity/equation too
          const isActive = !_activeIds || _activeIds.has(node.id);
          const r = node._r ?? (node._r = Math.min(26, 12 + 5 * Math.log2(1 + (_degree.get(node.id) || 0))));
          const isSelected = self.selected?.type === "quantity" && self.selected.id === node.qid;
          const fill = isSelected ? COLORS.activeFill : node._clusterColor || COLORS.quantityFill;
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
          ctx.strokeStyle = "rgba(20,23,38,0.28)";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = `${Math.max(9, r * 1.1 / scale)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(node._symbolText ?? (node._symbolText = displaySymbol(node.symbol)), node.x, node.y);

          ctx.font = `${Math.max(12, 14 / scale)}px Inter, sans-serif`;
          ctx.fillStyle = COLORS.quantityText;
          ctx.fillText(node.name, node.x, node.y + r + 10);
          ctx.restore();
        })
        .onRenderFramePost(() => this._syncOverlays());
      // Background clicks are handled ourselves below (see the pointerdown/pointerup pair on
      // `container`) rather than via .onBackgroundClick. force-graph only fires that when it sees a
      // clean click with zero canvas movement in between

      _graph.d3Force("charge").strength(-140);
      _defaultLinkStrength = _graph.d3Force("link").strength();
      _graph.d3Force("link").distance(70);
      _graph.d3Force("pull", centerPullForce(0.045));
      _graph.d3Force("collide", nodeCollideForce(26, 16));
      _graph.d3Force("cluster", clusterForce(0.6));

      const fgWrapper = container.querySelector(":scope > div");
      if (fgWrapper) container.appendChild(fgWrapper);

      _clusterBoxLayer = document.createElement("div");
      _clusterBoxLayer.className = "cluster-box-layer";
      container.appendChild(_clusterBoxLayer);

      _equationLayer = document.createElement("div");
      _equationLayer.className = "equation-layer";
      container.appendChild(_equationLayer);

      // Real DOM click targets for every node, since canvas-based hit-testing (force-graph's default) breaks under
      // browsers that add noise to canvas pixel readback for anti-fingerprinting, e.g. Brave.
      for (const node of _graphData.nodes) {
        const el = document.createElement("div");
        if (node.type === "equation") {
          el.className = "eq-card";
          el.innerHTML = `<div class="eq-card-label">${node.name}</div>` + _eqKatex.get(node.eqid);
          el.addEventListener("click", () => {
            if (el._wasDragged) return;
            self.selectEquation(node.eqid);
          });
        } else {
          el.className = "q-hit";
          el.addEventListener("click", () => {
            if (el._wasDragged) return;
            self.selectQuantity(node.qid);
          });
        }
        _equationLayer.appendChild(el);
        node._el = el;
        this._setupNodeDrag(node, el);
      }
      this._measureNodes();

      // Re-fit on resize too
      const resize = () => {
        const rect = container.getBoundingClientRect();
        _graph.width(rect.width).height(rect.height);
        if (!this._userMoved) this._fitView(0);
      };
      new ResizeObserver(resize).observe(container);
      resize();

      _degree = new Map();
      for (const l of _graphData.links) {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        _degree.set(s, (_degree.get(s) || 0) + 1);
        _degree.set(t, (_degree.get(t) || 0) + 1);
      }

      // Marks the view as user-driven the moment a pan/zoom gesture starts
      container.addEventListener("wheel", () => { this._userMoved = true; this._cancelFit(); }, { passive: true });
      container.addEventListener("pointerdown", (down) => {
        const startX = down.clientX;
        const startY = down.clientY;
        const onMove = (move) => {
          if (Math.abs(move.clientX - startX) > 4 || Math.abs(move.clientY - startY) > 4) {
            this._userMoved = true;
            this._cancelFit();
            window.removeEventListener("pointermove", onMove);
          }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener(
          "pointerup",
          () => window.removeEventListener("pointermove", onMove),
          { once: true }
        );
      });

      let bgDownX = 0, bgDownY = 0;
      container.addEventListener("pointerdown", (down) => {
        bgDownX = down.clientX;
        bgDownY = down.clientY;
      });
      container.addEventListener("pointerup", (up) => {
        if (Math.abs(up.clientX - bgDownX) > 4 || Math.abs(up.clientY - bgDownY) > 4) return;
        if (up.target.closest(".q-hit, .eq-card")) return; // a node click, not background
        self.clearSelection();
      });

      const refit = (duration) => {
        if (!this._userMoved) this._fitView(duration);
      };

      refit(0);
      let tick = 0;
      _graph.onEngineTick(() => {
        tick++;
        if (tick % 12 === 0) refit(250);
      });
      _graph.onEngineStop(() => {
        const collide = _graph.d3Force("collide");
        for (let i = 0; i < 10; i++) collide();
        refit(0);
      });

      document.fonts?.ready?.then(() => {
        this._measureNodes();
        this._applyTopicFilter();
      });
    },

    _isLinkActive(link) {
      if (!_selectedGraphId) return false;
      const source = link.source;
      const target = link.target;
      return (typeof source === "object" ? source.id : source) === _selectedGraphId
        || (typeof target === "object" ? target.id : target) === _selectedGraphId;
    },

    // Lets the user pick up a node and reposition it. The DOM overlay elements sit above the
    // canvas and own pointer events (see the click-target comment above), so force-graph's own
    // built-in canvas drag never sees these clicks — this reimplements dragging on top of that.
    _setupNodeDrag(node, el) {
      const self = this;
      el.addEventListener("pointerdown", (down) => {
        if (down.button !== 0) return;
        const startX = down.clientX;
        const startY = down.clientY;
        let dragging = false;

        // Pointer capture routes this pointer's move/up/cancel events straight to `el` even once
        // the finger/cursor leaves it, so each drag's listeners only ever see their own pointer.
        // without it, mobile browsers can cancel the touch mid-gesture (see below) and leave these
        // listeners on window forever.
        el.setPointerCapture(down.pointerId);

        const onMove = (move) => {
          if (move.pointerId !== down.pointerId) return;
          if (!dragging) {
            if (Math.abs(move.clientX - startX) < 4 && Math.abs(move.clientY - startY) < 4) return;
            dragging = true;
            el._wasDragged = true;
            el.classList.add("dragging");
            self._userMoved = true; // stop auto-fit from fighting the drag
            self._cancelFit();
          }
          const rect = _graphContainer.getBoundingClientRect();
          const { x, y } = _graph.screen2GraphCoords(move.clientX - rect.left, move.clientY - rect.top);
          node.x = node.fx = x;
          node.y = node.fy = y;
          _graph.d3ReheatSimulation();
          self._syncOverlays();
        };
        const onEnd = (end) => {
          if (end.pointerId !== down.pointerId) return;
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onEnd);
          el.removeEventListener("pointercancel", onEnd);
          if (dragging) {
            el.classList.remove("dragging");
            // Cleared on a timeout so the click event that follows pointerup still sees it.
            setTimeout(() => {
              el._wasDragged = false;
            }, 0);
          }
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onEnd);
        el.addEventListener("pointercancel", onEnd);
      });
    },

    // Lets the user grab a whole cluster and drag every node in that topic together, offsets preserved.
    _setupClusterDrag(topic, box, label) {
      const self = this;

      const start = (down) => {
        if (down.button !== 0) return;
        const el = down.currentTarget;
        if (el === box && !box.classList.contains("collapsed")) return;
        const startX = down.clientX;
        const startY = down.clientY;
        let dragging = false;
        let members = null; // [{ node, ox, oy }] graph-unit offsets from the pointer
        let center = null;

        el.setPointerCapture(down.pointerId);

        const onMove = (move) => {
          if (move.pointerId !== down.pointerId) return;
          if (!dragging) {
            if (Math.abs(move.clientX - startX) < 4 && Math.abs(move.clientY - startY) < 4) return;
            dragging = true;
            box.classList.add("dragging");
            box._wasDragged = true; 
            self._userMoved = true;
            self._cancelFit();
            const rect = _graphContainer.getBoundingClientRect();
            const { x: gx, y: gy } = _graph.screen2GraphCoords(startX - rect.left, startY - rect.top);
            members = _graphData.nodes
              .filter((n) => n._clusterTopic === topic)
              .map((n) => ({ node: n, ox: n.x - gx, oy: n.y - gy }));
            center = members[0]?.node._clusterCenter;
            if (center) {
              center._dragOx = center.x - gx;
              center._dragOy = center.y - gy;
            }
          }
          const rect = _graphContainer.getBoundingClientRect();
          const { x, y } = _graph.screen2GraphCoords(move.clientX - rect.left, move.clientY - rect.top);
          for (const { node, ox, oy } of members) {
            node.x = node.fx = x + ox;
            node.y = node.fy = y + oy;
          }
          if (center) {
            center.x = x + center._dragOx;
            center.y = y + center._dragOy;
          }
          _graph.d3ReheatSimulation();
          self._syncOverlays();
        };
        const onEnd = (end) => {
          if (end.pointerId !== down.pointerId) return;
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onEnd);
          el.removeEventListener("pointercancel", onEnd);
          box.classList.remove("dragging");
          // Cleared on a timeout so the click that follows this pointerup still sees it.
          if (dragging) setTimeout(() => { box._wasDragged = false; }, 0);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onEnd);
        el.addEventListener("pointercancel", onEnd);
      };

      box.addEventListener("pointerdown", start);
      label.addEventListener("pointerdown", start);
    },

    _syncOverlays() {
      // Cards and hit targets are HTML drawn over the canvas; scaling them with the view keeps them
      // in proportion to the layout (which is sized in pixels-at-zoom-1) at every zoom level.
      const zoom = _graph.zoom();
      if (zoom !== this._lastZoom) {
        _equationLayer.style.setProperty("--node-scale", zoom);
        this._lastZoom = zoom;
      }
      const visible = _topicNodeIds;
      for (const node of _graphData.nodes) {
        if (!node._el || node.x === undefined) continue;
        if (visible && !visible.has(node.id)) continue;
        const { x, y } = _graph.graph2ScreenCoords(node.x, node.y);
        if (x === node._sx && y === node._sy) continue;
        node._sx = x;
        node._sy = y;
        node._el.style.setProperty("--nx", `${x}px`);
        node._el.style.setProperty("--ny", `${y}px`);
      }
      this._syncClusterBoxes();
    },

    // Sizes/positions each active topic's container box to bound its equation cards' current
    // screen positions, so the box tracks the cards as the simulation settles or the view pans/zooms.
    _syncClusterBoxes() {
      if (!_clusterBoxEls?.length) return;
      const zoom = _graph.zoom();
      this._updateClusterCollapse(zoom);
      const PAD = 22 * Math.max(0.5, zoom);
      for (const { topic, box } of _clusterBoxEls) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of _clusterMembers.get(topic) || []) {
          if (node.x === undefined || node._sx === undefined) continue;
          const x = node._sx;
          const y = node._sy;
          const hw = node._hw * zoom;
          const hh = node._hh * zoom;
          minX = Math.min(minX, x - hw);
          minY = Math.min(minY, y - hh);
          maxX = Math.max(maxX, x + hw);
          maxY = Math.max(maxY, y + hh);
        }
        if (!isFinite(minX)) {
          box.style.display = "none";
          continue;
        }
        box.style.display = "";
        box.style.left = `${minX - PAD}px`;
        box.style.top = `${minY - PAD}px`;
        box.style.width = `${maxX - minX + PAD * 2}px`;
        box.style.height = `${maxY - minY + PAD * 2}px`;
      }
    },
  };
}

// Drags the handle between the graph and one of the side panels to resize it. `edge` says which
// side of the layout the panel is anchored to, so its width tracks the mouse from that edge in.
function setupResizer(resizerId, cssVar, edge, minWidth, maxWidth) {
  const resizer = document.getElementById(resizerId);
  const layout = document.querySelector(".layout");
  if (!resizer || !layout) return;

  const onMove = (e) => {
    const rect = layout.getBoundingClientRect();
    const raw = edge === "left" ? e.clientX - rect.left : rect.right - e.clientX;
    const width = Math.min(maxWidth, Math.max(minWidth, raw));
    layout.style.setProperty(cssVar, `${width}px`);
  };
  const stopDrag = () => {
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", stopDrag);
  };

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopDrag);
  });
}

function setupPanelResize() {
  setupResizer("explore-resizer", "--explore-width", "left", 260, 560);
  setupResizer("curriculum-resizer", "--curriculum-width", "right", 300, 640);
}

setupPanelResize();

window.explorer = explorer;
