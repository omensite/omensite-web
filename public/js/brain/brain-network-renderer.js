// Original neural topology, retaining the supplied Redline Cortex binary palette.
const TAU = Math.PI * 2;
export const BRAIN_REGIONS = ['frontal-l', 'frontal-r', 'parietal', 'temporal-l', 'temporal-r', 'occipital', 'cerebellum', 'stem'];
const CENTERS = [[-1.04, .65, .25], [.82, .72, -.2], [.04, 1.15, .24], [-.68, -.67, .36], [.94, -.57, -.16], [1.32, .1, .25], [-1.31, -.08, -.35], [.05, -1.14, .1]];
function random(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }

function buildTopology(seed = 42) {
  const r = random(seed), nodes = [], edges = [], hubs = [];
  for (const [regionIndex, center] of CENTERS.entries()) {
    const region = BRAIN_REGIONS[regionIndex], hub = nodes.length;
    hubs.push(hub); nodes.push({ x: center[0], y: center[1], z: center[2], region, hub: true });
    for (let branch = 0; branch < 11; branch++) {
      const angle = branch / 11 * TAU + r() * .28, elevation = (r() - .5) * 1.5;
      let parent = hub;
      for (let segment = 1; segment <= 4; segment++) {
        const distance = segment * (.075 + r() * .018), sway = (r() - .5) * .085;
        const node = { x: center[0] + Math.cos(angle + sway) * distance, y: center[1] + Math.sin(angle + sway) * distance, z: center[2] + elevation * distance, region };
        const index = nodes.push(node) - 1; edges.push([parent, index]);
        if (segment > 1) {
          const fork = nodes.push({ x: node.x + Math.cos(angle + .9) * .09, y: node.y + Math.sin(angle + .9) * .09, z: node.z + (r() - .5) * .12, region }) - 1;
          edges.push([index, fork]);
        }
        parent = index;
      }
    }
  }
  for (let index = 0; index < hubs.length; index++) {
    for (let other = index + 1; other < hubs.length; other++) {
      const a = nodes[hubs[index]], b = nodes[hubs[other]];
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1.85) continue;
      let parent = hubs[index];
      for (let step = 1; step <= 7; step++) {
        const t = step / 8, bend = Math.sin(t * Math.PI) * .11;
        const point = nodes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + bend, z: a.z + (b.z - a.z) * t + bend, region: t < .5 ? a.region : b.region }) - 1;
        edges.push([parent, point]); parent = point;
      }
      edges.push([parent, hubs[other]]);
    }
  }
  // A small internal mesh connects distant regions and gives the network depth.
  const core = nodes.length;
  for (let index = 0; index < 13; index++) {
    const angle = index / 13 * TAU;
    nodes.push({ x: Math.cos(angle) * (.18 + r() * .22), y: Math.sin(angle) * (.18 + r() * .23), z: (r() - .5) * .75, region: BRAIN_REGIONS[index % BRAIN_REGIONS.length] });
    if (index) edges.push([core + index - 1, core + index]);
  }
  for (let index = 0; index < hubs.length; index++) {
    edges.push([hubs[index], core + index], [hubs[index], core + (index + 5) % 13]);
  }
  return { nodes, edges, hubs };
}

/** Binary filaments follow connected dendrites rather than an anatomical shell. */
export function buildMatrixBrain(count = 3400, seed = 42) {
  const r = random(seed + 13), graph = buildTopology(seed), points = [];
  for (let index = 0; index < count; index++) {
    const [from, to] = graph.edges[index % graph.edges.length], a = graph.nodes[from], b = graph.nodes[to], t = r();
    const jitter = index % 5 === 0 ? .075 : .012;
    points.push({ x: a.x + (b.x - a.x) * t + (r() - .5) * jitter, y: a.y + (b.y - a.y) * t + (r() - .5) * jitter, z: a.z + (b.z - a.z) * t + (r() - .5) * jitter, region: t < .5 ? a.region : b.region });
  }
  return points;
}

/** The clock changes binary activity only. Camera transforms always belong to the user. */
export function createBrainNetworkRenderer(context, colors = {}) {
  let red = colors.red || '#ff2e43', glow = colors.glow || '#ff6675', line = colors.line || '#493039', mono = colors.mono || '"JetBrains Mono", monospace', dark = colors.dark !== false;
  const topology = buildTopology(), points = buildMatrixBrain(), r = random(9);
  const decorated = points.map((point) => ({ ...point, glyph: r() < .5 ? 0 : 1, delay: r() * 6 }));
  let projected = [], anchors = new Map();
  const render = ({ width, height, zoom = 1, time = 0, yaw = -.28, pitch = .14, panX = 0, panY = 0, selectedRegion }) => {
    context.clearRect(0, 0, width, height);
    const seconds = time / 1000, cx = width * (.5 + panX), cy = height * (.47 + panY);
    const scale = Math.min(width * .23, height * .245) * zoom;
    const cosine = Math.cos(yaw), sine = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (point) => {
      const xx = point.x * cosine + point.z * sine, zz = -point.x * sine + point.z * cosine;
      const yy = point.y * cp - zz * sp, depth = point.y * sp + zz * cp, perspective = 4.6 / (4.6 - depth);
      return { x: cx + xx * scale * perspective, y: cy - yy * scale * perspective, depth };
    };
    const neuronPoints = topology.nodes.map(project);
    context.lineWidth = .6;
    for (const selected of [false, true]) {
      context.strokeStyle = selected ? red : line;
      context.globalAlpha = selected ? .52 : dark ? .55 : .35;
      context.beginPath();
      for (const [from, to] of topology.edges) {
        if ((topology.nodes[from].region === selectedRegion) !== selected) continue;
        const a = neuronPoints[from], b = neuronPoints[to];
        context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
      }
      context.stroke();
    }
    context.fillStyle = red;
    for (const [index, point] of neuronPoints.entries()) {
      const hub = topology.nodes[index].hub;
      context.globalAlpha = hub ? .9 : .32;
      if (hub) {
        context.strokeStyle = topology.nodes[index].region === selectedRegion ? glow : red;
        context.lineWidth = 1; context.beginPath(); context.arc(point.x, point.y, 5 * zoom, 0, TAU); context.stroke();
      } else context.fillRect(point.x - .6, point.y - .6, 1.2, 1.2);
    }
    const buckets = Array.from({ length: 12 }, () => []);
    projected = decorated.map((point, index) => {
      const p = project(point), layer = Math.max(0, Math.min(3, Math.floor((p.depth + 1) * 2)));
      const beat = seconds * (1.8 + (index % 11) * .17) + point.delay;
      let signal = Math.imul(index + 1, 374761393) ^ Math.imul(Math.floor(beat) + 1, 668265263);
      signal = Math.imul(signal ^ (signal >>> 13), 1274126177) >>> 0;
      const burst = signal % 100 < 15, pulse = burst ? Math.sin((beat % 1) * Math.PI) * zoom : 0;
      p.x += pulse * ((signal >>> 8 & 1) ? 2.4 : -2.4);
      p.y += pulse * ((signal >>> 9 & 1) ? 4.5 : -4.5);
      buckets[layer * 3 + (point.region === selectedRegion ? 2 : burst ? 1 : 0)].push({ ...p, glyph: point.glyph ^ (signal & 1) });
      return { ...p, region: point.region };
    });
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const [bucket, items] of buckets.entries()) {
      const layer = Math.floor(bucket / 3), kind = bucket % 3;
      context.font = `${kind === 2 ? '600 ' : ''}${((5 + layer * .55) * Math.max(.85, zoom)).toFixed(1)}px ${mono}`;
      context.fillStyle = kind ? glow : red; context.globalAlpha = Math.min(.85, .16 + layer * .09 + (kind ? .26 : 0));
      for (const p of items) context.fillText(String(p.glyph), p.x, p.y);
    }
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
    anchors = new Map(topology.hubs.map((index) => [topology.nodes[index].region, neuronPoints[index]]));
    return anchors;
  };
  render.hitTest = (x, y) => {
    let distance = 225, region = null;
    for (const [name, point] of anchors) {
      const delta = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (delta < distance) { distance = delta; region = name; }
    }
    for (let index = 0; index < projected.length; index += 2) {
      const point = projected[index], delta = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (delta < distance) { distance = delta; region = point.region; }
    }
    return region;
  };
  render.setColors = (next = {}) => { red = next.red || red; glow = next.glow || glow; line = next.line || line; mono = next.mono || mono; dark = next.dark !== false; };
  return render;
}
