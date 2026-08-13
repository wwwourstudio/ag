/*
 * Annie Green — elevated catalog reads.
 *
 * WHERE THIS GOES
 *   Wix Studio editor -> Backend & Public -> Backend -> a new file named
 *   exactly `artworkCatalog.web.js`. The `.web.js` extension is what makes its
 *   exports callable from page code; a plain `.js` file is not.
 *
 * WHY IT EXISTS
 *   The Gallery page code reads the store directly, and on this site that
 *   comes back EMPTY — `[AG] built 0 artworks` — with no error thrown. That is
 *   what a permission-restricted read looks like from frontend code: an empty
 *   page rather than a refusal.
 *
 *   Permissions can only be raised in backend code ("methods can only be
 *   elevated in backend code" — Wix's elevated-permissions guide), so the
 *   three reads move here and run elevated. Page code then calls one method.
 *
 * IS THIS ACTUALLY THE PROBLEM?
 *   Reload the Gallery with the current page code and read the console:
 *
 *     [AG] catalog: N listed, N loaded, N with images
 *
 *   `0 listed` means the query itself came back empty — that is this file's
 *   problem, so wire it in (see below). Any other shape means the products are
 *   arriving and being lost later, and this file will not help.
 *
 * ORDER MATTERS
 *   Create this file FIRST, then paste the page code. The page code imports it
 *   by name, and an import of a file that isn't there fails the whole page —
 *   not just the catalog.
 *
 *   The page code calls this first and falls back to its own direct read if
 *   this throws, so a bad deploy here degrades to today's behaviour rather
 *   than breaking the gallery.
 *
 * WHAT IT RETURNS
 *   Raw store data, deliberately untransformed: the same objects the page code
 *   already knows how to read. Keeping the shaping in one place means the two
 *   halves cannot drift apart.
 *
 *   Collection NAMES are deliberately not here — see artworkCategories.web.js.
 *   They need an extra npm package, and a package that won't install must not
 *   be able to take the whole catalog down with it.
 */

import { Permissions, webMethod } from 'wix-web-module';
/* `auth.elevate` from @wix/essentials, NOT `elevate` from 'wix-auth'.
   wix-auth is the older Velo module and does not bind an @wix/* SDK method: it
   hands back the unbound descriptor, so the call returns a function expecting
   an HttpClient instead of a promise. The editor says as much —
   "cursorPaging does not exist in type 'HttpClient'" and "'await' has no
   effect on the type of this expression". @wix/essentials is the elevate that
   matches the @wix/* SDK, and is what the SDK docs use. */
import { auth } from '@wix/essentials';
import { productsV3, infoSectionsV3, inventoryItemsV3 } from '@wix/stores';

const idOf = (o) => (o ? o._id || o.id : null);

export const readCatalogSources = webMethod(Permissions.Anyone, async () => {
  /* elevate() is declared as `(sourceFunction: Function) => Function`, so the
     wrapped method's parameter list is erased and the editor reports
     "Expected 0-1 arguments, but got 2" on the two-argument getProduct call
     below. Casting to `any` restores a callable the checker won't argue with;
     the runtime calls are unchanged. */
  const queryProducts = /** @type {any} */ (auth.elevate(productsV3.queryProducts));
  const getProduct = /** @type {any} */ (auth.elevate(productsV3.getProduct));
  const queryInfoSections = /** @type {any} */ (auth.elevate(infoSectionsV3.queryInfoSections));
  const searchInventoryItems = /** @type {any} */ (auth.elevate(inventoryItemsV3.searchInventoryItems));

  /* Info sections and inventory are each optional: the gallery drops the
     Medium/Size/Year rows and the "37 left" label rather than failing the
     whole catalog over them. */
  let infoSections = [];
  try {
    const res = await queryInfoSections({ cursorPaging: { limit: 100 } });
    infoSections = res.infoSections || res.items || [];
  } catch (err) {
    console.error('[AG/backend] could not read info sections:', err);
  }

  let inventoryItems = [];
  try {
    const res = await searchInventoryItems({ cursorPaging: { limit: 100 } });
    inventoryItems = res.inventoryItems || res.items || [];
  } catch (err) {
    console.error('[AG/backend] could not read inventory:', err);
  }

  const listed = await queryProducts({ cursorPaging: { limit: 100 } });
  const items = listed.products || listed.items || [];
  console.log('[AG/backend] queryProducts returned', items.length, 'products');

  /* queryProducts does not return variant data, so each product is fetched
     individually for its variant ids and per-finish prices. */
  const products = (
    await Promise.all(
      items.map((p) =>
        getProduct(idOf(p), {
          fields: [
            'MEDIA_ITEMS_INFO',
            'PLAIN_DESCRIPTION',
            'VARIANT_OPTION_CHOICE_NAMES',
            'DESCRIPTION',
            'URL',
            'DIRECT_CATEGORIES_INFO',
            'INFO_SECTION',
          ],
        }).catch((err) => {
          console.error('[AG/backend] could not load product', p && p.name, err);
          return null;
        })
      )
    )
  ).filter(Boolean);

  /* The `fields` projection above is what carries variant data back, and it
     travels as getProduct's SECOND argument — through a wrapper whose type
     signature drops it. If elevate ever stopped forwarding it, products would
     arrive looking perfectly valid but with no variants, and the gallery would
     quietly lose every price, every stock flag and every Add to cart. Too
     quiet a failure to leave unwatched. */
  if (products.length && !products.some((p) => p.variantsInfo && p.variantsInfo.variants)) {
    console.error('[AG/backend] products came back with no variantsInfo — the fields ' +
                  'projection did not reach getProduct. Prices and Add to cart will not work.');
  }

  return { products, infoSections, inventoryItems };
});
