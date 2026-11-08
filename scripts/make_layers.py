"""Separate the original code-painted illustration into animated raster layers."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
assets=root/'dist/assets'
assets.mkdir(parents=True,exist_ok=True)
s=(root/'scripts/draw_teaser.py').read_text()
s=s.replace("for bx in [24,85,145,288,330,692,743,905,956,1001]:", "windows=[]\nfor bx in [24,85,145,288,330,692,743,905,956,1001]:")
s=s.replace("d.rectangle((bx,by,bx+13,by+22), fill=col)", "windows.append({'x':bx,'y':by,'color':col})\n            d.rectangle((bx,by,bx+13,by+22), fill='#3c4b60')")
a=s.index('# Pendant lights,'); b=s.index('# Booth,',a)
lamp_code=s[a:b]
s=s[:a]+s[b:]
a=s.index('# Steam consists'); b=s.index('final=paint.resize',a)
s=s[:a]+s[b:]
s=s[:s.index('out=Path(')]
g={'__file__':str(root/'scripts/draw_teaser.py')}
exec(compile(s,'layered_painting','exec'),g)
g['final'].save(assets/'cafe.jpg',quality=95,subsampling=0)
windows=[w for w in g['windows'] if (w['x'] in (85,145) or (w['x'] in (288,330) and w['y']==190) or (w['x'] in (692,743,905,956) and w['y']<343))]
(assets/'windows.json').write_text(json.dumps(windows))
for i,(cx,cy,rr) in enumerate([(167,150,63),(812,111,76)]):
    sprite=Image.new('RGBA',(1024,1024))
    g['d']=ImageDraw.Draw(sprite)
    exec(lamp_code.replace('[(167,150,63),(812,111,76)]',repr([(cx,cy,rr)])),g)
    ar=np.asarray(sprite).copy()
    noise=np.random.default_rng(77+i).normal(0,8,(1024,1024,1))
    ar[:,:,:3]=np.clip(ar[:,:,:3].astype(float)+noise,0,255).astype('uint8')
    Image.fromarray(ar).crop((cx-rr-3,0,cx+rr+4,cy+rr+5)).save(assets/f'lamp{i}.png')
print('Painted background, two textured lamp layers,',len(windows),'animated windows')
