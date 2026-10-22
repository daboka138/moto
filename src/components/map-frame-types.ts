// Commun à map-frame.tsx (WebView) et map-frame.web.tsx (iframe)

export const MAP_BASE_URL = 'https://localhost/';

export type MapFrameHandle = { injectJavaScript: (code: string) => void };

export type MapFrameProps = { html: string; onMessage: (data: string) => void };
