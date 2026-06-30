import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

function decoderBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, '')}`;
}

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(decoderBase('draco/'));
  }
  return dracoLoader;
}

function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(decoderBase('basis/'));
  }
  ktx2Loader.detectSupport(renderer);
  return ktx2Loader;
}

/** Draco / KTX2 対応の GLTFLoader（圧縮は gltf-transform 等で事前に行う） */
export function createGltfLoader(renderer: WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  loader.setKTX2Loader(getKtx2Loader(renderer));
  return loader;
}

export function disposeGltfLoaders(): void {
  dracoLoader?.dispose();
  dracoLoader = null;
  ktx2Loader?.dispose();
  ktx2Loader = null;
}
