"""
Lecture / écriture des banques de sprites SFF (M.U.G.E.N / Ikemen GO).

Décodeurs portés depuis la source d'Ikemen GO (src/image.go, licence MIT) :
RLE8, RLE5 et LZ5, plus le PNG à palette du SFF v2 (dont la palette interne
est nulle : ce sont les palettes du SFF qui font foi).

Utilisé par les outils de génération de personnages.
"""
import struct, zlib, io

# ─────────── Décompresseurs ───────────

def rle8_decode(rle, size):
    p = bytearray(size); i = j = 0
    while j < size and i < len(rle):
        n, d = 1, rle[i]
        if i < len(rle)-1: i += 1
        if d & 0xc0 == 0x40:
            n = d & 0x3f
            d = rle[i]
            if i < len(rle)-1: i += 1
        while n > 0 and j < size:
            p[j] = d; j += 1; n -= 1
    return bytes(p)

def rle5_decode(rle, size):
    p = bytearray(size); i = j = 0
    while j < size and i < len(rle):
        rl = rle[i]
        if i < len(rle)-1: i += 1
        dl = rle[i] & 0x7f
        c = 0
        if rle[i] >> 7:
            if i < len(rle)-1: i += 1
            c = rle[i]
        if i < len(rle)-1: i += 1
        while True:
            if j < size:
                p[j] = c; j += 1
            rl -= 1
            if rl < 0:
                dl -= 1
                if dl < 0: break
                c = rle[i] & 0x1f
                rl = rle[i] >> 5
                if i < len(rle)-1: i += 1
            if j >= size: break
    return bytes(p)

def lz5_decode(rle, size):
    p = bytearray(size)
    if not rle: return bytes(p)
    i = j = n = 0
    ct = rle[i]; cts = 0; rb = 0; rbc = 0
    if i < len(rle)-1: i += 1
    while j < size and i < len(rle):
        d = rle[i]
        if i < len(rle)-1: i += 1
        if ct & (1 << cts):
            if d & 0x3f == 0:
                d = ((d << 2 | rle[i]) + 1) & 0xffff
                if i < len(rle)-1: i += 1
                n = rle[i] + 2
                if i < len(rle)-1: i += 1
            else:
                rb |= (d & 0xc0) >> rbc
                rbc += 2
                n = d & 0x3f
                if rbc < 8:
                    d = rle[i] + 1
                    if i < len(rle)-1: i += 1
                else:
                    d = rb + 1
                    rb = rbc = 0
            while True:
                if j < size:
                    p[j] = p[j-d] if j-d >= 0 else 0
                    j += 1
                n -= 1
                if n < 0: break
                if j >= size: break
        else:
            if d & 0xe0 == 0:
                n = rle[i] + 8
                if i < len(rle)-1: i += 1
            else:
                n = d >> 5
                d &= 0x1f
            while n > 0 and j < size:
                p[j] = d; j += 1; n -= 1
        cts += 1
        if cts >= 8:
            ct = rle[i]; cts = 0
            if i < len(rle)-1: i += 1
    return bytes(p)

def png_indexed_decode(png):
    """PNG paletté 8 bits → (indices, w, h). Renvoie None si autre format."""
    p = 8; w = h = depth = 0; ctype = -1; idat = []
    while p < len(png) - 8:
        ln = struct.unpack_from('>I', png, p)[0]
        typ = png[p+4:p+8]
        data = png[p+8:p+8+ln]
        if typ == b'IHDR':
            w, h, depth, ctype = struct.unpack_from('>IIBB', data, 0)
        elif typ == b'IDAT': idat.append(data)
        elif typ == b'IEND': break
        p += 12 + ln
    if ctype != 3 or depth != 8: return None
    raw = zlib.decompress(b''.join(idat))
    idx = bytearray(w*h); sp = 0
    for y in range(h):
        f = raw[sp]; sp += 1
        row = y*w; prev = (y-1)*w
        for x in range(w):
            cur = raw[sp]; sp += 1
            a = idx[row+x-1] if x > 0 else 0
            b = idx[prev+x] if y > 0 else 0
            c = idx[prev+x-1] if (x > 0 and y > 0) else 0
            if f == 0:   v = cur
            elif f == 1: v = cur + a
            elif f == 2: v = cur + b
            elif f == 3: v = cur + ((a+b) >> 1)
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                v = cur + (a if pa <= pb and pa <= pc else b if pb <= pc else c)
            else: v = cur
            idx[row+x] = v & 0xff
    return bytes(idx), w, h

# ─────────── Lecture d'une banque SFF ───────────

def read_sff(path):
    """→ (sprites, palettes) ; sprite = dict(group,image,w,h,x,y,idx)."""
    d = open(path, 'rb').read()
    if d[:11] != b'ElecbyteSpr':
        raise ValueError('SFF invalide')
    return _read_v2(d) if d[15] >= 2 else _read_v1(d)

def _read_v1(d):
    count = struct.unpack_from('<I', d, 20)[0]
    off = struct.unpack_from('<I', d, 24)[0]
    sprites = []; shared = None
    for i in range(count):
        if off <= 0 or off >= len(d): break
        nxt, ln = struct.unpack_from('<II', d, off)
        x, y = struct.unpack_from('<hh', d, off+8)
        g, n = struct.unpack_from('<HH', d, off+12)
        data = d[off+32: off+32+ln] if ln else b''
        if i == 0 and len(data) >= 769 and data[-769] == 0x0C:
            shared = data[-768:]
        sprites.append(dict(group=g, image=n, x=x, y=y, pcx=data))
        if nxt == 0 or nxt <= off: break
        off = nxt
    return sprites, [shared] if shared else []

def _read_v2(d):
    sprOff, sprCount, palOff, palCount, ldata = struct.unpack_from('<IIIII', d, 36)
    palettes = []
    for i in range(palCount):
        o = palOff + i*16
        doff, dlen = struct.unpack_from('<II', d, o+8)
        raw = d[ldata+doff: ldata+doff+dlen]
        rgb = bytearray(768)
        for c in range(min(256, len(raw)//4)):
            rgb[c*3:c*3+3] = raw[c*4:c*4+3]
        palettes.append(bytes(rgb))

    metas = []
    for i in range(sprCount):
        o = sprOff + i*28
        g, it, w, h = struct.unpack_from('<HHHH', d, o)
        x, y = struct.unpack_from('<hh', d, o+8)
        linked = struct.unpack_from('<H', d, o+12)[0]
        fmt, depth = d[o+14], d[o+15]
        doff, dlen = struct.unpack_from('<II', d, o+16)
        pal = struct.unpack_from('<H', d, o+24)[0]
        metas.append(dict(group=g, image=it, w=w, h=h, x=x, y=y,
                          linked=linked, fmt=fmt, doff=doff, dlen=dlen, pal=pal))

    out = []
    for m in metas:
        if not m['w'] or not m['h']: continue
        src = metas[m['linked']] if (m['dlen'] == 0 and m['linked'] < len(metas)) else m
        if not src['dlen']: continue
        start = ldata + src['doff']
        size = m['w'] * m['h']
        idx = None
        if src['fmt'] == 0:
            idx = d[start:start+size]
        elif src['fmt'] in (2, 3, 4):
            comp = d[start+4: start+src['dlen']]
            idx = (rle8_decode(comp, size) if src['fmt'] == 2 else
                   rle5_decode(comp, size) if src['fmt'] == 3 else
                   lz5_decode(comp, size))
        elif src['fmt'] >= 10:
            r = png_indexed_decode(d[start+4: start+src['dlen']])
            if r: idx, m['w'], m['h'] = r[0], r[1], r[2]
        if idx is None or len(idx) < m['w']*m['h']: continue
        out.append(dict(group=m['group'], image=m['image'], w=m['w'], h=m['h'],
                        x=m['x'], y=m['y'], idx=idx, pal=m['pal']))
    return out, palettes

# ─────────── Écriture SFF v1 ───────────

def make_pcx(idx, w, h, palette):
    hdr = bytearray(128)
    hdr[0], hdr[1], hdr[2], hdr[3] = 0x0A, 5, 1, 8
    struct.pack_into('<HHHH', hdr, 4, 0, 0, w-1, h-1)
    struct.pack_into('<HH', hdr, 12, 72, 72)
    hdr[65] = 1
    bpl = w + (w & 1)
    struct.pack_into('<H', hdr, 66, bpl)
    body = bytearray()
    for y in range(h):
        row = bytearray(idx[y*w:(y+1)*w])
        if bpl > w: row.append(0)
        x = 0
        while x < len(row):
            run = 1
            while x+run < len(row) and row[x+run] == row[x] and run < 63: run += 1
            if run > 1 or row[x] >= 0xC0:
                body.append(0xC0 | run); body.append(row[x])
            else:
                body.append(row[x])
            x += run
    pal = bytearray(palette[:768])
    pal.extend(b'\x00' * (768 - len(pal)))
    return bytes(hdr) + bytes(body) + b'\x0C' + bytes(pal)

def write_sff_v1(path, sprites, palette):
    """sprites = liste de dict(group,image,w,h,x,y,idx)."""
    hdr = bytearray(512)
    hdr[0:12] = b'ElecbyteSpr\x00'
    struct.pack_into('<I', hdr, 12, 0)
    hdr[15] = 1
    struct.pack_into('<I', hdr, 16, len({s['group'] for s in sprites}))
    struct.pack_into('<I', hdr, 20, len(sprites))
    struct.pack_into('<I', hdr, 24, 512)
    struct.pack_into('<I', hdr, 28, 32)

    blobs = [(s, make_pcx(s['idx'], s['w'], s['h'], palette)) for s in sprites]
    body = bytearray(); offset = 512
    for i, (s, pcx) in enumerate(blobs):
        sub = bytearray(32)
        nxt = 0 if i == len(blobs)-1 else offset + 32 + len(pcx)
        struct.pack_into('<I', sub, 0, nxt)
        struct.pack_into('<I', sub, 4, len(pcx))
        struct.pack_into('<hh', sub, 8, s['x'], s['y'])
        struct.pack_into('<HH', sub, 12, s['group'], s['image'])
        struct.pack_into('<H', sub, 16, 0)
        sub[18] = 0 if i == 0 else 1
        body += sub + pcx
        if nxt: offset = nxt
    open(path, 'wb').write(bytes(hdr) + bytes(body))
