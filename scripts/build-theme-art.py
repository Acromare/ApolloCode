from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent


def feather(image, left=0, right=0, top=0, bottom=0):
    image = image.convert('RGBA')
    alpha = Image.new('L', image.size, 255)
    pixels = alpha.load()
    for y in range(image.height):
        for x in range(image.width):
            factor = min(1, x / left if left else 1,
                         (image.width - 1 - x) / right if right else 1,
                         y / top if top else 1,
                         (image.height - 1 - y) / bottom if bottom else 1)
            pixels[x, y] = int(255 * factor)
    image.putalpha(alpha)
    return image


def build(name, sidebar, base, bands):
    source = Image.open(root / 'assets' / f'{name}-reference.png').convert('RGBA')
    canvas = Image.new('RGBA', (source.width - sidebar, source.height), base)
    for box, fades in bands:
        crop = feather(source.crop(box), **fades)
        canvas.alpha_composite(crop, (box[0] - sidebar, box[1]))
    canvas.convert('RGB').save(root / 'assets' / f'{name}-background.webp', quality=94)


build('day', 312, '#f5f5f3', [
    ((312, 0, 620, 510), dict(right=48, bottom=60)),
    ((312, 0, 1330, 230), dict(right=45, bottom=50)),
    ((1340, 75, 1536, 510), dict(left=40, top=35, bottom=35)),
    ((1400, 510, 1536, 1024), dict(left=40, top=35)),
    ((312, 765, 1536, 1024), dict(top=50)),
])
build('night', 316, '#090c11', [
    ((316, 0, 1536, 270), dict(bottom=35)),
    ((316, 230, 560, 1024), dict(right=40, top=35)),
    ((1130, 230, 1536, 550), dict(left=50, top=35, bottom=35)),
    ((1400, 510, 1536, 880), dict(left=35, top=30, bottom=35)),
    ((316, 790, 1270, 1024), dict(top=35, right=55)),
])
