import sys
from PIL import Image
# usage: crop.py src out x0 y0 x1 y1 [scale]  (coords in original pixels)
src, out = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = map(int, sys.argv[3:7])
s = float(sys.argv[7]) if len(sys.argv) > 7 else 2
im = Image.open(src).crop((x0, y0, x1, y1))
im = im.resize((int(im.width * s), int(im.height * s)), Image.NEAREST)
im.save(out)
