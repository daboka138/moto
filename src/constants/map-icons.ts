// Icônes des signalements et des repères de la carte (note 32) : UNE seule famille, dessinée en SVG,
// utilisée partout (page Leaflet de l'app, carte web, grilles de signalement, fiches, réglages).
// Fichier pur (aucun import) : lu aussi par la page Leaflet (chaîne SVG) et par les scripts Node.
// Grille 32 × 32, trait 2 px arrondi, pictogrammes simples lisibles à 28-32 px.
// Dangers : triangle d'avertissement blanc bordé de rouge (circulation : bordé d'orange), pictogramme
// sombre ; infos (spots, parkings) : pastille ronde ou carrée colorée, pictogramme blanc. Liseré blanc
// autour de chaque forme : lisible sur carte claire ET sombre (+ ombre légère côté carte).
// LÉGAL : jamais d'icône de radar ni de contrôle.

export type IconPalette = {
  /** Bord des dangers */
  alert: string;
  /** Bord des infos de circulation (bouchon, véhicule arrêté) */
  traffic: string;
  /** Pictogrammes sur fond blanc */
  ink: string;
  white: string;
  /** Zones de danger (points noirs) */
  zone: string;
  /** Spots PasseRyder */
  place: string;
  /** Parkings moto OpenStreetMap */
  parking: string;
  /** Stations-service (prix officiels des carburants) */
  fuel: string;
  /** Feu tricolore */
  signalBody: string;
  signalRed: string;
  signalAmber: string;
  signalGreen: string;
};

export type ReportIconType =
  | 'accident'
  | 'gravel'
  | 'oil'
  | 'roadworks'
  | 'object'
  | 'animal'
  | 'traffic_jam'
  | 'stopped_vehicle'
  | 'danger';

export type PlaceIconKind = 'biker_cafe' | 'viewpoint' | 'road' | 'fuel' | 'garage' | 'parking';

/** Triangle d'avertissement aux coins arrondis (pointe en haut), centré dans 32 × 32 */
const TRIANGLE = 'M16 3.2c.9 0 1.7.5 2.2 1.3l11.3 19.8c1 1.7-.3 3.9-2.2 3.9H4.7c-1.9 0-3.2-2.2-2.2-3.9L13.8 4.5c.5-.8 1.3-1.3 2.2-1.3z';

const S = (c: string, w = 2) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const F = (c: string) => `fill="${c}"`;

/** Pictogrammes dans le triangle (zone utile ~ x 9-23, y 11-25) */
function reportGlyph(type: ReportIconType, ink: string, white: string): string {
  switch (type) {
    case 'danger':
      return `<path d="M16 11.5v7.5" ${S(ink, 2.8)}/><circle cx="16" cy="22.6" r="1.6" ${F(ink)}/>`;
    case 'accident':
      // Voiture de profil penchée + éclats du choc
      return (
        `<g transform="rotate(-14 15 20)"><path d="M8.6 22.2v-2.4l1.6-.6 1.6-2.6h5.4l2.2 2.6 1.4.4v2.6z" ${F(ink)}/>` +
        `<circle cx="11.6" cy="22.6" r="1.5" ${F(ink)}/><circle cx="18.2" cy="22.6" r="1.5" ${F(ink)}/></g>` +
        `<path d="M21.6 12.4l.6 2.2M24.2 15.4l-2 .9M19.2 13.6l1.1 1.8" ${S(ink, 1.6)}/>`
      );
    case 'gravel':
      // Tas de gravillons + éclat projeté
      return (
        `<ellipse cx="11.6" cy="23.2" rx="2.1" ry="1.6" ${F(ink)}/><ellipse cx="16.2" cy="23.4" rx="2.3" ry="1.7" ${F(ink)}/>` +
        `<ellipse cx="20.6" cy="23.2" rx="1.9" ry="1.5" ${F(ink)}/><ellipse cx="13.9" cy="20" rx="1.8" ry="1.4" ${F(ink)}/>` +
        `<ellipse cx="18.4" cy="20.1" rx="1.7" ry="1.4" ${F(ink)}/><circle cx="16.3" cy="16.9" r="1.3" ${F(ink)}/>` +
        `<circle cx="21.4" cy="15.6" r=".9" ${F(ink)}/>`
      );
    case 'oil':
      // Goutte + traces de dérapage
      return (
        `<path d="M14.6 11.6s-3.4 4.3-3.4 6.5a3.4 3.4 0 0 0 6.8 0c0-2.2-3.4-6.5-3.4-6.5z" ${F(ink)}/>` +
        `<path d="M18.6 24.2c1.6-1.1 1.2-2.4 2.6-3.4M14.4 24.4c1.6-1.1 1.2-2.4 2.6-3.4" ${S(ink, 1.6)}/>`
      );
    case 'roadworks':
      // Cône de chantier
      return (
        `<path d="M14.7 12.2h2.6l3.3 11.1h-9.2z" ${F(ink)}/>` +
        `<path d="M13.6 16.4h4.8M12.6 19.8h6.8" stroke="${white}" stroke-width="1.5"/>` +
        `<path d="M10 24h12" ${S(ink, 2.2)}/>`
      );
    case 'object':
      // Caisse tombée sur la route
      return (
        `<path d="M10.4 17.6l5.6-2.6 5.6 2.6v5.8l-5.6 2-5.6-2z" ${F(ink)}/>` +
        `<path d="M10.6 17.7l5.4 2.3 5.4-2.3M16 20v5.2" stroke="${white}" stroke-width="1.2" fill="none" stroke-linejoin="round"/>`
      );
    case 'animal':
      // Empreinte de patte
      return (
        `<ellipse cx="16" cy="21.4" rx="3.4" ry="2.8" ${F(ink)}/><ellipse cx="11.6" cy="17.6" rx="1.4" ry="1.8" ${F(ink)}/>` +
        `<ellipse cx="14.4" cy="14.8" rx="1.4" ry="1.8" ${F(ink)}/><ellipse cx="17.6" cy="14.8" rx="1.4" ry="1.8" ${F(ink)}/>` +
        `<ellipse cx="20.4" cy="17.6" rx="1.4" ry="1.8" ${F(ink)}/>`
      );
    case 'traffic_jam':
      // Deux voitures vues de l'arrière, l'une derrière l'autre
      return (
        `<path d="M12.4 15.4l1-2.4h5.2l1 2.4 1 .2v3.2h-9.2v-3.2z" ${F(ink)}/>` +
        `<path d="M9.8 20.2l1.3-3h9.8l1.3 3 1 .3v4.1h-2.4v-1h-8.6v1H8.8v-4.1z" ${F(ink)} stroke="${white}" stroke-width="1"/>` +
        `<path d="M11.4 21.6h1.8M18.8 21.6h1.8" stroke="${white}" stroke-width="1.3" stroke-linecap="round"/>`
      );
    case 'stopped_vehicle':
      // Voiture de profil + feux de détresse
      return (
        `<path d="M8.8 23.4v-2.6l1.6-.6 1.8-2.8h5.6l2.4 2.8 1.2.4v2.8z" ${F(ink)}/>` +
        `<circle cx="12" cy="23.8" r="1.6" ${F(ink)}/><circle cx="18.6" cy="23.8" r="1.6" ${F(ink)}/>` +
        `<path d="M13.4 13.6l-.9-1.4M16 13v-1.8M18.6 13.6l.9-1.4" ${S(ink, 1.5)}/>`
      );
  }
}

/** Panneau d'un signalement (triangle) en SVG, 32 × 32 */
export function reportIconSvg(type: ReportIconType, P: IconPalette): string {
  const border = type === 'traffic_jam' || type === 'stopped_vehicle' ? P.traffic : P.alert;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<path d="${TRIANGLE}" fill="${P.white}" stroke="${P.white}" stroke-width="3.4" stroke-linejoin="round"/>` +
    `<path d="${TRIANGLE}" fill="${P.white}" stroke="${border}" stroke-width="2.6" stroke-linejoin="round" transform="translate(16 16.4) scale(.9) translate(-16 -16.4)"/>` +
    reportGlyph(type, P.ink, P.white) +
    `</svg>`
  );
}

/** Zone de danger (point noir) : triangle plein, point d'exclamation blanc */
export function zoneIconSvg(P: IconPalette): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<path d="${TRIANGLE}" fill="${P.zone}" stroke="${P.white}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M16 11.5v7.5" ${S(P.white, 2.8)}/><circle cx="16" cy="22.6" r="1.6" ${F(P.white)}/>` +
    `</svg>`
  );
}

/** Pictogrammes blancs des spots (dans un cercle de rayon 12 centré en 16,16) */
function placeGlyph(kind: PlaceIconKind, c: string): string {
  switch (kind) {
    case 'biker_cafe':
      return (
        `<path d="M9.6 14h10v3.6a5 5 0 0 1-10 0z" ${F(c)}/><path d="M19.4 15.2h1.4a2 2 0 0 1 0 4h-1.6" ${S(c, 1.8)}/>` +
        `<path d="M12.2 9.4c-.8 1 .8 1.6 0 2.6M15.6 9.4c-.8 1 .8 1.6 0 2.6" ${S(c, 1.4)}/><path d="M9 23.6h11.6" ${S(c, 1.8)}/>`
      );
    case 'viewpoint':
      return `<path d="M7.4 22.4l5.4-8.2 3.2 4.6 2.2-2.8 4.6 6.4z" ${F(c)}/><circle cx="20.6" cy="11" r="1.9" ${F(c)}/>`;
    case 'road':
      // Route en lacets
      return `<path d="M11 24c0-3.4 9.6-2.4 9.6-6s-9.2-2.4-9.2-6c0-1.6 1.2-2.6 2.8-2.6" ${S(c, 2.6)}/>`;
    case 'fuel':
      return (
        `<rect x="9.6" y="9" width="8" height="14.4" rx="1.4" ${F(c)}/><rect x="11.2" y="10.8" width="4.8" height="3.6" rx=".6" fill="none"/>` +
        `<path d="M17.6 13.2h1.6l1.8 1.8v6.2a1.2 1.2 0 0 0 2.4 0v-6.4l-2-2.2" ${S(c, 1.6)}/><path d="M8.6 23.6h10" ${S(c, 1.8)}/>`
      );
    case 'garage':
      // Clé plate
      return (
        `<path d="M10.2 21.8l6.6-6.6" ${S(c, 3)}/>` +
        `<path d="M17.4 10.4a4 4 0 0 0 4.2 5.6l-1.6-1.8.4-2.2 2.2-.4 1.4 1.4" ${S(c, 2)}/>`
      );
    case 'parking':
      return parkingLetter(c);
  }
}

/** Lettre P dessinée (pas de fonte : même rendu partout) */
const parkingLetter = (c: string) => `<path d="M12.6 23.2V9.4h4.4a4 4 0 0 1 0 8h-4.4" ${S(c, 2.8)}/>`;

/** Repère d'un spot (pastille ronde) */
export function placeIconSvg(kind: PlaceIconKind, P: IconPalette): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="13.4" fill="${P.place}" stroke="${P.white}" stroke-width="2.2"/>` +
    placeGlyph(kind, P.white) +
    `</svg>`
  );
}

/** Parking moto OpenStreetMap : carré bleu arrondi, P blanc + petite moto */
/** Station-service (prix officiels des carburants) : carré arrondi vert, pompe dessinée */
export function fuelStationIconSvg(P: IconPalette): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect x="3" y="3" width="26" height="26" rx="6" fill="${P.fuel}" stroke="${P.white}" stroke-width="2.2"/>` +
    placeGlyph('fuel', P.white) +
    `</svg>`
  );
}

export function parkingIconSvg(P: IconPalette): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect x="3" y="3" width="26" height="26" rx="6" fill="${P.parking}" stroke="${P.white}" stroke-width="2.2"/>` +
    `<path d="M10.4 23V8.8h4.4a4 4 0 0 1 0 8h-4.4" ${S(P.white, 2.8)}/>` +
    `<circle cx="19.2" cy="23.4" r="1.6" ${S(P.white, 1.3)}/><circle cx="24.4" cy="23.4" r="1.6" ${S(P.white, 1.3)}/>` +
    `<path d="M19.2 23.4l2.2-3h2l1 3" ${S(P.white, 1.3)}/>` +
    `</svg>`
  );
}

/** Feu tricolore (petit, non cliquable) : 14 × 26 */
export function signalIconSvg(P: IconPalette): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 26">` +
    `<rect x="1" y="1" width="12" height="24" rx="3.4" fill="${P.signalBody}" stroke="${P.white}" stroke-width="1.6"/>` +
    `<circle cx="7" cy="6.4" r="2.5" fill="${P.signalRed}"/><circle cx="7" cy="13" r="2.5" fill="${P.signalAmber}"/>` +
    `<circle cx="7" cy="19.6" r="2.5" fill="${P.signalGreen}"/>` +
    `</svg>`
  );
}
