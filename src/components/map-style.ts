import type { Palette } from '@/constants/theme';

// Tuiles et styles des repères, communs à la carte de l'app (WebView) et à celle du site web.

// Tuiles : MapTiler « streets-v2 » (propre et lisible, façon Google Maps), « streets-v2-dark » si le
// style de carte est sombre (réglage séparé du thème de l'app). Clé : EXPO_PUBLIC_MAPTILER_KEY (.env
// en local, variables EAS preview/production). Sans clé ou si MapTiler refuse les tuiles (quota, clé
// invalide…), la page repasse sur les tuiles OpenStreetMap standard.
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';
export const OSM_COPYRIGHT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILES = {
  light: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key=',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}{r}.png?key=',
  attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM_COPYRIGHT,
  fallback: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/** Styles des pastilles, repères, panneaux et de ma position (classes posées par les deux cartes). */
export function mapCss(Colors: Palette) {
  return `
  .person-wrap { background: none; border: none; transition: transform 1s linear; }
  .zooming .person-wrap, .rotating .person-wrap { transition: none; }
  .person {
    width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: ${Colors.white};
    border: 3px solid ${Colors.accent}; box-shadow: 0 2px 6px ${Colors.markerShadow};
    transition: transform .2s, border-color .3s;
  }
  .person img { width: 100%; height: 100%; display: block; }
  .person.muted { border-color: ${Colors.textFaint}; }
  .person.alert { border-color: ${Colors.danger}; box-shadow: 0 0 0 3px ${Colors.dangerHalo}, 0 2px 6px ${Colors.markerShadow}; }
  .person.selected { transform: scale(1.25); }
  .pin-wrap { background: none; border: none; }
  .pin {
    min-width: 28px; height: 28px; padding: 0 6px; box-sizing: border-box; border-radius: 14px;
    border: 2px solid ${Colors.white}; color: ${Colors.white}; font: 700 12px sans-serif;
    display: flex; align-items: center; justify-content: center; white-space: nowrap;
    box-shadow: 0 2px 6px ${Colors.markerShadow};
  }
  .pin.start { background: ${Colors.success}; } .pin.end { background: ${Colors.danger}; }
  .pin.step { background: ${Colors.neutral}; } .pin.meeting { background: ${Colors.accent}; }
  .pin.report {
    background: ${Colors.white}; border: 3px solid ${Colors.danger}; color: ${Colors.text}; font-size: 18px;
    min-width: 36px; height: 36px; border-radius: 18px; padding: 0;
  }
  /* Point posé par appui long : goutte façon Google Maps, pointe sur le lieu */
  .drop {
    width: 26px; height: 26px; box-sizing: border-box; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
    background: ${Colors.danger}; border: 3px solid ${Colors.white}; box-shadow: 0 2px 6px ${Colors.markerShadow};
  }
  .sign-wrap { background: none; border: none; }
  .sign svg { width: 46px; height: 46px; display: block; overflow: visible;
    filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
  .leaflet-control-attribution { background: ${Colors.surface}cc !important; color: ${Colors.textMuted}; }
  .leaflet-control-attribution a { color: ${Colors.accent}; }
  /* Ma position : flèche pointée dans ma direction, rond si le cap est inconnu */
  .me-wrap { background: none; border: none; }
  .me { width: 40px; height: 40px; }
  .me svg { width: 40px; height: 40px; display: block; filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
  .me .dot { display: none; }
  .me.nohead .arrow { display: none; }
  .me.nohead .dot { display: block; }
`;
}
