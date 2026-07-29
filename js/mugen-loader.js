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
    for(let raw of text.split(/\r?\n/)){
      const line = raw.replace(/;.*$/, '').trim();
      if(!line) continue;
      const head = line.match(/^\[\s*Begin\s+Action\s+(-?\d+)\s*\]$/i);
      if(head){ cur = { no:Number(head[1]), frames:[], loopStart:0 }; anims[cur.no] = cur; continue; }
      if(!cur) continue;
      if(/^loopstart$/i.test(line)){ cur.loopStart = cur.frames.length; continue; }
      if(/^(interpolate|clsn)/i.test(line)) continue;   // hitboxes : géré via CNS
      const p = line.split(',').map(s => s.trim());
      if(p.length >= 5 && /^-?\d+$/.test(p[0])){
        cur.frames.push({
          group:+p[0], image:+p[1], x:+p[2], y:+p[3], dur:+p[4],
          flip:(p[5]||'').toLowerCase(), alpha:p[6]||null
        });
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
  function indexedToCanvas(idx, w, h, pal){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for(let i = 0; i < idx.length; i++){
      const c = idx[i], o = i * 4;
      if(c === 0){ img.data[o+3] = 0; continue; }       // couleur 0 = transparente
      img.data[o]   = pal[c*3];
      img.data[o+1] = pal[c*3+1];
      img.data[o+2] = pal[c*3+2];
      img.data[o+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** Lit une banque SFF (v1 ou v2) → Map "group,image" → {canvas,x,y}. */
  async function parseSff(buf){
    const sig = String.fromCharCode(...buf.subarray(0, 11));
    if(sig !== 'ElecbyteSpr') throw new Error('SFF invalide');
    const verHi = buf[15];                     // 1 = SFF v1, 2 = SFF v2
    return verHi >= 2 ? parseSffV2(buf) : parseSffV1(buf);
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

  async function parseSffV2(buf){
    const sprites = new Map();
    const sprOff = rd.u32(buf, 36), sprCount = rd.u32(buf, 40);
    const palOff = rd.u32(buf, 44), palCount = rd.u32(buf, 48);
    const ldataOff = rd.u32(buf, 52);
    // palettes
    const palettes = [];
    for(let i = 0; i < palCount; i++){
      const o = palOff + i * 16;
      const dataOff = rd.u32(buf, o + 8), dataLen = rd.u32(buf, o + 12);
      const p = buf.subarray(ldataOff + dataOff, ldataOff + dataOff + dataLen);
      const rgb = new Uint8Array(768);
      for(let c = 0; c < 256 && c*4+2 < p.length; c++){
        rgb[c*3] = p[c*4]; rgb[c*3+1] = p[c*4+1]; rgb[c*3+2] = p[c*4+2];
      }
      palettes.push(rgb);
    }
    const jobs = [];
    for(let i = 0; i < sprCount; i++){
      const o = sprOff + i * 28;
      const group = rd.u16(buf, o), image = rd.u16(buf, o + 2);
      const w = rd.u16(buf, o + 4), h = rd.u16(buf, o + 6);
      const x = (rd.u16(buf, o + 8) << 16) >> 16, y = (rd.u16(buf, o + 10) << 16) >> 16;
      const palIdx = rd.u16(buf, o + 14);
      const dataOff = rd.u32(buf, o + 16), dataLen = rd.u32(buf, o + 20);
      const fmt = buf[o + 27];
      if(!dataLen || !w || !h) continue;
      const data = buf.subarray(ldataOff + dataOff, ldataOff + dataOff + dataLen);
      if(fmt === 0){                                   // RAW indexé
        const pal = palettes[palIdx] || palettes[0];
        if(pal && data.length >= w*h){
          try{ sprites.set(`${group},${image}`, { canvas:indexedToCanvas(data.subarray(0,w*h), w, h, pal), x, y }); }catch{}
        }
      } else if(fmt >= 10){                            // PNG (10/11/12)
        jobs.push((async () => {
          try{
            const blob = new Blob([data.slice(4)], { type:'image/png' });
            const bmp = await createImageBitmap(blob);
            sprites.set(`${group},${image}`, { canvas:bmp, x, y });
          }catch{ /* PNG illisible → ignoré */ }
        })());
      }
      // fmt 2/3/4 (RLE8/RLE5/LZ5) non décodés → sprite sauté
    }
    await Promise.all(jobs);
    return sprites;
  }

  // ─────────── Chargement complet d'un personnage ───────────
  async function loadCharacter(defUrl){
    const base = dirOf(defUrl);
    const def = parseIni(await fetchText(defUrl));
    const files = def['files'] || {};
    const info  = def['info']  || {};

    const out = {
      name: (info.displayname || info.name || 'Perso').replace(/^"|"$/g, ''),
      author: (info.author || '').replace(/^"|"$/g, ''),
      anims: {}, commands: [], constants: {}, sprites: new Map(),
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
    // CNS (constantes : vitesse, dégâts…)
    const cnsFile = files.cns || files.stcommon;
    if(cnsFile){
      try{ out.constants = parseIni(await fetchText(base + cnsFile)); }
      catch(e){ console.warn('[ChickenMugen] CNS:', e.message); }
    }
    // SFF (sprites)
    if(files.sprite){
      try{ out.sprites = await parseSff(await fetchBuffer(base + files.sprite)); }
      catch(e){ console.warn('[ChickenMugen] SFF:', e.message); }
    }
    return out;
  }

  window.ChickenMugen = {
    loadCharacter, parseIni, parseAir, parseCmd, parseSff,
    parseCommandString, decodePcx
  };
})();
