/* =========================================================
   Gate Camp — logic circuits workbench
   Vanilla JS, no build step. Everything lives in localStorage.
   ========================================================= */

const SVGNS = "http://www.w3.org/2000/svg";

const GATE_DEFS = {
  AND: { inputs: 2, fn: (a, b) => (a && b) ? 1 : 0 },
  OR:  { inputs: 2, fn: (a, b) => (a || b) ? 1 : 0 },
  NOT: { inputs: 1, fn: (a) => a ? 0 : 1 },
};

const FUNCTION_NAMES = {
  "0000": "FALSE",
  "0001": "AND",
  "0010": "A AND NOT B",
  "0011": "A",
  "0100": "NOT A AND B",
  "0101": "B",
  "0110": "XOR",
  "0111": "OR",
  "1000": "NOR",
  "1001": "XNOR",
  "1010": "NOT B",
  "1011": "B IMPLIES A",
  "1100": "NOT A",
  "1101": "A IMPLIES B",
  "1110": "NAND",
  "1111": "TRUE",
};
// NOTE: derived from Object.keys(FUNCTION_NAMES) would silently reorder —
// JS hoists integer-like keys ("1000".."1111") ahead of leading-zero keys
// ("0000".."0111") regardless of insertion order. Pin the order explicitly.
const PATTERN_ORDER = [
  "0000","0001","0010","0011","0100","0101","0110","0111",
  "1000","1001","1010","1011","1100","1101","1110","1111",
];

/* ---------------- circuit state ---------------- */

function freshCircuit() {
  return {
    nodes: {
      A:   { id: "A", type: "SRC", label: "A", x: 90,  y: 150 },
      B:   { id: "B", type: "SRC", label: "B", x: 90,  y: 340 },
      OUT: { id: "OUT", type: "OUT", x: 800, y: 245 },
    },
    wires: [], // {id, from:{node,port}, to:{node,port}}
  };
}

let circuit = freshCircuit();
let gateSeq = 0;

let currentA = 0, currentB = 0;   // live toggle-test values
let pendingFrom = null;           // wire-drawing source pin {node,port}
let selected = null;              // {kind:'node'|'wire', id}
let dragNode = null;              // node id currently being dragged
let dragOffset = { x: 0, y: 0 };
let ghostPointer = null;          // live cursor pos while drawing a wire

/* ---------------- geometry helpers ---------------- */

function nodeSize(type) {
  if (type === "SRC") return { w: 56, h: 40 };
  if (type === "OUT") return { w: 60, h: 44 };
  if (type === "NOT") return { w: 64, h: 44 };
  return { w: 76, h: 56 }; // AND / OR
}

function pinPos(nodeId, port) {
  const node = circuit.nodes[nodeId];
  const { w, h } = nodeSize(node.type);
  if (port === "out") return { x: node.x + w / 2, y: node.y };
  if (port === "in0") {
    if (node.type === "OUT" || node.type === "NOT") return { x: node.x - w / 2, y: node.y };
    return { x: node.x - w / 2, y: node.y - 13 };
  }
  if (port === "in1") return { x: node.x - w / 2, y: node.y + 13 };
  return { x: node.x, y: node.y };
}

function inputCount(type) {
  if (type === "OUT") return 1;
  if (!GATE_DEFS[type]) return 0;
  return GATE_DEFS[type].inputs;
}

/* ---------------- evaluation ---------------- */

function evalNode(nodeId, A, B, memo, visiting) {
  if (memo.has(nodeId)) return memo.get(nodeId);
  if (visiting.has(nodeId)) { memo.set(nodeId, null); return null; }
  const node = circuit.nodes[nodeId];
  let result = null;

  if (node.type === "SRC") {
    result = node.label === "A" ? A : B;
  } else {
    visiting.add(nodeId);
    const need = inputCount(node.type);
    const vals = [];
    let ok = true;
    for (let i = 0; i < need; i++) {
      const port = "in" + i;
      const w = circuit.wires.find(w => w.to.node === nodeId && w.to.port === port);
      if (!w) { ok = false; break; }
      const v = evalNode(w.from.node, A, B, memo, visiting);
      if (v === null) { ok = false; break; }
      vals.push(v);
    }
    visiting.delete(nodeId);
    if (!ok) result = null;
    else if (node.type === "OUT") result = vals[0];
    else result = GATE_DEFS[node.type].fn(...vals);
  }
  memo.set(nodeId, result);
  return result;
}

function computeAllLive(A, B) {
  const memo = new Map();
  const out = {};
  for (const id in circuit.nodes) out[id] = evalNode(id, A, B, memo, new Set());
  return out;
}

function computeTruthTable() {
  return [[0,0],[0,1],[1,0],[1,1]].map(([A,B]) => {
    const memo = new Map();
    return { A, B, out: evalNode("OUT", A, B, memo, new Set()) };
  });
}

function tableToPattern(rows) {
  if (rows.some(r => r.out === null)) return null;
  return rows.map(r => r.out).join("");
}

/* ---------------- rendering: workbench ---------------- */

const svg = document.getElementById("wb-svg");

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function renderWorkbench() {
  svg.innerHTML = "";
  const live = computeAllLive(currentA, currentB);

  // wires (drawn first, under nodes)
  circuit.wires.forEach(w => {
    const p1 = pinPos(w.from.node, w.from.port);
    const p2 = pinPos(w.to.node, w.to.port);
    const midX = (p1.x + p2.x) / 2;
    const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    const on = live[w.from.node] === 1;
    const isSel = selected && selected.kind === "wire" && selected.id === w.id;

    const hit = el("path", { d, class: "wire-hit" });
    hit.addEventListener("pointerdown", (e) => { e.stopPropagation(); selectWire(w.id); });
    svg.appendChild(hit);

    const path = el("path", { d, class: "wire" + (on ? " on" : "") + (isSel ? " selected" : "") });
    path.style.pointerEvents = "none";
    svg.appendChild(path);
  });

  // ghost wire while drawing
  if (pendingFrom && ghostPointer) {
    const p1 = pinPos(pendingFrom.node, pendingFrom.port);
    const midX = (p1.x + ghostPointer.x) / 2;
    const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${ghostPointer.y} L ${ghostPointer.x} ${ghostPointer.y}`;
    svg.appendChild(el("path", { d, class: "wire-ghost" }));
  }

  // nodes
  Object.values(circuit.nodes).forEach(node => drawNode(node, live));
}

function drawNode(node, live) {
  const { w, h } = nodeSize(node.type);
  const val = live[node.id];
  const isSel = selected && selected.kind === "node" && selected.id === node.id;
  const g = el("g", { class: "gate-node" + (node.type === "SRC" ? " src-node" : "") + (val === 1 ? " on" : "") });
  g.setAttribute("transform", `translate(0,0)`);

  let shape;
  if (node.type === "SRC") {
    shape = el("rect", { x: node.x - w/2, y: node.y - h/2, width: w, height: h, rx: h/2,
      class: "node-body" + (isSel ? " selected" : "") + (val === 1 ? " on" : "") });
  } else if (node.type === "OUT") {
    shape = el("circle", { cx: node.x, cy: node.y, r: w/2, class: "out-led" + (val === 1 ? " on" : "") });
  } else if (node.type === "NOT") {
    const x0 = node.x - w/2, x1 = node.x + w/2 - 10;
    shape = el("path", {
      d: `M ${x0} ${node.y-h/2} L ${x1} ${node.y} L ${x0} ${node.y+h/2} Z`,
      class: "node-body" + (isSel ? " selected" : "") + (val === 1 ? " on" : "")
    });
  } else {
    shape = el("rect", { x: node.x - w/2, y: node.y - h/2, width: w, height: h, rx: 10,
      class: "node-body" + (isSel ? " selected" : "") + (val === 1 ? " on" : "") });
  }
  shape.setAttribute("data-node-id", node.id);
  g.appendChild(shape);

  if (node.type !== "OUT") {
    const label = el("text", { x: node.x, y: node.type === "NOT" ? node.y : node.y, class: "node-label" });
    label.textContent = node.type === "SRC" ? node.label : node.type;
    if (node.type === "NOT") label.setAttribute("x", node.x - 8);
    g.appendChild(label);
  } else {
    const label = el("text", { x: node.x, y: node.y + h/2 + 14, class: "node-sub" });
    label.textContent = "OUT";
    g.appendChild(label);
  }

  // body interaction: drag to reposition; a plain click on a SRC (A/B) node
  // toggles its live test value instead of dragging.
  shape.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.target.classList.contains("pin")) return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    startDrag(node.id, e);
    selectNode(node.id);

    function onMove(ev) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
    }
    function onUp() {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      if (!moved && node.type === "SRC") toggleSource(node.label);
    }
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
  });

  // pins
  if (node.type !== "OUT") {
    const p = pinPos(node.id, "out");
    g.appendChild(makePin(node.id, "out", p, live[node.id]));
  }
  for (let i = 0; i < inputCount(node.type); i++) {
    const port = "in" + i;
    const p = pinPos(node.id, port);
    const w2 = circuit.wires.find(w => w.to.node === node.id && w.to.port === port);
    const v = w2 ? live[w2.from.node] : null;
    g.appendChild(makePin(node.id, port, p, v));
  }

  svg.appendChild(g);
}

function makePin(nodeId, port, pos, value) {
  const isPending = pendingFrom && pendingFrom.node === nodeId && pendingFrom.port === port;
  const circle = el("circle", {
    cx: pos.x, cy: pos.y, r: 6,
    class: "pin" + (value === 1 ? " on" : "") + (isPending ? " pending" : ""),
    "data-node": nodeId, "data-port": port
  });
  circle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    handlePinClick(nodeId, port);
  });
  return circle;
}

/* ---------------- interaction: wiring ---------------- */

function isOutputPort(port) { return port === "out"; }

function handlePinClick(nodeId, port) {
  if (!pendingFrom) {
    if (isOutputPort(port)) {
      pendingFrom = { node: nodeId, port };
      selected = null;
      renderWorkbench();
    } else {
      toast("Start a wire from an output pin, then click the input you want to feed.");
    }
    return;
  }
  // pendingFrom already set
  if (isOutputPort(port)) {
    pendingFrom = { node: nodeId, port }; // switch source
    renderWorkbench();
    return;
  }
  if (nodeId === pendingFrom.node) {
    toast("A gate can't feed itself.");
    pendingFrom = null; renderWorkbench();
    return;
  }
  // remove any existing wire into this input pin (one wire per input)
  const existingIdx = circuit.wires.findIndex(w => w.to.node === nodeId && w.to.port === port);
  if (existingIdx !== -1) circuit.wires.splice(existingIdx, 1);

  circuit.wires.push({ id: "w" + (gateSeq++), from: { ...pendingFrom }, to: { node: nodeId, port } });
  pendingFrom = null;
  refreshAll();
}

svg.addEventListener("pointermove", (e) => {
  if (pendingFrom) {
    ghostPointer = svgPoint(e);
    renderWorkbench();
  }
  if (dragNode) {
    const p = svgPoint(e);
    circuit.nodes[dragNode].x = clamp(p.x - dragOffset.x, 40, 860);
    circuit.nodes[dragNode].y = clamp(p.y - dragOffset.y, 30, 430);
    renderWorkbench();
  }
});

svg.addEventListener("pointerup", () => { dragNode = null; });
svg.addEventListener("pointerleave", () => { dragNode = null; });

svg.addEventListener("pointerdown", (e) => {
  if (e.target === svg) {
    if (pendingFrom) { pendingFrom = null; renderWorkbench(); }
    selected = null;
    updateDeleteBtn();
    renderWorkbench();
  }
});

function svgPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM().inverse();
  const p = pt.matrixTransform(ctm);
  return { x: p.x, y: p.y };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function startDrag(nodeId, evt) {
  const p = svgPoint(evt);
  const node = circuit.nodes[nodeId];
  dragOffset = { x: p.x - node.x, y: p.y - node.y };
  dragNode = nodeId;
}

function selectNode(id) { selected = { kind: "node", id }; updateDeleteBtn(); renderWorkbench(); }
function selectWire(id) { selected = { kind: "wire", id }; updateDeleteBtn(); renderWorkbench(); }

function updateDeleteBtn() {
  const btn = document.getElementById("delete-selected-btn");
  const fixed = selected && selected.kind === "node" && ["A","B","OUT"].includes(selected.id);
  btn.disabled = !selected || fixed;
}

document.getElementById("delete-selected-btn").addEventListener("click", () => {
  if (!selected) return;
  if (selected.kind === "wire") {
    circuit.wires = circuit.wires.filter(w => w.id !== selected.id);
  } else if (selected.kind === "node") {
    if (["A","B","OUT"].includes(selected.id)) return;
    delete circuit.nodes[selected.id];
    circuit.wires = circuit.wires.filter(w => w.from.node !== selected.id && w.to.node !== selected.id);
  }
  selected = null;
  updateDeleteBtn();
  refreshAll();
});

document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && selected && document.activeElement.tagName !== "INPUT") {
    document.getElementById("delete-selected-btn").click();
  }
  if (e.key === "Escape" && pendingFrom) {
    pendingFrom = null; renderWorkbench();
  }
});

/* ---------------- palette: add gates, click nodes to toggle A/B ---------------- */

document.querySelectorAll(".gate-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.gate;
    const id = "g" + (gateSeq++);
    const count = Object.values(circuit.nodes).filter(n => !["A","B","OUT"].includes(n.id)).length;
    const x = 300 + (count % 4) * 100;
    const y = 100 + Math.floor(count / 4) * 110;
    circuit.nodes[id] = { id, type, x, y };
    refreshAll();
  });
});

// clicking the body of A or B toggles the live test signal (separate from wiring pin clicks)
function toggleSource(label) {
  if (label === "A") currentA = currentA ? 0 : 1;
  else currentB = currentB ? 0 : 1;
  renderWorkbench();
}

/* ---------------- clear / status / delete ---------------- */

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Clear the whole workbench? This can't be undone.")) return;
  circuit = freshCircuit();
  selected = null; pendingFrom = null;
  refreshAll();
});

function refreshAll() {
  renderWorkbench();
  renderTruthTable();
}

function renderTruthTable() {
  const rows = computeTruthTable();
  const tbody = document.querySelector("#truth-table tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    const cls = v => v === null ? "val-null" : "val-" + v;
    tr.innerHTML = `<td>${r.A}</td><td>${r.B}</td><td class="${cls(r.out)}">${r.out === null ? "?" : r.out}</td>`;
    tbody.appendChild(tr);
  });

  const pattern = tableToPattern(rows);
  document.getElementById("pattern-code").textContent = pattern || "????";

  const statusEl = document.getElementById("status-msg");
  const submitBtn = document.getElementById("submit-btn");
  const submitHint = document.getElementById("submit-hint");

  if (pattern) {
    const name = FUNCTION_NAMES[pattern];
    statusEl.textContent = `Complete — this circuit computes ${name}.`;
    submitBtn.disabled = false;
    submitHint.textContent = `Ready to submit as "${name}" (pattern ${pattern}).`;
  } else {
    statusEl.textContent = "Some gate input isn't wired yet — no dangling inputs allowed.";
    submitBtn.disabled = true;
    submitHint.textContent = "Finish wiring every gate input to enable submitting.";
  }
}

/* ---------------- toasts ---------------- */

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------- tabs ---------------- */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected","false"); });
    tab.classList.add("active"); tab.setAttribute("aria-selected","true");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "board") renderBoard();
  });
});

/* ---------------- persistence: the Board ---------------- */

const STORAGE_KEY = "gatecamp_board_v1";

function loadBoard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveBoard(board) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}

document.getElementById("submit-btn").addEventListener("click", () => {
  const rows = computeTruthTable();
  const pattern = tableToPattern(rows);
  if (!pattern) return;
  const name = document.getElementById("student-name").value.trim() || "Anonymous";

  const board = loadBoard();
  if (!board[pattern]) board[pattern] = [];
  board[pattern].push({
    id: "s" + Date.now() + Math.floor(Math.random()*1000),
    name,
    ts: Date.now(),
    nodes: JSON.parse(JSON.stringify(circuit.nodes)),
    wires: JSON.parse(JSON.stringify(circuit.wires)),
  });
  saveBoard(board);
  toast(`Added to the Board under ${FUNCTION_NAMES[pattern]} (${pattern}).`);

  document.querySelector('.tab[data-tab="board"]').click();
});

document.getElementById("reset-board-btn").addEventListener("click", () => {
  if (!confirm("Reset the whole Board for everyone on this device? This can't be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  renderBoard();
  toast("Board reset.");
});

function renderBoard() {
  const board = loadBoard();
  const grid = document.getElementById("board-grid");
  grid.innerHTML = "";

  PATTERN_ORDER.forEach(pattern => {
    const entries = board[pattern] || [];
    const solved = entries.length > 0;
    const card = document.createElement("div");
    card.className = "board-card" + (solved ? " solved" : "");

    const rowsHtml = pattern.split("").map((bit, i) => {
      const [A,B] = [[0,0],[0,1],[1,0],[1,1]][i];
      return `<tr><td>${A}</td><td>${B}</td><td class="val-${bit}">${bit}</td></tr>`;
    }).join("");

    card.innerHTML = `
      <div class="card-top">
        <span class="card-pattern">${pattern}</span>
        <span class="card-name ${solved ? "" : "unsolved"}">${solved ? FUNCTION_NAMES[pattern] : "unsolved"}</span>
      </div>
      <table class="mini-table"><thead><tr><th>A</th><th>B</th><th>OUT</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="card-solutions"></div>
    `;

    const solBox = card.querySelector(".card-solutions");
    if (!solved) {
      solBox.innerHTML = `<div class="card-empty">No circuit yet — first to find it wins the slot on the board.</div>`;
    } else {
      entries.forEach(entry => {
        const row = document.createElement("div");
        row.className = "solution-row";
        const gateCount = Object.values(entry.nodes).filter(n => !["A","B","OUT"].includes(n.id)).length;
        row.innerHTML = `<span>${escapeHtml(entry.name)} · ${gateCount} gate${gateCount===1?"":"s"}</span>`;
        const viewBtn = document.createElement("button");
        viewBtn.textContent = "View";
        viewBtn.addEventListener("click", () => openViewer(entry, pattern));
        row.appendChild(viewBtn);
        solBox.appendChild(row);
      });
    }

    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ---------------- read-only viewer ---------------- */

function openViewer(entry, pattern) {
  document.getElementById("viewer-title").textContent =
    `${FUNCTION_NAMES[pattern]} — by ${entry.name}`;

  const vsvg = document.getElementById("viewer-svg");
  vsvg.innerHTML = "";
  const savedNodes = entry.nodes, savedWires = entry.wires;

  savedWires.forEach(w => {
    const fromNode = savedNodes[w.from.node], toNode = savedNodes[w.to.node];
    const p1 = pinPosFor(fromNode, w.from.port);
    const p2 = pinPosFor(toNode, w.to.port);
    const midX = (p1.x + p2.x) / 2;
    const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    vsvg.appendChild(el("path", { d, class: "wire" }));
  });

  Object.values(savedNodes).forEach(node => {
    const { w, h } = nodeSize(node.type);
    let shape;
    if (node.type === "SRC") shape = el("rect", { x: node.x-w/2, y: node.y-h/2, width:w, height:h, rx:h/2, class:"node-body" });
    else if (node.type === "OUT") shape = el("circle", { cx: node.x, cy: node.y, r: w/2, class: "out-led" });
    else if (node.type === "NOT") shape = el("path", { d:`M ${node.x-w/2} ${node.y-h/2} L ${node.x+w/2-10} ${node.y} L ${node.x-w/2} ${node.y+h/2} Z`, class:"node-body" });
    else shape = el("rect", { x: node.x-w/2, y: node.y-h/2, width:w, height:h, rx:10, class:"node-body" });
    vsvg.appendChild(shape);
    if (node.type !== "OUT") {
      const label = el("text", { x: node.type==="NOT" ? node.x-8 : node.x, y: node.y, class: "node-label" });
      label.textContent = node.type === "SRC" ? node.label : node.type;
      vsvg.appendChild(label);
    }
    if (node.type !== "OUT") vsvg.appendChild(el("circle", {...pinPosXY(pinPosFor(node,"out")), r:5, class:"pin"}));
    for (let i=0;i<inputCount(node.type);i++) {
      vsvg.appendChild(el("circle", {...pinPosXY(pinPosFor(node,"in"+i)), r:5, class:"pin"}));
    }
  });

  const rows = [[0,0],[0,1],[1,0],[1,1]].map(([A,B]) => `<tr><td>${A}</td><td>${B}</td><td class="val-${pattern[[[0,0],[0,1],[1,0],[1,1]].findIndex(p=>p[0]===A&&p[1]===B)]}">${pattern[[[0,0],[0,1],[1,0],[1,1]].findIndex(p=>p[0]===A&&p[1]===B)]}</td></tr>`).join("");
  document.getElementById("viewer-table").innerHTML = `<thead><tr><th>A</th><th>B</th><th>OUT</th></tr></thead><tbody>${rows}</tbody>`;

  document.getElementById("viewer-modal").classList.remove("hidden");
}
function pinPosFor(node, port) {
  const { w, h } = nodeSize(node.type);
  if (port === "out") return { x: node.x + w/2, y: node.y };
  if (port === "in0") {
    if (node.type === "OUT" || node.type === "NOT") return { x: node.x - w/2, y: node.y };
    return { x: node.x - w/2, y: node.y - 13 };
  }
  return { x: node.x - w/2, y: node.y + 13 };
}
function pinPosXY(p) { return { cx: p.x, cy: p.y }; }

document.getElementById("viewer-close").addEventListener("click", () => {
  document.getElementById("viewer-modal").classList.add("hidden");
});
document.getElementById("viewer-modal").addEventListener("click", (e) => {
  if (e.target.id === "viewer-modal") document.getElementById("viewer-modal").classList.add("hidden");
});

/* ---------------- init ---------------- */

refreshAll();
renderBoard();
