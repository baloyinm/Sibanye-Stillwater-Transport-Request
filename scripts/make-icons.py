# Generic icons (no logo, no client branding): blue square, white letter T. Run: python3 scripts/make-icons.py
from PIL import Image, ImageDraw
def icon(size, safe, rounded):
    im = Image.new('RGB', (size, size), (11, 92, 173)); d = ImageDraw.Draw(im)
    w = size * safe; x0 = (size - w) / 2; y0 = (size - w) / 2
    d.rectangle([x0 + w * .2, y0 + w * .2, x0 + w * .8, y0 + w * .36], fill='white')
    d.rectangle([x0 + w * .42, y0 + w * .36, x0 + w * .58, y0 + w * .82], fill='white')
    return im
for name, size, safe in [('icon-192.png', 192, .9), ('icon-512.png', 512, .9), ('icon-maskable-512.png', 512, .55), ('icon-180.png', 180, .9)]:
    icon(size, safe, False).save('public/' + name)
