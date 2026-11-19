// 🌀 Trompos de batalla — tiempo real (3D). Cada jugador es un trompo de
// combate girando en un estadio que se va encogiendo. Choca con los demás y
// usa ¡ATACA! para embestirlos y sacarlos del estadio. 3 vidas.
//
// Cada teléfono calcula los golpes que recibe SU trompo a partir de las
// posiciones de los demás (que incluyen si vienen atacando).
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 40;
const LIVES = 3;
const PR = 0.075;
const radiusAt = (t) => Math.max(0.5, 0.9 - Math.max(0, t - 8) * 0.0135);

const G = {
  TOTAL, LIVES, lives: LIVES, PR,
  action: '¡ATACA!',
  fallText: '{sparkle} ¡Fuera del estadio!',
  music: 'battle',

  world() { return {}; },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    const p = newPlayerBase(Math.cos(a) * 0.5, Math.sin(a) * 0.5, LIVES);
    // empiezan girando alrededor del centro, como al lanzarlos
    Object.assign(p, { vx: -Math.sin(a) * 0.4, vy: Math.cos(a) * 0.4, fall: 0, push: 0, pcd: 0, scale: 1 });
    return p;
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    let ev = null;
    if (p.fall > 0) {
      p.fall -= DT;
      p.scale = Math.max(0, p.fall / 0.8);
      if (p.fall <= 0) {
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        p.x = 0; p.y = 0; p.vx = 0.3; p.vy = 0; p.scale = 1; p.inv = 1.5;
      }
      return null;
    }
    // embestida
    if (p.act && p.pcd <= 0) {
      let dx = inp.x, dy = inp.y;
      if (Math.hypot(dx, dy) < 0.2) { dx = p.ldx || p.vx || 0; dy = p.ldy || p.vy || 1; }
      const l = Math.hypot(dx, dy) || 1;
      p.vx += (dx / l) * 1.7; p.vy += (dy / l) * 1.7;
      p.push = 0.32; p.pcd = 1.1;
      ev = 'act';
    }
    p.act = false;
    if (p.push > 0) p.push -= DT;
    if (p.pcd > 0) p.pcd -= DT;
    if (p.inv > 0) p.inv -= DT;
    const il = Math.hypot(inp.x, inp.y);
    if (il > 0.2) { p.ldx = inp.x / il; p.ldy = inp.y / il; }
    p.vx += inp.x * 3.2 * DT;
    p.vy += inp.y * 3.2 * DT;
    // el estadio es cóncavo: empuja suavemente hacia el centro
    p.vx -= p.x * 0.9 * DT;
    p.vy -= p.y * 0.9 * DT;
    const fr = Math.pow(0.18, DT);
    p.vx *= fr; p.vy *= fr;
    const sp = Math.hypot(p.vx, p.vy), max = p.push > 0 ? 2.3 : 0.8;
    if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
    // choques (cada uno se mueve a sí mismo)
    if (ext && ext.all && p.inv <= 0) {
      for (const o of ext.all) {
        if (!o || o === p || o.id === p.id || o.out) continue;
        if (o.fall > 0 || (o.e && o.e.f !== undefined) || o.inv > 0) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d, ny = dy / d;
        const theyPush = o.push > 0 || (o.e && o.e.p) || o.d;
        const mePush = p.push > 0;
        // rebote metálico: siempre rebotan; el que embiste sale menos despedido
        const k = theyPush ? (mePush ? 1.4 : 2.4) : (mePush ? 0.5 : 1.1);
        if (!p._clash || p._clash <= 0) {
          p.vx += nx * k;
          p.vy += ny * k;
          p._clash = 0.12;
          if (theyPush && !mePush) ev = ev || 'hit';
        }
        const over = PR * 2 - d;
        p.x += nx * over * 0.5; p.y += ny * over * 0.5;
      }
    }
    if (p._clash > 0) p._clash -= DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (Math.hypot(p.x, p.y) > radiusAt(t) + PR * 0.2 && p.inv <= 0) {
      p.h--;
      p.fall = 0.8;
      return 'fall';
    }
    if (p.inv > 0) {
      const r = Math.hypot(p.x, p.y), m = radiusAt(t) - PR;
      if (r > m) { p.x *= m / r; p.y *= m / r; }
    }
    return ev;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x2545f491 * (idx + 1))) >>> 0);
    const aggro = 0.45 + r() * 0.4;
    let wob = r() * TAU;
    return (p, t, ext) => {
      wob += DT * (0.8 + r() * 0.4);
      const R = radiusAt(t);
      const pr = Math.hypot(p.x, p.y);
      if (pr > R - 0.22) return { x: -p.x / pr, y: -p.y / pr };
      let best = null, bd = 9;
      if (ext && ext.all) {
        for (const o of ext.all) {
          if (!o || o.id === p.id || o.out) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < bd) { bd = d; best = o; }
        }
      }
      if (!best) return { x: Math.cos(wob) * 0.4, y: Math.sin(wob) * 0.4 };
      const dx = best.x - p.x, dy = best.y - p.y, l = Math.hypot(dx, dy) || 1;
      if (l < 0.34 && p.pcd <= 0 && r() < aggro * 0.08) p.act = true;
      return { x: (dx / l) * 0.8 * aggro + Math.cos(wob) * 0.25, y: (dy / l) * 0.8 * aggro + Math.sin(wob) * 0.25 };
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),
  pack: (p) => {
    const o = {};
    if (p.push > 0) o.p = 1;
    if (p.fall > 0) o.f = Math.round(p.scale * 100) / 100;
    return o;
  },

  banner(t) {
    if (t < 1.2) return { text: '3, 2, 1… ¡LANZA!', color: '#f72585' };
    if (t > 8 && t < 9.6) return { text: '{warn} ¡El estadio se encoge!', color: '#7209b7' };
    return null;
  },

  // ---- eventos: choques con chispas y sonido metálico
  events(t0, t1, W, ext, ents, fx) {
    const st = fx.st;
    if (t0 === 0 && !st.launched) { st.launched = true; fx.sfx.launch(); }
    if (t0 < 8 && t1 >= 8) fx.sfx.warn();
    st.pairs = st.pairs || new Map();
    const live = ents.filter((e) => e && !e.out && !(e.fall > 0) && !(e.e && e.e.f !== undefined));
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > PR * 2.15) continue;
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (t1 - (st.pairs.get(key) ?? -9) < 0.3) continue;
        st.pairs.set(key, t1);
        const mine = a === fx.me || b === fx.me;
        const strong = a.push > 0 || b.push > 0 || a.d || b.d || (a.e && a.e.p) || (b.e && b.e.p);
        fx.sfx.clang(mine ? 1 : 0.5);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        fx.burst(mx, 0.08, my, { n: strong ? 40 : 20, color: ['#ffd60a', '#ffffff', '#ff9f1c'], speed: strong ? 1.4 : 0.9, up: 0.8, size: 0.035, life: 0.45, gravity: 3, drag: 2 });
        if (mine) fx.shake(strong ? 0.06 : 0.03);
      }
    }
  },

  // ---- 3D: estadio y trompos
  scene3d: {
    sky: '#10002b',
    hemiSky: '#c77dff',
    hemiGround: '#240046',
    camElev: 55,
    charScale: 1.3,
    splashColor: ['#c77dff', '#ffffff', '#7209b7'],
    trailColor: ['#ff9f1c', '#ffd60a', '#ff006e'],
    setup(S) {
      const { THREE, scene } = S;
      // piso del estadio con textura de líneas de neón
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256);
      gr.addColorStop(0, '#3c096c'); gr.addColorStop(1, '#10002b');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(199,125,255,0.6)'; g.lineWidth = 4;
      for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(256, 256, i * 60, 0, Math.PI * 2); g.stroke(); }
      for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); g.stroke(); }
      g.fillStyle = '#f72585'; g.beginPath(); g.arc(256, 256, 22, 0, Math.PI * 2); g.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const side = new THREE.MeshStandardMaterial({ color: '#5a189a', metalness: 0.6, roughness: 0.35 });
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.85, 0.25, 64), [side, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.4 }), side]);
      floor.position.y = -0.125;
      floor.receiveShadow = true;
      scene.add(floor);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 10, 80), new THREE.MeshStandardMaterial({ color: '#f72585', emissive: '#f72585', emissiveIntensity: 1.4 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.01;
      scene.add(rim);
      // abismo con brillo
      const abyss = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshBasicMaterial({ color: '#240046' }));
      abyss.rotation.x = -Math.PI / 2;
      abyss.position.y = -1.2;
      scene.add(abyss);
      // reflectores
      const spot = new THREE.PointLight('#c77dff', 3, 4);
      spot.position.set(0, 1.2, 0);
      scene.add(spot);
      // gradas lejanas
      const standMat = new THREE.MeshStandardMaterial({ color: '#3c096c', roughness: 0.9 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5 + (i % 3) * 0.15, 0.3), standMat);
        m.position.set(Math.cos(a) * 3.2, -0.4, Math.sin(a) * 3.2);
        m.lookAt(0, -0.4, 0);
        scene.add(m);
      }
      Object.assign(S.objs, { floor, rim, spot });
    },
    update(S, t) {
      const R = radiusAt(t);
      S.objs.floor.scale.set(R, 1, R);
      S.objs.rim.scale.set(R, R, 1);
      S.objs.rim.material.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.4;
    },
    // trompo de batalla en vez de muñequito
    makeAvatar(S, e, U) {
      const { THREE } = S;
      const color = new THREE.Color(e.c || '#ffffff');
      const root = new THREE.Group();
      const top = new THREE.Group();
      root.add(top);
      const metal = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.85, roughness: 0.25 });
      const body = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 });
      const dark = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.45), metalness: 0.5, roughness: 0.4 });
      const cast = (m) => { m.castShadow = true; return m; };
      // punta
      const tip = cast(new THREE.Mesh(new THREE.ConeGeometry(0.32 * U, 0.7 * U, 16), metal));
      tip.rotation.x = Math.PI;
      tip.position.y = 0.35 * U;
      top.add(tip);
      // disco de peso metálico
      const disk = cast(new THREE.Mesh(new THREE.CylinderGeometry(1.15 * U, 1.0 * U, 0.3 * U, 24), metal));
      disk.position.y = 0.8 * U;
      top.add(disk);
      // anillo de ataque con aspas
      const ring = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.95 * U, 1.05 * U, 0.35 * U, 24), body));
      ring.position.y = 1.1 * U;
      top.add(ring);
      for (let i = 0; i < 3; i++) {
        const blade = cast(new THREE.Mesh(new THREE.BoxGeometry(0.75 * U, 0.3 * U, 0.35 * U), dark));
        const a = (i / 3) * Math.PI * 2;
        blade.position.set(Math.cos(a) * 1.15 * U, 1.05 * U, Math.sin(a) * 1.15 * U);
        blade.rotation.y = -a + 0.5;
        top.add(blade);
      }
      // centro (bit) con brillo
      const bit = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.45 * U, 0.55 * U, 0.35 * U, 16), dark));
      bit.position.y = 1.42 * U;
      top.add(bit);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.28 * U, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.1 }));
      gem.position.y = 1.62 * U;
      top.add(gem);
      // aro de velocidad (se ve cuando ataca)
      const speedRing = new THREE.Mesh(new THREE.TorusGeometry(1.45 * U, 0.06 * U, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffd60a', transparent: true, opacity: 0, depthWrite: false }));
      speedRing.rotation.x = Math.PI / 2;
      speedRing.position.y = 1.0 * U;
      root.add(speedRing);
      // el piloto: cabeza 3D del personaje sobre el trompo (no gira con él)
      const headObj = S.makeHead(e.a || 'frog', 0.62 * U);
      const headY = 2.35 * U;
      headObj.group.position.y = headY;
      root.add(headObj.group);
      const ghostM = S.makeGhost(0.8 * U);
      ghostM.position.y = 1.4 * U;
      ghostM.visible = false;
      root.add(ghostM);
      return {
        root, rig: top, headObj, ghostM, headY, height: headY + 0.9 * U, U, legs: [], arms: [],
        update(en, dt, t, a, s) {
          const fast = s.dashing ? 2.2 : 1;
          a.spinA = (a.spinA || 0) + dt * 28 * fast;
          top.rotation.y = a.spinA;
          // bamboleo: más cuando lo golpean o se cae
          const wob = (s.inv ? 0.35 : 0.06) + (s.scale < 0.98 ? 0.6 : 0);
          top.rotation.x = Math.sin(t * 9) * wob;
          top.rotation.z = Math.cos(t * 9) * wob;
          speedRing.material.opacity = s.dashing ? 0.7 : 0;
          speedRing.rotation.z = -a.spinA * 0.5;
          gem.material.emissiveIntensity = s.dashing ? 2 : 0.9;
          const blink = s.inv && Math.floor(t * 12) % 2;
          top.visible = !s.ghost && !blink;
          headObj.group.visible = !s.ghost;
          // la cabeza se tambalea con el trompo y mira hacia donde va
          headObj.group.rotation.x = top.rotation.x * 0.5 - 0.15;
          headObj.group.rotation.z = top.rotation.z * 0.5;
          headObj.group.position.y = headY + Math.sin(t * 20) * 0.02 * U;
        },
      };
    },
  },

  draw(g, v, t, W, ents, meId) {
    const { size, c, R } = v;
    g.fillStyle = '#10002b'; g.fillRect(0, 0, size, size);
    const pr = radiusAt(t) * R;
    g.beginPath(); g.arc(c, c, pr, 0, TAU); g.fillStyle = '#3c096c'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#f72585'; g.stroke();
    for (const e of ents) {
      if (e.out) continue;
      const scale = e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1);
      drawPlayer(g, v, { ...e, pr: PR, scale }, meId, t);
    }
  },
};

export default {
  id: 'sumo',
  name: 'Trompos de batalla',
  realtime: true,
  desc: '¡Eres un trompo de combate! Choca contra los demás y usa ¡ATACA! para embestirlos y sacarlos del estadio, que se va encogiendo. 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, { ...G, endWhenOneLeft: true }),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
