"""A deterministic painting made of raster marks. No models or external images.
Run: python draw_teaser.py [output_directory]
Pillow + NumPy are the only dependencies. BMP headers and BGR bytes are written here.
"""
from pathlib import Path
import math, random, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W = H = 1024
rng = random.Random(731042)
im = Image.new('RGB', (W,H), '#4a666e')
d = ImageDraw.Draw(im)

def ellipse(box, color): d.ellipse(box, fill=color)
def poly(points, color): d.polygon(points, fill=color)
def line(points, color, width=3): d.line(points, fill=color, width=width, joint='curve')
def path(start, segments, color):
    pts=[start]; p=start
    for a,b,c in segments:
        for i in range(1,31):
            t=i/30; u=1-t
            pts.append((u**3*p[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t**3*c[0],
                        u**3*p[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t**3*c[1]))
        p=c
    poly(pts,color)

# Evening beyond the cafe window: indigo buildings, turquoise glass, amber rain.
for y in range(H):
    t=y/H
    line([(0,y),(1024,y)],(int(35+50*t),int(74+25*t),int(103+16*t)),1)
ellipse((25,-75,760,530),'#537c9a')
poly([(0,270),(65,251),(65,149),(132,121),(190,159),(190,310),(273,310),(273,165),(319,114),(372,151),(372,379),(0,446)],'#455367')
poly([(668,326),(668,172),(725,130),(799,165),(799,263),(883,263),(883,94),(956,52),(1024,102),(1024,511)],'#4b536b')
poly([(0,450),(1024,364),(1024,627),(0,701)],'#315364')
for bx in [24,85,145,288,330,692,743,905,956,1001]:
    for by in [190,243,296,349]:
        if rng.random()<.78:
            col=rng.choice(['#d6a171','#e6bc70','#91b9b2','#678799'])
            d.rectangle((bx,by,bx+13,by+22), fill=col)
for i in range(140):
    x=rng.randint(8,1020); y=rng.randint(435,645)
    line([(x,y),(x-rng.randrange(0,9),y+rng.randrange(5,45))],rng.choice(['#648f96','#7e9c9b','#b49a76','#536d89']),rng.randint(2,5))
# A distant red cafe canopy.
poly([(676,343),(1024,315),(1024,378),(658,399)],'#9c535d')
for x in range(694,1024,43): poly([(x,342),(x+20,340),(x+3,390),(x-17,393)],'#d28d79')
# Heavy wooden framing and a cream wall at the right edge.
d.rectangle((0,0,32,720),fill='#313d43')
d.rectangle((531,0,551,629),fill='#273b43')
d.rectangle((968,0,1024,720),fill='#b78b69')
d.rectangle((975,0,987,684),fill='#e1ba81')
d.rectangle((0,604,979,626),fill='#917c61')
line([(33,609),(969,609)],'#d3b186',6)
for x in [50,564,943]: line([(x,15),(x-2,589)],'#93a5a0',2)
# Pendant lights, painted as nested fields of warm light.
for cx,cy,rr in [(167,150,63),(812,111,76)]:
    line([(cx,0),(cx,cy-50)],'#3d4245',5)
    for r in range(rr,18,-1):
        t=(rr-r)/(rr-18)
        ellipse((cx-r,cy-r*.77,cx+r,cy+r*.77),
                (int(147+100*t),int(119+111*t),int(81+66*t)))
    poly([(cx-53,cy-6),(cx-25,cy-47),(cx+25,cy-47),(cx+53,cy-6)],'#48565a')
    ellipse((cx-52,cy-18,cx+52,cy+9),'#e8c789')
    ellipse((cx-27,cy-10,cx+27,cy+12),'#fff1b6')
# Booth, behind the sitter.
path((55,750), [((45,648),(80,565),(147,573)),((240,579),(297,626),(355,744)),((246,819),(151,834),(55,750))], '#65444f')
path((72,742), [((66,657),(98,598),(147,601)),((211,607),(267,675),(294,745)),((210,795),(129,789),(72,742))], '#996262')

# Tail curls out from the chair at left.
path((263,750), [((144,766),(100,698),(133,658)),((156,628),(192,663),(170,690)),((167,705),(212,714),(271,693)),((315,701),(315,738),(263,750))], '#b87d4e')
line([(152,663),(147,692),(169,713)],'#e9b470',13)
# Teal cardigan and lit shoulder. The head and paws remain orange tabby.
path((222,488), [((177,527),(165,667),(207,762)),((292,819),(499,818),(581,747)),((569,625),(545,539),(482,502)),((403,468),(302,462),(222,488))], '#235963')
path((232,507), [((189,548),(187,669),(218,743)),((249,751),(267,717),(271,666)),((278,593),(273,541),(297,511))], '#427a77')
path((458,523), [((516,528),(542,584),(567,642)),((553,686),(531,705),(510,679)),((482,615),(452,585),(440,556))], '#3c716e')
path((281,496), [((288,544),(315,578),(344,605)),((383,579),(413,540),(437,506)),((389,493),(332,482),(281,496))], '#cf9b61')
poly([(277,493),(341,577),(312,608),(253,530)],'#71918a')
poly([(438,506),(344,577),(381,606),(466,541)],'#96aaa0')
line([(341,586),(353,740)],'#182f40',7)
for yy in [635,685,735]: ellipse((356,yy,363,yy+8),'#c2a783')
# Head: asymmetric ears, generous cheek, turned slightly towards the laptop.
path((228,343), [((209,292),(210,215),(230,199)),((264,203),(303,239),(325,256)),((357,240),(398,239),(433,251)),((462,218),(500,209),(513,216)),((532,245),(518,302),(514,337)),((540,388),(519,450),(478,487)),((423,531),(333,529),(281,495)),((231,463),(210,402),(228,343))], '#d69954')
path((229,310), [((220,278),(224,232),(234,220)),((259,230),(283,253),(295,272)),((265,272),(248,286),(229,310))], '#a75c52')
path((461,271), [((477,245),(498,232),(504,235)),((513,260),(504,290),(498,309)),((487,288),(473,279),(461,271))], '#b87162')
line([(236,228),(248,264),(260,273)],'#e7b08a',6)
line([(501,242),(495,269)],'#eed3a1',6)
# Warm light from the pendant, cool violet shadows on the far side.
path((240,315), [((261,278),(306,266),(339,270)),((314,316),(305,356),(309,398)),((292,445),(280,472),(302,500)),((235,475),(214,392),(240,315))], '#ba7b55')
path((381,269), [((440,259),(482,287),(498,328)),((457,310),(438,322),(415,353)),((400,324),(381,305),(381,269))], '#edbb6a')
path((477,366), [((519,374),(517,423),(494,453)),((477,474),(455,487),(431,492)),((452,450),(463,414),(477,366))], '#b88066')
# Tabby markings follow the dome and cheeks.
for pts,w,col in [([(342,265),(351,292),(355,320)],12,'#886146'), ([(382,263),(379,293),(371,321)],10,'#946544'), ([(302,280),(315,300),(323,319)],10,'#9b6744'), ([(426,278),(412,304),(405,319)],9,'#a36c42'), ([(234,358),(264,369),(279,383)],12,'#835f51'), ([(232,390),(257,400),(274,407)],10,'#976349'), ([(241,427),(267,432),(282,437)],10,'#916c5c'), ([(481,335),(466,354),(454,366)],9,'#9a6c4d'), ([(504,388),(484,395),(470,408)],10,'#926857')]: line(pts,col,w)
# Eye sockets and almond eyes.
path((281,358), [((297,337),(324,338),(340,355)),((329,376),(299,382),(281,358))], '#544d43')
path((287,356), [((305,345),(323,347),(334,356)),((321,370),(302,371),(287,356))], '#b6b780')
path((398,354), [((411,331),(441,326),(459,342)),((451,364),(418,376),(398,354))], '#625141')
path((405,351), [((421,337),(441,335),(452,343)),((443,360),(421,365),(405,351))], '#b9c992')
ellipse((312,346,322,369),'#293e3a'); ellipse((429,335,438,359),'#293d38')
ellipse((311,348,316,353),'#fff1cb'); ellipse((428,339,433,344),'#fff4d3')
# Cream muzzle, small terracotta nose and soft mouth.
ellipse((295,392,379,466),'#e1ba87'); ellipse((355,387,434,460),'#edcca0')
poly([(347,401),(382,399),(365,418)],'#9b655e')
line([(365,418),(366,433),(350,440)],'#775653',3)
line([(366,433),(383,439),(395,434)],'#775653',3)
path((319,465), [((346,471),(385,469),(412,459)),((394,486),(347,493),(319,465))], '#efd0a0')
for x,y in [(319,416),(332,427),(314,433),(396,412),(404,423),(390,432)]: ellipse((x,y,x+3,y+3),'#9a826a')

# Table, rising diagonally into the picture, with a long warm reflection.
path((0,826), [((205,753),(660,688),(1024,737)),((1043,823),(1052,939),(1024,1024)),((685,1056),(207,1043),(0,1000)),((0,924),(0,868),(0,826))], '#986c59')
path((0,859), [((255,781),(725,721),(1024,766)),((998,837),(424,902),(0,965)),((0,932),(0,887),(0,859))], '#bc8e6c')
for i in range(28):
    yy=800+i*8
    line([(0,yy+70),(400,yy-2),(1024,yy-31)],rng.choice(['#ae8065','#cd9d74','#a07562','#d0a07c']),2)
# Cat's forearm reaches to the keyboard.
path((229,615), [((229,648),(258,690),(314,708)),((367,733),(404,726),(436,708)),((443,684),(414,669),(378,673)),((328,668),(309,633),(300,614))], '#4b7b76')
path((376,670), [((406,652),(445,657),(471,677)),((479,692),(461,713),(434,716)),((407,717),(379,705),(370,690))], '#dba766')
line([(420,673),(428,692)],'#af7b51',3); line([(435,674),(444,692)],'#af7b51',3)

# MacBook keyboard tray. Its screen is viewed from behind, angled towards the cat.
poly([(448,684),(737,674),(902,803),(575,844),(400,739)],'#4d6971')
poly([(443,682),(737,678),(887,798),(571,830),(413,738)],'#a3b6b5')
poly([(473,697),(717,692),(808,763),(568,785)],'#536a71')
for j in range(5):
    for i in range(12):
        x=481+i*18+j*15; y=703+j*12-i*.45
        poly([(x,y),(x+12,y-.5),(x+23,y+7),(x+10,y+8)],'#9baead')
poly([(579,789),(677,778),(719,805),(614,818)],'#becac3')
path((489,652), [((510,638),(541,645),(555,662)),((562,684),(547,696),(522,693)),((502,690),(482,673),(489,652))], '#e2b476')
line([(517,654),(530,677)],'#b68459',3); line([(534,656),(547,675)],'#b68459',3)
# Screen lid, thin bevels, silver rear and subtle Apple silhouette.
poly([(570,541),(875,485),(943,749),(647,823)],'#334f5c')
poly([(578,546),(871,494),(933,745),(650,813)],'#b9c7be')
poly([(578,546),(668,566),(721,796),(650,813)],'#9eb8b4')
poly([(582,549),(870,498),(878,527),(590,577)],'#d3d8c7')
line([(579,546),(870,494),(932,744)],'#e8e4ce',3)
line([(649,813),(936,747)],'#798e93',4)
# Recognizable small bitten apple, assembled from raster shapes.
path((754,636), [((734,626),(727,639),(730,654)),((730,672),(745,692),(754,685)),((762,680),(766,684),(774,680)),((787,668),(790,645),(780,636)),((770,629),(763,638),(754,636))], '#e6e6d1')
ellipse((776,641,792,658),'#bbc8bf')
path((755,631), [((755,618),(764,611),(773,612)),((773,623),(764,630),(755,631))], '#e6e6d1')
# Espresso and saucer, a glass of water, croissant and linen napkin.
ellipse((85,871,295,928),'#735c59'); ellipse((83,861,290,914),'#d2d0b0'); ellipse((101,869,274,901),'#e6d9b6')
ellipse((229,817,278,865),'#e3d6b5'); ellipse((239,825,267,856),'#a57b60')
path((124,807), [((121,841),(129,875),(162,882)),((193,893),(227,876),(232,847)),((235,828),(236,814),(233,803))], '#e8d6b0')
ellipse((124,790,235,824),'#f5dfb4'); ellipse((135,797,225,818),'#654e42'); ellipse((143,799,218,814),'#ad8055')
line([(151,808),(176,803),(203,808)],'#e2bc82',3)
poly([(29,945),(221,927),(326,991),(114,1017)],'#cebb9a')
path((57,955), [((61,930),(92,912),(121,916)),((157,904),(210,918),(231,947)),((245,968),(223,989),(202,976)),((162,947),(128,948),(100,975)),((81,984),(59,978),(57,955))], '#c98e45')
for pts in [[(83,933),(96,943),(100,965)],[(111,922),(125,937),(127,954)],[(145,921),(154,934),(155,951)],[(179,925),(184,940),(179,956)],[(208,937),(208,952),(198,966)]]: line(pts,'#edbe73',8)
ellipse((831,873,950,913),'#6d6c66')
poly([(854,815),(934,803),(925,886),(864,896)],'#8fa6a1')
ellipse((853,801,934,826),'#c8d2bd'); ellipse((860,807,928,821),'#839f9d')
line([(861,826),(868,880)],'#d5d9bf',5); line([(925,827),(919,879)],'#b9cbbb',3)
# A small cafe plant at the far right.
for ex,ey in [(998,366),(976,403),(1025,440),(983,470)]:
    line([(1015,614),(ex,ey)],'#4b6b60',5)
    ellipse((ex-19,ey-30,ex+15,ey+20),'#658776')

# Transform the underpainting into thousands of broken optical-color marks.
# Dabs sample only the local color; no downloaded or generated bitmap is used.
base=np.asarray(im).copy()
paint=im.filter(ImageFilter.GaussianBlur(.7)).resize((2048,2048))
pd=ImageDraw.Draw(paint)
accents=np.array([[21,8,-18],[-18,9,21],[13,-15,18],[-12,17,-7],[18,15,4]])
for step,rad,alpha in [(6.5,3.8,.68),(3.5,2.05,.87),(2.1,1.0,.92)]:
    for yy in np.arange(0,1024,step):
        for xx in np.arange(0,1024,step):
            x=min(1023,max(0,xx+rng.uniform(-step*.65,step*.65)))
            y=min(1023,max(0,yy+rng.uniform(-step*.65,step*.65)))
            c=base[int(y),int(x)].astype(float)
            a=accents[rng.randrange(len(accents))]*rng.uniform(.35,1.25)
            c=np.clip(c+a+rng.uniform(-10,10),0,255)
            # Slightly different complementary pigments are left side by side.
            col=tuple(int(v) for v in c)
            rx=rad*rng.uniform(.55,1.08); ry=rad*rng.uniform(.55,1.25)
            pd.ellipse(((x-rx)*2,(y-ry)*2,(x+rx)*2,(y+ry)*2),fill=col)

# Directional short fur strokes and tiny glints are added over the point field.
for i in range(3800):
    x=rng.uniform(218,520); y=rng.uniform(213,519)
    c=base[int(y),int(x)]
    # Select orange/cream fur, excluding eyes, pink ears, background, and clothing.
    if not (c[0]>155 and c[0]>c[1]*1.12 and c[1]>c[2]*1.12): continue
    angle=math.atan2(y-335,(x-368)*.9)
    ln=rng.uniform(1.8,4.5)
    col=tuple(int(v) for v in np.clip(c.astype(float)+rng.choice([-1,1])*np.array([18,17,13]),0,255))
    pd.line([(x*2,y*2),((x+math.cos(angle)*ln)*2,(y+math.sin(angle)*ln)*2)],fill=col,width=rng.choice([1,2,2,3]))

def fine_curve(points,color,width=1):
    # Quadratic Bezier made from many tiny raster line segments.
    p,a,b=points; out=[]
    for i in range(61):
        t=i/60; u=1-t
        out.append(((u*u*p[0]+2*u*t*a[0]+t*t*b[0])*2,(u*u*p[1]+2*u*t*a[1]+t*t*b[1])*2))
    pd.line(out,fill=color,width=width)

for pts in [((320,430),(265,408),(210,417)),((321,440),(265,435),(204,452)),((322,449),(270,461),(231,483)),((401,426),(456,397),(492,402)),((402,437),(459,420),(510,432)),((399,447),(458,449),(494,469))]:
    fine_curve(pts,'#e8d9b8',2)
for x,y in [(313,349),(429,340)]: pd.ellipse((x*2,y*2,x*2+6,y*2+6),fill='#fff6d9')
# Steam consists of sparse cream and lavender dots, never a solid clipart line.
for i in range(230):
    t=rng.random(); x=181+math.sin(t*8)*12+rng.gauss(0,3); y=787-t*88
    r=rng.uniform(.45,1.5)
    pd.ellipse(((x-r)*2,(y-r)*2,(x+r)*2,(y+r)*2),fill=rng.choice(['#b8bbb0','#d5c8a7','#9fb7b7']))

final=paint.resize((1024,1024),Image.Resampling.LANCZOS)
# Fine canvas grain remains visible between the optical color dots.
arr=np.asarray(final).astype(np.int16)
noise=np.random.default_rng(164).normal(0,1.3,(1024,1024,1))
arr=np.clip(arr+noise,0,255).astype(np.uint8)
final=Image.fromarray(arr)
out=Path(sys.argv[1] if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'output')
out.mkdir(parents=True,exist_ok=True)
# A real uncompressed Windows BMP: 14-byte file header + 40-byte DIB + BGR rows.
stride=(W*3+3)&~3
payload=b''.join(arr[y,:,::-1].tobytes()+b'\0'*(stride-W*3) for y in range(H-1,-1,-1))
header=struct.pack('<2sIHHI',b'BM',54+len(payload),0,0,54)
dib=struct.pack('<IiiHHIIiiII',40,W,H,1,24,0,len(payload),2835,2835,0,0)
(out/'teaser.bmp').write_bytes(header+dib+payload)
final.save(out/'teaser.jpg',quality=96,subsampling=0)
assert Image.open(out/'teaser.bmp').size==(1024,1024)
assert np.array_equal(np.asarray(Image.open(out/'teaser.bmp')),arr)
print(f'1024x1024 RGB. BMP: {54+len(payload):,} bytes. Output: {out}')
