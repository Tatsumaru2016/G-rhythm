export async function fetchAndDecodeAudio(
  decode: (arrayBuffer: ArrayBuffer) => Promise<AudioBuffer>,
  url: string,
  label = url,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return await decode(arrayBuffer);
  } catch (err) {
    console.warn(`Failed to load audio (${label}):`, err);
    return null;
  }
}
