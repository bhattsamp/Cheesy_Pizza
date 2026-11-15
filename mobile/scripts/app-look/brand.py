# Draws the Cheesy Pizza logo as vector SVG (img/logo*.svg): the pin with CHEESY PIZZA round the ring and
# a C in the middle, the CHEESY PIZZA(TM) wordmark and "Really Cheesy...!". Every letter is turned into an
# outline, so the files need no fonts and stay sharp at any size.
# Run: pip install fonttools brotli && python3 mobile/scripts/app-look/brand.py img
import io, math, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os
FONTS=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fonts')+'/'
OUT=sys.argv[1]
def load(name,wght=None):
    f=TTFont(FONTS+name+'.woff2')
    if wght and 'fvar' in f: f=instantiateVariableFont(f,{'wght':wght})
    return f
class Face:
    def __init__(s,f):
        s.f=f;s.gs=f.getGlyphSet();s.cmap=f.getBestCmap();s.upm=f['head'].unitsPerEm
        s.kern={}
    def adv(s,ch,size): return s.gs[s.cmap[ord(ch)]].width*size/s.upm
    def path(s,ch,size,tx,ty,rot=0):
        """glyph path, origin at baseline-left placed at (tx,ty), rotated by rot (rad) about that point"""
        g=s.gs[s.cmap[ord(ch)]];pen=SVGPathPen(s.gs);k=size/s.upm
        c,sn=math.cos(rot),math.sin(rot)
        # font y goes up; svg y goes down: scale (k,-k), rotate, translate
        # font units, y up -> svg, y down, rotated by rot about the baseline point (tx,ty)
        tp=TransformPen(pen,(k*c,k*sn,k*sn,-k*c,tx,ty))
        g.draw(tp);return pen.getCommands()
    def width(s,text,size,track=0): return sum(s.adv(ch,size) for ch in text)+track*(len(text)-1)
    def line(s,text,size,x,y,track=0,anchor='middle'):
        w=s.width(text,size,track);x0=x-w/2 if anchor=='middle' else x;out=[]
        for ch in text:
            if ch!=' ':out.append(s.path(ch,size,x0,y))
            x0+=s.adv(ch,size)+track
        return ' '.join(out),w
    def arc(s,text,size,cx,cy,r,top=True,track=0):
        """text centred on the top (reading clockwise, baseline radius r) or bottom (reading left to right, baseline radius r)"""
        w=s.width(text,size,track);pos=-w/2;out=[]
        for ch in text:
            a=s.adv(ch,size);mid=pos+a/2
            if top:
                th=-math.pi/2+mid/r          # angle of glyph centre
                bx,by=cx+r*math.cos(th),cy+r*math.sin(th)   # baseline point at glyph centre
                rot=th+math.pi/2                              # glyph upright points outward
            else:
                th=math.pi/2-mid/r
                bx,by=cx+r*math.cos(th),cy+r*math.sin(th)
                rot=th-math.pi/2                              # upright points inward
            # move from glyph centre back to its left edge along the tangent
            lx,ly=bx-math.cos(rot)*a/2,by-math.sin(rot)*a/2
            if ch!=' ':out.append(s.path(ch,size,lx,ly,rot))
            pos+=a+track
        return ' '.join(out)
dosis=Face(load('Dosis',700)); dosisX=Face(load('Dosis',800)); script=Face(load('Courgette'))
CX,CY,R=512,330,250          # pin circle
RING_IN=92                   # centre hole radius
TIP=CY+462
pin=(f"M{CX-R} {CY}A{R} {R} 0 0 1 {CX+R} {CY}"
     f"C{CX+R} {CY+110} {CX+150} {CY+290} {CX+42} {TIP-70}"
     f"Q{CX+28} {TIP} {CX} {TIP}Q{CX-28} {TIP} {CX-42} {TIP-70}"
     f"C{CX-150} {CY+290} {CX-R} {CY+110} {CX-R} {CY}Z")
hole=f"M{CX-RING_IN} {CY}a{RING_IN} {RING_IN} 0 1 0 {2*RING_IN} 0a{RING_IN} {RING_IN} 0 1 0 {-2*RING_IN} 0Z"
RT,RB=142,198
_n=dosisX.width('CHEESY PIZZA',100,0)/100     # width per unit of font size
RS=(2.62*RT-11*2)/_n                           # top line fills ~150 degrees at its baseline
TRB=(2.5*RB-_n*RS)/11                          # bottom line: same letters, spaced to fill its longer arc
ring_top=dosisX.arc('CHEESY PIZZA',RS,CX,CY,RT,True,track=2)
ring_bot=dosisX.arc('CHEESY PIZZA',RS,CX,CY,RB,False,track=TRB)
print('ring size',round(RS,1),'bottom track',round(TRB,1))
star=lambda x,y,s:' '.join(f"M{x} {y}l{s*math.cos(a)} {s*math.sin(a)}" for a in [i*math.pi/3+math.pi/2 for i in range(6)])
stars=star(CX-186,CY+10,13)+' '+star(CX+186,CY+10,13)
cmark,_=dosisX.line('C',118,CX,CY+42)
WB=TIP+120
word,ww=dosisX.line('CHEESY PIZZA',130,CX,WB,track=1)
tm,tw=dosis.line('TM',44,CX+ww/2+8,WB-74,track=1,anchor='left')
tag,_=script.line('Really Cheesy...!',62,CX,WB+88)
X0=min(CX-R,CX-ww/2)-20;X1=max(CX+R,CX+ww/2+8+tw)+20
VB_FULL=f'{X0:.0f} {CY-R-20} {X1-X0:.0f} {WB+88+30-(CY-R-20)}'
VB_PIN=f'{CX-R-6} {CY-R-6} {2*R+12} {TIP-CY+R+12}'
def svg(fg,ring,vb,full=True,bg=None):
    """fg: pin and lettering colour; ring: ring text, stars and C colour (on the pin)"""
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">']
    if bg: x,y,w,h=vb.split();parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>')
    parts.append(f'<path fill="{fg}" fill-rule="evenodd" d="{pin} {hole}"/>')
    parts.append(f'<path fill="{ring}" d="{ring_top} {ring_bot}"/>')
    parts.append(f'<path fill="none" stroke="{ring}" stroke-width="5" stroke-linecap="round" d="{stars}"/>')
    parts.append(f'<path fill="{fg}" d="{cmark}"/>')
    if full: parts.append(f'<path fill="{fg}" d="{word} {tm}"/><path fill="{fg}" d="{tag}"/>')
    parts.append('</svg>');return ''.join(parts)
TEAL='#10A1BC'
files={
 'logo.svg':svg(TEAL,'#ffffff',VB_FULL),
 'logo-white.svg':svg('#ffffff','none',VB_FULL),
 'logo-pin.svg':svg(TEAL,'#ffffff',VB_PIN,False),
 'logo-pin-white.svg':svg('#ffffff','none',VB_PIN,False),
}
# white version: the ring lettering and C are cut out of the white pin, so the page shows through
def knock(vb,full):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><defs><mask id="k" maskUnits="userSpaceOnUse" x="-100" y="-100" width="1300" height="1400"><rect x="-100" y="-100" width="1300" height="1400" fill="#fff"/>',
       f'<path fill="#000" d="{ring_top} {ring_bot}"/><path fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" d="{stars}"/></mask></defs>',
       f'<path fill="#fff" fill-rule="evenodd" mask="url(#k)" d="{pin} {hole}"/><path fill="#fff" d="{cmark}"/>']
    if full:p.append(f'<path fill="#fff" d="{word} {tm}"/><path fill="#fff" d="{tag}"/>')
    p.append('</svg>');return ''.join(p)
WY0=TIP+6
VB_WORD=f'{X0:.0f} {WY0} {X1-X0:.0f} {WB+88+30-WY0}'
files['logo-wordmark.svg']=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB_WORD}"><path fill="{TEAL}" d="{word} {tm} {tag}"/></svg>'
files['logo-wordmark-white.svg']=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB_WORD}"><path fill="#fff" d="{word} {tm} {tag}"/></svg>'
files['logo-white.svg']=knock(VB_FULL,True);files['logo-pin-white.svg']=knock(VB_PIN,False)
import re
tidy=lambda t:re.sub(r'-?\d+\.\d+',lambda m:('%.1f'%float(m.group())).rstrip('0').rstrip('.'),t)  # 0.1 unit is plenty
for n,t in files.items():
    open(OUT+'/'+n,'w').write(tidy(t));print(n,len(tidy(t)))
