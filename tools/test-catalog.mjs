// Smoke test for the gallery's data pipeline.
//
// The gallery carries no artwork of its own any more: the catalog is read from
// the Wix store at load time, either from the parent Wix page over postMessage
// or directly from the Wix API. So the first thing this checks is that nothing
// about the artwork is baked into index.html, and the rest feeds catalogs in
// the way the two live sources do and checks what comes out.
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("/home/user/ag/index.html", "utf8");
const body = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log("  FAIL " + msg); }
  else console.log("  ok   " + msg);
};

console.log("\nnothing is baked in");
// A media id is what a hardcoded artwork looks like: the gallery should hold
// none, because it has not read the store yet at parse time.
ok(!/static\.wixstatic\.com\/media\//.test(html),
   "no Wix CDN artwork URLs anywhere in index.html");
ok(!/AG_CATALOG_FALLBACK/.test(html), "no baked catalog constant");
ok(!/art-web/.test(html), "no art-web/*.jpg references remain");
// Product names and variant ids are catalogue data too.
ok(!/Crowned Girl|Night Study|Small Mercies|Be Kind to Yourself/.test(html),
   "no product titles hardcoded");

const makeComponent = () => {
  const ctx = { console, window: {}, DCLogic: class { setState() {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(body + "\n;globalThis.__C = Component;", ctx);
  const c = new ctx.__C();
  c.state = { lb: 0, col: 0, paper: 0, ptype: 0 };
  return { ctx, c };
};

// One artwork in the shape both live sources produce.
const artwork = (over = {}) => ({
  id: "p1", slug: "live-one", url: "https://example.test/p/live-one",
  image: "https://static.wixstatic.com/media/live.png/v1/fit/w_1200,h_1200,q_85/file.jpg",
  title: "Live One", medium: "Mixed media on paper", size: "16 x 20 in",
  year: 2024, edition: 50, collections: ["New Work"], description: "d",
  price: 500, priceText: "$500", inStock: true, printPrice: 90,
  origVariantId: "v-orig",
  prints: {
    Matte: { price: 90, priceText: "$90", inStock: true, variantId: "v-m" },
    Gloss: { price: 115, priceText: "$115", inStock: true, variantId: "v-g" },
    Metallic: { price: 145, priceText: "$145", inStock: true, variantId: "v-x" },
  },
  ...over,
});

console.log("\nno source has answered yet");
{
  const { c } = makeComponent();
  ok(c.catalog() === null, "catalog() is null rather than a snapshot");
  ok(c.workData().length === 0, "no artwork invented");
  ok(c.liveCatalog() === false, "liveCatalog() false");
  const st = c.catalogStatus();
  ok(st && !st.failed && /loading/i.test(st.text), "status says loading: " + (st && st.text));
}

console.log("\nthe store could not be reached");
{
  const { ctx, c } = makeComponent();
  ctx.window.AGStore = { catalog: null, error: "boom", settled: true };
  const st = c.catalogStatus();
  ok(st && st.failed, "status reports failure rather than showing stale work");
  ok(c.workData().length === 0, "still no artwork invented");
}

console.log("\ncatalog from the Wix parent page (embedded)");
{
  const { ctx, c } = makeComponent();
  ctx.window.AGWix = { catalog: [artwork()] };
  const works = c.workData();
  ok(works.length === 1 && works[0].title === "Live One", "artwork comes from the bridge");
  ok(works[0].origVariantId === "v-orig", "origVariantId carried (Add to cart bug)");
  ok(works[0].prints.Matte.variantId === "v-m", "print variantId carried");
  ok(works[0].medium === "Mixed media on paper", "medium read from the store");
  ok(c.liveCatalog() === true, "liveCatalog() true");
  ok(c.catalogStatus() === null, "no status overlay once artwork is in");
  ok(c.collectionData().slice(1)[0].label === "New Work",
     "a collection the code has never heard of still appears in the menu");
}

console.log("\ncatalog read directly from Wix (standalone)");
{
  const { ctx, c } = makeComponent();
  ctx.window.AGStore = { catalog: [artwork({ title: "Direct One" })], error: null, settled: true };
  const works = c.workData();
  ok(works.length === 1 && works[0].title === "Direct One", "artwork comes from the direct read");
  ok(c.liveCatalog() === true, "liveCatalog() true without a Wix parent");
  ok(c.catalogStatus() === null, "no status overlay");
}

console.log("\nthe parent page wins when both answer");
{
  const { ctx, c } = makeComponent();
  ctx.window.AGStore = { catalog: [artwork({ title: "Direct One" })], error: null, settled: true };
  ctx.window.AGWix = { catalog: [artwork({ title: "Bridge One" })] };
  ok(c.workData()[0].title === "Bridge One",
     "the site's own read is preferred (it carries inventory counts)");
}

console.log("\npricing off whatever variants the store sent");
{
  const { ctx, c } = makeComponent();
  ctx.window.AGWix = { catalog: [artwork()] };
  const works = c.workData();
  const paper = c.paperData();
  ok(paper.length === 3, "three paper finishes");
  ok(paper[0].label === "Matte" && paper[0].delta === 0, "Matte is the anchor");
  ok(paper[1].label === "Gloss" && paper[1].delta === 25, "Gloss +$25, from the variant price");
  ok(paper[2].label === "Metallic" && paper[2].delta === 55, "Metallic +$55, from the variant price");
  ok(c.printTotal(works[0]) === 90, `print total tracks the finish (got ${c.printTotal(works[0])})`);
  c.state.paper = 2;
  ok(c.printTotal(works[0]) === 145, `metallic print total 145 (got ${c.printTotal(works[0])})`);
}

// The direct read is the only source a standalone visitor has, and it is one
// Promise.all: a single malformed call blanks the entire gallery. These pin the
// two things that made that happen.
console.log("\nthe direct store read is shaped the way the API expects");
{
  const store = html.match(/--- Live store read[\s\S]*?<\/script>/)[0];
  ok(!/categories\/v1\/categories\/query/.test(store),
     "no categories/query — that endpoint 400s, the Catalog V3 read is categories/search");
  ok(/categories\/v1\/categories\/search/.test(store),
     "collection names come from categories/search");
  const cat = store.match(/categories\/v1\/categories\/search[\s\S]{0,320}/)[0];
  ok(/treeReference[\s\S]{0,60}@wix\/stores/.test(cat),
     "the category call carries treeReference: @wix/stores (required, or it 400s)");
  ok(/soft\("collection names"/.test(store) && /soft\("info sections"/.test(store),
     "labels (categories, info sections) can't take the catalog down with them");
  ok(/post\("\/stores\/v3\/products\/search"/.test(store) &&
     !/soft\([^)]*products\/search/.test(store),
     "products stay fatal — there is no gallery without them");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
