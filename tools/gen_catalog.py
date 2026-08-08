#!/usr/bin/env python3
"""Generate the baked Wix catalog block injected into index.html."""
import json

SITE = "https://ourstudioco.wixstudio.com/annie-green"
CDN = "https://static.wixstatic.com/media/"
# Wix media transform: keeps the source PNGs (2.3-6.6 MB each) out of the browser.
TRANSFORM = "/v1/fit/w_1200,h_1200,q_85/file.jpg"

# Print finish deltas over the Matte print price, taken from the live Wix
# variants (verified identical on Night Study 01/02, Small Mercies, Crowned
# Girl 01). Live embed data overrides these entirely.
GLOSS_DELTA = 25
METALLIC_DELTA = 55

# name, slug, productId, mediaId, mattePrint, original, originalInStock, collection, description
ROWS = [
    ("Night Study 02", "night-study-02", "f783b558-a740-488f-9bb8-fa7236795ad7",
     "ee1cab_877fff041cfd49699212736a8b37a0a2~mv2.png", 245, 1550, True, "Night Studies",
     "Worked in a single sitting under lamplight, edges left raw."),
    ("Night Study 01", "night-study-01", "5b42f4c0-482a-4bf1-a8fb-dd53a55272ce",
     "ee1cab_63ccb5c7f9a04966ae9dc7cdf006f946~mv2.png", 320, 2400, True, "Night Studies",
     "Deep indigo ground worked after dark, the figures emerging from the splatter."),
    ("Small Mercies", "small-mercies", "f02c87fb-47ea-49e5-9419-6007a6c691d8",
     "ee1cab_8fbaefc9dc324714a7213f5dcbcd54a9~mv2.png", 185, 1100, False, "Kind Words",
     "Marker and felt over collage, the lettering left deliberately unfinished."),
    ("Be Kind to Yourself", "be-kind-to-yourself", "d8f43217-047b-42ef-abb7-22f582131b9d",
     "ee1cab_6a0e83ef535f4fb5855525ce2f83ce02~mv2.png", 175, 980, True, "Kind Words",
     "A stamped phrase pressed into the lower field, half-swallowed by the wash."),
    ("Two Together", "two-together", "573bbcc0-55ef-4974-b403-1ed3d042a0ef",
     "ee1cab_6205b669b8a74ee185147b678078fc30~mv2.png", 265, 1950, True, "Angels & Companions",
     "Two figures on a bed of indigo splatter, one turned away, one facing out."),
    ("The Keeper", "the-keeper", "c058c9c5-312a-4f70-b7e4-4c7d32046100",
     "ee1cab_4d4525b27f7142eb95ab07949b9d4909~mv2.png", 250, 1750, True, "Angels & Companions",
     "Stitched patchwork and marker over a headscarfed figure, holding something unseen."),
    ("Angel with Companion", "angel-with-companion", "cc1ab4d6-1b5a-4590-9056-a90e986d7ee6",
     "ee1cab_a9d875bd8f8f42e284e055512552d8c5~mv2.png", 280, 2100, True, "Angels & Companions",
     "A veiled figure and her small keeper, worked on a ground of pressed blue."),
    ("Crowned Girl 04", "crowned-girl-04", "a54d3ae3-e49c-4f94-8b54-a62a42e60f51",
     "ee1cab_058fb98b3fbe4c9d84980e93a79e0c55~mv2.png", 195, 1250, True, "Crowned Girls",
     "Warm reds worked over a printed ground, the crown drawn in a single unbroken line."),
    ("Crowned Girl 03", "crowned-girl-03", "1aa22102-cdb5-42ce-92d8-0d65e8e933d2",
     "ee1cab_7dfa9e7104084c43bb0e178be1942749~mv2.png", 240, 1650, False, "Crowned Girls",
     "Ochre and gold ground, with a small figure held at the centre of the field."),
    ("Crowned Girl 02", "crowned-girl-02", "99fa1741-dfea-4f42-b51a-c2e6ced6ad69",
     "ee1cab_a211aec2eeae40dfa2327a8b084f9c09~mv2.png", 260, 1400, True, "Crowned Girls",
     "A crowned figure worked in wash and pastel, her collar built from torn paper."),
    ("Crowned Girl 01", "crowned-girl-01", "0ac8e5d9-6768-4f6a-be49-fb2f4b51f442",
     "ee1cab_5d385ee002454981873f4f5eddaa0c05~mv2.png", 220, 1850, True, "Crowned Girls",
     "Pastel, wash and collage built up around a single figure, with a stamped phrase set into the lower field."),
]


def money(n):
    return "$" + format(n, ",")


def build():
    out = []
    for name, slug, pid, media, matte, original, in_stock, collection, desc in ROWS:
        out.append({
            "id": pid,
            "slug": slug,
            "url": SITE + "/product-page/" + slug,
            "image": CDN + media + TRANSFORM,
            "title": name,
            "collections": [collection],
            "description": desc,
            "price": original,
            "priceText": money(original),
            "inStock": in_stock,
            "printPrice": matte,
            "prints": {
                "Matte": {"price": matte, "priceText": money(matte), "inStock": True},
                "Gloss": {"price": matte + GLOSS_DELTA,
                          "priceText": money(matte + GLOSS_DELTA), "inStock": True},
                "Metallic": {"price": matte + METALLIC_DELTA,
                             "priceText": money(matte + METALLIC_DELTA), "inStock": True},
            },
        })
    return out


if __name__ == "__main__":
    print(json.dumps(build(), indent=2, ensure_ascii=False))
