from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
art = Image.open(root / "assets" / "star-logo-source.png").convert("RGBA")
purple = [(x, y) for y in range(art.height) for x in range(art.width)
          if (lambda r, g, b, a: a > 0 and b > r + 15 and r > g + 20 and b > 110)(*art.getpixel((x, y)))]
if not purple:
    raise ValueError("The logo source must contain the purple star")
left, top = min(x for x, y in purple), min(y for x, y in purple)
right, bottom = max(x for x, y in purple), max(y for x, y in purple)
size = max(right - left + 1, bottom - top + 1) + 8
center_x, center_y = (left + right) // 2, (top + bottom) // 2
art = art.crop((center_x - size // 2, center_y - size // 2,
                center_x - size // 2 + size, center_y - size // 2 + size))
art.save(root / "assets" / "star-logo.png")
mark = art.copy()
mark.putalpha(Image.eval(mark.getchannel('A'), lambda a: 0))
for y in range(art.height):
    for x in range(art.width):
        r, g, b, a = art.getpixel((x, y))
        mark.putpixel((x, y), (r, g, b, min(a, max(0, min(255, int((b - g - 12) * 2.5))))))
mark.save(root / "assets" / "star-mark.png")
icon = art.resize((256, 256), Image.Resampling.LANCZOS)
icon.save(root / "desktop" / "icon.png")
icon.save(root / "desktop" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
