import {
  loadLastCustomMusicFileHandle,
  saveLastCustomMusicFileHandle,
} from '../settings/customMusicFolder';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];

export function supportsCustomMusicFilePicker(): boolean {
  return typeof window.showOpenFilePicker === 'function';
}

export async function pickCustomAudioFile(): Promise<File | null> {
  if (!supportsCustomMusicFilePicker()) return null;

  try {
    const lastFile = await loadLastCustomMusicFileHandle();
    const options: OpenFilePickerOptions = {
      id: 'g-rhythm-custom-audio',
      multiple: false,
      types: [{
        description: 'Audio',
        accept: {
          'audio/*': AUDIO_EXTENSIONS,
        },
      }],
      startIn: lastFile ?? 'music',
    };

    const [handle] = await window.showOpenFilePicker(options);
    await saveLastCustomMusicFileHandle(handle);
    return await handle.getFile();
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null;
    throw err;
  }
}
