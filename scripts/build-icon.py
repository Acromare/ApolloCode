"""Build transparent UI marks and Windows icons from the supplied Apollo logo."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).resolve().parent.parent
source = Image.open(root / "assets" / "apollo-logo-source.png").convert("RGB")
# Remove the near-white background while retaining antialiased symbol edges.
alpha = ImageOps.invert(ImageOps.grayscale(source)).point(
    lambda value: round(max(0, value - 24) * 255 / 231)
)
bounds = alpha.getbbox()
if not bounds:
    raise ValueError("The supplied logo contains no visible mark")
alpha = alpha.crop(bounds)
alpha.thumbnail((448, 448), Image.Resampling.LANCZOS)
mask = Image.new("L", (512, 512), 0)
mask.paste(alpha, ((512 - alpha.width) // 2, (512 - alpha.height) // 2))
mark = Image.new("RGBA", (512, 512), (22, 22, 22, 0))
mark.putalpha(mask)
mark.save(root / "assets" / "apollo-mark.png")

# A light tile preserves the black logo on both light and dark Windows desktops.
tile = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
ImageDraw.Draw(tile).rounded_rectangle((8, 8, 504, 504), radius=104, fill=(250, 250, 250, 255))
tile.alpha_composite(mark)
icon = tile.resize((256, 256), Image.Resampling.LANCZOS)
icon.save(root / "desktop" / "icon.png")
icon.save(root / "desktop" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("Built Apollo UI mark and Windows icons (16-256 px)")
