// Replicates the sphere placement math to check the claim the change is
// meant to deliver: dragging up/down brings EVERY artwork through the front.
const GA = Math.PI * (3 - Math.sqrt(5));
const N = 11;
const R = 500, f = 1750;
const w = 1440, h = 900;

function place(j, spin, rotY, rotX) {
  const uRaw = j / N + spin;
  const u = uRaw - Math.floor(uRaw);
  const yUnit = (1 - u * 2) * 0.97;
  const phi = Math.acos(yUnit);
  const a = uRaw * N * GA + rotY;
  let sx = R * Math.sin(phi) * Math.cos(a);
  let sy = R * 0.95 * Math.cos(phi);
  let sz = R * Math.sin(phi) * Math.sin(a);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const sy2 = sy * cosX - sz * sinX, sz2 = sy * sinX + sz * cosX;
  sy = sy2; sz = sz2;
  const persp = f / (f - sz);
  const depth = (sz + R) / (2 * R);
  const poleFade = Math.min(1, Math.min(u, 1 - u) / 0.06);
  return {
    depth, poleFade,
    x: w / 2 + sx * persp,
    y: h / 2 + sy * persp,
  };
}

// "Clearly presented": front half of the sphere, not faded out at a pole,
// and inside the central region of the canvas.
function prominent(p) {
  return p.depth > 0.72 && p.poleFade > 0.9 &&
         Math.abs(p.x - w / 2) < w * 0.34 && Math.abs(p.y - h / 2) < h * 0.36;
}

let fails = 0;
for (const rotY of [0, 1.1, 2.7]) {
  const best = [];
  for (let j = 0; j < N; j++) {
    let seen = false;
    // one full pass of the spiral, sampled finely
    for (let s = 0; s < 1; s += 0.002) {
      if (prominent(place(j, s, rotY, 0.12))) { seen = true; break; }
    }
    if (!seen) { fails++; best.push(j); }
  }
  console.log(`rotY=${rotY}: ${best.length ? "MISSED " + best.join(",") : "all 11 artworks come into full view within one spiral pass"}`);
}

// The wrap must not be a visible teleport in the middle of the screen:
// whenever an item's latitude jumps, it must already be faded out.
let worst = 0;
for (let j = 0; j < N; j++) {
  for (let s = 0; s < 1; s += 0.0005) {
    const a = place(j, s, 0, 0.12), b = place(j, s + 0.0005, 0, 0.12);
    const jump = Math.hypot(a.x - b.x, a.y - b.y);
    if (jump > 40) worst = Math.max(worst, Math.min(a.poleFade, b.poleFade));
  }
}
console.log(`largest opacity at a wrap discontinuity: ${worst.toFixed(3)} (0 = invisible when it jumps)`);
if (worst > 0.01) { fails++; console.log("  FAIL wrap is visible"); }

console.log(fails ? `\n${fails} FAILED` : "\nsphere checks passed");
process.exit(fails ? 1 : 0);
