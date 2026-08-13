// Models the sphere placement to check the property the interaction promises:
// dragging up/down (which now tumbles the sphere on an unclamped rotX) brings
// EVERY artwork through the front face, so nothing in the catalogue is
// unreachable. Run: node tools/test-sphere.mjs
const GA = Math.PI * (3 - Math.sqrt(5));
const w = 1440, h = 900;
// The desktop numbers index.html actually uses, so this models the real thing:
//   R = mn * 0.66,  f = 2750,  mn = min(w, h)
// They were retuned because the old framing (mn * 1.12, f 1750) put only 5 or 6
// of eleven pieces on screen at once and let one card span half the window.
const mn = Math.min(w, h);
const R = mn * 0.66, f = 2750;
const CARD = 300 * (mn / 1700);   // tile width * fitS, before perspective

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

// Enough of the catalogue has to be in frame at once to feel like a sphere of
// work rather than one card and some colour. Sampled across a full rotation.
let worstInFrame = 99;
for (let step = 0; step < 240; step++) {
  const rx = (step / 240) * Math.PI * 2;
  let inFrame = 0;
  for (let j = 0; j < N; j++) {
    const p = place(j, N, rx * PRECESS, rx);
    const half = (CARD * (f / (f - (p.depth * 2 - 1) * R))) / 2;
    if (p.x + half > 0 && p.x - half < w && p.y + half > 0 && p.y - half < h) inFrame++;
  }
  worstInFrame = Math.min(worstInFrame, inFrame);
}
console.log(`at worst ${worstInFrame} of ${N} artworks are in frame at once`);
if (worstInFrame < 8) { fails++; console.log("  FAIL too few artworks visible at once"); }

console.log(fails ? `\n${fails} FAILED` : "\nsphere checks passed");
process.exit(fails ? 1 : 0);
