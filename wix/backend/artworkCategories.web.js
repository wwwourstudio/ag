/*
 * Annie Green — collection names from the store.
 *
 * REQUIRED. The page code holds no table of collection names any more, so this
 * is what turns the category ids on a product into the labels in the gallery's
 * Collections menu. Rename a collection in Wix and the menu renames; add or
 * delete one and it appears or goes.
 *
 * WHERE THIS GOES
 *   Wix Studio editor -> Backend & Public -> Backend -> a new file named
 *   exactly `artworkCategories.web.js`.
 *
 * REQUIRES ONE PACKAGE
 *   Wix editor -> Packages & Apps -> npm -> install `@wix/categories`.
 *   Do that BEFORE creating this file, or it won't build.
 *
 *   This is the package the page code once recorded as "Cannot find module
 *   '@wix/categories'". That was it not being installed, not Wix refusing —
 *   which is why the names ended up hard-coded in the first place.
 *
 * WHY IT IS SEPARATE FROM artworkCatalog.web.js
 *   That file needs no new packages. This one does, and a package that won't
 *   install must not be able to take the catalog down with it. Skip this file
 *   and the gallery still works.
 *
 * WHY IT IS NEEDED AT ALL
 *   Products carry category *ids*, never names. Checked against this store:
 *   DIRECT_CATEGORIES_INFO returns bare ids, and the Velo Stores/Collections
 *   data collection does not exist on a Catalog V3 site. This API is the only
 *   route from an id to a name.
 */

import { Permissions, webMethod } from 'wix-web-module';
/* @wix/essentials, not 'wix-auth' — see artworkCatalog.web.js. */
import { auth } from '@wix/essentials';
import { categories } from '@wix/categories';

export const readCategoryNames = webMethod(Permissions.Anyone, async () => {
  const names = {};
  try {
    /* Cast for the same reason as artworkCatalog.web.js: elevate() erases the
       wrapped method's parameter list. */
    const queryCategories = /** @type {any} */ (auth.elevate(categories.queryCategories));
    const res = await queryCategories({
      treeReference: { appNamespace: '@wix/stores' },
      query: { cursorPaging: { limit: 100 } },
    });
    for (const cat of res.categories || res.items || []) {
      const id = cat && (cat._id || cat.id);
      if (id && cat.name) names[id] = cat.name;
    }
    console.log('[AG/backend] read', Object.keys(names).length, 'collection names');
  } catch (err) {
    /* Nothing stands in for this any more. An empty map drops every piece into
       "Works", and the gallery's own direct read of the store then supplies the
       real names — so this costs the menu, not the artwork. */
    console.error('[AG/backend] could not read categories:', err);
  }
  return names;
});
