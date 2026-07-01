import { AUDIO_EXTENSIONS, isAudioFileName } from './customAudioExtensions';
import {
  CustomFolderEmptyError,
  loadLastCustomMusicFileHandle,
  loadLastCustomMusicFolderHandle,
  saveLastCustomMusicFileHandle,
  saveLastCustomMusicFolderHandle,
} from '../settings/customMusicFolder';

export { CustomFolderEmptyError };

export function supportsCustomMusicFilePicker(): boolean {
  return typeof window.showOpenFilePicker === 'function';
}

export function supportsCustomMusicFolderPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export async function pickCustomAudioFile(): Promise<File | null> {
  if (!supportsCustomMusicFilePicker()) return null;

  try {
    const lastFile = await loadLastCustomMusicFileHandle();
    const options: OpenFilePickerOptions = {
      id: 'g-rhythm-custom-audio',
      multiple: false,
      types: [
        {
          description: 'Audio',
          accept: {
            'audio/*': [...AUDIO_EXTENSIONS],
          },
        },
      ],
      startIn: lastFile ?? 'music',
    };

    const [handle] = await window.showOpenFilePicker!(options);
    await saveLastCustomMusicFileHandle(handle);
    return await handle.getFile();
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null;
    throw err;
  }
}

async function collectAudioFilesFromDirectory(handle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && isAudioFileName(entry.name)) {
      files.push(await (entry as FileSystemFileHandle).getFile());
    } else if (entry.kind === 'directory') {
      files.push(...(await collectAudioFilesFromDirectory(entry as FileSystemDirectoryHandle)));
    }
  }
  return files;
}

export interface CustomAudioFolderPick {
  files: File[];
  folderName: string;
}

async function openDirectoryPicker(startIn?: FileSystemHandle): Promise<FileSystemDirectoryHandle> {
  const options: DirectoryPickerOptions = { mode: 'read' };
  if (startIn) options.startIn = startIn;
  return window.showDirectoryPicker!(options);
}

function sortAudioFiles(files: File[]): File[] {
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function readAudioFilesFromFolderHandle(
  handle: FileSystemDirectoryHandle,
): Promise<CustomAudioFolderPick | null> {
  const files = sortAudioFiles(await collectAudioFilesFromDirectory(handle));
  if (files.length === 0) return null;
  return { files, folderName: handle.name };
}

/** 保存済みフォルダを読み込む（起動時は requestPermission: false 推奨） */
export async function restoreLastCustomMusicFolder(options?: {
  requestPermission?: boolean;
}): Promise<CustomAudioFolderPick | null> {
  if (!supportsCustomMusicFolderPicker()) return null;

  const handle = await loadLastCustomMusicFolderHandle({ requirePermission: false });
  if (!handle) return null;

  const permOpts: FileSystemHandlePermissionDescriptor = { mode: 'read' };
  let perm = await handle.queryPermission(permOpts);
  if (perm !== 'granted') {
    if (!options?.requestPermission) return null;
    perm = await handle.requestPermission(permOpts);
    if (perm !== 'granted') return null;
  }

  try {
    return await readAudioFilesFromFolderHandle(handle);
  } catch {
    return null;
  }
}

export async function pickCustomAudioFolder(): Promise<CustomAudioFolderPick | null> {
  if (!supportsCustomMusicFolderPicker()) return null;

  let startIn: FileSystemHandle | undefined;
  try {
    startIn = (await loadLastCustomMusicFolderHandle({ requirePermission: false })) ?? undefined;
  } catch {
    /* ignore stale handle */
  }

  let handle: FileSystemDirectoryHandle;
  try {
    try {
      handle = await openDirectoryPicker(startIn);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
      if (!startIn) throw err;
      handle = await openDirectoryPicker();
    }
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null;
    throw err;
  }

  const pick = await readAudioFilesFromFolderHandle(handle);
  void saveLastCustomMusicFolderHandle(handle);
  if (!pick) {
    throw new CustomFolderEmptyError(handle.name);
  }

  return pick;
}

export function filterAudioFiles(files: File[]): File[] {
  return files
    .filter((f) => isAudioFileName(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function folderNameFromFiles(files: File[]): string {
  if (files.length === 0) return '';
  const rel = files[0].webkitRelativePath;
  if (!rel) return '';
  const slash = rel.indexOf('/');
  return slash > 0 ? rel.slice(0, slash) : '';
}
