// Version web : téléchargement du GPX par le navigateur, import par le sélecteur de fichiers.

export async function saveGpxFile(fileName: string, content: string): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function pickGpxFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then(resolve, reject);
    };
    // Fenêtre fermée sans choix
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
