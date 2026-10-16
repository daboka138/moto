// Usage : node --import ./scripts/dev/register.mjs scripts/dev/loops-map.mjs <départ> <minutes> <sortie.html>
// Carte Leaflet des boucles générées (tracés, points de passage), pour vérifier à l'œil.
import { writeFileSync } from 'node:fs';
const t0 = Date.now();
const { generateLoops } = await import('../../src/lib/loop.ts');
const STARTS = { prado: [43.2655, 5.3805], pointerouge: [43.244, 5.373], cassis: [43.2148, 5.5378] };
const [name = 'prado', minutes = '60', out = 'loops.html'] = process.argv.slice(2);
const [lat, lng] = STARTS[name];
const loops = await generateLoops({ start: { latitude: lat, longitude: lng }, target: { kind: 'duration', minutes: Number(minutes) }, curviness: 'twisty', avoidHighways: true });
const colors = ['#e11d48', '#2563eb', '#16a34a'];
const data = loops.map((l, i) => ({ color: colors[i], pts: l.route.points.filter((_, k) => k % 3 === 0).map((p) => [p.latitude, p.longitude]), via: l.via.map((p) => [p.latitude, p.longitude]), label: `${i + 1}: ${(l.route.distanceM / 1000).toFixed(0)} km, ≈${l.durationMin} min, sinuosité ${l.score}, urbain ${l.urban == null ? '?' : Math.round(l.urban * 100) + ' %'}, overlap ${Math.round(l.overlap * 100)} %, sortie de ville ${l.exitKm == null ? '?' : l.exitKm.toFixed(1) + ' km'}` }));
writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>html,body,#m{margin:0;height:100%}#l{position:absolute;z-index:999;top:8px;left:50px;background:#fff;padding:6px 10px;font:14px sans-serif;border-radius:8px}</style></head><body><div id="m"></div><div id="l"></div><script>
const D=${JSON.stringify(data)};const m=L.map('m',{zoomSnap:0.25});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
const b=L.latLngBounds([[${lat},${lng}]]);D.forEach(d=>{L.polyline(d.pts,{color:d.color,weight:4,opacity:.8}).addTo(m);d.pts.forEach(p=>b.extend(p));d.via.forEach(v=>L.circleMarker(v,{radius:6,color:d.color,fillOpacity:1}).addTo(m))});
L.circleMarker([${lat},${lng}],{radius:9,color:'#000',fillColor:'#facc15',fillOpacity:1}).addTo(m);m.fitBounds(b,{padding:[20,20]});
document.getElementById('l').innerHTML='<b>${name} ${minutes} min</b><br>'+D.map(d=>'<span style="color:'+d.color+'">■</span> '+d.label).join('<br>');
</script></body></html>`);
console.log(data.map((d) => d.label).join('\n'));
