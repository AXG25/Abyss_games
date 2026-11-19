// Sella la versión: calcula un hash del código y reescribe index.html para que
// el CSS y TODOS los módulos JS se pidan con ?v=<hash> (mapa de importación).
// Así el celular nunca mezcla archivos viejos (de la caché) con nuevos.
// Uso: node tools/version.mjs   (antes de cada publicación)
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(root, 'css')), ...walk(join(root, 'js')), ...walk(join(root, 'vendor'))].sort();
const h = createHash('sha1');
for (const f of files) { h.update(relative(root, f)); h.update(readFileSync(f)); }
const v = h.digest('hex').slice(0, 10);
const js = files.filter((f) => f.endsWith('.js')).map((f) => relative(root, f));
const map = Object.fromEntries(js.map((f) => [`./${f}`, `./${f}?v=${v}`]));

const html = `<!DOCTYPE html>
<html lang="es" data-v="${v}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#2c3268">
<title>Abyss Games</title>
<meta name="apple-mobile-web-app-title" content="Abyss Games">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/styles.css?v=${v}">
<!-- versión ${v}: cada archivo se pide con ?v= para no mezclar versiones viejas de la caché -->
<script type="importmap">
${JSON.stringify({ imports: map }, null, 1)}
</script>
</head>
<body>
<div id="app">
  <div class="boot">Cargando la fiesta…</div>
</div>
<div id="toast" class="toast" hidden></div>
<!-- PeerJS: conexión entre celulares gratis (WebRTC) cuando no está alojada en Claude -->
<script src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"></script>
<script type="module" src="js/main.js?v=${v}"></script>
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), html);
writeFileSync(join(root, 'version.json'), JSON.stringify({ v }) + '\n');
console.log('versión', v, '·', js.length, 'módulos');
