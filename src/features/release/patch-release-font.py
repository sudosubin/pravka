import fontforge
import sys


def fullwidth_forms():
    forms = [(source, 0xFF01 + source - 0x21) for source in range(0x21, 0x7F)]
    forms.extend(
        [
            (0x00A2, 0xFFE0),
            (0x00A3, 0xFFE1),
            (0x00AC, 0xFFE2),
            (0x00AF, 0xFFE3),
            (0x00A6, 0xFFE4),
            (0x00A5, 0xFFE5),
            (0x20A9, 0xFFE6),
        ]
    )
    return forms


MONO_GLYPH_ALIASES = [
    (0x22A2, 0x27DD),
    (0x22A3, 0x27DE),
    (0x2190, 0x27F5),
    (0x2192, 0x27F6),
    (0x2194, 0x27F7),
    (0x21D0, 0x27F8),
    (0x21D2, 0x27F9),
    (0x21D4, 0x27FA),
    (0x21A4, 0x27FB),
    (0x21A6, 0x27FC),
    (0x2906, 0x27FD),
    (0x2907, 0x27FE),
    (0x21DD, 0x27FF),
    (0x21DC, 0x2B33),
    (0x21C4, 0x1F8D0),
    (0x21CC, 0x1F8D1),
    (0x21CC, 0x1F8D2),
    (0x21CC, 0x1F8D3),
    (0x21CB, 0x1F8D4),
    (0x21CB, 0x1F8D5),
    (0x219B, 0x1F8D6),
    (0x21FB, 0x1F8D7),
    (0x21AD, 0x1F8D8),
]


def copy_glyph(font, source, target):
    font.selection.select(("unicode",), source)
    font.copy()
    font.selection.select(("unicode",), target)
    font.paste()
    font[target].width = 500


def remove_width_features(font):
    for lookup in list(font.gsub_lookups):
        features = font.getLookupInfo(lookup)[2]
        tags = {feature[0] for feature in features}
        if "NWID" in tags or "WWID" in tags:
            font.removeLookup(lookup)


def main(path):
    font = fontforge.open(path)

    for source, target in fullwidth_forms() + MONO_GLYPH_ALIASES:
        copy_glyph(font, source, target)

    for glyph in font.glyphs():
        if glyph.width > 500:
            glyph.width = 500

    remove_width_features(font)
    font.generate(path)


if __name__ == "__main__":
    main(sys.argv[1])
