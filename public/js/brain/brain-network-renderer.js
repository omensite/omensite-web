const TAU = Math.PI * 2;
const fract = (value) => value - Math.floor(value);
const noise = (seed) => fract(Math.sin(seed * 127.1 + 311.7) * 43758.5453);
const green = (alpha) => `rgba(86,255,145,${alpha})`;

function curvePoint(start, control, end, t) {
  const u = 1 - t;
  return { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x, y: u * u * start.y + 2 * u * t * control.y + t * t * end.y };
}

function makeCore() {
  const points = Array.from({ length: 380 }, (_, index) => {
    const y = 1 - (index + .5) / 190, radius = Math.sqrt(1 - y * y), angle = index * 2.399963;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // A slight cleft and irregular lobes give the decorative mesh an organic silhouette.
    const lobe = .9 + Math.abs(x) * .15 + Math.sin(angle * 3) * .035;
    return { x: x * lobe, y: y * (.87 + Math.abs(x) * .12), z: z * lobe };
  });
  const edges = [];
  points.forEach((point, index) => {
    const closest = points.map((other, target) => ({ target, distance: (point.x - other.x) ** 2 + (point.y - other.y) ** 2 + (point.z - other.z) ** 2 }))
      .filter((entry) => entry.target !== index).sort((a, b) => a.distance - b.distance).slice(0, 4);
    for (const { target } of closest) if (target > index) edges.push([index, target]);
  });
  return { points, edges };
}

/** Canvas ornament only: no requests, model activity, or synthetic runtime telemetry. */
export function createBrainNetworkRenderer(context) {
  const mesh = makeCore();
  const glyphs = "01アイウエカキクケサシスセタチツテナニヌネハヒフヘミムメモヤユヨラリルレワ";
  function line(start, control, end) {
    context.moveTo(start.x, start.y); context.quadraticCurveTo(control.x, control.y, end.x, end.y);
  }
  function glow(point, radius, alpha) {
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, green(alpha)); gradient.addColorStop(.26, green(alpha * .33)); gradient.addColorStop(1, green(0));
    context.fillStyle = gradient; context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }
  function pulse(start, control, end, progress, intensity, size = 1.6) {
    // Each trailing segment fades independently, making direction readable even at a glance.
    for (let tail = 5; tail >= 0; tail -= 1) {
      const at = progress - tail * .018; if (at < 0 || at > 1) continue;
      const point = curvePoint(start, control, end, at);
      context.fillStyle = tail === 0 ? `rgba(210,255,221,${intensity})` : green(intensity * (1 - tail / 6) * .7);
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
  }
  return function render({ width, height, zoom, time, positions, nodes, visible, selectedId }) {
    const seconds = time / 1000;
    context.clearRect(0, 0, width, height);

    // Slow, low-contrast code rain stays behind the network and its accessible labels.
    context.font = '10px "IBM Plex Mono", monospace';
    const columns = Math.min(28, Math.ceil(width / 31));
    for (let column = 0; column < columns; column += 1) {
      const x = (column + .45) * width / columns, speed = 17 + noise(column + 4) * 25;
      const head = (seconds * speed + noise(column + 48) * (height + 150)) % (height + 150);
      for (let trail = 0; trail < 9; trail += 1) {
        const y = head - trail * 13; if (y < 5 || y > height - 5) continue;
        const index = Math.floor(noise(column * 91 + trail + Math.floor(seconds * .7)) * glyphs.length);
        context.fillStyle = trail === 0 ? "rgba(158,255,184,.4)" : green(.14 * (1 - trail / 9));
        context.fillText(glyphs[index], x, y);
      }
    }

    // Static circuit fragments and dust establish depth without simulating system events.
    context.beginPath();
    for (let index = 0; index < 24; index += 1) {
      const x = noise(index + 900) * width, y = noise(index + 450) * height, span = 9 + noise(index + 204) * 24;
      context.moveTo(x, y); context.lineTo(x + span, y); context.lineTo(x + span + 9, y - 9);
    }
    context.strokeStyle = green(.075); context.lineWidth = .6; context.stroke();
    for (let index = 0; index < 85; index += 1) {
      const x = noise(index + 61) * width, y = noise(index + 817) * height;
      context.fillStyle = green(.08 + (Math.sin(index + seconds * .9) + 1) * .095);
      context.fillRect(x, y, index % 8 ? .8 : 1.5, index % 8 ? .8 : 1.5);
    }

    for (const [nodeIndex, node] of nodes.entries()) {
      if (!node.parent) continue;
      const point = positions.get(node.id), parent = positions.get(node.parent); if (!parent) continue;
      const shown = visible(node), main = node.kind === "agent", intensity = shown ? 1 : .075;
      const bend = node.position[0] > 0 ? -1 : 1;
      const dx = point.x - parent.x, dy = point.y - parent.y, length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length, ny = dx / length;
      const strandCount = main ? 11 : 3;
      for (let strand = 0; strand < strandCount; strand += 1) {
        const offset = strand - (strandCount - 1) / 2;
        const breath = Math.sin(seconds * .43 + nodeIndex + strand * .14) * (main ? 9 : 3);
        const control = { x: (point.x + parent.x) / 2 + nx * (offset * (main ? 12 : 5) + breath), y: (point.y + parent.y) / 2 + ny * offset * (main ? 12 : 5) + bend * (main ? 37 : 15) };
        context.beginPath(); line(parent, control, point);
        context.strokeStyle = green((main ? .17 : .12) * intensity); context.lineWidth = strand === Math.floor(strandCount / 2) ? 1.05 : .55; context.stroke();
        const travel = fract(seconds * (main ? .23 : .3) + strand * .131 + nodeIndex * .19);
        pulse(parent, control, point, travel, (.58 + (strand % 3) * .12) * intensity, main ? 1.8 : 1.35);
        if (main) pulse(parent, control, point, fract(travel + .52), .58 * intensity, 1.4);

        // Small branches turn a simple spoke into a bundle of visible synapses.
        if (main && strand % 2 === 0) {
          for (let branch = 0; branch < 4; branch += 1) {
            const t = .18 + branch * .18 + noise(strand * 31 + nodeIndex) * .06;
            const root = curvePoint(parent, control, point, t), direction = (strand < strandCount / 2 ? -1 : 1);
            const reach = (12 + noise(branch * 13 + strand + nodeIndex) * 23) * zoom;
            const tip = { x: root.x + nx * reach * direction + dx / length * 12, y: root.y + ny * reach * direction + dy / length * 12 };
            const joint = { x: root.x + nx * reach * direction * .55, y: root.y + ny * reach * direction * .55 };
            context.beginPath(); line(root, joint, tip); context.strokeStyle = green(.13 * intensity); context.lineWidth = .55; context.stroke();
            const firing = Math.max(0, Math.sin(seconds * 3.1 - branch * 1.2 - strand * .7 - nodeIndex)) ** 12;
            context.fillStyle = green((.22 + firing * .65) * intensity); const size = 1.1 + firing * 1.4;
            context.fillRect(tip.x - size / 2, tip.y - size / 2, size, size);
          }
        }
      }
      if (shown) {
        const firing = Math.max(0, Math.sin(seconds * 2.6 - nodeIndex * .84)) ** 10;
        glow(point, main ? 35 + firing * 16 : 15 + firing * 7, (node.id === selectedId ? .32 : .17) + firing * .2);
        // Expanding sparks are decorative and deliberately independent of saved run status.
        const wave = fract(seconds * .38 + nodeIndex * .17), radius = (main ? 12 : 7) + wave * (main ? 18 : 9);
        context.beginPath(); context.arc(point.x, point.y, radius, 0, TAU);
        context.strokeStyle = green((1 - wave) * .19); context.lineWidth = .6; context.stroke();
      }
    }

    const core = positions.get("omen"); if (!core) return;
    const breath = 1 + Math.sin(seconds * 1.6) * .055;
    const radius = Math.min(125, Math.max(70, Math.min(width, height) * .17)) * zoom * breath;
    glow(core, radius * 1.9, .2 + (Math.sin(seconds * 1.6) + 1) * .04);
    const rotation = seconds * .17, c = Math.cos(rotation), s = Math.sin(rotation), tilt = -.24 + Math.sin(seconds * .19) * .15;
    const projected = mesh.points.map((point, index) => {
      const x = point.x * c - point.z * s, z = point.x * s + point.z * c;
      const y = point.y * Math.cos(tilt) - z * Math.sin(tilt), depth = point.y * Math.sin(tilt) + z * Math.cos(tilt);
      const perspective = 1 + depth * .11;
      return { x: core.x + x * radius * 1.13 * perspective, y: core.y + y * radius * perspective, depth, fire: Math.max(0, Math.sin(seconds * 2.6 + index * .091)) ** 22 };
    });
    // Batch the mesh by depth so the near hemisphere reads brighter than its back surface.
    for (let layer = 0; layer < 4; layer += 1) {
      context.beginPath();
      for (const [from, to] of mesh.edges) {
        const a = projected[from], b = projected[to], bucket = Math.min(3, Math.max(0, Math.floor(((a.depth + b.depth) / 2 + 1) * 2)));
        if (bucket !== layer) continue;
        context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
      }
      context.strokeStyle = green(.045 + layer * .032); context.lineWidth = .55; context.stroke();
    }
    for (const point of projected) {
      const alpha = .19 + (point.depth + 1) * .2 + point.fire * .29, size = .7 + (point.depth + 1) * .4 + point.fire * .65;
      context.fillStyle = `rgba(${point.fire > .6 ? "205,255,221" : "110,255,163"},${Math.min(.94, alpha)})`;
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    // Three broken orbital arcs add an old terminal instrumentation feel.
    for (let orbit = 0; orbit < 3; orbit += 1) {
      const start = seconds * (orbit % 2 ? -.18 : .14) + orbit * 2.1;
      context.beginPath(); context.ellipse(core.x, core.y, radius * (1.27 + orbit * .09), radius * (.39 + orbit * .07), -.45 + orbit * .53, start, start + 2.15);
      context.strokeStyle = green(.21 - orbit * .035); context.lineWidth = orbit ? .6 : 1; context.stroke();
    }
  };
}
