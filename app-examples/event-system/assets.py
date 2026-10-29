from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
labels = [
    ("TITLE", "HB Event System", 66),
    ("SUBTITLE", "Live controller and SDK service events", 26),
    ("LAST_EVENT", "LAST EVENT", 19),
    ("PRESSED", "BUTTON PRESSED", 31),
    ("RELEASED", "BUTTON RELEASED", 31),
    ("COMPLETED", "SERVICE COMPLETED", 31),
    ("FAILED", "SERVICE FAILED", 31),
    ("NETWORK", "NETWORK MESSAGE", 31),
    ("NFC", "NFC TAG DETECTED", 31),
    ("WAITING", "WAITING FOR EVENTS", 31),
    ("EVENT_DATA", "EVENT DATA", 18),
    ("STATUS", "STATUS", 18),
    ("SEQUENCE", "SEQUENCE", 18),
    ("QUEUE", "QUEUE", 18),
    ("DROPPED", "DROPPED", 18),
    ("ERRORS", "ERRORS", 18),
    ("PENDING", "EVENT QUEUED", 16),
    ("EMPTY", "QUEUE EMPTY", 16),
    ("RETURN", "B or Minus to return", 18),
]
labels += [(f"DIGIT{i}", str(i), 22) for i in range(10)]
atlas = Image.new("L", (1024, 2048))
draw = ImageDraw.Draw(atlas)
constants = []
y = 2
for name, label, size in labels:
    face = ImageFont.truetype(bold if name in {"TITLE", "LAST_EVENT"} else font, size)
    bounds = draw.textbbox((0, 0), label, font=face)
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    draw.text((2 - bounds[0], y - bounds[1]), label, font=face, fill=255)
    constants.append(f"const ivec4 TEXT_{name} = ivec4(2, {y}, {width}, {height});")
    y += height + 8
constants.append(
    "const ivec4 DIGITS[10] = ivec4[10]("
    + ",".join(f"TEXT_DIGIT{i}" for i in range(10))
    + ");"
)
(root / "assets/text.bin").write_bytes(atlas.tobytes())
(root / "shaders/text.glsl").write_text("\n".join(constants) + "\n", encoding="utf-8")

icon = Image.new("RGBA", (256, 256), (29, 5, 15, 255))
draw = ImageDraw.Draw(icon)
draw.rounded_rectangle((24, 24, 232, 232), radius=42, fill=(74, 8, 29), outline=(244, 24, 65), width=7)
draw.ellipse((76, 76, 180, 180), outline=(255, 48, 83), width=10)
draw.ellipse((105, 105, 151, 151), fill=(255, 48, 83))
icon.save(root / "assets/icon.png")
