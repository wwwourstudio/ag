repo: wwwourstudio/ag
branch: claude/annie-green-artist-site-h914ho

## Last sync

date: 2026-08-09T05:32:00Z

### Updated in this project

- Recreated the artwork lightbox screen as `Lightbox.dc.html` from `index.html`.
- Rebuilt the sidebar print box: inline three-up paper finish selector, rounded cards, Giclée line.
- Wired the print card to the Wix store payload: per-finish variant prices and stock, sold-out states, real product URLs.
- Added inventory counts to `wix/page-code.js` so "37 left" reflects the selected finish's tracked quantity.
- Buy now / Buy print now refresh the cart UI and slide out the Wix side cart on a successful add.
- Sold originals dim their holographic wash and price instead of staying the loudest card in the panel.
- Short desktop viewports tighten the editorial half so Buy print stays above the fold at 540px tall.

## Screen map

| Screen | Repo files |
| --- | --- |
| index.html (patched in place) | index.html, wix/page-code.js (catalog payload contract) |
