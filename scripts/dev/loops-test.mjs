// Usage : node --import ./scripts/dev/register.mjs scripts/dev/loops-test.mjs
// Génère des boucles depuis quelques départs de test et affiche leurs indicateurs.
const { generateLoops } = await import('../../src/lib/loop.ts');
const STARTS = {
  'Prado': { latitude: 43.2655, longitude: 5.3805 },
  'Pointe Rouge': { latitude: 43.2440, longitude: 5.3730 },
  'Cassis': { latitude: 43.2148, longitude: 5.5378 },
};
const only = process.argv[2];
for (const [name, start] of Object.entries(STARTS)) {
  if (only && !name.startsWith(only)) continue;
  for (const minutes of [60, 90]) {
    const t0 = Date.now();
    try {
      const loops = await generateLoops({ start, target: { kind: 'duration', minutes }, curviness: 'twisty', avoidHighways: true });
      for (const l of loops) {
        let maxSeg = 0;
        for (let i = 1; i < l.route.points.length; i++) {
          const a = l.route.points[i - 1], b = l.route.points[i];
          const d = Math.hypot((a.latitude - b.latitude) * 111e3, (a.longitude - b.longitude) * 81e3);
          if (d > maxSeg) maxSeg = d;
        }
        console.log(`${name} ${minutes} min | ${(l.route.distanceM / 1000).toFixed(0)} km ≈${l.durationMin} min | sinuosité ${l.score} | overlap ${(l.overlap * 100).toFixed(0)} % | urbain ${l.urban != null ? (l.urban * 100).toFixed(0) + ' %' : '?'} | sortie ville ${l.exitKm != null ? l.exitKm.toFixed(1) + ' km' : '?'} | segment max ${(maxSeg / 1000).toFixed(2)} km | ferry ${l.route.hasFerry}`);
      }
    } catch (e) {
      console.log(`${name} ${minutes} min | ERREUR ${e.message}`);
    }
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
