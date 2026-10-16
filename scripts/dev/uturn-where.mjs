// Usage : node --import ./scripts/dev/register.mjs scripts/dev/uturn-where.mjs <départ> <minutes>
// Où sont les demi-tours des boucles générées (près d'un point de passage, du départ, ailleurs) ?
const { generateLoops, findUTurns } = await import('../../src/lib/loop.ts');
const { distanceM } = await import('../../src/lib/geo.ts');
const { attractors } = await import('./attractors.mjs');
const STARTS = { prado: [43.2655, 5.3805], pointerouge: [43.244, 5.373], cassis: [43.2148, 5.5378] };
const [name = 'cassis', minutes = '90'] = process.argv.slice(2);
const start = { latitude: STARTS[name][0], longitude: STARTS[name][1] };
const loops = await generateLoops({ start, target: { kind: 'duration', minutes: Number(minutes) }, curviness: 'twisty', avoidHighways: true, attractors: await attractors() });
for (const l of loops) {
  const u = findUTurns(l.route.points);
  console.log(`${l.id} : ${u.length} demi-tour(s)`);
  for (const p of u) {
    const dv = Math.min(...l.via.map((v) => distanceM(v, p)));
    console.log(`   ${p.latitude.toFixed(5)},${p.longitude.toFixed(5)} · ${Math.round(dv)} m du point de passage le plus proche · ${Math.round(distanceM(start, p))} m du départ`);
  }
}
