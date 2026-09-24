// Adapted from the supplied Redline Cortex MatrixBrain; decorative only.
const TAU = Math.PI * 2;
export const BRAIN_REGIONS = ['frontal-l', 'frontal-r', 'parietal', 'temporal-l', 'temporal-r', 'occipital', 'cerebellum', 'stem'];
const ease = (value) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;
function random(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
export function buildMatrixBrain(count = 3400, seed = 42) {
  const r = random(seed), points = [];
  const dir = () => { const u = r() * 2 - 1, angle = r() * TAU, radius = Math.sqrt(1 - u * u); return [radius * Math.cos(angle), u, radius * Math.sin(angle)]; };
  const push = (x, y, z, region) => points.push({ x, y, z, region });
  const hemispheres = Math.round(count * .8), cerebellum = Math.round(count * .13);
  for (let index = 0; index < hemispheres; index++) {
    const sign = index % 2 ? 1 : -1, d = dir();
    const gyrus = 1 + .055 * Math.sin(d[0] * 11 + d[1] * 7) * Math.sin(d[2] * 9 - d[1] * 5);
    const depth = r() < .82 ? .93 + r() * .07 : .55 + r() * .4, k = gyrus * depth;
    let x = sign * .34 + d[0] * .56 * k, y = .08 + d[1] * .64 * k;
    const z = d[2] * 1.02 * k;
    if (sign * x < .035) x = sign * (.035 + r() * .025);
    if (y < -.36) y = -.36 + (y + .36) * .45;
    if (z > .55) y -= (z - .55) * .18;
    push(x, y, z, z > .34 ? (x < 0 ? 'frontal-l' : 'frontal-r') : z < -.52 ? 'occipital' : y < -.08 ? (x < 0 ? 'temporal-l' : 'temporal-r') : 'parietal');
  }
  for (let index = 0; index < cerebellum; index++) {
    const d = dir(), depth = .8 + r() * .2, band = 1 + .08 * Math.sin(d[1] * 22);
    push(d[0] * .6 * depth * band, -.52 + d[1] * .24 * depth, -.6 + d[2] * .34 * depth * band, 'cerebellum');
  }
  for (let index = points.length; index < count; index++) {
    const y = -.4 - r() * .78, angle = r() * TAU, radius = (.14 - (y + .4) * -.03) * (.85 + r() * .15);
    push(Math.cos(angle) * radius, y, -.22 + Math.sin(angle) * radius - (y + .4) * .12, 'stem');
  }
  return points;
}
/** Pure scene-time rendering makes pause, hidden tabs and reduced motion exact. */
export function createBrainNetworkRenderer(context, colors = {}) {
  let red = colors.red || '#ff2e43', glow = colors.glow || '#ff6675', line = colors.line || '#3d252b', mono = colors.mono || '"JetBrains Mono", monospace', dark = colors.dark !== false;
  const points = buildMatrixBrain(), r = random(9), centroids = new Map(BRAIN_REGIONS.map((region) => [region, [0, 0, 0, 0]]));
  for (const point of points) { const c = centroids.get(point.region); c[0] += point.x; c[1] += point.y; c[2] += point.z; c[3]++; }
  for (const c of centroids.values()) { for (let i = 0; i < 3; i++) c[i] /= c[3] || 1; const length = Math.hypot(c[0], c[1] + .1, c[2]) || 1; c.push(c[0] / length, (c[1] + .1) / length, c[2] / length); }
  const decorated = points.map((point) => {
    const glyph = r() < .5 ? 0 : 1, delay = r() * .6, jitter = [r() - .5, r() - .5, r() - .5];
    const angle = r() * TAU, elevation = r() * 2 - 1, radius = 2.6 + r() * 1.6, q = Math.sqrt(1 - elevation * elevation);
    return { ...point, glyph, delay, jitter, origin: [q * Math.cos(angle) * radius, elevation * radius, q * Math.sin(angle) * radius] };
  });
  let projected = [];
  const render = ({ width, height, zoom, time, yaw = -.6, pitch = .22, exploded = 0, assembly = 1.6, selectedRegion }) => {
    context.clearRect(0, 0, width, height);
    const seconds = time / 1000, e = ease(exploded), cx = width / 2, cy = height * .46;
    const scale = Math.min(width * .5, height) * .46 * zoom * (1 - exploded * .22);
    const cosine = Math.cos(yaw), sine = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (x, y, z) => { const xx = x * cosine + z * sine, zz = -x * sine + z * cosine, yy = y * cp - zz * sp, depth = y * sp + zz * cp, perspective = 3.4 / (3.4 - depth); return { x: cx + xx * scale * perspective, y: cy - yy * scale * perspective, depth }; };
    context.lineWidth = 1; context.strokeStyle = line; context.globalAlpha = .65;
    for (const [index, radius] of [1.55 + e * .5, 1.75 + e * .6].entries()) {
      context.beginPath();
      for (let step = 0; step <= 96; step++) { const angle = step / 96 * TAU, p = project(Math.cos(angle) * radius, -.15, Math.sin(angle) * radius); step ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); }
      context.setLineDash?.(index ? [2, 6] : []); context.stroke(); context.setLineDash?.([]);
    }
    context.fillStyle = red; context.font = `9px ${mono}`;
    for (let index = 0; index < 24; index++) { const angle = index / 24 * TAU, p = project(Math.cos(angle) * (1.55 + e * .5), -.15, Math.sin(angle) * (1.55 + e * .5)); context.globalAlpha = Math.max(.1, Math.min(.8, .25 + .5 * (p.depth + 1.6) / 3.2)); context.fillText(index % 6 === 0 ? (index * 15).toString(2).padStart(9, '0') : '+', p.x - 3, p.y + 3); }
    context.globalAlpha = .4; context.strokeStyle = red; context.lineWidth = 1.5;
    for (const [offset, extent] of [[0, 1.1], [Math.PI, .6]]) { context.beginPath(); context.arc(cx, cy, scale * 1.72, offset, offset + extent); context.stroke(); }
    context.globalAlpha = .22; context.lineWidth = 1; context.beginPath(); context.arc(cx, cy, scale * 1.72 + 10, 0, 2.2); context.stroke();
    const buckets = Array.from({ length: 15 }, () => []), scan = -.125 + Math.sin(seconds * .47) * 1.175;
    projected = decorated.map((point, index) => {
      const c = centroids.get(point.region), offset = e * (point.region === 'stem' ? .45 : .62), k = ease((assembly - point.delay) / .9);
      const coordinates = [point.x, point.y, point.z].map((value, axis) => { const assembled = value + c[axis + 4] * offset + point.jitter[axis] * e * .125; return point.origin[axis] + (assembled - point.origin[axis]) * k; });
      const p = project(...coordinates), layer = Math.max(0, Math.min(4, Math.floor((p.depth + 1.3) / 2.6 * 5)));
      // Independent, deterministic bursts keep the digits restless without
      // rotating or deforming the anatomical silhouette or its label anchors.
      const beat = seconds * (1.8 + (index % 11) * .17) + point.delay * 9;
      let signal = Math.imul(index + 1, 374761393) ^ Math.imul(Math.floor(beat) + 1, 668265263);
      signal = Math.imul(signal ^ (signal >>> 13), 1274126177) >>> 0;
      const burst = signal % 100 < 18, pulse = burst ? Math.sin((beat % 1) * Math.PI) * zoom : 0;
      p.x += pulse * ((signal >>> 8 & 1) ? 2.4 : -2.4);
      p.y += pulse * ((signal >>> 9 & 1) ? 4.5 : -4.5);
      buckets[layer * 3 + (point.region === selectedRegion ? 2 : burst || Math.abs(point.y - scan) < .035 ? 1 : 0)].push({ ...p, glyph: point.glyph ^ (signal & 1) });
      return { ...p, region: point.region };
    });
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const [bucket, items] of buckets.entries()) {
      const layer = Math.floor(bucket / 3), kind = bucket % 3;
      context.font = `${kind === 2 ? '600 ' : ''}${(6.5 + layer * 1.6 * zoom).toFixed(1)}px ${mono}`;
      context.fillStyle = kind ? glow : red; context.globalAlpha = Math.min(1, .18 + layer * .15 + (kind ? .15 : 0));
      for (const p of items) context.fillText(String(p.glyph), p.x, p.y);
    }
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
    return new Map([...centroids].map(([region, c]) => { const offset = e * (region === 'stem' ? .45 : .62); return [region, project(c[0] + c[4] * offset, c[1] + c[5] * offset, c[2] + c[6] * offset)]; }));
  };
  render.hitTest = (x, y) => { let distance = 144, region = null; for (let index = 0; index < projected.length; index += 2) { const point = projected[index], delta = (point.x - x) ** 2 + (point.y - y) ** 2; if (delta < distance) { distance = delta; region = point.region; } } return region; };
  render.setColors = (next = {}) => { red = next.red || red; glow = next.glow || glow; line = next.line || line; mono = next.mono || mono; dark = next.dark !== false; };
  return render;
}
