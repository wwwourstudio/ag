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
import { elevate } from 'wix-auth';
import { productsV3, infoSectionsV3, inventoryItemsV3 } from '@wix/stores';

const idOf = (o) => (o ? o._id || o.id : null);

export const readCatalogSources = webMethod(Permissions.Anyone, async () => {
  const queryProducts = elevate(productsV3.queryProducts);
  const getProduct = elevate(productsV3.getProduct);
  const queryInfoSections = elevate(infoSectionsV3.queryInfoSections);
  const searchInventoryItems = elevate(inventoryItemsV3.searchInventoryItems);

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

  const listed = await queryProducts({ cursorPaging: { limit: 100 } }, { fields: [] });
  const items = listed.products || listed.items || [];
  console.log('[AG/backend] queryProducts returned', items.length, 'products');

  /* queryProducts does not return variant data, so each product is fetched
     individually for its variant ids and per-finish prices. */
  const products = (
    await Promise.all(
      items.map((p) =>
        getProduct(idOf(p), {
          fields: [
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

  return { products, infoSections, inventoryItems };
});
