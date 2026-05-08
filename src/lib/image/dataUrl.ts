/** Decode a data URL (e.g. from canvas) into a Blob for re-processing. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
