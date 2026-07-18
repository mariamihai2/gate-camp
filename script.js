/* =========================================================
   Gate Camp — logic circuits workbench
   Vanilla JS, no build step. Board + username in localStorage.
   ========================================================= */

const SVGNS = "http://www.w3.org/2000/svg";

const GATE_DEFS = {
  AND: { inputs: 2, fn: (a, b) => (a && b) ? 1 : 0 },
  OR:  { inputs: 2, fn: (a, b) => (a || b) ? 1 : 0 },
  NOT: { inputs: 1, fn: (a) => a ? 0 : 1 },
};

const FUNCTION_NAMES_2 = {
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

const PATTERN_ORDER_2 = [
  "0000","0001","0010","0011","0100","0101","0110","0111",
  "1000","1001","1010","1011","1100","1101","1110","1111",
];

const TRUTH_ROWS_2 = [[0,0],[0,1],[1,0],[1,1]];

const FUNCTION_NAMES_3 = {
  "00010111": "MAJORITY (2-of-3)",
  "01101000": "EXACTLY ONE",
  "01101001": "PARITY (XOR all 3)",
  "00111000": "A XOR B",
  "00000001": "A AND B AND C",
  "01111111": "A OR B OR C",
};

const PATTERN_ORDER_3 = [
  "00010111","01101000","01101001","00111000","00000001","01111111",
];

const TRUTH_ROWS_3 = [];
for (let a = 0; a < 2; a++)
  for (let b = 0; b < 2; b++)
    for (let c = 0; c < 2; c++)
      TRUTH_ROWS_3.push([a, b, c]);

const USERNAME_KEY = "gatecamp_username_v1";

/* ---------------- username ---------------- */

function getUsername() {
  try { return (localStorage.getItem(USERNAME_KEY) || "").trim(); }
  catch { return ""; }
}

function setUsername(name) {
  localStorage.setItem(USERNAME_KEY, name.trim());
  refreshUsernameUI();
}

function refreshUsernameUI() {
  const name = getUsername();
  const label = name || "set your name";
  document.getElementById("user-name-btn").textContent = label;
  document.querySelectorAll(".submit-as strong").forEach(el => {
    el.textContent = name || "—";
  });
  if (mainWb) mainWb.updateSubmitState();
  if (extraWb) extraWb.updateSubmitState();
}

function openUsernameModal(force = false) {
  const modal = document.getElementById("username-modal");
  const input = document.getElementById("username-input");
  input.value = getUsername();
  modal.classList.remove("hidden");
  input.focus();
  if (force) input.select();
}

function closeUsernameModal() {
  document.getElementById("username-modal").classList.add("hidden");
}

document.getElementById("user-name-btn").addEventListener("click", () => openUsernameModal(true));

document.getElementById("username-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = document.getElementById("username-input").value.trim();
  if (!val) return;
  setUsername(val);
  closeUsernameModal();
  toast(`Saved — you're ${val} on this browser.`);
});

/* ---------------- shared helpers ---------------- */

function nodeSize(type) {
  if (type === "SRC") return { w: 56, h: 40 };
  if (type === "OUT") return { w: 60, h: 44 };
  if (type === "NOT") return { w: 64, h: 44 };
  return { w: 76, h: 56 };
}

function inputCount(type) {
  if (type === "OUT") return 1;
  if (!GATE_DEFS[type]) return 0;
  return GATE_DEFS[type].inputs;
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function pinPosFor(node, port) {
  const { w, h } = nodeSize(node.type);
  if (port === "out") return { x: node.x + w / 2, y: node.y };
  if (port === "in0") {
    if (node.type === "OUT" || node.type === "NOT") return { x: node.x - w / 2, y: node.y };
    return { x: node.x - w / 2, y: node.y - 13 };
  }
  return { x: node.x - w / 2, y: node.y + 13 };
}

function pinPosXY(p) { return { cx: p.x, cy: p.y }; }

function tableToPattern(rows) {
  if (rows.some(r => r.out === null)) return null;
  return rows.map(r => r.out).join("");
}

function sourceValue(label, inputs) {
  if (label === "A") return inputs.A;
  if (label === "B") return inputs.B;
  if (label === "C") return inputs.C;
  return 0;
}

function fixedNodeIds(sources) {
  return [...sources, "OUT"];
}

/* ---------------- Workbench controller ---------------- */

class Workbench {
  constructor(opts) {
    this.sources = opts.sources;
    this.truthRows = opts.truthRows;
    this.functionNames = opts.functionNames;
    this.patternOrder = opts.patternOrder;
    this.storageKey = opts.storageKey;
    this.boardGridId = opts.boardGridId;
    this.boardTab = opts.boardTab;
    this.fixed = fixedNodeIds(this.sources);

    this.svg = document.getElementById(opts.svgId);
    this.truthTableBody = document.querySelector(`#${opts.truthTableId} tbody`);
    this.patternEl = document.getElementById(opts.patternCodeId);
    this.statusEl = document.getElementById(opts.statusId);
    this.submitBtn = document.getElementById(opts.submitBtnId);
    this.submitHint = document.getElementById(opts.submitHintId);
    this.deleteBtn = document.getElementById(opts.deleteBtnId);
    this.clearBtn = document.getElementById(opts.clearBtnId);
    this.resetBoardBtn = opts.resetBoardBtnId ? document.getElementById(opts.resetBoardBtnId) : null;

    this.circuit = this.freshCircuit();
    this.gateSeq = 0;
    this.liveInputs = Object.fromEntries(this.sources.map(s => [s, 0]));
    this.pendingFrom = null;
    this.selected = null;
    this.dragNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.ghostPointer = null;

    this.bindEvents();
  }

  freshCircuit() {
    const yPositions = this.sources.length === 2
      ? { A: 150, B: 340 }
      : { A: 120, B: 230, C: 340 };
    const outY = this.sources.length === 2 ? 245 : 230;
    const nodes = { OUT: { id: "OUT", type: "OUT", x: 800, y: outY } };
    this.sources.forEach(src => {
      nodes[src] = { id: src, type: "SRC", label: src, x: 90, y: yPositions[src] };
    });
    return { nodes, wires: [] };
  }

  pinPos(nodeId, port) {
    const node = this.circuit.nodes[nodeId];
    return pinPosFor(node, port);
  }

  evalNode(nodeId, inputs, memo, visiting) {
    if (memo.has(nodeId)) return memo.get(nodeId);
    if (visiting.has(nodeId)) { memo.set(nodeId, null); return null; }
    const node = this.circuit.nodes[nodeId];
    let result = null;

    if (node.type === "SRC") {
      result = sourceValue(node.label, inputs);
    } else {
      visiting.add(nodeId);
      const need = inputCount(node.type);
      const vals = [];
      let ok = true;
      for (let i = 0; i < need; i++) {
        const port = "in" + i;
        const w = this.circuit.wires.find(w => w.to.node === nodeId && w.to.port === port);
        if (!w) { ok = false; break; }
        const v = this.evalNode(w.from.node, inputs, memo, visiting);
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

  inputsFromRow(row) {
    const inputs = { A: 0, B: 0, C: 0 };
    if (row.length === 2) {
      inputs.A = row[0]; inputs.B = row[1];
    } else {
      inputs.A = row[0]; inputs.B = row[1]; inputs.C = row[2];
    }
    return inputs;
  }

  computeAllLive() {
    const inputs = { ...this.liveInputs };
    const memo = new Map();
    const out = {};
    for (const id in this.circuit.nodes) out[id] = this.evalNode(id, inputs, memo, new Set());
    return out;
  }

  computeTruthTable() {
    return this.truthRows.map(row => {
      const inputs = this.inputsFromRow(row);
      const memo = new Map();
      return { ...inputs, out: this.evalNode("OUT", inputs, memo, new Set()) };
    });
  }

  svgPoint(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = this.svg.getScreenCTM().inverse();
    return pt.matrixTransform(ctm);
  }

  render() {
    this.svg.innerHTML = "";
    const live = this.computeAllLive();

    this.circuit.wires.forEach(w => {
      const p1 = this.pinPos(w.from.node, w.from.port);
      const p2 = this.pinPos(w.to.node, w.to.port);
      const midX = (p1.x + p2.x) / 2;
      const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      const on = live[w.from.node] === 1;
      const isSel = this.selected && this.selected.kind === "wire" && this.selected.id === w.id;

      const hit = el("path", { d, class: "wire-hit" });
      hit.addEventListener("pointerdown", (e) => { e.stopPropagation(); this.selectWire(w.id); });
      this.svg.appendChild(hit);

      const path = el("path", { d, class: "wire" + (on ? " on" : "") + (isSel ? " selected" : "") });
      path.style.pointerEvents = "none";
      this.svg.appendChild(path);
    });

    if (this.pendingFrom && this.ghostPointer) {
      const p1 = this.pinPos(this.pendingFrom.node, this.pendingFrom.port);
      const midX = (p1.x + this.ghostPointer.x) / 2;
      const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${this.ghostPointer.y} L ${this.ghostPointer.x} ${this.ghostPointer.y}`;
      this.svg.appendChild(el("path", { d, class: "wire-ghost" }));
    }

    Object.values(this.circuit.nodes).forEach(node => this.drawNode(node, live));
  }

  drawNode(node, live) {
    const { w, h } = nodeSize(node.type);
    const val = live[node.id];
    const isSel = this.selected && this.selected.kind === "node" && this.selected.id === node.id;
    const g = el("g", { class: "gate-node" + (node.type === "SRC" ? " src-node" : "") + (val === 1 ? " on" : "") });

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
    g.appendChild(shape);

    if (node.type !== "OUT") {
      const label = el("text", { x: node.type === "NOT" ? node.x - 8 : node.x, y: node.y, class: "node-label" });
      label.textContent = node.type === "SRC" ? node.label : node.type;
      g.appendChild(label);
    } else {
      const label = el("text", { x: node.x, y: node.y + h/2 + 14, class: "node-sub" });
      label.textContent = "OUT";
      g.appendChild(label);
    }

    shape.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (e.target.classList.contains("pin")) return;
      const startX = e.clientX, startY = e.clientY;
      let moved = false;
      this.startDrag(node.id, e);
      this.selectNode(node.id);

      const onMove = (ev) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      };
      const onUp = () => {
        this.svg.removeEventListener("pointermove", onMove);
        this.svg.removeEventListener("pointerup", onUp);
        if (!moved && node.type === "SRC") this.toggleSource(node.label);
      };
      this.svg.addEventListener("pointermove", onMove);
      this.svg.addEventListener("pointerup", onUp);
    });

    if (node.type !== "OUT") {
      const p = this.pinPos(node.id, "out");
      g.appendChild(this.makePin(node.id, "out", p, live[node.id]));
    }
    for (let i = 0; i < inputCount(node.type); i++) {
      const port = "in" + i;
      const p = this.pinPos(node.id, port);
      const w2 = this.circuit.wires.find(w => w.to.node === node.id && w.to.port === port);
      const v = w2 ? live[w2.from.node] : null;
      g.appendChild(this.makePin(node.id, port, p, v));
    }

    this.svg.appendChild(g);
  }

  makePin(nodeId, port, pos, value) {
    const isPending = this.pendingFrom && this.pendingFrom.node === nodeId && this.pendingFrom.port === port;
    const circle = el("circle", {
      cx: pos.x, cy: pos.y, r: 6,
      class: "pin" + (value === 1 ? " on" : "") + (isPending ? " pending" : ""),
      "data-node": nodeId, "data-port": port
    });
    circle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.handlePinClick(nodeId, port);
    });
    return circle;
  }

  isOutputPort(port) { return port === "out"; }

  handlePinClick(nodeId, port) {
    if (!this.pendingFrom) {
      if (this.isOutputPort(port)) {
        this.pendingFrom = { node: nodeId, port };
        this.selected = null;
        this.render();
      } else {
        toast("Start from an output pin, then click the input you want.");
      }
      return;
    }
    if (this.isOutputPort(port)) {
      this.pendingFrom = { node: nodeId, port };
      this.render();
      return;
    }
    if (nodeId === this.pendingFrom.node) {
      toast("A gate can't feed itself.");
      this.pendingFrom = null;
      this.render();
      return;
    }
    const existingIdx = this.circuit.wires.findIndex(w => w.to.node === nodeId && w.to.port === port);
    if (existingIdx !== -1) this.circuit.wires.splice(existingIdx, 1);
    this.circuit.wires.push({ id: "w" + (this.gateSeq++), from: { ...this.pendingFrom }, to: { node: nodeId, port } });
    this.pendingFrom = null;
    this.refreshAll();
  }

  startDrag(nodeId, evt) {
    const p = this.svgPoint(evt);
    const node = this.circuit.nodes[nodeId];
    this.dragOffset = { x: p.x - node.x, y: p.y - node.y };
    this.dragNode = nodeId;
  }

  selectNode(id) { this.selected = { kind: "node", id }; this.updateDeleteBtn(); this.render(); }
  selectWire(id) { this.selected = { kind: "wire", id }; this.updateDeleteBtn(); this.render(); }

  updateDeleteBtn() {
    const fixed = this.selected && this.selected.kind === "node" && this.fixed.includes(this.selected.id);
    this.deleteBtn.disabled = !this.selected || fixed;
  }

  deleteSelected() {
    if (!this.selected) return;
    if (this.selected.kind === "wire") {
      this.circuit.wires = this.circuit.wires.filter(w => w.id !== this.selected.id);
    } else if (this.selected.kind === "node") {
      if (this.fixed.includes(this.selected.id)) return;
      delete this.circuit.nodes[this.selected.id];
      this.circuit.wires = this.circuit.wires.filter(w => w.from.node !== this.selected.id && w.to.node !== this.selected.id);
    }
    this.selected = null;
    this.updateDeleteBtn();
    this.refreshAll();
  }

  addGate(type) {
    const id = "g" + (this.gateSeq++);
    const count = Object.values(this.circuit.nodes).filter(n => !this.fixed.includes(n.id)).length;
    const x = 300 + (count % 4) * 100;
    const y = 100 + Math.floor(count / 4) * 110;
    this.circuit.nodes[id] = { id, type, x, y };
    this.refreshAll();
  }

  toggleSource(label) {
    this.liveInputs[label] = this.liveInputs[label] ? 0 : 1;
    this.render();
  }

  clearBoard() {
    if (!confirm("Clear the whole workbench? This can't be undone.")) return;
    this.circuit = this.freshCircuit();
    this.selected = null;
    this.pendingFrom = null;
    this.refreshAll();
  }

  refreshAll() {
    this.render();
    this.renderTruthTable();
  }

  updateSubmitState(pattern) {
    const hasName = !!getUsername();
    if (pattern && hasName) {
      this.submitBtn.disabled = false;
    } else {
      this.submitBtn.disabled = true;
    }
  }

  renderTruthTable() {
    const rows = this.computeTruthTable();
    this.truthTableBody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const cls = v => v === null ? "val-null" : "val-" + v;
      if (this.sources.length === 2) {
        tr.innerHTML = `<td>${r.A}</td><td>${r.B}</td><td class="${cls(r.out)}">${r.out === null ? "?" : r.out}</td>`;
      } else {
        tr.innerHTML = `<td>${r.A}</td><td>${r.B}</td><td>${r.C}</td><td class="${cls(r.out)}">${r.out === null ? "?" : r.out}</td>`;
      }
      this.truthTableBody.appendChild(tr);
    });

    const pattern = tableToPattern(rows);
    this.patternEl.textContent = pattern || (this.sources.length === 2 ? "????" : "????????");

    if (pattern) {
      const fnName = this.functionNames[pattern];
      if (fnName) {
        this.statusEl.textContent = `Done — this is ${fnName}.`;
        this.submitHint.textContent = `Ready to submit as ${fnName} (${pattern}).`;
        this.updateSubmitState(pattern);
      } else {
        this.statusEl.textContent = `Valid circuit — pattern ${pattern}, but it's not one of the targets on this Board.`;
        this.submitHint.textContent = "Try matching one of the Board cards.";
        this.submitBtn.disabled = true;
      }
    } else {
      this.statusEl.textContent = "Some gate input isn't wired yet.";
      this.submitHint.textContent = "Wire every gate input before you can submit.";
      this.submitBtn.disabled = true;
    }

    if (pattern && !getUsername()) {
      this.submitHint.textContent = "Set your name at the top before submitting.";
    }
  }

  loadBoard() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  saveBoard(board) {
    localStorage.setItem(this.storageKey, JSON.stringify(board));
  }

  submit() {
    const rows = this.computeTruthTable();
    const pattern = tableToPattern(rows);
    if (!pattern) return;

    const username = getUsername();
    if (!username) {
      openUsernameModal(true);
      toast("Pick a name first — it goes on your submission.");
      return;
    }

    if (!this.functionNames[pattern]) {
      toast("That pattern isn't on this Board. Check the target cards.");
      return;
    }

    const board = this.loadBoard();
    if (!board[pattern]) board[pattern] = [];
    board[pattern].push({
      id: "s" + Date.now() + Math.floor(Math.random() * 1000),
      name: username,
      ts: Date.now(),
      nodes: JSON.parse(JSON.stringify(this.circuit.nodes)),
      wires: JSON.parse(JSON.stringify(this.circuit.wires)),
    });
    this.saveBoard(board);
    toast(`${username} added ${this.functionNames[pattern]} to the Board.`);

    if (this.boardTab) document.querySelector(this.boardTab).click();
    else this.renderBoard();
  }

  resetBoard() {
    if (!confirm("Reset this Board on this device? Can't undo.")) return;
    localStorage.removeItem(this.storageKey);
    this.renderBoard();
    toast("Board reset.");
  }

  renderBoard() {
    const board = this.loadBoard();
    const grid = document.getElementById(this.boardGridId);
    grid.innerHTML = "";

    const varHeaders = this.sources.map(s => `<th>${s}</th>`).join("");

    this.patternOrder.forEach(pattern => {
      const entries = board[pattern] || [];
      const solved = entries.length > 0;
      const card = document.createElement("div");
      card.className = "board-card" + (solved ? " solved" : "");

      const rowsHtml = pattern.split("").map((bit, i) => {
        const row = this.truthRows[i];
        const cells = row.map(v => `<td>${v}</td>`).join("");
        return `<tr>${cells}<td class="val-${bit}">${bit}</td></tr>`;
      }).join("");

      card.innerHTML = `
        <div class="card-top">
          <span class="card-pattern">${pattern}</span>
          <span class="card-name ${solved ? "" : "unsolved"}">${solved ? this.functionNames[pattern] : "unsolved"}</span>
        </div>
        <table class="mini-table"><thead><tr>${varHeaders}<th>OUT</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        <div class="card-solutions"></div>
      `;

      const solBox = card.querySelector(".card-solutions");
      if (!solved) {
        solBox.innerHTML = `<div class="card-empty">Nobody's found this one yet.</div>`;
      } else {
        entries.forEach(entry => {
          const row = document.createElement("div");
          row.className = "solution-row";
          const gateCount = Object.values(entry.nodes).filter(n => !this.fixed.includes(n.id)).length;
          row.innerHTML = `<span><strong>${escapeHtml(entry.name)}</strong> · ${gateCount} gate${gateCount === 1 ? "" : "s"}</span>`;
          const viewBtn = document.createElement("button");
          viewBtn.textContent = "View";
          viewBtn.addEventListener("click", () => openViewer(entry, pattern, this));
          row.appendChild(viewBtn);
          solBox.appendChild(row);
        });
      }

      grid.appendChild(card);
    });
  }

  bindEvents() {
    this.svg.addEventListener("pointermove", (e) => {
      if (this.pendingFrom) {
        this.ghostPointer = this.svgPoint(e);
        this.render();
      }
      if (this.dragNode) {
        const p = this.svgPoint(e);
        this.circuit.nodes[this.dragNode].x = clamp(p.x - this.dragOffset.x, 40, 860);
        this.circuit.nodes[this.dragNode].y = clamp(p.y - this.dragOffset.y, 30, 430);
        this.render();
      }
    });

    this.svg.addEventListener("pointerup", () => { this.dragNode = null; });
    this.svg.addEventListener("pointerleave", () => { this.dragNode = null; });

    this.svg.addEventListener("pointerdown", (e) => {
      if (e.target === this.svg) {
        if (this.pendingFrom) { this.pendingFrom = null; this.render(); }
        this.selected = null;
        this.updateDeleteBtn();
        this.render();
      }
    });

    this.deleteBtn.addEventListener("click", () => this.deleteSelected());
    this.clearBtn.addEventListener("click", () => this.clearBoard());
    this.submitBtn.addEventListener("click", () => this.submit());
    if (this.resetBoardBtn) this.resetBoardBtn.addEventListener("click", () => this.resetBoard());
  }
}

/* ---------------- viewer ---------------- */

function openViewer(entry, pattern, wb) {
  document.getElementById("viewer-title").textContent =
    `${wb.functionNames[pattern]} — ${entry.name}`;

  const vsvg = document.getElementById("viewer-svg");
  vsvg.innerHTML = "";
  const savedNodes = entry.nodes;
  const savedWires = entry.wires;

  savedWires.forEach(w => {
    const fromNode = savedNodes[w.from.node];
    const toNode = savedNodes[w.to.node];
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
    for (let i = 0; i < inputCount(node.type); i++) {
      vsvg.appendChild(el("circle", {...pinPosXY(pinPosFor(node,"in"+i)), r:5, class:"pin"}));
    }
  });

  const varHeaders = wb.sources.map(s => `<th>${s}</th>`).join("");
  const rows = wb.truthRows.map((row, i) => {
    const cells = row.map(v => `<td>${v}</td>`).join("");
    const bit = pattern[i];
    return `<tr>${cells}<td class="val-${bit}">${bit}</td></tr>`;
  }).join("");
  document.getElementById("viewer-table").innerHTML = `<thead><tr>${varHeaders}<th>OUT</th></tr></thead><tbody>${rows}</tbody>`;

  document.getElementById("viewer-modal").classList.remove("hidden");
}

document.getElementById("viewer-close").addEventListener("click", () => {
  document.getElementById("viewer-modal").classList.add("hidden");
});
document.getElementById("viewer-modal").addEventListener("click", (e) => {
  if (e.target.id === "viewer-modal") document.getElementById("viewer-modal").classList.add("hidden");
});

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
    if (tab.dataset.tab === "board") mainWb.renderBoard();
    if (tab.dataset.tab === "extra") extraWb.renderBoard();
  });
});

document.querySelectorAll(".subtab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".subtab").forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected","false"); });
    tab.classList.add("active"); tab.setAttribute("aria-selected","true");
    document.querySelectorAll(".subpanel").forEach(p => p.classList.remove("active"));
    document.getElementById("subpanel-" + tab.dataset.subtab).classList.add("active");
    if (tab.dataset.subtab === "extra-board") extraWb.renderBoard();
  });
});

/* ---------------- gate palette ---------------- */

document.querySelectorAll(".gate-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const wb = btn.dataset.wb === "extra" ? extraWb : mainWb;
    wb.addGate(btn.dataset.gate);
  });
});

document.addEventListener("keydown", (e) => {
  const activePanel = document.querySelector(".panel.active");
  const wb = activePanel && activePanel.id === "panel-extra" ? extraWb : mainWb;
  if ((e.key === "Delete" || e.key === "Backspace") && wb.selected && document.activeElement.tagName !== "INPUT") {
    wb.deleteSelected();
  }
  if (e.key === "Escape") {
    if (wb.pendingFrom) { wb.pendingFrom = null; wb.render(); }
    closeUsernameModal();
    document.getElementById("viewer-modal").classList.add("hidden");
  }
});

/* ---------------- init ---------------- */

let mainWb, extraWb;

mainWb = new Workbench({
  sources: ["A", "B"],
  truthRows: TRUTH_ROWS_2,
  functionNames: FUNCTION_NAMES_2,
  patternOrder: PATTERN_ORDER_2,
  storageKey: "gatecamp_board_v1",
  boardGridId: "board-grid",
  boardTab: '.tab[data-tab="board"]',
  svgId: "wb-svg",
  truthTableId: "truth-table",
  patternCodeId: "pattern-code",
  statusId: "status-msg",
  submitBtnId: "submit-btn",
  submitHintId: "submit-hint",
  deleteBtnId: "delete-selected-btn",
  clearBtnId: "clear-btn",
  resetBoardBtnId: "reset-board-btn",
});

extraWb = new Workbench({
  sources: ["A", "B", "C"],
  truthRows: TRUTH_ROWS_3,
  functionNames: FUNCTION_NAMES_3,
  patternOrder: PATTERN_ORDER_3,
  storageKey: "gatecamp_board_3v_v1",
  boardGridId: "board-grid-extra",
  boardTab: '.subtab[data-subtab="extra-board"]',
  svgId: "wb-svg-extra",
  truthTableId: "truth-table-extra",
  patternCodeId: "pattern-code-extra",
  statusId: "status-msg-extra",
  submitBtnId: "submit-btn-extra",
  submitHintId: "submit-hint-extra",
  deleteBtnId: "delete-selected-btn-extra",
  clearBtnId: "clear-btn-extra",
  resetBoardBtnId: "reset-board-btn-extra",
});

mainWb.refreshAll();
mainWb.renderBoard();
extraWb.refreshAll();
extraWb.renderBoard();
refreshUsernameUI();

if (!getUsername()) openUsernameModal();
