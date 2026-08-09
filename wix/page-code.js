/*
 * Annie Green — Wix page code for the gallery embed.
 *
 * WHERE THIS GOES
 *   Wix Studio editor -> the page holding the gallery -> Code panel (Velo).
 *   Add an Embed > "Embed a widget" / HtmlComponent to the page, point it at
 *   https://annie-green-artist.vercel.app/, and give it the element ID `html1`
 *   (or change HTML_ID below to match).
 *
 * WHAT IT DOES
 *   The gallery iframe cannot reach the Wix catalog or the Wix cart on its own
 *   — it is a cross-origin frame. This code is the other half of that bridge:
 *
 *     iframe -> here : "ready"        ask for the catalog
 *                      "addToCart"    add a variant to the Wix cart
 *                      "openProduct"  go to the product page
 *     here -> iframe : "catalog"      the artworks, with prices and variant ids
 *                      "cartResult"   whether the add succeeded
 *
 *   Without the "catalog" message the gallery falls back to a baked snapshot,
 *   which is why the Collections menu showed only "View all" — nothing was
 *   sending per-product collections. This sends them.
 *
 * IMPORTANT — the payload shape is a contract with index.html. `prints` and
 * `origVariantId` in particular are what make the print card appear and Add to
 * cart work; dropping them is what broke the store before.
 */

import { productsV3, infoSectionsV3 } from '@wix/stores';
import { currentCartV2 } from '@wix/ecom';
import wixLocation from 'wix-location';

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

/* Turn one Wix product into the shape index.html expects. */
/** @param {any} product */
function toArtwork(product, info) {
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
    prints: finishes.length ? prints : null,
    origVariantId,
  };
}

async function buildCatalog() {
  const info = await loadInfoSections();

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
    .map((res) => toArtwork(res, info))
    .filter((a) => a.image);
}

async function sendCatalog() {
  try {
    const artworks = await buildCatalog();
    console.log('[AG] sending', artworks.length, 'artworks to the gallery');
    $w('#' + HTML_ID).postMessage({ type: 'catalog', artworks });
  } catch (err) {
    console.error('[AG] failed to build the catalog:', err);
  }
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

  /* The iframe asks for the catalogue itself once it boots, but it may have
     booted before this handler was attached. */
  sendCatalog();
});
