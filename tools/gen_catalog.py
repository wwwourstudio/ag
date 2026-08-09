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

# Variant ids, read from the live store with Search Variants (Catalog V3).
#
# These are what make Add to cart work: the Wix cart takes a variantId, not a
# product id and a finish name. The live bridge sends its own ids and overrides
# everything here — this snapshot only has to carry the site through a moment
# when the catalog message doesn't arrive.
#
# Regenerate these whenever variants are added, removed, or recreated in Wix.
# A variant deleted in the store leaves a dead id here, and the add then fails
# visibly ("Failed — see console") rather than adding the wrong thing.
#
# slug -> (originalVariantId, matteId, glossId, metallicId)
VARIANTS = {
    "night-study-02": ("816e14af-0848-4cfd-927b-53e648975bad",
                       "52c5e41a-6931-4b66-a2a6-cf5ee060348f",
                       "d4d56eae-6a57-4489-afdc-99043b60e685",
                       "d5914adf-33b1-4dd4-b58e-6ee8be01fc28"),
    "night-study-01": ("39358f47-8914-463c-a040-6f420299fdc4",
                       "b0e9a263-00d9-4fa1-808f-580721dd5a0b",
                       "7d645b1c-1350-47ed-93ea-99107bd836ed",
                       "2bdeb2c5-bfdd-4b0c-8d20-ebf05063509a"),
    "small-mercies": ("bd59d502-a3e2-421e-8008-3bd2e7aa8598",
                      "143be7a8-c176-4927-8fd2-a0235054706f",
                      "e6518819-5dbf-4e94-a960-5fb7358ed79e",
                      "acf21c85-1a13-4309-864f-f347885f16a4"),
    "be-kind-to-yourself": ("167960ec-ca42-4bf6-bc08-0a46134d509d",
                            "2142181d-039d-4534-a98c-1267542dc4c3",
                            "2c8b7f93-5e36-4d96-8b15-88b941fb9e76",
                            "954438f9-5bd4-4f05-a2a2-f39cf8609ebc"),
    "two-together": ("9a2a4ccb-8263-4131-a2f4-e1528a21c325",
                     "c2880686-636c-4206-b059-f1bcb7ddac8e",
                     "516fcd40-5d2b-4b9f-b37a-ddd6226705c8",
                     "5f5d04c6-fb4d-4185-912c-190cc34a75b3"),
    "the-keeper": ("f2e545e9-bc81-4e19-a4ed-f7d3c5c98b53",
                   "4e9d9a4a-2c23-4738-ac50-97b79ecdf11f",
                   "dbff5af9-84c5-41db-a558-36209ebeaafc",
                   "4c6e9065-909a-4ab8-8374-7d40ca14d488"),
    "angel-with-companion": ("44702ef1-b2bc-432a-be72-89405369b3de",
                             "c4da832d-69ed-4ab7-9740-4f3babe18c6c",
                             "25ec3fe8-852d-427e-ac8d-1b5827377da6",
                             "f05e2f95-6907-4e78-a859-f8c36954af4f"),
    "crowned-girl-04": ("09d72c14-7f5a-4eb4-a997-a7cc96b0ee35",
                        "f0f8e904-8014-4f9b-a574-9c76ee179a2e",
                        "79ac40a0-9d1c-4725-a471-b1b3dca7b591",
                        "e41877d9-4c7a-4516-a594-b88f2b412b0e"),
    "crowned-girl-03": ("d12f5c9a-3eca-4e3c-b6d2-d0706f23650d",
                        "30273d91-a2f8-4ffc-a47c-c279326b70df",
                        "21dc7de9-0171-4221-b8e7-7aa4fe824ee2",
                        "c582d730-d3ac-4338-88c3-4d9e133269b6"),
    "crowned-girl-02": ("d90498a2-0a55-4e1a-bafc-a82b4bc23a73",
                        "b991da85-bc8a-4198-887b-4415bee97ecf",
                        "f6c14f06-0303-488b-a718-2357789e8684",
                        "faf3977d-c4cb-4ac2-8a09-cfbdc2e607e9"),
    "crowned-girl-01": ("3de488af-c612-4576-b535-dd25a73f6fc4",
                        "1bc8d176-e29e-487d-9e1b-e7c305889b05",
                        "7411214e-7673-4c9b-b408-7ddf32a12859",
                        "f208e2a8-d6ce-4c83-beef-59222d88ff62"),
}

# name, slug, productId, mediaId, mattePrint, original, originalInStock, collection, description
ROWS = [
    # The store's main image for this piece was replaced on 2026-08-09 with a
    # file named "Notary_Recraft V4…"; this snapshot follows the store.
    ("Night Study 02", "night-study-02", "f783b558-a740-488f-9bb8-fa7236795ad7",
     "11062b_818116e459a94b2a933ec6c6ed9240c3~mv2.jpg", 245, 1550, True, "Night Studies",
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


# Metadata from the store's shared info sections (Medium / Size / Year /
# Edition). These are one value for the whole catalogue in Wix today, so they
# are the same for every piece here too. The live bridge reads them from Wix
# directly; this snapshot just needs to agree with it.
SIZE = "16 x 20 in"
YEAR = 2024
EDITION = 50


def money(n):
    return "$" + format(n, ",")


def build():
    out = []
    for name, slug, pid, media, matte, original, in_stock, collection, desc in ROWS:
        orig_vid, matte_vid, gloss_vid, metallic_vid = VARIANTS[slug]
        out.append({
            "id": pid,
            "slug": slug,
            "url": SITE + "/product-page/" + slug,
            "image": CDN + media + TRANSFORM,
            "title": name,
            "size": SIZE,
            "year": YEAR,
            "edition": EDITION,
            "collections": [collection],
            "description": desc,
            "price": original,
            "priceText": money(original),
            "inStock": in_stock,
            "printPrice": matte,
            "prints": {
                "Matte": {"price": matte, "priceText": money(matte),
                          "inStock": True, "variantId": matte_vid},
                "Gloss": {"price": matte + GLOSS_DELTA,
                          "priceText": money(matte + GLOSS_DELTA),
                          "inStock": True, "variantId": gloss_vid},
                "Metallic": {"price": matte + METALLIC_DELTA,
                             "priceText": money(matte + METALLIC_DELTA),
                             "inStock": True, "variantId": metallic_vid},
            },
            "origVariantId": orig_vid,
        })
    return out


if __name__ == "__main__":
    print(json.dumps(build(), indent=2, ensure_ascii=False))
