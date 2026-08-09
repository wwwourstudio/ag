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
- A **Collections** menu filtering to one of four collections: Crowned Girls,
  Angels & Companions, Kind Words, Night Studies.
- A lightbox with hover-to-zoom, artwork metadata (size, year, edition), and
  original / print pricing.
- An animated colour-wash background, particle dust canvases, and an idle spin.

### Wix embedding

The page is built to run standalone *and* inside a Wix site as an iframe. The
`AGWix` bridge at the top of `index.html` talks to the Wix parent over
`postMessage`:

- sends `ready`, receives `catalog` — when the parent supplies a catalog, the
  real Wix products and prices replace the built-in artwork list.
- sends `addToCart` / `openProduct`, receives `cartResult`.

Standalone (no Wix parent), the page falls back to a generated set of 24
artworks defined in `index.html`, priced and sized locally.

## Artwork images — not in this repo

The gallery loads its images from `art-web/02.jpg` … `art-web/10.jpg`
(8 distinct files: `02`–`08` and `10`), resolved as:

```js
src: (window.AG_ART && window.AG_ART[n]) || ("art-web/" + n + ".jpg")
```

That fallback is gone. Artwork now comes from the Wix CDN through resize
transforms, both in the live catalog and in the baked snapshot, so this repo is
a complete deployable copy. The only binary asset is `logo/wordmark.png`, which
the loader samples to build its particle wordmark.

## Provenance

The live site was created by a direct file upload (Vercel deployment
`source: "drop"`), so it was never connected to a git repository. The files here
were recovered from the running production deployment.

## Wix side

One file: `wix/page-code.js` goes in the **Gallery page's** code panel — the
editor tab named after the page. Nowhere else, and nothing else needed.

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
