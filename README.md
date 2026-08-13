# Annie Green — Artist Site

Source for <https://annie-green-artist.vercel.app/> (Vercel project `annie-green-artist`,
team `leverage-ai-sports`).

## What this is

A single-page immersive artwork gallery. The whole site is two files:

| File | What it is |
| --- | --- |
| `index.html` | The entire site — markup, styles, and the gallery component |
| `support.js` | The `x-dc` client runtime the page boots from (generated; do not hand-edit) |

`index.html` is written in the `x-dc` component format: a `<helmet>` block for
head content and global styles, a declarative markup body using `ref="{{ … }}"`
and `onClick="{{ … }}"` bindings, and a `<script type="text/x-dc">` block at the
end holding the component class.

### Features

- Two view modes, **Sphere** (artworks orbiting in 3D, drag to spin) and **Wall**
  (flat gallery wall with lighting), toggled from the bottom chrome.
- A **Collections** menu built from whatever collections the store's products
  are actually in — rename one in Wix and the menu follows.
- A lightbox with hover-to-zoom, artwork metadata (size, year, edition), and
  original / print pricing.
- An animated colour-wash background, particle dust canvases, and an idle spin.

## The catalog is always live

**No artwork is stored in this repo.** No titles, no prices, no image URLs, no
variant ids, no collection names. The gallery reads the Wix store on every load,
so adding, editing or deleting a product in Wix is the whole job — there is
nothing here to regenerate and nothing that can go stale.

There are two live sources, and both are reads of the same store:

| Source | Where it runs | What it needs |
| --- | --- | --- |
| `AGWix` — the parent Wix page over `postMessage` | inside the Wix site only | `wix/page-code.js` published on the Gallery page |
| `AGStore` — the Wix API, read straight from the browser | everywhere | the headless client id in `index.html` |

`AGWix` wins when both answer, because it is the site's own read and carries
per-variant inventory counts ("37 left"). `AGStore` is what makes the standalone
page work, and what covers the embed when the page code is missing or silent.

If neither answers, the gallery says so on screen. It does not invent artwork.

### The headless client id

`AGStore` authenticates as an anonymous visitor using a Wix Headless client id,
a public identifier held in `index.html`. It is **not** a secret: it only mints
visitor tokens, which can read publicly visible store data and nothing else. The
client secret is not in this repo and must never be — visitor auth does not use
one. Manage the client in the site's dashboard under Headless Settings.

### Cart

Adding to cart still needs the Wix parent frame, since the cart belongs to the
Wix site. Standalone, the buy button links out to the product page instead.

## Assets

The only binary asset is `logo/wordmark.png`, which the loader samples to build
its particle wordmark. Artwork images are served from the Wix CDN through resize
transforms, requested at runtime from whatever the store currently holds.

## Provenance

The live site was created by a direct file upload (Vercel deployment
`source: "drop"`), so it was never connected to a git repository. The files here
were recovered from the running production deployment.

## Wix side

`wix/page-code.js` goes in the **Gallery page's** code panel — the editor tab
named after the page. Nowhere else.

It imports **one** backend file, so create it **before** pasting the page code —
an import of a file that isn't there fails the whole page code, not just the
catalog:

- `backend/artworkCatalog.web.js` — reads products, variants, info sections and
  inventory with elevated permissions.

`backend/artworkCategories.web.js` is **no longer imported** and no longer needs
creating; `@wix/categories` no longer needs installing. Both were required only
for collection names, and a missing one produced

```
[/pages/Gallery.c1dmp.js]: Cannot find module 'backend/artworkCategories.web'
```

which stopped the page code building at all — no catalog, no add-to-cart. The
gallery reads the categories itself now (`AGStore` in `index.html`), so the names
survive without it. The file is kept in `wix/backend/` for reference only.

The site modules stay on the classic Velo specifiers — `wix-location`,
`wix-window`, `wix-ecom-frontend`. The editor red-underlines the last two with
`Cannot find module ... or its corresponding type declaration` and suggests
`@wix/site-window`; **ignore it.** That is the TypeScript service missing a type
declaration, not the bundler failing to resolve the module. The `@wix/site-*`
packages are not installed here, so taking the suggestion turns a cosmetic
squiggle into a real build failure.

Tell the two apart by where the message appears. A build error names the file and
shows in the deploy log under `Status: Error`. A squiggle in the editor gutter is
a type lookup.

- Not `data.js`, not a Public file: `$w` and `wix-location` exist only in page
  code, and using them elsewhere fails with
  `Cannot use namespace '$w' as a value`.
- It is deliberately self-contained. Splitting the data half into
  `Public > artworkSync.js` read better, but the page code could not resolve
  `public/artworkSync` in this workspace, and one file has no import path to
  get wrong.

## Deploying

The Vercel project is connected to this repository and `main` is its production
branch, so a push to `main` deploys. `.vercelignore` keeps `README.md`, `tools/`
and `wix/` off the site's domain.
