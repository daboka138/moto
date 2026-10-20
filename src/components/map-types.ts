import type { SignStyle } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';

// Types communs aux deux cartes : leaflet-map.tsx (app, WebView) et leaflet-map.web.tsx (site web).

export type MapPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** Cap en degrés (0 = nord) : GPS en mouvement, boussole à l'arrêt. null = inconnu (rond au lieu de la flèche) */
  heading?: number | null;
};

/** Pastille avec photo affichée sur la carte (autres motards). */
export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  photoUrl: string;
  /** default : orange, muted : gris (arrêté), alert : rouge (excès de vitesse) */
  tone?: 'default' | 'muted' | 'alert';
  /** Petit badge en haut à droite (convoi : 🚩 ouvreur, 🧹 serre-file) */
  badge?: string;
};

/** Repère fixe : départ, arrivée, étape, point de RDV, point posé par appui long. */
export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  kind: 'start' | 'end' | 'step' | 'meeting' | 'report' | 'dropped' | 'place' | 'event' | 'parking';
  label: string;
  /** Panneau de signalisation (signalements) : dessiné à la place de la pastille */
  sign?: SignStyle;
  /** Regroupable avec ses voisins selon le zoom (balades, événements, spots, parkings ; jamais les dangers) */
  cluster?: boolean;
};

/** Tracé : [[lat, lng], ...]. muted : itinéraire alternatif, plus fin et dessous */
export type MapRoute = { id: string; points: [number, number][]; color?: string; muted?: boolean };

export type MapProps = {
  position: MapPosition | null;
  /** Mode navigation : carte orientée dans mon sens de marche, flèche en bas de l'écran, zoom rapproché */
  navigating?: boolean;
  /** La carte suit ma position (et, en navigation, mon cap). Coupé par un glissement ou une rotation au doigt */
  follow?: boolean;
  /** L'utilisateur a déplacé ou tourné la carte */
  onUserPan?: () => void;
  /** Orientation de la carte en degrés (0 = nord en haut), envoyée quand elle change */
  onBearingChange?: (bearing: number) => void;
  /** Incrémenter pour remettre le nord en haut (bouton boussole) */
  northUpKey?: number;
  markers?: MapMarker[];
  selectedMarkerId?: string | null;
  onMarkerPress?: (id: string) => void;
  onMapPress?: (point: LatLng) => void;
  /** Appui long sur la carte (comme Google Maps) */
  onMapLongPress?: (point: LatLng) => void;
  pins?: MapPin[];
  onPinPress?: (id: string) => void;
  routes?: MapRoute[];
  /** Cadre la carte sur ces points à chaque changement */
  fitPoints?: LatLng[];
  /** Nombre de pastilles réellement affichées dans la page (diagnostic) */
  onMarkersRendered?: (count: number) => void;
  /** Incrémenter pour jouer un petit bip (dépassement de vitesse) */
  beepKey?: number;
  /** Le bip n'a pas pu être joué (son bloqué par la page) */
  onBeepFailed?: () => void;
  /** Centre et zoom de la carte après un déplacement (signalements, parkings moto de la zone) */
  onViewChange?: (center: LatLng, zoom: number) => void;
  /**
   * Vue tant qu'aucune position GPS n'est arrivée et que l'utilisateur n'a pas déplacé la carte
   * (dernière position connue, ville du profil, France)
   */
  defaultView?: (LatLng & { zoom: number }) | null;
  /** Premières tuiles affichées (ou 1,5 s après le chargement de la page) : une seule fois */
  onPainted?: () => void;
};
