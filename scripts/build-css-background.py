from pathlib import Path
import math, struct
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/launcher/css-pack/cstrike/materials/console'
OUT.mkdir(parents=True, exist_ok=True)

def font(size, bold=False):
    names = ['/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf' if bold else '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
             '/usr/share/fonts/arial.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf']
    for name in names:
        if Path(name).exists(): return ImageFont.truetype(name, size)
    return ImageFont.load_default()

def design(size):
    w,h=size
    im=Image.new('RGBA', size, '#05090f'); d=ImageDraw.Draw(im, 'RGBA')
    for y in range(h):
        t=y/max(1,h-1); d.line((0,y,w,y), fill=(5+int(6*t),10+int(14*t),17+int(22*t),255))
    glow=Image.new('RGBA', size); gd=ImageDraw.Draw(glow,'RGBA')
    gd.ellipse((w*.48,-h*.55,w*1.25,h*.75), fill=(27,178,232,58))
    gd.ellipse((-w*.3,h*.52,w*.45,h*1.25), fill=(255,112,48,24))
    glow=glow.filter(ImageFilter.GaussianBlur(max(30,w//18))); im.alpha_composite(glow); d=ImageDraw.Draw(im,'RGBA')
    step=max(28,w//28)
    for x in range(-h,w+h,step): d.line((x,0,x-h,h), fill=(68,178,221,15), width=1)
    for x in range(0,w+h,step): d.line((x,0,x-h,h), fill=(68,178,221,9), width=1)
    d.polygon([(0,0),(w*.035,0),(w*.32,h),(w*.285,h)], fill=(47,211,255,80))
    d.polygon([(w*.035,0),(w*.052,0),(w*.337,h),(w*.32,h)], fill=(255,255,255,150))
    d.rectangle((w*.075,h*.17,w*.085,h*.62), fill=(53,213,255,230))
    d.text((w*.11,h*.18), 'rareteam', font=font(max(28,w//17),True), fill=(235,248,255,255))
    d.text((w*.112,h*.31), 'SURVIVAL JIM', font=font(max(17,w//31),True), fill=(53,213,255,255))
    d.text((w*.113,h*.40), 'COUNTER-STRIKE: SOURCE  //  v34', font=font(max(9,w//78),True), fill=(137,161,180,255))
    d.text((w*.113,h*.47), 'RARE NETWORK  •  PLAY.RARENETWORK.RU', font=font(max(8,w//92)), fill=(100,126,146,255))
    d.line((w*.11,h*.57,w*.43,h*.57), fill=(53,213,255,100), width=max(1,w//700))
    d.text((w*.79,h*.89), 'RT // CSS-34', font=font(max(8,w//90),True), fill=(79,113,135,190))
    return im

def write_vtf(image, target):
    image=image.convert('RGBA')
    w,h=image.size
    # VTF 7.2, one BGRA8888 mip, no thumbnail.
    header=bytearray()
    header += b'VTF\x00' + struct.pack('<II',7,2) + struct.pack('<I',80)
    header += struct.pack('<HHIHH',w,h,0,1,0)
    header += b'\x00'*4 + struct.pack('<fff',0.0,0.0,0.0) + b'\x00'*4
    header += struct.pack('<fI',1.0,12) + struct.pack('<B',1) + b'\x00'*3
    header += struct.pack('<IBBH',13,0,0,1)
    header += b'\x00' * (80 - len(header))
    assert len(header)==80
    target.write_bytes(header + image.tobytes('raw','BGRA'))

standard=design((1024,1024)); wide=design((1024,512))
write_vtf(standard, OUT/'background01.vtf'); write_vtf(wide, OUT/'background01_widescreen.vtf')
wide.convert('RGB').save('/data/css-menu-preview.jpg', quality=90)
print('CSS backgrounds generated')
