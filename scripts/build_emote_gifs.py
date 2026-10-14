"""Assemble eight generated poses per emote into transparent 2.4-second GIFs.

Requires Pillow. Run with the directory containing NAME-sheet.png as the first
argument and the output asset directory as the second. No animation runs in JS.
"""
from pathlib import Path
import sys
from PIL import Image, ImageChops

source_dir, output_dir = map(Path, sys.argv[1:3])
output_dir.mkdir(parents=True, exist_ok=True)
for name in ('laughing', 'angry', 'crying', 'gg'):
    sheet = Image.open(source_dir / f'{name}-sheet.png').convert('RGBA')
    width, height = sheet.size
    frames = []
    for n in range(8):
        x, y = n % 4, n // 4
        frame = sheet.crop((round(x*width/4), round(y*height/2), round((x+1)*width/4), round((y+1)*height/2)))
        frame = frame.resize((256, 256), Image.Resampling.LANCZOS)
        frames.append(frame)
    frames[2].save(output_dir / f'{name}.png')
    # Share one 255-color palette across all poses; reserve index 0 for alpha.
    atlas = Image.new('RGB', (256*8, 256), '#111827')
    for n, frame in enumerate(frames):
        atlas.paste(frame, (256*n, 0), frame.getchannel('A'))
    colors = atlas.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    palette = Image.new('P', (1, 1))
    palette.putpalette([0,0,0] + colors.getpalette()[:765])
    encoded = []
    for frame in frames:
        rgb = Image.new('RGB', frame.size, '#111827')
        rgb.paste(frame, mask=frame.getchannel('A'))
        indexed = rgb.quantize(palette=palette, dither=Image.Dither.NONE)
        # Reserve zero strictly for transparent pixels.
        indexed = indexed.point(lambda p: max(1, p))
        indexed.paste(0, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
        indexed.info['transparency'] = 0
        encoded.append(indexed)
    sequence = encoded * 2
    path = output_dir / f'{name}.gif'
    sequence[0].save(path, save_all=True, append_images=sequence[1:], duration=150,
                     loop=0, transparency=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        duration = 0
        for i in range(gif.n_frames):
            gif.seek(i)
            duration += gif.info['duration']
            assert gif.convert('RGBA').getpixel((0,0))[3] == 0
        assert gif.size == (256,256) and duration == 2400 and gif.n_frames >= 8
        gif.seek(0)
        first=gif.convert('RGBA')
        gif.seek(2)
        assert ImageChops.difference(first.convert('RGB'),gif.convert('RGB')).getbbox()
        print(f'{name}: {gif.n_frames} frames, {duration} ms, {path.stat().st_size:,} bytes, transparency verified')
