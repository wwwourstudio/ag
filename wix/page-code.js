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
 *                                     refresh and slide out the side cart
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
import { currentCartV2 } from '@wix/ecom';

const HTML_ID = 'html1';
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/* The store's "All Products" category — every product is in it, so it is not a
   collection worth showing in the menu. */
const ALL_PRODUCTS = '97859c36-72bd-40f3-846d-3d8c533ea382';

/* Category id -> the name shown in the gallery's Collections menu.
 *
 * This is a lookup table rather than a query because the `@wix/categories`
 * package isn't available in this site's Velo environment — importing it
 * fails the build with "Cannot find module '@wix/categories'". Products only
 * carry category *ids*, so the names have to come from somewhere; hard-coding
 * the four that exist is the honest trade for a catalogue this size.
 *
 * If you add or rename a collection in Wix, add it here too. Anything missing
 * is logged to the console and the artwork falls back to "Works", so a stale
 * entry shows up as a wrong menu label rather than a silent disappearance.
 */
const CATEGORY_NAMES = {
  '8e48dec4-59a1-4310-9bc5-ceb5c8bb1bb6': 'Crowned Girls',
  '49bca492-5965-44fc-ba17-073624eb3659': 'Angels & Companions',
  'dcd8b88c-b308-4348-9d38-091984855f70': 'Kind Words',
  'b3c85211-c373-43d3-9fc7-46f5c66d402c': 'Night Studies',
};

/* Info sections carry the gallery's metadata — Medium, Size, Year, Edition —
   as rich text on a shared entity, and products reference them by id. The
   values are real store data and editable in Wix, so nothing here is
   hard-coded: change "16 x 20 in" in the Size section and the lightbox
   follows. */
let infoText = null;
async function loadInfoSections() {
  if (infoText) return infoText;
  infoText = {};
  try {
    /** @type {any} */
    const res = await infoSectionsV3.queryInfoSections({ cursorPaging: { limit: 100 } });
    for (const sec of res.infoSections || res.items || []) {
      const id = idOf(sec);
      if (id) infoText[id] = { name: sec.uniqueName, text: richText(sec.description) };
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

/* Pull one named info section's text off a product. */
/** @param {any} product */
function sectionOf(product, info, uniqueName) {
  for (const ref of product.infoSections || []) {
    const hit = info[idOf(ref)];
    if (hit && hit.name === uniqueName) return hit.text;
  }
  return '';
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
function toArtwork(product, info, inventory) {
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
      const name = CATEGORY_NAMES[id];
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

  const full = await Promise.all(
    (listed.products || listed.items || []).map((p) =>
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

  return full
    .filter(Boolean)
    .map((res) => toArtwork(res, info, inventory))
    .filter((a) => a.image);
}


async function addToCart(productId, variantId) {
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

  /* The SDK writes straight to the cart, which leaves the page's cart UI
     showing stale data — only refreshCart() makes the cart icon and side cart
     re-read it. Refresh first, then slide the cart out, so the panel opens
     already showing the artwork that was just added. */
  try {
    await wixEcomFrontend.refreshCart();
  } catch (err) {
    console.error('[AG] could not refresh the cart UI:', err);
  }
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
        await addToCart(msg.productId, msg.variantId);
        frame.postMessage({ type: 'cartResult', ok: true });
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
