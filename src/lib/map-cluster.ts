// Regroupement des repères de la carte (balades, événements, spots, parkings) selon le zoom : une pastille
// avec le nombre (« 12 ») qui s'éclate en zoomant. Amis en direct et dangers ne sont JAMAIS regroupés.
// Écrit UNE fois en JavaScript simple (chaîne CLUSTER_JS) : injecté tel quel dans la page Leaflet de l'app
// (WebView) et chargé par la carte web (new Function, navigateur seulement) ; testé par scripts/dev/cluster-test.mjs.

/** En dessous de cet écart à l'écran (px), deux repères sont regroupés */
export const CLUSTER_RADIUS_PX = 56;
/** À partir de ce zoom (rue), plus aucun regroupement */
export const CLUSTER_MAX_ZOOM = 16;

export const CLUSTER_JS = `
function clusterPoints(items, radius) {
  // items : [{ x, y, ... }] en pixels au zoom courant ; rend des groupes (tableaux d'items).
  // Glouton sur une grille : chaque repère libre prend ses voisins libres à moins de radius.
  var grid = {}, i, j, k;
  for (i = 0; i < items.length; i++) {
    k = Math.floor(items[i].x / radius) + ':' + Math.floor(items[i].y / radius);
    (grid[k] || (grid[k] = [])).push(i);
  }
  var used = [], groups = [];
  for (i = 0; i < items.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    var a = items[i], group = [a];
    var gx = Math.floor(a.x / radius), gy = Math.floor(a.y / radius);
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var list = grid[(gx + dx) + ':' + (gy + dy)];
        if (!list) continue;
        for (j = 0; j < list.length; j++) {
          var n = list[j];
          if (used[n]) continue;
          var b = items[n];
          if (Math.abs(b.x - a.x) <= radius && Math.abs(b.y - a.y) <= radius) {
            used[n] = true;
            group.push(b);
          }
        }
      }
    }
    groups.push(group);
  }
  return groups;
}
function clusterLabel(n) { return n > 999 ? Math.floor(n / 1000) + 'k' : String(n); }
`;

export type ClusterPoint = { x: number; y: number };
export type ClusterFn = <T extends ClusterPoint>(items: T[], radius: number) => T[][];
