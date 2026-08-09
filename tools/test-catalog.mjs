// Smoke test for the gallery's data pipeline: loads the real component script
// with a stubbed runtime and exercises the catalog -> works -> pricing path.
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("/home/user/ag/index.html", "utf8");
const body = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

const ctx = {
  console,
  window: {},
  DCLogic: class { setState() {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(body + "\n;globalThis.__C = Component;", ctx);

const c = new ctx.__C();
c.state = { lb: 0, col: 0, paper: 0, ptype: 0 };

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log("  FAIL " + msg); }
  else console.log("  ok   " + msg);
};

console.log("\nstandalone (no Wix parent)");
const works = c.workData();
ok(works.length === 11, `11 artworks (got ${works.length})`);
ok(works.every(w => /^https:\/\/static\.wixstatic\.com\//.test(w.src)),
   "every image points at the Wix CDN");
ok(works.every(w => /\/v1\/fit\/w_1200/.test(w.src)),
   "every image uses a Wix resize transform (not the raw multi-MB PNG)");
ok(!JSON.stringify(works).includes("art-web"), "no art-web/*.jpg references remain");
ok(works.every(w => w.prints && Object.keys(w.prints).length === 3),
   "prints carried through workData (the dropped-field bug)");
ok(works.every(w => w.title && w.priceText && w.url),
   "title, price text and store URL present on every artwork");

const sold = works.filter(w => w.sold).map(w => w.title).sort();
ok(JSON.stringify(sold) === JSON.stringify(["Crowned Girl 03", "Small Mercies"]),
   "sold-out originals match Wix stock: " + sold.join(", "));

console.log("\ncollections");
const cols = c.collectionData();
ok(cols[0].key === "all", "'View all' first");
ok(JSON.stringify(cols.slice(1).map(x => x.label)) ===
   JSON.stringify(["Crowned Girls", "Angels & Companions", "Kind Words", "Night Studies"]),
   "collection order: " + cols.slice(1).map(x => x.label).join(" / "));
const counts = {};
works.forEach(w => { counts[w.collection] = (counts[w.collection] || 0) + 1; });
ok(counts["Crowned Girls"] === 4 && counts["Angels & Companions"] === 3 &&
   counts["Kind Words"] === 2 && counts["Night Studies"] === 2,
   "counts match Wix categories: " + JSON.stringify(counts));

console.log("\npricing off real variants");
const paper = c.paperData();
ok(paper.length === 3, "three paper finishes");
ok(paper[0].label === "Matte" && paper[0].delta === 0, "Matte is the anchor");
ok(paper[1].label === "Gloss" && paper[1].delta === 25, "Gloss +$25 (from Wix variants)");
ok(paper[2].label === "Metallic" && paper[2].delta === 55, "Metallic +$55 (from Wix variants)");
// Night Study 02 is index 0: matte print 245
ok(c.printTotal(works[0]) === 245, `print total tracks the finish (got ${c.printTotal(works[0])})`);
c.state.paper = 2;
ok(c.printTotal(works[0]) === 300, `metallic print total 300 (got ${c.printTotal(works[0])})`);
c.state.paper = 0;

console.log("\nlive Wix catalog overrides the baked one");
ctx.window.AGWix = {
  catalog: [{
    id: "p1", slug: "live-one", url: "https://example.test/p/live-one",
    image: "https://static.wixstatic.com/media/live.png", title: "Live One",
    collections: ["New Work"], description: "d", price: 500, priceText: "$500",
    inStock: true, printPrice: 90, origVariantId: "v-orig",
    prints: { Matte: { price: 90, priceText: "$90", inStock: true, variantId: "v-m" } },
  }],
};
c._works = null; c._cols = null;
const live = c.workData();
ok(live.length === 1 && live[0].title === "Live One", "live catalog replaces the snapshot");
ok(live[0].origVariantId === "v-orig", "origVariantId carried (Add to cart bug)");
ok(live[0].prints.Matte.variantId === "v-m", "print variantId carried");
ok(c.liveCatalog() === true, "liveCatalog() true when embedded");
ok(c.collectionData().slice(1)[0].label === "New Work",
   "unknown collection still appears in the menu");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
