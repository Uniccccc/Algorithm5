const SAMPLE_GRAPHS = {
  graph: `10
12
0 1
1 2
2 3
3 4
4 5
5 0
2 6
6 7
7 8
8 2
4 9
1 9`,
  tree: `9
8
0 1
1 2
1 3
3 4
3 5
5 6
5 7
7 8`,
  cycle: `12
15
0 1
1 2
2 3
3 0
3 4
4 5
5 6
6 3
6 7
7 8
8 9
9 6
9 10
10 11
11 9`
};

const ui = {
  sampleSelect: document.getElementById("sampleSelect"),
  graphInput: document.getElementById("graphInput"),
  vertexCountInput: document.getElementById("vertexCountInput"),
  densityRange: document.getElementById("densityRange"),
  densityValue: document.getElementById("densityValue"),
  loadBtn: document.getElementById("loadBtn"),
  randomBtn: document.getElementById("randomBtn"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  playBtn: document.getElementById("playBtn"),
  speedRange: document.getElementById("speedRange"),
  speedValue: document.getElementById("speedValue"),
  stepRange: document.getElementById("stepRange"),
  stepLabel: document.getElementById("stepLabel"),
  statVertices: document.getElementById("statVertices"),
  statEdges: document.getElementById("statEdges"),
  statBridges: document.getElementById("statBridges"),
  statSteps: document.getElementById("statSteps"),
  stepTitle: document.getElementById("stepTitle"),
  stepNarrative: document.getElementById("stepNarrative"),
  baselineState: document.getElementById("baselineState"),
  optimizedState: document.getElementById("optimizedState"),
  bridgeList: document.getElementById("bridgeList"),
  reachableList: document.getElementById("reachableList"),
  parentList: document.getElementById("parentList"),
  forestStage: document.getElementById("forestStage"),
  forestEdgeList: document.getElementById("forestEdgeList"),
  coveredEdgeList: document.getElementById("coveredEdgeList"),
  graphSvg: document.getElementById("graphSvg"),
  forestSvg: document.getElementById("forestSvg")
};

let graphModel = null;
let timeline = [];
let currentStep = 0;
let playTimer = null;

function edgeKey(u, v) {
  return u < v ? `${u}-${v}` : `${v}-${u}`;
}

function parseGraph(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("输入至少需要两行：顶点数 V 和边数 E。");
  }

  const vertexCount = Number(lines[0]);
  const edgeCount = Number(lines[1]);
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new Error("第一行顶点数 V 不合法。");
  }
  if (!Number.isInteger(edgeCount) || edgeCount < 0) {
    throw new Error("第二行边数 E 不合法。");
  }
  if (lines.length < edgeCount + 2) {
    throw new Error("边的行数不足。");
  }

  const edges = [];
  const seen = new Set();
  for (let i = 0; i < edgeCount; i += 1) {
    const parts = lines[i + 2].split(/\s+/).map(Number);
    if (parts.length !== 2 || parts.some((x) => !Number.isInteger(x))) {
      throw new Error(`第 ${i + 3} 行边格式不合法。`);
    }
    let [u, v] = parts;
    if (u === v) {
      continue;
    }
    if (u < 0 || u >= vertexCount || v < 0 || v >= vertexCount) {
      throw new Error(`第 ${i + 3} 行顶点编号越界。`);
    }
    if (u > v) {
      [u, v] = [v, u];
    }
    const key = edgeKey(u, v);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    edges.push({ u, v, key });
  }

  const adj = Array.from({ length: vertexCount }, () => []);
  edges.forEach((edge, index) => {
    adj[edge.u].push({ to: edge.v, index });
    adj[edge.v].push({ to: edge.u, index });
  });

  return { vertexCount, edges, adj };
}

function graphToText(vertexCount, edges) {
  const lines = [String(vertexCount), String(edges.length)];
  edges.forEach((edge) => lines.push(`${edge.u} ${edge.v}`));
  return lines.join("\n");
}

function generateRandomGraph(vertexCount, density) {
  const maxEdges = (vertexCount * (vertexCount - 1)) / 2;
  const targetEdges = Math.max(vertexCount - 1, Math.round(maxEdges * density));
  const edgeMap = new Set();
  const edges = [];

  for (let i = 1; i < vertexCount; i += 1) {
    const parent = Math.floor(Math.random() * i);
    const key = edgeKey(i, parent);
    edgeMap.add(key);
    edges.push({ u: Math.min(i, parent), v: Math.max(i, parent), key });
  }

  while (edges.length < targetEdges) {
    let u = Math.floor(Math.random() * vertexCount);
    let v = Math.floor(Math.random() * vertexCount);
    if (u === v) {
      continue;
    }
    if (u > v) {
      [u, v] = [v, u];
    }
    const key = edgeKey(u, v);
    if (edgeMap.has(key)) {
      continue;
    }
    edgeMap.add(key);
    edges.push({ u, v, key });
  }

  edges.sort((a, b) => (a.u - b.u) || (a.v - b.v));
  return graphToText(vertexCount, edges);
}

function buildLayout(vertexCount, width = 760, height = 460) {
  const centerX = width / 2;
  const centerY = height / 2;
  const base = Math.min(width, height) * 0.33;
  const positions = [];
  for (let i = 0; i < vertexCount; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(vertexCount, 1);
    const radius = base + (i % 3 === 0 ? 18 : i % 3 === 1 ? -6 : 9);
    positions.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius * 0.8
    });
  }
  return positions;
}

function buildTreeLayout(graph, treeEdgeKeys) {
  const width = 760;
  const height = 320;
  const adj = Array.from({ length: graph.vertexCount }, () => []);
  for (const edge of graph.edges) {
    if (!treeEdgeKeys.has(edge.key)) {
      continue;
    }
    adj[edge.u].push(edge.v);
    adj[edge.v].push(edge.u);
  }

  const depth = Array.from({ length: graph.vertexCount }, () => -1);
  const orderByDepth = [];
  for (let start = 0; start < graph.vertexCount; start += 1) {
    if (depth[start] !== -1) {
      continue;
    }
    const queue = [start];
    depth[start] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      const d = depth[node];
      if (!orderByDepth[d]) {
        orderByDepth[d] = [];
      }
      orderByDepth[d].push(node);
      for (const next of adj[node]) {
        if (depth[next] !== -1) {
          continue;
        }
        depth[next] = d + 1;
        queue.push(next);
      }
    }
  }

  const positions = Array.from({ length: graph.vertexCount }, () => ({ x: 0, y: 0 }));
  const levels = orderByDepth.filter(Boolean);
  levels.forEach((levelNodes, level) => {
    const y = 56 + (level * (height - 96)) / Math.max(1, levels.length - 1 || 1);
    const gap = width / (levelNodes.length + 1);
    levelNodes.forEach((node, index) => {
      positions[node] = { x: gap * (index + 1), y };
    });
  });
  return positions;
}

function bfsReachable(graph, blockedKey, start) {
  const visited = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of graph.adj[node]) {
      if (graph.edges[next.index].key === blockedKey) {
        continue;
      }
      if (!visited.has(next.to)) {
        visited.add(next.to);
        queue.push(next.to);
      }
    }
  }
  return visited;
}

class DSU {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = Array.from({ length: n }, () => 1);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  unite(a, b) {
    a = this.find(a);
    b = this.find(b);
    if (a === b) {
      return false;
    }
    if (this.size[a] < this.size[b]) {
      [a, b] = [b, a];
    }
    this.parent[b] = a;
    this.size[a] += this.size[b];
    return true;
  }

  snapshot() {
    return this.parent.map((_, i) => this.find(i));
  }
}

class JumpDSU {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(x) {
    if (x === -1) {
      return -1;
    }
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  linkToParent(x, p) {
    this.parent[x] = this.find(p);
  }

  snapshot(limit = 12) {
    const items = [];
    for (let i = 0; i < Math.min(limit, this.parent.length); i += 1) {
      items.push(`${i}->${this.find(i)}`);
    }
    return items;
  }
}

function formatEdgeList(keys) {
  return keys.map((key) => `(${key.replace("-", ", ")})`).join("  ");
}

function buildTimeline(graph) {
  const steps = [];
  const bridgeKeys = new Set();
  const baselineState = {
    currentEdge: null,
    removedEdge: null,
    reachable: [],
    confirmedBridges: []
  };
  const optimizedState = {
    currentEdge: null,
    forestEdges: new Set(),
    coveredEdges: new Set(),
    extraEdges: new Set(),
    dsuParents: [],
    jumpParents: [],
    forestStage: "尚未开始"
  };

  const pushStep = ({ title, narrative, baselineText, optimizedText }) => {
    steps.push({
      title,
      narrative,
      baselineText,
      optimizedText,
      currentEdge: baselineState.currentEdge || optimizedState.currentEdge,
      removedEdge: baselineState.removedEdge,
      reachable: [...baselineState.reachable],
      confirmedBridges: [...baselineState.confirmedBridges],
      forestEdges: [...optimizedState.forestEdges],
      coveredEdges: [...optimizedState.coveredEdges],
      extraEdges: [...optimizedState.extraEdges],
      dsuParents: [...optimizedState.dsuParents],
      jumpParents: [...optimizedState.jumpParents],
      forestStage: optimizedState.forestStage
    });
  };

  pushStep({
    title: "双算法就绪",
    narrative: "深色舞台上，左侧基准算法准备逐边删边并 BFS，右侧优化算法准备先构建森林，再用非树边批量排除非桥树边。",
    baselineText: "等待逐条检查边。",
    optimizedText: "等待扫描边集并建立并查集森林。"
  });

  for (const edge of graph.edges) {
    baselineState.currentEdge = edge.key;
    baselineState.removedEdge = edge.key;
    const visited = bfsReachable(graph, edge.key, edge.u);
    baselineState.reachable = [...visited].sort((a, b) => a - b);
    pushStep({
      title: `基准算法：删除边 (${edge.u}, ${edge.v})`,
      narrative: `临时删除边 (${edge.u}, ${edge.v})，从端点 ${edge.u} 发起 BFS。若 ${edge.v} 失联，这条边就是桥。`,
      baselineText: `当前 BFS 可达点数：${visited.size}。`,
      optimizedText: "优化算法保持全局视角，尚未进入逐边判断。"
    });

    if (!visited.has(edge.v)) {
      bridgeKeys.add(edge.key);
      baselineState.confirmedBridges = [...bridgeKeys];
    }
    baselineState.removedEdge = null;
    pushStep({
      title: `基准算法：完成边 (${edge.u}, ${edge.v}) 判断`,
      narrative: visited.has(edge.v)
        ? `删边后 ${edge.v} 仍可达，因此 (${edge.u}, ${edge.v}) 在某个环上，不是桥。`
        : `删边后 ${edge.v} 不再可达，因此 (${edge.u}, ${edge.v}) 是桥。`,
      baselineText: visited.has(edge.v)
        ? `边 (${edge.u}, ${edge.v}) 不是桥。`
        : `边 (${edge.u}, ${edge.v}) 已加入桥集合。`,
      optimizedText: "优化算法稍后会批量完成这类判断。"
    });
  }

  baselineState.currentEdge = null;
  baselineState.reachable = [];

  const buildDsu = new DSU(graph.vertexCount);
  const treeAdj = Array.from({ length: graph.vertexCount }, () => []);
  const treeEdges = [];
  const extraEdges = [];

  pushStep({
    title: "优化算法：构造生成森林",
    narrative: "并查集开始接管图结构。树边会进入森林，非树边会保留下来，作为证明“某些树边位于环上”的证据。",
    baselineText: `基准算法当前桥数：${bridgeKeys.size}。`,
    optimizedText: "并查集开始扫描边集。"
  });

  for (const edge of graph.edges) {
    optimizedState.currentEdge = edge.key;
    const merged = buildDsu.unite(edge.u, edge.v);
    optimizedState.dsuParents = buildDsu.snapshot();
    if (merged) {
      optimizedState.forestEdges.add(edge.key);
      treeAdj[edge.u].push({ to: edge.v, key: edge.key });
      treeAdj[edge.v].push({ to: edge.u, key: edge.key });
      treeEdges.push(edge);
      optimizedState.forestStage = `树边 (${edge.u}, ${edge.v}) 已加入森林`;
      pushStep({
        title: `优化算法：树边入森林 (${edge.u}, ${edge.v})`,
        narrative: `端点原本分属不同集合，所以这条边安全进入生成森林，并暂时作为桥候选存在。`,
        baselineText: `基准算法桥集合：${formatEdgeList([...bridgeKeys]) || "空"}`,
        optimizedText: `森林边数增加到 ${optimizedState.forestEdges.size}。`
      });
    } else {
      optimizedState.extraEdges.add(edge.key);
      extraEdges.push(edge);
      optimizedState.forestStage = `发现非树边 (${edge.u}, ${edge.v})`;
      pushStep({
        title: `优化算法：发现非树边 (${edge.u}, ${edge.v})`,
        narrative: `这条边连接的是同一连通块内的两个点，因此它会和森林中的一条路径一起形成环。`,
        baselineText: `基准算法桥集合：${formatEdgeList([...bridgeKeys]) || "空"}`,
        optimizedText: `非树边会用于覆盖环路径。`
      });
    }
  }

  optimizedState.currentEdge = null;

  const parent = Array.from({ length: graph.vertexCount }, () => -1);
  const depth = Array.from({ length: graph.vertexCount }, () => 0);
  const parentEdge = Array.from({ length: graph.vertexCount }, () => null);
  const seen = Array.from({ length: graph.vertexCount }, () => false);

  for (let start = 0; start < graph.vertexCount; start += 1) {
    if (seen[start]) {
      continue;
    }
    const queue = [start];
    seen[start] = true;
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      for (const next of treeAdj[node]) {
        if (seen[next.to]) {
          continue;
        }
        seen[next.to] = true;
        parent[next.to] = node;
        parentEdge[next.to] = next.key;
        depth[next.to] = depth[node] + 1;
        queue.push(next.to);
      }
    }
  }

  const jump = new JumpDSU(graph.vertexCount);
  const covered = new Set();

  for (const edge of extraEdges) {
    optimizedState.currentEdge = edge.key;
    optimizedState.forestStage = `非树边 (${edge.u}, ${edge.v}) 开始覆盖路径`;
    pushStep({
      title: `优化算法：启动环覆盖 (${edge.u}, ${edge.v})`,
      narrative: `非树边 (${edge.u}, ${edge.v}) 与森林中 ${edge.u} 到 ${edge.v} 的唯一路径形成一个环，这条路径上的树边都不是桥。`,
      baselineText: `基准算法桥集合：${formatEdgeList([...bridgeKeys]) || "空"}`,
      optimizedText: `开始沿森林路径向上跳。`
    });

    let u = jump.find(edge.u);
    let v = jump.find(edge.v);
    while (u !== v && u !== -1 && v !== -1) {
      if (depth[u] < depth[v]) {
        [u, v] = [v, u];
      }
      const key = parentEdge[u];
      if (!key) {
        break;
      }
      covered.add(key);
      optimizedState.coveredEdges = new Set(covered);
      jump.linkToParent(u, parent[u]);
      optimizedState.jumpParents = jump.snapshot();
      optimizedState.forestStage = `树边 ${key} 被环覆盖`;
      pushStep({
        title: `优化算法：覆盖树边 ${key.replace("-", " - ")}`,
        narrative: `树边 ${key.replace("-", " - ")} 已被证明位于某个环上，因此从桥候选中移除；跳跃并查集会让后续路径上跳更快。`,
        baselineText: `基准算法桥集合：${formatEdgeList([...bridgeKeys]) || "空"}`,
        optimizedText: `被覆盖树边数：${covered.size}。`
      });
      u = jump.find(u);
    }
  }

  optimizedState.currentEdge = null;
  optimizedState.jumpParents = jump.snapshot();
  optimizedState.forestStage = "森林中未被覆盖的树边即为桥";
  pushStep({
    title: "双算法总结",
    narrative: "基准算法是逐边验证，优化算法是先建森林再批量排除在环上的树边。二者结论一致，但优化算法重复工作更少。",
    baselineText: `基准算法最终桥集合：${formatEdgeList([...bridgeKeys]) || "空"}`,
    optimizedText: `森林中保留下来的桥：${formatEdgeList(treeEdges.filter((edge) => !covered.has(edge.key)).map((edge) => edge.key)) || "空"}`
  });

  return {
    steps,
    finalBridges: [...bridgeKeys],
    forestEdges: treeEdges.map((edge) => edge.key)
  };
}

function renderChipHtml(items, fallback = "空") {
  if (!items || items.length === 0) {
    return `<span class="chip muted">${fallback}</span>`;
  }
  return items.map((item) => `<span class="chip">${item}</span>`).join("");
}

function layoutAndBuild(text) {
  graphModel = parseGraph(text);
  graphModel.positions = buildLayout(graphModel.vertexCount);
  const result = buildTimeline(graphModel);
  graphModel.treePositions = buildTreeLayout(graphModel, new Set(result.forestEdges));
  timeline = result.steps;
  currentStep = 0;

  ui.statVertices.textContent = graphModel.vertexCount;
  ui.statEdges.textContent = graphModel.edges.length;
  ui.statBridges.textContent = result.finalBridges.length;
  ui.statSteps.textContent = timeline.length;

  ui.stepRange.max = Math.max(0, timeline.length - 1);
  ui.stepRange.value = 0;
  renderStep();
}

function drawGraph(step) {
  const svg = ui.graphSvg;
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  const ns = "http://www.w3.org/2000/svg";
  const forest = new Set(step.forestEdges);
  const covered = new Set(step.coveredEdges);
  const bridges = new Set(step.confirmedBridges);
  const extras = new Set(step.extraEdges);
  const reachable = new Set(step.reachable);

  for (const edge of graphModel.edges) {
    const p1 = graphModel.positions[edge.u];
    const p2 = graphModel.positions[edge.v];
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);

    let stroke = "#4b5b76";
    let width = 2.8;
    let dash = "";
    let opacity = "0.88";

    if (forest.has(edge.key)) {
      stroke = "#3ed0c2";
      width = 4.2;
    }
    if (extras.has(edge.key)) {
      stroke = "#7b83ff";
      width = 3.2;
      dash = "8 6";
    }
    if (covered.has(edge.key)) {
      stroke = "#ffb65c";
      width = 5.3;
      dash = "10 7";
    }
    if (bridges.has(edge.key)) {
      stroke = "#6fe19f";
      width = 6;
      dash = "";
    }
    if (edge.key === step.currentEdge) {
      stroke = "#ff9a3d";
      width = 7;
      dash = "";
    }
    if (edge.key === step.removedEdge) {
      stroke = "#ff7272";
      width = 5;
      dash = "12 8";
      opacity = "0.8";
    }

    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", String(width));
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", opacity);
    if (dash) {
      line.setAttribute("stroke-dasharray", dash);
    }
    svg.appendChild(line);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", ((p1.x + p2.x) / 2).toFixed(1));
    label.setAttribute("y", (((p1.y + p2.y) / 2) - 8).toFixed(1));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "edge-label");
    label.textContent = `${edge.u}-${edge.v}`;
    svg.appendChild(label);
  }

  for (let i = 0; i < graphModel.vertexCount; i += 1) {
    const pos = graphModel.positions[i];
    const node = document.createElementNS(ns, "circle");
    node.setAttribute("cx", pos.x);
    node.setAttribute("cy", pos.y);
    node.setAttribute("r", "18");

    let fill = "#101b2e";
    let stroke = "#9ab8ff";
    let width = 2.8;

    if (reachable.has(i)) {
      fill = "rgba(255, 182, 92, 0.18)";
      stroke = "#ffb65c";
      width = 4;
    }

    node.setAttribute("fill", fill);
    node.setAttribute("stroke", stroke);
    node.setAttribute("stroke-width", String(width));
    svg.appendChild(node);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + 4);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "node-label");
    label.textContent = String(i);
    svg.appendChild(label);
  }
}

function drawForest(step) {
  const svg = ui.forestSvg;
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  const ns = "http://www.w3.org/2000/svg";
  const forest = new Set(step.forestEdges);
  const covered = new Set(step.coveredEdges);
  const bridges = new Set(step.confirmedBridges);

  for (const edge of graphModel.edges) {
    if (!forest.has(edge.key)) {
      continue;
    }
    const p1 = graphModel.treePositions[edge.u];
    const p2 = graphModel.treePositions[edge.v];
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);

    let stroke = "#3ed0c2";
    let width = 4.5;
    if (covered.has(edge.key)) {
      stroke = "#ffb65c";
      width = 5.5;
    }
    if (bridges.has(edge.key)) {
      stroke = "#6fe19f";
      width = 6.5;
    }
    if (edge.key === step.currentEdge) {
      stroke = "#ff9a3d";
      width = 7;
    }

    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", String(width));
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", ((p1.x + p2.x) / 2).toFixed(1));
    label.setAttribute("y", (((p1.y + p2.y) / 2) - 8).toFixed(1));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "edge-label");
    label.textContent = `${edge.u}-${edge.v}`;
    svg.appendChild(label);
  }

  for (let i = 0; i < graphModel.vertexCount; i += 1) {
    const pos = graphModel.treePositions[i];
    const node = document.createElementNS(ns, "circle");
    node.setAttribute("cx", pos.x);
    node.setAttribute("cy", pos.y);
    node.setAttribute("r", "16");
    node.setAttribute("fill", "#0d1728");
    node.setAttribute("stroke", "#8fb6ff");
    node.setAttribute("stroke-width", "2.5");
    svg.appendChild(node);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + 4);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "node-label");
    label.textContent = String(i);
    svg.appendChild(label);
  }
}

function renderStep() {
  if (!graphModel || timeline.length === 0) {
    return;
  }
  const step = timeline[currentStep];
  ui.stepRange.value = currentStep;
  ui.stepLabel.textContent = `${currentStep + 1} / ${timeline.length}`;
  ui.stepTitle.textContent = step.title;
  ui.stepNarrative.textContent = step.narrative;
  ui.baselineState.textContent = step.baselineText;
  ui.optimizedState.textContent = step.optimizedText;
  ui.bridgeList.innerHTML = renderChipHtml(step.confirmedBridges.map((key) => `(${key.replace("-", ", ")})`));
  ui.reachableList.innerHTML = renderChipHtml(step.reachable.map(String), "暂无");

  const parentText = step.jumpParents.length > 0
    ? step.jumpParents
    : step.dsuParents.slice(0, 12).map((p, i) => `${i}->${p}`);
  ui.parentList.innerHTML = renderChipHtml(parentText, "暂无");
  ui.forestStage.textContent = step.forestStage;
  ui.forestEdgeList.innerHTML = renderChipHtml(step.forestEdges.map((key) => `(${key.replace("-", ", ")})`), "尚未构造");
  ui.coveredEdgeList.innerHTML = renderChipHtml(step.coveredEdges.map((key) => `(${key.replace("-", ", ")})`), "暂无");

  ui.prevBtn.disabled = currentStep === 0;
  ui.nextBtn.disabled = currentStep === timeline.length - 1;
  ui.playBtn.textContent = playTimer ? "暂停" : "播放";

  drawGraph(step);
  drawForest(step);
}

function goToStep(nextIndex) {
  currentStep = Math.max(0, Math.min(nextIndex, timeline.length - 1));
  renderStep();
}

function stopPlayback() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function togglePlayback() {
  if (playTimer) {
    stopPlayback();
    renderStep();
    return;
  }
  playTimer = setInterval(() => {
    if (currentStep >= timeline.length - 1) {
      stopPlayback();
      renderStep();
      return;
    }
    goToStep(currentStep + 1);
  }, Number(ui.speedRange.value));
  renderStep();
}

ui.sampleSelect.addEventListener("change", () => {
  const value = ui.sampleSelect.value;
  if (value !== "custom" && SAMPLE_GRAPHS[value]) {
    ui.graphInput.value = SAMPLE_GRAPHS[value];
  }
});

ui.densityRange.addEventListener("input", () => {
  ui.densityValue.textContent = (Number(ui.densityRange.value) / 100).toFixed(2);
});

ui.speedRange.addEventListener("input", () => {
  ui.speedValue.textContent = ui.speedRange.value;
  if (playTimer) {
    stopPlayback();
    togglePlayback();
  }
});

ui.loadBtn.addEventListener("click", () => {
  try {
    stopPlayback();
    layoutAndBuild(ui.graphInput.value);
  } catch (error) {
    alert(error.message);
  }
});

ui.randomBtn.addEventListener("click", () => {
  const vertexCount = Number(ui.vertexCountInput.value);
  const density = Number(ui.densityRange.value) / 100;
  if (!Number.isInteger(vertexCount) || vertexCount < 4 || vertexCount > 24) {
    alert("随机节点数请设置在 4 到 24 之间。");
    return;
  }
  ui.sampleSelect.value = "custom";
  ui.graphInput.value = generateRandomGraph(vertexCount, density);
  try {
    stopPlayback();
    layoutAndBuild(ui.graphInput.value);
  } catch (error) {
    alert(error.message);
  }
});

ui.analyzeBtn.addEventListener("click", () => {
  try {
    stopPlayback();
    layoutAndBuild(ui.graphInput.value);
  } catch (error) {
    alert(error.message);
  }
});

ui.prevBtn.addEventListener("click", () => {
  stopPlayback();
  goToStep(currentStep - 1);
});

ui.nextBtn.addEventListener("click", () => {
  stopPlayback();
  goToStep(currentStep + 1);
});

ui.playBtn.addEventListener("click", togglePlayback);

ui.stepRange.addEventListener("input", () => {
  stopPlayback();
  goToStep(Number(ui.stepRange.value));
});

ui.graphInput.value = SAMPLE_GRAPHS.graph;
ui.sampleSelect.value = "graph";
ui.speedValue.textContent = ui.speedRange.value;
ui.densityValue.textContent = (Number(ui.densityRange.value) / 100).toFixed(2);
layoutAndBuild(ui.graphInput.value);
