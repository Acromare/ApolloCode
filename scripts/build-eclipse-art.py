"""Extract clean artwork bands; never bake screenshot controls or lettering into wallpaper."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parent.parent
source = Image.open(root / 'assets' / 'eclipse-reference.png').convert('RGB')
width, height = 1220, 1024
canvas = Image.new('RGB', (width, height), '#11151e')
top = source.crop((316, 0, 1536, 450))
# Remove three screenshot controls in the sky with a nearby clean sky strip,
# feathered on every edge. No face or celestial artwork is replaced.
patch = top.crop((805, 85, 1215, 170)).resize((220, 100))
mask = Image.new('L', patch.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((6, 6, 214, 94), radius=16, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(6))
top.paste(patch, (1000, 0), mask)
top_mask = Image.new('L', top.size, 255)
draw = ImageDraw.Draw(top_mask)
for y in range(405, 450):
    draw.line((0, y, width, y), fill=round(255*(450-y)/45))
canvas.paste(top, (0, 0), top_mask)
bottom = source.crop((316, 846, 1536, 1024)).resize((width, 356), Image.Resampling.LANCZOS)
bottom_mask = Image.new('L', bottom.size, 255)
draw = ImageDraw.Draw(bottom_mask)
for y in range(130):
    draw.line((0, y, width, y), fill=round(255*y/130))
canvas.paste(bottom, (0, height-bottom.height), bottom_mask)
canvas.save(root / 'assets' / 'eclipse-background.webp', quality=94)
