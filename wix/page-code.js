/*
 * Annie Green — Gallery PAGE code.
 *
 * WHERE THIS GOES
 *   Wix Studio editor -> the Gallery page -> the page's code panel (the tab
 *   named after the page, e.g. "Gallery"). NOT data.js, and NOT a Public
 *   file: `$w` and `wix-location` only exist in page code, and using them
 *   anywhere else fails with "Cannot use namespace '$w' as a value".
 *
 *   The catalog and cart logic lives in Public > artworkSync.js.
 *
 * SETUP
 *   Add an Embed > "Embed a widget" / HtmlComponent pointing at
 *   https://annie-green-artist.vercel.app/ and give it the element ID
 *   below.
 *
 * THE BRIDGE
 *   iframe -> here : "ready" / "addToCart" / "openProduct"
 *   here -> iframe : "catalog" / "cartResult"
 */

import wixLocation from 'wix-location';
/* Velo resolves Public modules without the file extension — 'public/artworkSync.js'
   does not resolve, 'public/artworkSync' does. The file must exist first:
   Public & Backend -> Public -> artworkSync.js, holding wix/public-artworkSync.js. */
import { buildCatalog, addToCart } from 'public/artworkSync';

const HTML_ID = 'html1';

async function sendCatalog() {
  try {
    const artworks = await buildCatalog();
    console.log('[AG] sending', artworks.length, 'artworks to the gallery');
    $w('#' + HTML_ID).postMessage({ type: 'catalog', artworks });
  } catch (err) {
    console.error('[AG] failed to build the catalog:', err);
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
