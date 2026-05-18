import struct
import os

icons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src-tauri', 'icons')
os.makedirs(icons_dir, exist_ok=True)

w, h = 32, 32
# BMP DIB header + pixel data
bmp_header = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
pixels = b''
for y in range(h):
    for x in range(w):
        # BGRA blue
        pixels += bytes([0xff, 0x77, 0x1e, 0xff])

img_data = bmp_header + pixels

# ICO header + 1 entry
ico_header = struct.pack('<HHH', 0, 1, 1)
ico_entry = struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(img_data), 22)

with open(os.path.join(icons_dir, 'icon.ico'), 'wb') as f:
    f.write(ico_header + ico_entry + img_data)

print('ICO created successfully at', os.path.join(icons_dir, 'icon.ico'))
