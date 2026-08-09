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
 * HOW TO WIRE IT IN
 *   In the Gallery page code, uncomment the two marked blocks: the import at
 *   the top, and the `readCatalogSources()` branch inside buildCatalog(). Both
 *   are labelled "BACKEND CATALOG". Nothing else changes — the page code keeps
 *   doing the shaping, this file only does the reading.
 *
 * WHAT IT RETURNS
 *   Raw store data, deliberately untransformed: the same objects the page code
 *   already knows how to read, plus a category id -> name map. Keeping the
 *   shaping in one place means the two halves cannot drift apart.
 */

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { productsV3, infoSectionsV3, inventoryItemsV3 } from '@wix/stores';
/* Requires the `@wix/categories` npm package: Wix editor -> Packages & Apps ->
   npm -> install it. Without it this file won't build. It is what makes the
   Collections menu follow the store — products carry category *ids* only, and
   this is the only API that turns those into names. */
import { categories } from '@wix/categories';

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

  /* Collection names, read from the store so the gallery's Collections menu
     follows it. Rename one in Wix and the menu renames; add or delete one and
     it appears or goes. Returned as a plain id -> name map. */
  const categoryNames = {};
  try {
    const queryCategories = elevate(categories.queryCategories);
    const res = await queryCategories({
      treeReference: { appNamespace: '@wix/stores' },
      query: { cursorPaging: { limit: 100 } },
    });
    for (const cat of res.categories || res.items || []) {
      const id = idOf(cat);
      if (id && cat.name) categoryNames[id] = cat.name;
    }
    console.log('[AG/backend] read', Object.keys(categoryNames).length, 'collection names');
  } catch (err) {
    /* The page code keeps a hard-coded table for exactly this case, so a
       failure here costs freshness, not the menu. */
    console.error('[AG/backend] could not read categories:', err);
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

  return { products, infoSections, inventoryItems, categoryNames };
});
