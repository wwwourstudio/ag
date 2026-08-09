// Models the sphere placement to check the property the interaction promises:
// dragging up/down (which now tumbles the sphere on an unclamped rotX) brings
// EVERY artwork through the front face, so nothing in the catalogue is
// unreachable. Run: node tools/test-sphere.mjs
const GA = Math.PI * (3 - Math.sqrt(5));
const R = 500, f = 1750;
const w = 1440, h = 900;

function place(j, N, rotY, rotX) {
  const yUnit = N > 1 ? (1 - (j / (N - 1)) * 2) * 0.97 : 0;
  const phi = Math.acos(yUnit);
  const a = j * GA + rotY;
  let sx = R * Math.sin(phi) * Math.cos(a);
  let sy = R * 0.95 * Math.cos(phi);
  let sz = R * Math.sin(phi) * Math.sin(a);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const sy2 = sy * cosX - sz * sinX, sz2 = sy * sinX + sz * cosX;
  sy = sy2; sz = sz2;
  const persp = f / (f - sz);
  return {
    depth: (sz + R) / (2 * R),
    x: w / 2 + sx * persp,
    y: h / 2 + sy * persp,
  };
}

// "Clearly presented": front half of the sphere and inside the central region.
const prominent = (p) =>
  p.depth > 0.72 &&
  Math.abs(p.x - w / 2) < w * 0.34 &&
  Math.abs(p.y - h / 2) < h * 0.36;

let fails = 0;
const N = 11;

// A vertical drag spins rotX and precesses rotY by PRECESS per unit of rotX
// (index.html), on top of whatever idle drift rotY already has.
const PRECESS = 0.25;
for (const drift of [0, 0.00018, 0.0006]) {
  const missed = [];
  for (let j = 0; j < N; j++) {
    let seen = false;
    for (let step = 0; step < 4000 && !seen; step++) {
      const rotX = (step / 2000) * Math.PI * 2;
      if (prominent(place(j, N, step * drift + rotX * PRECESS, rotX))) seen = true;
    }
    if (!seen) missed.push(j);
  }
  if (missed.length) {
    fails++;
    console.log(`rotY drift ${drift}: MISSED artworks ${missed.join(", ")}`);
  } else {
    console.log(`rotY drift ${drift}: all ${N} artworks reach the front within one tumble`);
  }
}

// Nothing may be permanently invisible: opacity comes straight from depth,
// so check the fade band the old spiral introduced is really gone.
let minPeak = 1;
for (let j = 0; j < N; j++) {
  let peak = 0;
  for (let step = 0; step < 720; step++) {
    const rx = (step / 720) * Math.PI * 2;
    const p = place(j, N, rx * PRECESS, rx);
    peak = Math.max(peak, 0.42 + 0.58 * p.depth);
  }
  minPeak = Math.min(minPeak, peak);
}
console.log(`dimmest artwork still peaks at opacity ${minPeak.toFixed(3)}`);
if (minPeak < 0.9) { fails++; console.log("  FAIL something never becomes fully visible"); }

console.log(fails ? `\n${fails} FAILED` : "\nsphere checks passed");
process.exit(fails ? 1 : 0);
