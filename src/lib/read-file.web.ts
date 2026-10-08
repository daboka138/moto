/** Web : le sélecteur renvoie une URL blob: ou data:, lue avec fetch. */
export async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}
