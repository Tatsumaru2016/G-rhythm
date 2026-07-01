export interface AudioOnset {
  time: number;
  energy: number;
}

export function detectOnsets(
  buffer: AudioBuffer,
  minGap: number,
  fluxScale = 1,
): AudioOnset[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.023);
  const onsets: AudioOnset[] = [];
  let prevEnergy = 0;
  let lastOnset = -minGap;
  const fluxThreshold = 0.008 * fluxScale;
  const energyThreshold = 0.015 * fluxScale;

  for (let i = 0; i < data.length; i += windowSize) {
    let energy = 0;
    const end = Math.min(i + windowSize, data.length);
    for (let j = i; j < end; j++) energy += data[j] * data[j];
    energy = Math.sqrt(energy / (end - i));

    const flux = Math.max(0, energy - prevEnergy);
    const time = i / sampleRate;

    if (flux > fluxThreshold && energy > energyThreshold && time - lastOnset >= minGap) {
      onsets.push({ time, energy });
      lastOnset = time;
    }
    prevEnergy = energy * 0.85 + prevEnergy * 0.15;
  }

  return onsets;
}
