/*
 * Annie Green — Gallery page code.
 *
 * WHERE THIS GOES
 *   Wix Studio editor -> the Gallery page -> that page's code panel (the tab
 *   named after the page, e.g. "Gallery"). Nowhere else.
 *
 *   NOT data.js and NOT a Public file: `$w` and `wix-location` exist only in
 *   page code, and using them elsewhere fails with
 *   "Cannot use namespace '$w' as a value".
 *
 *   This is deliberately ONE self-contained file. Splitting the data half into
 *   Public > artworkSync.js was tidier but the page code then could not resolve
 *   'public/artworkSync', and a single file has no import path to get wrong.
 *
 * SETUP
 *   Add an Embed > "Embed a widget" / HtmlComponent pointing at
 *   https://annie-green-artist.vercel.app/ and give it the element ID in
 *   HTML_ID below.
 *
 * THE BRIDGE
 *   The gallery iframe is cross-origin, so it cannot reach the Wix catalog or
 *   the Wix cart itself. This is the other half:
 *
 *     iframe -> here : "ready"        ask for the catalog
 *                      "addToCart"    add a variant to the Wix cart, then
 *                                     refresh and slide out the cart lightbox
 *                      "openProduct"  go to the product page
 *     here -> iframe : "catalog"      artworks, prices, metadata, variant ids
 *                      "cartResult"   whether the add succeeded
 *
 *   Everything the gallery shows comes from the store: products, collections,
 *   descriptions, per-finish prices, stock, and the Medium / Size / Year /
 *   Edition info sections. Add or delete products in Wix and the gallery
 *   follows.
 *
 * IMPORTANT — the payload shape is a contract with index.html. `prints` and
 * `origVariantId` are what make the print card appear and Add to cart work.
 */

import { productsV3, infoSectionsV3, inventoryItemsV3 } from '@wix/stores';
import wixLocation from 'wix-location';
import wixEcomFrontend from 'wix-ecom-frontend';
import wixWindow from 'wix-window';
import { currentCartV2 } from '@wix/ecom';

/* --- BACKEND CATALOG (opt-in) -----------------------------------------
   Uncomment this line, and the matching block in buildCatalog(), only after
   creating backend/artworkCatalog.web.js — an import of a file that isn't
   there fails the whole page code, not just the catalog.

   Do it when the console says `[AG] catalog: 0 listed, ...`: the store read
   is coming back empty with no error, which is what a permission-restricted
   read looks like from frontend code, and permissions can only be raised in
   backend code. Any other shape means the products arrive fine and are lost
   later, so this won't help. */
// import { readCatalogSources } from 'backend/artworkCatalog.web';

const HTML_ID = 'html1';
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/* The cart that slides out on this site is a lightbox, not Wix's built-in side
   cart, so openSideCart() has nothing to open — this is what to open instead.
   Give it the id from the editor without the leading '#'. Set it to '' to fall
   back to openSideCart() alone. */
const CART_LIGHTBOX = 'lightbox1';

/* The store's "All Products" category — every product is in it, so it is not a
   collection worth showing in the menu. */
const ALL_PRODUCTS = '97859c36-72bd-40f3-846d-3d8c533ea382';

/* Category id -> the name shown in the gallery's Collections menu.
 *
 * FALLBACK ONLY. Products carry category *ids*, never names, so the names have
 * to be looked up — and the only API that does it is `@wix/categories`, which
 * failed to import here with "Cannot find module '@wix/categories'". That is
 * an npm package that has to be installed in the editor (Packages & Apps ->
 * npm), not a missing capability.
 *
 * backend/artworkCatalog.web.js installs and reads it, and passes the live
 * names through, so with the backend catalog wired in the Collections menu
 * follows the store: rename a collection in Wix and the menu renames, add or
 * delete one and it appears or goes.
 *
 * Until then this table stands in. If you add or rename a collection, add it
 * here too. Anything missing is logged and the artwork falls back to "Works",
 * so a stale entry shows up as a wrong menu label, not a disappearance.
 */
const CATEGORY_NAMES = {
  '8e48dec4-59a1-4310-9bc5-ceb5c8bb1bb6': 'Crowned Girls',
  '49bca492-5965-44fc-ba17-073624eb3659': 'Angels & Companions',
  'dcd8b88c-b308-4348-9d38-091984855f70': 'Kind Words',
  'b3c85211-c373-43d3-9fc7-46f5c66d402c': 'Night Studies',
  /* The store also holds an older, empty copy of each of these four, left over
     from when the collections were first set up. No product uses them today,
     but tagging one would otherwise drop that piece into "Works" with only a
     console warning to show for it. */
  '137a6302-bc74-46dd-b0c7-9c81f60a823a': 'Crowned Girls',
  'd3dd3b54-7dd7-4e41-a624-cdf7c9639b02': 'Angels & Companions',
  '4bb9bafb-e7a0-4b42-b9e6-464fab1fe0f9': 'Kind Words',
  'af1b64bc-8560-4068-acaa-1557547be445': 'Night Studies',
};

/* Info sections carry the gallery's metadata — Medium, Size, Year, Edition —
   as rich text on shared entities that products reference by id. All four are
   read from the store: change "16 x 20 in" in the Size section and the
   lightbox follows. Medium used to be the exception, typed into index.html
   where editing Wix could never reach it.

   Shared is the operative word — see sectionOf for what that means per
   artwork, and how to give one piece its own values. */
let infoText = null;
async function loadInfoSections() {
  if (infoText) return infoText;
  infoText = {};
  try {
    /** @type {any} */
    const res = await infoSectionsV3.queryInfoSections({ cursorPaging: { limit: 100 } });
    for (const sec of res.infoSections || res.items || []) {
      const id = idOf(sec);
      if (id) infoText[id] = { name: sec.uniqueName, title: sec.title, text: richText(sec.description) };
    }
  } catch (err) {
    console.error('[AG] could not read info sections:', err);
  }
  return infoText;
}

/* Flatten Wix rich content down to the one line these sections hold. */
/** @param {any} doc */
function richText(doc) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.textData && n.textData.text) out.push(n.textData.text);
    (n.nodes || []).forEach(walk);
  };
  (doc && doc.nodes || []).forEach(walk);
  return out.join('').trim();
}

/* The SDK names ids `_id`, but nested references (category refs, for one) come
   back as `id`. Reading them through an `any` helper keeps the editor's type
   checker quiet either way.
   @param {any} o */
const idOf = (o) => (o ? o._id || o.id : null);

const money = (n) =>
  typeof n === 'number' && !isNaN(n) ? '$' + n.toLocaleString('en-US') : '';

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/* Wix stores the artwork as 2-6 MB PNGs. Serve a resized JPEG instead, or the
   gallery pulls down ~50 MB of images on load. */
function webImage(url, px) {
  if (!url) return '';
  if (url.indexOf('/v1/') !== -1) return url;
  return url + '/v1/fit/w_' + px + ',h_' + px + ',q_85/file.jpg';
}

/** @param {any} variant */
function choiceOf(variant, optionName) {
  const list = variant.choices || variant.optionChoices || [];
  for (const c of list) {
    const names = c.optionChoiceNames || {};
    if (names.optionName === optionName) return names.choiceName;
  }
  return null;
}

/* Pull one named info section's text off a product.
 *
 * Every artwork currently points at the SAME four info sections, so Medium,
 * Size, Year and Edition are one value for the whole catalogue — editing Size
 * in Wix changes all eleven pieces at once. That is how the store is set up,
 * not a limit of this code.
 *
 * To give one piece its own Size, add a second info section to just that
 * product. Unique names have to be unique across the store, so it has to be
 * called something like `size-night-study-01`, but its *title* can still be
 * "Size". Hence the three ways of matching below, and hence the preference for
 * the more specific one: a product carrying both the shared `size` and its own
 * `size-…` should show its own.
 *
 * @param {any} product */
function sectionOf(product, info, key) {
  const want = String(key).toLowerCase();
  let shared = '';
  for (const ref of product.infoSections || []) {
    const hit = info[idOf(ref)];
    if (!hit) continue;
    const name = String(hit.name || '').toLowerCase();
    const title = String(hit.title || '').toLowerCase();
    if (name === want || title === want) {
      if (!shared) shared = hit.text;
      continue;
    }
    /* `size-night-study-01` and the like — this artwork's own. */
    if (name.split('-')[0] === want) return hit.text;
  }
  return shared;
}

/* Remaining edition counts — "37 left" in the lightbox.
 *
 * Products only carry an in-stock boolean; the exact count lives on inventory
 * items, one per variant per location, so this is a second read keyed by
 * variantId. Only quantity-tracked items have a number: a finish set to plain
 * in-stock tracking reports no count, and the gallery then hides the label
 * rather than inventing one.
 *
 * Search Inventory Items wants Manage Stores permission. If the site's page
 * code isn't granted it the call throws, we log it once, and every artwork
 * simply ships without `left` — same as before this existed. */
let inventoryByVariant = null;
async function loadInventory() {
  if (inventoryByVariant) return inventoryByVariant;
  inventoryByVariant = {};
  try {
    /** @type {any} */
    const res = await inventoryItemsV3.searchInventoryItems({
      cursorPaging: { limit: 100 },
    });
    for (const it of res.inventoryItems || res.items || []) {
      /* The variant reference has moved around between shapes; read all of
         them rather than betting on one. */
      const vid =
        it.variantId ||
        (it.variant && idOf(it.variant)) ||
        (it.productVariant && it.productVariant.variantId) ||
        null;
      if (!vid) continue;
      inventoryByVariant[vid] = {
        quantity: typeof it.quantity === 'number' ? it.quantity : null,
        tracked: it.trackQuantity !== false,
      };
    }
  } catch (err) {
    console.error('[AG] could not read inventory counts (needs Manage Stores):', err);
  }
  return inventoryByVariant;
}

/* Whole units left for one variant, or 0 when the store isn't counting. */
function leftOf(inventory, variantId) {
  const rec = variantId && inventory[variantId];
  if (!rec || !rec.tracked || typeof rec.quantity !== 'number') return 0;
  return Math.max(0, Math.floor(rec.quantity));
}

/* Turn one Wix product into the shape index.html expects. */
/** @param {any} product */
function toArtwork(product, info, inventory, names) {
  const variants = (product.variantsInfo && product.variantsInfo.variants) || [];

  /* Originals: one visible Original variant is the sellable one. Prints: one
     per paper finish, keyed by finish name so the gallery can price the finish
     selector from real variant prices. */
  let origVariantId = null;
  let origPrice = 0;
  let origInStock = false;
  const prints = {};

  for (const v of variants) {
    const format = choiceOf(v, 'Format');
    const finish = choiceOf(v, 'Paper Finish');
    const price = num(v.price && v.price.actualPrice && v.price.actualPrice.amount);
    const inStock = !!(v.inventoryStatus && v.inventoryStatus.inStock);
    const visible = v.visible !== false;

    if (format === 'Original') {
      if (visible && (!origVariantId || inStock)) {
        origVariantId = idOf(v);
        origPrice = price;
        origInStock = inStock;
      }
    } else if (format === 'Print' && finish && visible) {
      prints[finish] = {
        price,
        priceText: money(price),
        inStock,
        variantId: idOf(v),
        left: leftOf(inventory, idOf(v)),
      };
    }
  }

  const finishes = Object.keys(prints);
  const printPrice = finishes.length
    ? Math.min(...finishes.map((f) => prints[f].price))
    : 0;

  const catRefs =
    (product.directCategoriesInfo && product.directCategoriesInfo.categories) || [];
  const collections = catRefs
    .map(idOf)
    .filter((id) => id && id !== ALL_PRODUCTS)
    .map((id) => {
      /* Live names when the backend read supplied them, the table otherwise. */
      const name = (names && names[id]) || CATEGORY_NAMES[id];
      if (!name) console.warn('[AG] no name for category', id, '- add it to CATEGORY_NAMES');
      return name;
    })
    .filter(Boolean);

  const media = product.media && product.media.main && product.media.main.image;

  return {
    id: idOf(product),
    slug: product.slug,
    url:
      (product.url && (product.url.url || product.url.relativePath)) ||
      '/product-page/' + product.slug,
    image: webImage(media && media.url, 1200),
    title: product.name || 'Untitled',
    medium: sectionOf(product, info, 'medium'),
    size: sectionOf(product, info, 'size'),
    year: sectionOf(product, info, 'year'),
    edition: parseInt(sectionOf(product, info, 'edition'), 10) || 0,
    collections: collections.length ? collections : ['Works'],
    description: product.plainDescription || '',
    price: origPrice,
    priceText: money(origPrice),
    inStock: origInStock,
    printPrice,
    /* The finish the gallery opens on is the cheapest one, so its count is the
       one that matches the price shown before the buyer picks a finish. */
    left: finishes.length
      ? prints[finishes.reduce((a, b) => (prints[b].price < prints[a].price ? b : a))].left
      : 0,
    prints: finishes.length ? prints : null,
    origVariantId,
  };
}

async function buildCatalog() {
  /* --- BACKEND CATALOG (opt-in) ---------------------------------------
     Uncomment together with the import at the top of this file. The backend
     module does the same three reads with elevated permissions and hands back
     the same raw objects; everything below stays exactly as it is, so the
     shaping lives in one place either way.

  const src = await readCatalogSources();
  const binfo = {};
  for (const sec of src.infoSections) {
    const id = idOf(sec);
    if (id) binfo[id] = { name: sec.uniqueName, title: sec.title, text: richText(sec.description) };
  }
  const binv = {};
  for (const it of src.inventoryItems) {
    const vid = it.variantId || (it.variant && idOf(it.variant)) ||
                (it.productVariant && it.productVariant.variantId) || null;
    if (!vid) continue;
    binv[vid] = {
      quantity: typeof it.quantity === 'number' ? it.quantity : null,
      tracked: it.trackQuantity !== false,
    };
  }
  const bart = src.products.map((res) => toArtwork(res, binfo, binv, src.categoryNames)).filter((a) => a.image);
  console.log('[AG] catalog (backend):', src.products.length, 'loaded,', bart.length, 'with images');
  return bart;
  */

  const info = await loadInfoSections();
  const inventory = await loadInventory();

  /* queryProducts does NOT return variant data, so each product is fetched
     individually for its variant ids and per-finish prices. Fine for a
     catalogue this size; if it grows past a few dozen, cache the result
     rather than widening this loop. */
  /** @type {any} */
  const listed = await productsV3.queryProducts(
    { cursorPaging: { limit: 100 } },
    { fields: [] }
  );

  const items = listed.products || listed.items || [];
  if (!items.length) {
    /* The query resolved and simply had nothing in it — no error to catch. The
       usual cause is the page code reading the store without permission to see
       products, which returns an empty page rather than throwing. */
    console.error('[AG] queryProducts returned no products. Response keys:',
                  Object.keys(listed || {}), 'pagingMetadata:', listed && listed.pagingMetadata);
  }

  const full = await Promise.all(
    items.map((p) =>
      productsV3
        .getProduct(idOf(p), {
          fields: [
            'VARIANT_OPTION_CHOICE_NAMES',
            'DESCRIPTION',
            'URL',
            'DIRECT_CATEGORIES_INFO',
            'INFO_SECTION',
          ],
        })
        .catch((err) => {
          console.error('[AG] could not load product', p.name, err);
          return null;
        })
    )
  );

  /* Say which stage lost the products. "0 artworks" on its own could be an
     empty query, every getProduct failing, or every product being dropped for
     having no image, and those have nothing to do with each other. */
  const loaded = full.filter(Boolean);
  const artworks = loaded.map((res) => toArtwork(res, info, inventory)).filter((a) => a.image);
  console.log('[AG] catalog:', items.length, 'listed,', loaded.length, 'loaded,',
              artworks.length, 'with images');
  if (loaded.length && !artworks.length) {
    console.error('[AG] every product was dropped for having no main image. First one:',
                  loaded[0] && loaded[0].name, 'media:', loaded[0] && loaded[0].media);
  }
  return artworks;
}


async function addToCart(productId, variantId) {
  try {
    /* Older sites expose this as currentCart.addToCurrentCart({ lineItems })
       instead — swap the import and this call if the editor flags it. */
    await currentCartV2.addLineItemsToCurrentCart({
      catalogItems: [
        {
          quantity: 1,
          catalogReference: {
            catalogItemId: productId,
            appId: STORES_APP_ID,
            options: { variantId },
          },
        },
      ],
    });
  } catch (err) {
    /* An original is a stock of one. Pressing Buy now for a piece that is
       already in the cart therefore asks for a second and gets rejected — the
       buyer sees a hard failure for having done nothing wrong. Tell those two
       cases apart and let the caller answer each properly. */
    const kind = inventoryRefusal(err);
    if (kind === 'already') {
      await refreshCartUI();
      openCartPanel();
      return { already: true };
    }
    if (kind === 'soldOut') return { soldOut: true };
    throw err;
  }

  await refreshCartUI();
  openCartPanel();
  return {};
}

/* Which kind of INSUFFICIENT_INVENTORY this is, or null if it's another error.
 *
 * We always ask for one. So a refusal that still reports stock available means
 * the shortfall is the buyer's own cart holding the rest — the piece is in
 * there already. No stock available is the genuine sell-out. */
function inventoryRefusal(err) {
  const appErr = err && err.details && err.details.applicationError;
  if (!appErr || appErr.code !== 'INSUFFICIENT_INVENTORY') return null;
  const items = (appErr.data && appErr.data.invalidItems) || [];
  const available = items.length ? items[0].availableQuantity : 0;
  return available >= 1 ? 'already' : 'soldOut';
}

/* The SDK writes straight to the cart, which leaves the page's cart UI showing
   stale data — only refreshCart() makes the cart icon and side cart re-read it.
   Refresh before opening the panel, so it opens already showing the artwork. */
async function refreshCartUI() {
  try {
    await wixEcomFrontend.refreshCart();
  } catch (err) {
    console.error('[AG] could not refresh the cart UI:', err);
  }
}

/* Slide the cart out after an add.
 *
 * Which call does that depends on how the cart was built, and this site's is a
 * lightbox — so try that first and keep openSideCart() as the fallback. A
 * lightbox can be either a lightbox *page*, opened by name, or a box sitting on
 * this page, opened by expanding it; both are tried because the id alone
 * doesn't say which. Whichever works, the item is already in the cart by the
 * time we get here, so failing to open the panel costs a flourish, not a sale.
 *
 * Nothing here is awaited by the caller on purpose — see openLightboxNamed. */
function openCartPanel() {
  if (!CART_LIGHTBOX) {
    openSideCart();
    return;
  }

  /* A collapsed box on this page. An id $w doesn't know gives back an empty
     selector rather than throwing, and that empty selector still answers to
     expand/show as no-ops — so checking for the methods alone would swallow
     the whole fallback chain. Only a real element carries a `type`. */
  try {
    /** @type {any} */
    const el = $w('#' + CART_LIGHTBOX);
    if (el && el.type && typeof el.expand === 'function') {
      el.expand();
      if (typeof el.show === 'function') el.show();
      return;
    }
  } catch (err) {
    /* Not an element on this page — it must be a lightbox page. */
  }

  openLightboxNamed(0);
}

/* Try the lightbox-page names in turn, falling back to the built-in side cart.
 *
 * openLightbox() rejects for a name that doesn't exist, but it only *resolves*
 * once the lightbox is closed again — so awaiting it would hang until the
 * shopper dismisses the cart, and the iframe would hit its 6s timeout and bail
 * to the product page mid-purchase. Hence the callback walk: the rejection
 * advances to the next candidate, and success is simply left pending. */
function openLightboxNamed(i) {
  /* openLightbox takes the lightbox's *name*, which is usually the id with a
     capital first letter, so try both spellings. */
  const names = [CART_LIGHTBOX, CART_LIGHTBOX.charAt(0).toUpperCase() + CART_LIGHTBOX.slice(1)];
  if (i >= names.length) {
    console.warn('[AG] could not open cart lightbox "' + CART_LIGHTBOX +
                 '"; falling back to the built-in side cart');
    openSideCart();
    return;
  }

  let opening;
  try {
    opening = wixWindow.openLightbox(names[i]);
  } catch (err) {
    openLightboxNamed(i + 1);
    return;
  }
  if (opening && typeof opening.catch === 'function') {
    opening.catch(() => openLightboxNamed(i + 1));
  }
}

function openSideCart() {
  try {
    wixEcomFrontend.openSideCart();
  } catch (err) {
    /* Sites still on the old Mini Cart have no side cart to open (and it
       throws outright on mobile there). The item is in the cart either way,
       so this is a missing flourish, not a failed purchase. */
    console.warn('[AG] side cart unavailable, item still added:', err);
  }
}

async function sendCatalog() {
  try {
    const artworks = await buildCatalog();
    console.log('[AG] sending', artworks.length, 'artworks to the gallery');
    /* An empty catalog is a failure that doesn't throw: the gallery treats it
       exactly like silence and falls back to its baked snapshot, so say so
       here rather than letting it look like a clean run. */
    if (!artworks.length) {
      console.error('[AG] built 0 artworks — the gallery will fall back to its baked ' +
                    'snapshot. Check the store has visible products with a main image.');
    }
    $w('#' + HTML_ID).postMessage({ type: 'catalog', artworks });
  } catch (err) {
    console.error('[AG] failed to build the catalog:', err);
    /* Report it to the iframe as well: that console is the one anyone
       debugging the live site actually has open. */
    try {
      $w('#' + HTML_ID).postMessage({
        type: 'catalogError',
        error: (err && err.message) || String(err),
      });
    } catch (postErr) {
      console.error('[AG] could not reach the gallery frame either:', postErr);
    }
  }
}

$w.onReady(function () {
  const frame = $w('#' + HTML_ID);

  frame.onMessage(async (event) => {
    const msg = (event && event.data) || {};

    if (msg.type === 'ready') {
      sendCatalog();
      return;
    }

    if (msg.type === 'openProduct') {
      wixLocation.to(msg.url || '/product-page/' + msg.slug);
      return;
    }

    if (msg.type === 'addToCart') {
      try {
        const res = await addToCart(msg.productId, msg.variantId);
        if (res.soldOut) {
          frame.postMessage({ type: 'cartResult', ok: false, soldOut: true });
        } else {
          frame.postMessage({ type: 'cartResult', ok: true, already: !!res.already });
        }
      } catch (err) {
        console.error('[AG] add to cart failed:', err);
        frame.postMessage({
          type: 'cartResult',
          ok: false,
          error: (err && err.message) || String(err),
        });
      }
      return;
    }
  });

  /* The iframe asks for the catalogue when it boots, but it may have booted
     before this handler was attached. */
  sendCatalog();
});
