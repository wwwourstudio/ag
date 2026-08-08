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

import { productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { currentCartV2 } from '@wix/ecom';
import wixLocation from 'wix-location';

const HTML_ID = 'html1';
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/* The store's "All Products" category — every product is in it, so it is not a
   collection worth showing in the menu. */
const ALL_PRODUCTS = '97859c36-72bd-40f3-846d-3d8c533ea382';

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

/* categoryId -> display name, loaded once per page view. */
let categoryNames = null;
async function loadCategoryNames() {
  if (categoryNames) return categoryNames;
  categoryNames = {};
  try {
    /** @type {any} */
    const res = await categories.queryCategories(
      {},
      { treeReference: { appNamespace: '@wix/stores', treeKey: null } }
    );
    for (const c of res.categories || res.items || []) {
      const id = idOf(c);
      if (id) categoryNames[id] = c.name;
    }
  } catch (err) {
    console.error('[AG] could not read categories; collections will be empty:', err);
  }
  return categoryNames;
}

/* Turn one Wix product into the shape index.html expects. */
/** @param {any} product */
function toArtwork(product, names) {
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
    .map((id) => names[id])
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
  const names = await loadCategoryNames();

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
    .map((res) => toArtwork(res, names))
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
