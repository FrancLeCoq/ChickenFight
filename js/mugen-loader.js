/* ══════════════════════════════════════════════════════════════
   ChickenMugen — chargeur de personnages Ikemen GO / M.U.G.E.N
   ---------------------------------------------------------------
   Lit les formats de données utilisés par Ikemen GO (moteur MIT) afin
   de faire combattre de vrais personnages dans le moteur web :

     .DEF  — fiche du perso (INI) : quels fichiers charger
     .AIR  — animations : suites de sprites + durées + offsets
     .CMD  — commandes (↓↘→ + coup) et déclencheurs
     .CNS  — constantes & états (vitesse, dégâts, frame data)
     .SFF  — banque de sprites binaire (v1 = PCX, v2 = RAW/PNG)

   Prise en charge des sprites :
     • SFF v1  : palette + PCX RLE                → OK
     • SFF v2  : sous-formats RAW(0) et PNG(10/11/12) → OK
     • SFF v2  : RLE8 / RLE5 / LZ5                → non décodés (ignorés)
   Les sprites non décodés sont simplement sautés : le reste du perso
   se charge quand même.

   Usage :
     const char = await ChickenMugen.loadCharacter('chars/kfm/kfm.def');
     char.anims[0]      → animation d'attente
     char.sprite(0,0)   → ImageBitmap/Canvas du sprite (groupe, image)
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ─────────── Utilitaires ───────────
  const dirOf = url => url.slice(0, url.lastIndexOf('/') + 1);

  async function fetchText(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    // Les fichiers MUGEN sont souvent en latin-1, pas en UTF-8.
    const buf = await r.arrayBuffer();
    return new TextDecoder('windows-1252').decode(buf);
  }
  async function fetchBuffer(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  /** Parse un fichier INI (DEF/CNS) → { section: { clé: valeur } }. */
  function parseIni(text){
    const out = {}; let cur = null;
    for(let raw of text.split(/\r?\n/)){
      const line = raw.replace(/;.*$/, '').trim();     // ';' = commentaire
      if(!line) continue;
      const sec = line.match(/^\[(.+)\]$/);
      if(sec){ cur = sec[1].trim().toLowerCase(); out[cur] ||= {}; continue; }
      const eq = line.indexOf('=');
      if(eq > 0 && cur){
        const k = line.slice(0, eq).trim().toLowerCase();
        out[cur][k] = line.slice(eq + 1).trim();
      }
    }
    return out;
  }

  // ─────────── .AIR : animations ───────────
  /**
   * Format d'une frame : group, image, offsetX, offsetY, duration [, flip [, blend]]
   * duration -1 = frame finale (animation bloquée dessus).
   * "Loopstart" marque le point de bouclage.
   */
  function parseAir(text){
    const anims = {}; let cur = null;
    // Boîtes de collision en attente : les blocs Clsn précèdent la frame
    // à laquelle ils s'appliquent. "Default" vaut pour toute l'animation.
    let pendHit = null, pendHurt = null, defHit = null, defHurt = null, fill = null;

    for(let raw of text.split(/\r?\n/)){
      const line = raw.replace(/;.*$/, '').trim();
      if(!line) continue;

      const head = line.match(/^\[\s*Begin\s+Action\s+(-?\d+)\s*\]$/i);
      if(head){
        cur = { no:Number(head[1]), frames:[], loopStart:0 };
        anims[cur.no] = cur;
        pendHit = pendHurt = defHit = defHurt = fill = null;
        continue;
      }
      if(!cur) continue;
      if(/^loopstart$/i.test(line)){ cur.loopStart = cur.frames.length; continue; }
      if(/^interpolate/i.test(line)) continue;

      // en-tête d'un bloc de boîtes : "Clsn1: 2", "Clsn2Default: 3".
      // Les boîtes qui suivent s'écrivent "Clsn2[0] = …" même sous un
      // en-tête Default : c'est donc l'en-tête qui fixe la destination.
      const hdr = line.match(/^Clsn([12])(Default)?\s*:\s*(\d+)/i);
      if(hdr){
        const list = [];
        if(hdr[2]){ if(hdr[1] === '1') defHit = list; else defHurt = list; }
        else      { if(hdr[1] === '1') pendHit = list; else pendHurt = list; }
        fill = list;
        continue;
      }
      // une boîte : "Clsn2[0] = -10, 0, 19,-80"
      const box = line.match(/^Clsn([12])(Default)?\s*\[\s*\d+\s*\]\s*=\s*(.+)$/i);
      if(box){
        const v = box[3].split(',').map(s => parseInt(s.trim(), 10));
        if(v.length >= 4 && v.every(n => !isNaN(n))){
          const rect = { x1:Math.min(v[0],v[2]), y1:Math.min(v[1],v[3]),
                         x2:Math.max(v[0],v[2]), y2:Math.max(v[1],v[3]) };
          if(fill) fill.push(rect);
        }
        continue;
      }

      const p = line.split(',').map(s => s.trim());
      if(p.length >= 5 && /^-?\d+$/.test(p[0])){
        cur.frames.push({
          group:+p[0], image:+p[1], x:+p[2], y:+p[3], dur:+p[4],
          flip:(p[5]||'').toLowerCase(), alpha:p[6]||null,
          // boîtes propres à la frame, sinon celles par défaut de l'animation
          hit:  pendHit  || defHit  || null,
          hurt: pendHurt || defHurt || null
        });
        pendHit = pendHurt = fill = null;   // consommées par cette frame
      }
    }
    return anims;
  }

  // ─────────── .CMD : commandes ───────────
  /** Convertit la notation MUGEN ("~D, DF, F, x") en étapes exploitables. */
  function parseCommandString(str){
    const NUM = { B:4, DB:1, D:2, DF:3, F:6, UF:9, U:8, UB:7 };
    return str.split(',').map(tok => {
      let t = tok.trim().replace(/[\/$]/g, '');       // '/'=maintenu, '$'=toute direction
      const release = t.startsWith('~'); if(release) t = t.slice(1);
      if(t.includes('+')) return t.split('+').map(s => mapToken(s.trim(), NUM));
      return mapToken(t, NUM);
    }).filter(Boolean);
  }
  function mapToken(t, NUM){
    const up = t.toUpperCase();
    if(NUM[up] !== undefined) return NUM[up];
    if(/^[XYZABC]$/i.test(t)) return t.toUpperCase();   // boutons MUGEN
    return null;
  }
  function parseCmd(text){
    const cmds = []; let cur = null;
    for(let raw of text.split(/\r?\n/)){
      const line = raw.replace(/;.*$/, '').trim();
      if(!line) continue;
      if(/^\[\s*Command\s*\]$/i.test(line)){ cur = {}; cmds.push(cur); continue; }
      if(/^\[/.test(line)){ cur = null; continue; }
      if(!cur) continue;
      const eq = line.indexOf('='); if(eq < 0) continue;
      const k = line.slice(0, eq).trim().toLowerCase(), v = line.slice(eq + 1).trim();
      if(k === 'name') cur.name = v.replace(/^"|"$/g, '');
      else if(k === 'command') cur.steps = parseCommandString(v);
      else if(k === 'time') cur.time = +v;
      else if(k === 'buffer.time') cur.buffer = +v;
    }
    return cmds.filter(c => c.name && c.steps?.length);
  }

  // ─────────── .SFF : sprites ───────────
  const rd = {
    u8:  (b,o)=> b[o],
    u16: (b,o)=> b[o] | (b[o+1]<<8),
    u32: (b,o)=> (b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0
  };

  /** Décode une image PCX 8 bits (RLE) avec une palette externe. */
  function decodePcx(data, pal){
    if(data.length < 128) return null;
    const bpl = rd.u16(data, 66);
    const xmin = rd.u16(data,4), ymin = rd.u16(data,6), xmax = rd.u16(data,8), ymax = rd.u16(data,10);
    const w = xmax - xmin + 1, h = ymax - ymin + 1;
    if(w <= 0 || h <= 0 || w > 4096 || h > 4096) return null;
    const idx = new Uint8Array(w * h);
    let p = 128;
    for(let y = 0; y < h; y++){
      let x = 0;
      while(x < bpl && p < data.length){
        let b = data[p++];
        let run = 1;
        if((b & 0xC0) === 0xC0){ run = b & 0x3F; b = data[p++]; }
        for(let i = 0; i < run && x < bpl; i++, x++) if(x < w) idx[y*w + x] = b;
      }
    }
    // palette : soit fournie (SFF partagée), soit à la fin du PCX (0x0C + 768o)
    let palette = pal;
    if(!palette && data.length >= 769 && data[data.length - 769] === 0x0C){
      palette = data.subarray(data.length - 768);
    }
    if(!palette) return null;
    return indexedToCanvas(idx, w, h, palette);
  }

  /** Transforme une image indexée + palette RGB en canvas (index 0 = transparent). */
  function indexedToCanvas(idx, w, h, pal, trns){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for(let i = 0; i < idx.length; i++){
      const c = idx[i], o = i * 4;
      // index 0 transparent (convention MUGEN), ou alpha issu du chunk tRNS
      if(c === 0 || (trns && trns[c] === 0)){ img.data[o+3] = 0; continue; }
      img.data[o]   = pal[c*3];
      img.data[o+1] = pal[c*3+1];
      img.data[o+2] = pal[c*3+2];
      img.data[o+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** Lit une banque SFF (v1 ou v2) → Map "group,image" → {canvas,x,y}. */
  async function parseSff(buf, forcePal, skin){
    const sig = String.fromCharCode(...buf.subarray(0, 11));
    if(sig !== 'ElecbyteSpr') throw new Error('SFF invalide');
    const verHi = buf[15];                     // 1 = SFF v1, 2 = SFF v2
    return verHi >= 2 ? parseSffV2(buf, forcePal, skin) : parseSffV1(buf);
  }

  function parseSffV1(buf){
    const sprites = new Map();
    const count = rd.u32(buf, 20);
    let off = rd.u32(buf, 24);
    let sharedPal = null;
    const raw = [];
    for(let i = 0; i < count && off > 0 && off < buf.length; i++){
      const next = rd.u32(buf, off);
      const len  = rd.u32(buf, off + 4);
      const x    = (rd.u16(buf, off + 8)  << 16) >> 16;
      const y    = (rd.u16(buf, off + 10) << 16) >> 16;
      const group= rd.u16(buf, off + 12);
      const image= rd.u16(buf, off + 14);
      const linked = rd.u16(buf, off + 16);
      const samePal = buf[off + 18];
      const data = len > 0 ? buf.subarray(off + 32, off + 32 + len) : null;
      raw.push({ group, image, x, y, data, linked, samePal, idx:i });
      if(i === 0 && data && data.length >= 769 && data[data.length-769] === 0x0C)
        sharedPal = data.subarray(data.length - 768);
      if(next === 0 || next <= off) break;
      off = next;
    }
    for(const s of raw){
      let d = s.data;
      if((!d || d.length === 0) && s.linked < raw.length) d = raw[s.linked]?.data;  // sprite lié (copie)
      if(!d) continue;
      try{
        const cv = decodePcx(d, s.samePal ? sharedPal : null) || decodePcx(d, sharedPal);
        if(cv) sprites.set(`${s.group},${s.image}`, { canvas:cv, x:s.x, y:s.y });
      }catch{ /* sprite illisible → ignoré */ }
    }
    return sprites;
  }

  // ── Décompresseurs SFF v2 ──────────────────────────────────────
  // Portés fidèlement depuis Ikemen GO (src/image.go, licence MIT).

  function rle8Decode(rle, size){
    const p = new Uint8Array(size);
    if(!rle.length) return p;
    let i = 0, j = 0;
    while(j < size){
      let n = 1, d = rle[i];
      if(i < rle.length-1) i++;
      if((d & 0xc0) === 0x40){
        n = d & 0x3f;
        d = rle[i];
        if(i < rle.length-1) i++;
      }
      for(; n > 0; n--){ if(j < size) p[j++] = d; }
    }
    return p;
  }

  function rle5Decode(rle, size){
    const p = new Uint8Array(size);
    if(!rle.length) return p;
    let i = 0, j = 0;
    while(j < size){
      let rl = rle[i];
      if(i < rle.length-1) i++;
      let dl = rle[i] & 0x7f;
      let c = 0;
      if(rle[i] >> 7 !== 0){
        if(i < rle.length-1) i++;
        c = rle[i];
      }
      if(i < rle.length-1) i++;
      for(;;){
        if(j < size) p[j++] = c;
        rl--;
        if(rl < 0){
          dl--;
          if(dl < 0) break;
          c = rle[i] & 0x1f;
          rl = rle[i] >> 5;
          if(i < rle.length-1) i++;
        }
      }
    }
    return p;
  }

  function lz5Decode(rle, size){
    const p = new Uint8Array(size);
    if(!rle.length) return p;
    let i = 0, j = 0, n = 0;
    let ct = rle[i], cts = 0, rb = 0, rbc = 0;
    if(i < rle.length-1) i++;
    while(j < size){
      let d = rle[i];
      if(i < rle.length-1) i++;
      if(ct & (1 << cts)){
        // paquet LZ : recopie une séquence déjà écrite
        if((d & 0x3f) === 0){
          d = ((d << 2 | rle[i]) + 1) & 0xffff;
          if(i < rle.length-1) i++;
          n = rle[i] + 2;
          if(i < rle.length-1) i++;
        } else {
          rb |= (d & 0xc0) >> rbc;
          rbc += 2;
          n = d & 0x3f;
          if(rbc < 8){
            d = rle[i] + 1;
            if(i < rle.length-1) i++;
          } else {
            d = rb + 1;
            rb = 0; rbc = 0;
          }
        }
        for(;;){
          if(j < size && j - d >= 0){ p[j] = p[j-d]; j++; }
          else if(j < size){ j++; }
          n--;
          if(n < 0) break;
        }
      } else {
        // paquet RLE : répète une couleur
        if((d & 0xe0) === 0){
          n = rle[i] + 8;
          if(i < rle.length-1) i++;
        } else {
          n = d >> 5;
          d &= 0x1f;
        }
        for(; n > 0; n--){ if(j < size) p[j++] = d; }
      }
      cts++;
      if(cts >= 8){
        ct = rle[i]; cts = 0;
        if(i < rle.length-1) i++;
      }
    }
    return p;
  }

  // ── PNG à palette (SFF v2, format 10) ──────────────────────────
  // Ces PNG portent des INDEX, pas des couleurs : leur palette interne est
  // souvent nulle (tout noir) et ce sont les palettes du SFF qui font foi
  // (même logique que png.Decode + pi.Pix côté Ikemen GO). Il faut donc
  // décoder le PNG soi-même pour récupérer les index.
  async function decodeIndexedPng(png, pal, expectW, expectH){
    // 1) lecture des chunks
    let p = 8, w = 0, h = 0, depth = 0, colorType = -1, idat = [], trns = null;
    while(p < png.length - 8){
      const len = (png[p]<<24 | png[p+1]<<16 | png[p+2]<<8 | png[p+3]) >>> 0;
      const type = String.fromCharCode(png[p+4], png[p+5], png[p+6], png[p+7]);
      const data = png.subarray(p+8, p+8+len);
      if(type === 'IHDR'){
        w = (data[0]<<24|data[1]<<16|data[2]<<8|data[3])>>>0;
        h = (data[4]<<24|data[5]<<16|data[6]<<8|data[7])>>>0;
        depth = data[8]; colorType = data[9];
      }
      else if(type === 'IDAT') idat.push(data);
      else if(type === 'tRNS') trns = data;
      else if(type === 'IEND') break;
      p += 12 + len;
    }
    if(colorType !== 3 || depth !== 8) return null;      // non paletté → voie normale

    // 2) décompression zlib
    const total = idat.reduce((s,a)=>s+a.length, 0);
    const z = new Uint8Array(total);
    let off = 0; for(const a of idat){ z.set(a, off); off += a.length; }
    let raw;
    try{
      const ds = new DecompressionStream('deflate');
      raw = new Uint8Array(await new Response(
        new Blob([z]).stream().pipeThrough(ds)
      ).arrayBuffer());
    }catch{ return null; }

    // 3) dé-filtrage des lignes (1 octet par pixel en mode paletté 8 bits)
    const idx = new Uint8Array(w*h);
    let sp = 0;
    for(let y = 0; y < h; y++){
      const filter = raw[sp++];
      const row = y*w, prev = (y-1)*w;
      for(let x = 0; x < w; x++){
        const cur = raw[sp++] || 0;
        const a = x > 0 ? idx[row + x - 1] : 0;
        const b = y > 0 ? idx[prev + x] : 0;
        const c = (x > 0 && y > 0) ? idx[prev + x - 1] : 0;
        let v;
        switch(filter){
          case 0: v = cur; break;
          case 1: v = cur + a; break;
          case 2: v = cur + b; break;
          case 3: v = cur + ((a + b) >> 1); break;
          case 4: {                                   // Paeth
            const pp = a + b - c, pa = Math.abs(pp-a), pb = Math.abs(pp-b), pc = Math.abs(pp-c);
            v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            break;
          }
          default: v = cur;
        }
        idx[row + x] = v & 0xff;
      }
    }
    if(expectW && expectH && (w !== expectW || h !== expectH)) { /* on garde quand même */ }
    return indexedToCanvas(idx, w, h, pal, trns);
  }

  async function parseSffV2(buf, forcePal, skin){
    const sprites = new Map();
    const sprOff = rd.u32(buf, 36), sprCount = rd.u32(buf, 40);
    const palOff = rd.u32(buf, 44), palCount = rd.u32(buf, 48);
    const ldataOff = rd.u32(buf, 52);

    // Palettes : 4 octets par couleur (RGBA) dans le bloc de données.
    const palettes = [];
    for(let i = 0; i < palCount; i++){
      const o = palOff + i * 16;
      const dataOff = rd.u32(buf, o + 8), dataLen = rd.u32(buf, o + 12);
      const p = buf.subarray(ldataOff + dataOff, ldataOff + dataOff + dataLen);
      const rgb = new Uint8Array(768);
      for(let c = 0; c < 256 && c*4+2 < p.length; c++){
        rgb[c*3] = p[c*4]; rgb[c*3+1] = p[c*4+1]; rgb[c*3+2] = p[c*4+2];
      }
      // Tenue ninja : le kimono blanc et les bleus (bandeau, chaussures)
      // passent au noir. Sans cela, le personnage resterait en blanc.
      if(skin === 'ninja'){
        const dark = [[38,38,44],[28,28,34],[20,20,25],[14,14,18]];
        [16,17,18,19,20,21].forEach((i,k)=>{ const c=dark[Math.min(k,3)]; rgb[i*3]=c[0]; rgb[i*3+1]=c[1]; rgb[i*3+2]=c[2]; });
        [22,23,24,25].forEach((i,k)=>{ const c=dark[Math.min(k,3)]; rgb[i*3]=c[0]; rgb[i*3+1]=c[1]; rgb[i*3+2]=c[2]; });
      }
      // Teinte de peau : remplace les tons chair (index 26-29 chez KFM).
      if(skin && SKINS[skin]){
        SKINS[skin].forEach((c, k) => { const i = 26 + k; rgb[i*3]=c[0]; rgb[i*3+1]=c[1]; rgb[i*3+2]=c[2]; });
      }
      palettes.push(rgb);
    }

    const jobs = [];
    const metas = [];
    for(let i = 0; i < sprCount; i++){
      const o = sprOff + i * 28;
      metas.push({
        group: rd.u16(buf, o), image: rd.u16(buf, o + 2),
        w: rd.u16(buf, o + 4), h: rd.u16(buf, o + 6),
        x: (rd.u16(buf, o + 8) << 16) >> 16, y: (rd.u16(buf, o + 10) << 16) >> 16,
        linked: rd.u16(buf, o + 12),
        fmt: buf[o + 14], depth: buf[o + 15],
        dataOff: rd.u32(buf, o + 16), dataLen: rd.u32(buf, o + 20),
        pal: rd.u16(buf, o + 24)
      });
    }

    for(const m of metas){
      if(!m.w || !m.h) continue;
      // Sprite lié : réutilise les données de la source (copie).
      const src = m.dataLen === 0 && metas[m.linked] ? metas[m.linked] : m;
      if(!src.dataLen) continue;
      const start = ldataOff + src.dataOff;
      // Palette forcée : même sprites, couleurs différentes.
      const pal = (forcePal != null && palettes[forcePal]) || palettes[m.pal] || palettes[0];

      if(src.fmt === 0){                                  // RAW indexé
        const data = buf.subarray(start, start + src.dataLen);
        if(pal && data.length >= m.w*m.h)
          try{ sprites.set(`${m.group},${m.image}`, { canvas:indexedToCanvas(data.subarray(0, m.w*m.h), m.w, m.h, pal), x:m.x, y:m.y }); }catch{}
      } else if(src.fmt >= 2 && src.fmt <= 4){            // RLE8 / RLE5 / LZ5
        // Les formats compressés sont précédés de 4 octets (taille décompressée).
        const comp = buf.subarray(start + 4, start + Math.max(4, src.dataLen));
        const size = m.w * m.h;
        let px = null;
        try{
          px = src.fmt === 2 ? rle8Decode(comp, size)
             : src.fmt === 3 ? rle5Decode(comp, size)
             : lz5Decode(comp, size);
        }catch{ px = null; }
        if(px && pal)
          try{ sprites.set(`${m.group},${m.image}`, { canvas:indexedToCanvas(px, m.w, m.h, pal), x:m.x, y:m.y }); }catch{}
      } else if(src.fmt >= 10){                           // PNG (10/11/12)
        const data = buf.subarray(start + 4, start + src.dataLen);
        jobs.push((async () => {
          try{
            // fmt 10 = PNG à palette : les couleurs viennent du SFF.
            if(src.fmt === 10 && pal){
              const cv = await decodeIndexedPng(data, pal, m.w, m.h);
              if(cv){ sprites.set(`${m.group},${m.image}`, { canvas:cv, x:m.x, y:m.y }); return; }
            }
            const bmp = await createImageBitmap(new Blob([data], { type:'image/png' }));
            sprites.set(`${m.group},${m.image}`, { canvas:bmp, x:m.x, y:m.y });
          }catch{ /* PNG illisible → ignoré */ }
        })());
      }
    }
    await Promise.all(jobs);
    return sprites;
  }

  // ─────────── Chargement complet d'un personnage ───────────
  /**
   * Charge un personnage en forçant une palette donnée.
   * C'est la méthode MUGEN classique pour obtenir des combattants
   * visuellement distincts à partir des mêmes sprites.
   */
  async function loadCharacterPal(defUrl, palIndex){
    const c = await loadCharacter(defUrl, palIndex);
    return c;
  }

  // Teintes de peau : on remplace les tons chair de la palette. Les index
  // 26 à 29 de Kung Fu Man vont du plus clair au plus foncé.
  const SKINS = {
    black: [[92,58,38],[74,45,29],[56,33,21],[38,22,14]],
    // Ninja : peau très sombre (les vêtements sont traités à part).
    ninja: [[62,44,38],[48,33,28],[34,22,19],[22,14,12]],
    asian: [[247,214,160],[224,181,120],[186,140,86],[130,92,54]],
    pale:  [[255,232,210],[240,205,178],[206,164,134],[150,110,84]]
  };
  async function loadCharacter(defUrl, forcePal, skin){
    const base = dirOf(defUrl);
    const def = parseIni(await fetchText(defUrl));
    const files = def['files'] || {};
    const info  = def['info']  || {};

    const out = {
      name: (info.displayname || info.name || 'Perso').replace(/^"|"$/g, ''),
      author: (info.author || '').replace(/^"|"$/g, ''),
      anims: {}, commands: [], constants: {}, states: {}, sprites: new Map(),
      sprite(group, image){ return this.sprites.get(`${group},${image}`) || null; }
    };

    // AIR (animations)
    if(files.anim){
      try{ out.anims = parseAir(await fetchText(base + files.anim)); }
      catch(e){ console.warn('[ChickenMugen] AIR:', e.message); }
    }
    // CMD (commandes)
    if(files.cmd){
      try{ out.commands = parseCmd(await fetchText(base + files.cmd)); }
      catch(e){ console.warn('[ChickenMugen] CMD:', e.message); }
    }
    // CNS : constantes (INI) + états exécutables (interprétés par ChickenCns)
    const cnsFile = files.cns || files.stcommon;
    if(cnsFile){
      try{
        const txt = await fetchText(base + cnsFile);
        out.constants = parseIni(txt);
        if(window.ChickenCns) out.states = window.ChickenCns.parseCns(txt);
      }
      catch(e){ console.warn('[ChickenMugen] CNS:', e.message); }
    }
    // Fichiers d'états additionnels (st, st1, st2… chez beaucoup de persos)
    for(const k of ['st','st1','st2','st3']){
      if(!files[k] || !window.ChickenCns) continue;
      try{
        const extra = window.ChickenCns.parseCns(await fetchText(base + files[k]));
        out.states = Object.assign(out.states || {}, extra);
      }catch{ /* fichier absent → ignoré */ }
    }
    // SFF (sprites)
    if(files.sprite){
      try{ out.sprites = await parseSff(await fetchBuffer(base + files.sprite), forcePal, skin); }
      catch(e){ console.warn('[ChickenMugen] SFF:', e.message); }
    }
    return out;
  }

  // ─────────── Lecteur d'animations (.AIR) ───────────
  /**
   * Joue une animation MUGEN : avance dans les frames selon leur durée,
   * gère le bouclage sur "Loopstart" et les frames finales (durée -1).
   */
  class Animator {
    constructor(character){ this.char = character; this.anim = null; this.no = -1; this.i = 0; this.t = 0; }

    /** Change d'animation. force=true redémarre même si c'est la même. */
    play(no, force=false){
      if(this.no === no && !force) return;
      const a = this.char.anims[no];
      if(!a || !a.frames.length) return;          // animation absente → on garde l'actuelle
      this.no = no; this.anim = a; this.i = 0; this.t = 0; this.done = false;
    }

    /** Avance d'une frame de jeu. Renvoie true si l'animation est terminée. */
    tick(){
      if(!this.anim) return true;
      const f = this.anim.frames[this.i];
      if(!f) return true;
      if(f.dur < 0){ this.done = true; return true; }   // frame finale : on reste dessus
      this.t++;
      if(this.t >= f.dur){
        this.t = 0;
        this.i++;
        if(this.i >= this.anim.frames.length){
          this.i = this.anim.loopStart || 0;      // bouclage
          this.done = true;                       // un cycle complet est passé
          return true;
        }
      }
      return false;
    }

    /** Frame courante : { sprite, x, y, flip, hit, hurt } ou null. */
    current(){
      if(!this.anim) return null;
      const f = this.anim.frames[this.i];
      if(!f) return null;
      const s = this.char.sprite(f.group, f.image);
      if(!s) return null;
      // groupKey identifie le sprite : sert aux calques posés par-dessus
      // (voir l'habillage "tête de coq" du moteur).
      // hit/hurt : les boîtes Clsn1/Clsn2 du .air. Sans elles, le moteur
      // retombe sur une portée approximative et les coups ne portent plus.
      return { sprite:s, x:f.x, y:f.y, flip:f.flip || '', groupKey:`${f.group},${f.image}`,
               hit:f.hit || null, hurt:f.hurt || null };
    }

    /** true si l'animation a fait au moins un tour complet. */
    get finished(){
      if(!this.anim) return true;
      const last = this.anim.frames[this.anim.frames.length-1];
      return this.i >= this.anim.frames.length-1 && (last?.dur < 0 || this.t >= (last?.dur||1));
    }
  }

  // Numéros d'animation standard MUGEN (respectés par la quasi-totalité des persos).
  const ANIM = {
    stand:0, crouch:11, walkFwd:20, walkBack:21,
    jumpStart:40, jumpUp:41, jumpDown:43, landing:47,
    guardStand:130, guardCrouch:131, guardAir:132,
    hitHigh:5000, hitLow:5010, fall:5030, down:5110, getUp:5120,
    lightPunch:200, strongPunch:210, lightKick:230, strongKick:240,
    crouchPunch:400, crouchKick:430,
    special:1000, super:3000, win:180, lose:170, intro:190
  };

  window.ChickenMugen = {
    loadCharacter, loadCharacterPal, parseIni, parseAir, parseCmd, parseSff,
    parseCommandString, decodePcx, Animator, ANIM,
    rle8Decode, rle5Decode, lz5Decode
  };
})();
