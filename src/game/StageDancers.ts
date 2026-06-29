import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LaneBounds } from './SideStageFX';
import type { SongPhase } from './scrollPhase';
import {
  ALL_DANCER_MODEL_IDS,
  PHASE_LEFT_POOLS,
  PHASE_RIGHT_POOLS,
  getPerfectDancerTier,
  perfectModelForTier,
  type DancerModelId,
  type PerfectDancerTier,
} from './dancerCatalog';

export type { DancerModelId } from './dancerCatalog';

const MODEL_FILES: Record<DancerModelId, string> = Object.fromEntries(
  ALL_DANCER_MODEL_IDS.map((id) => [id, `${id}.glb`]),
) as Record<DancerModelId, string>;

function randomFrom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickPhasePair(songPhase: SongPhase): [DancerModelId, DancerModelId] {
  const leftPool = PHASE_LEFT_POOLS[songPhase];
  const rightPool = PHASE_RIGHT_POOLS[songPhase];
  return [randomFrom(leftPool), randomFrom(rightPool)];
}

interface DancerTemplate {
  base: THREE.Object3D;
  clips: THREE.AnimationClip[];
  height: number;
  width: number;
}

export class StageDancers {
  private layer: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 100);
  private loader = new GLTFLoader();
  private templates = new Map<DancerModelId, DancerTemplate>();
  private leftRoot = new THREE.Group();
  private rightRoot = new THREE.Group();
  private leftMixer: THREE.AnimationMixer | null = null;
  private rightMixer: THREE.AnimationMixer | null = null;
  private leftModelId: DancerModelId | null = null;
  private rightModelId: DancerModelId | null = null;
  private lastSongPhase: SongPhase | null = null;
  private perfectDanceActive = false;
  private activePerfectTier: PerfectDancerTier = 0;
  private pendingLoopOnce = false;
  private perfectFinishHandlers: Array<{
    mixer: THREE.AnimationMixer;
    handler: (event: THREE.Event & { action?: THREE.AnimationAction }) => void;
  }> = [];
  private visible = false;
  private previewMode = false;
  private previewLeft: DancerModelId | null = null;
  private previewRight: DancerModelId | null = null;
  private pendingLeft: DancerModelId | null = null;
  private pendingRight: DancerModelId | null = null;
  private loadPromises = new Map<DancerModelId, Promise<void>>();
  private panelBounds: LaneBounds | null = null;
  private screenW = 0;
  private screenH = 0;
  private layoutKey = '';

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.id = 'dancer-layer';
    this.layer.className = 'hidden';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dancer-canvas';
    this.layer.appendChild(this.canvas);
    parent.appendChild(this.layer);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(this.leftRoot);
    this.scene.add(this.rightRoot);

    const key = new THREE.DirectionalLight(0x88eeff, 2.8);
    key.position.set(2, 3, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff70dd, 2.2);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x7090b0, 1.1));
  }

  private queueLoad(id: DancerModelId): void {
    void this.ensureLoaded(id);
  }

  private ensureLoaded(id: DancerModelId): Promise<void> {
    if (this.templates.has(id)) return Promise.resolve();
    const inFlight = this.loadPromises.get(id);
    if (inFlight) return inFlight;

    const promise = this.loadTemplate(id).finally(() => {
      this.loadPromises.delete(id);
      this.tryApplyPending();
    });
    this.loadPromises.set(id, promise);
    return promise;
  }

  /** 起動時プリロード（大容量GLBのため逐次読み込み） */
  async preloadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const total = ALL_DANCER_MODEL_IDS.length;
    onProgress?.(0, total);
    let loaded = 0;
    for (const id of ALL_DANCER_MODEL_IDS) {
      await this.ensureLoaded(id);
      loaded++;
      onProgress?.(loaded, total);
    }
  }

  private tryApplyPending(): void {
    if (this.previewMode && this.previewLeft && this.previewRight) {
      if (this.templates.has(this.previewLeft) && this.templates.has(this.previewRight)) {
        this.applyPair(this.previewLeft, this.previewRight);
      }
      return;
    }

    if (
      this.visible
      && this.pendingLeft
      && this.pendingRight
      && this.templates.has(this.pendingLeft)
      && this.templates.has(this.pendingRight)
    ) {
      const loopOnce = this.pendingLoopOnce;
      this.pendingLoopOnce = false;
      this.applyPair(this.pendingLeft, this.pendingRight, { loopOnce });
      if (this.panelBounds) {
        this.resize(this.screenW, this.screenH, this.panelBounds);
      }
    }
  }

  private modelUrl(id: DancerModelId): string {
    const file = MODEL_FILES[id];
    if (import.meta.env.DEV) {
      return `${import.meta.env.BASE_URL}models/${file}`;
    }
    return `https://raw.githubusercontent.com/Tatsumaru2016/G-rhythm/main/public/models/${file}`;
  }

  private loadTemplate(id: DancerModelId): Promise<void> {
    const url = this.modelUrl(id);
    return new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          const prepared = this.prepareModel(gltf.scene);
          const size = this.measureStaticSize(prepared);
          this.templates.set(id, {
            base: prepared,
            clips: gltf.animations,
            height: size.y,
            width: size.x,
          });
          resolve();
        },
        undefined,
        (err) => {
          console.error('[StageDancers] load failed:', url, err);
          resolve();
        },
      );
    });
  }

  private measureStaticSize(model: THREE.Object3D): THREE.Vector3 {
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      return new THREE.Vector3(0.45, 1, 0.45);
    }
    return box.getSize(new THREE.Vector3());
  }

  private prepareModel(model: THREE.Object3D): THREE.Object3D {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1.7, 0.3));
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.01);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.scale.setScalar(1 / height);
    return model;
  }

  private applySilhouette(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = new THREE.MeshStandardMaterial({
        color: 0x142840,
        emissive: 0x2a88cc,
        emissiveIntensity: 0.85,
        metalness: 0.2,
        roughness: 0.4,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
      });
      obj.frustumCulled = false;
    });
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    });
  }

  private clearSide(root: THREE.Group): void {
    while (root.children.length > 0) {
      const child = root.children[0];
      root.remove(child);
      this.disposeObject(child);
    }
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
  }

  private unbindPerfectFinishHandlers(): void {
    for (const { mixer, handler } of this.perfectFinishHandlers) {
      mixer.removeEventListener('finished', handler);
    }
    this.perfectFinishHandlers = [];
  }

  private onPerfectDanceFinished(): void {
    if (!this.perfectDanceActive) return;
    this.unbindPerfectFinishHandlers();
    this.perfectDanceActive = false;
    this.activePerfectTier = 0;
    this.leftModelId = null;
    this.rightModelId = null;
    this.pendingLeft = null;
    this.pendingRight = null;
    this.pendingLoopOnce = false;
    this.clearRoots();
  }

  private bindPerfectFinish(mixer: THREE.AnimationMixer): void {
    const handler = () => {
      this.onPerfectDanceFinished();
    };
    mixer.addEventListener('finished', handler);
    this.perfectFinishHandlers.push({ mixer, handler });
  }

  private clearRoots(): void {
    this.unbindPerfectFinishHandlers();
    this.leftMixer = null;
    this.rightMixer = null;
    this.clearSide(this.leftRoot);
    this.clearSide(this.rightRoot);
  }

  private mountSide(
    root: THREE.Group,
    template: DancerTemplate,
    mirror: boolean,
    loopOnce = false,
  ): THREE.AnimationMixer | null {
    const model = cloneSkeleton(template.base) as THREE.Object3D;
    this.applySilhouette(model);
    if (mirror) {
      const flip = new THREE.Group();
      flip.scale.x = -1;
      flip.add(model);
      root.add(flip);
    } else {
      root.add(model);
    }
    if (template.clips.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(template.clips[0]);
      if (loopOnce) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      if (mirror) this.rightMixer = mixer;
      else this.leftMixer = mixer;
      return mixer;
    }
    return null;
  }

  private applyPair(
    leftId: DancerModelId,
    rightId: DancerModelId,
    options?: { loopOnce?: boolean; force?: boolean },
  ): void {
    if (!options?.force && this.leftModelId === leftId && this.rightModelId === rightId) return;
    const leftTemplate = this.templates.get(leftId);
    const rightTemplate = this.templates.get(rightId);
    if (!leftTemplate || !rightTemplate) return;

    this.clearRoots();
    const leftMixer = this.mountSide(this.leftRoot, leftTemplate, false, options?.loopOnce);
    const rightMixer = this.mountSide(this.rightRoot, rightTemplate, true, options?.loopOnce);
    if (options?.loopOnce) {
      const finishMixer = leftMixer ?? rightMixer;
      if (finishMixer) this.bindPerfectFinish(finishMixer);
    }
    this.leftModelId = leftId;
    this.rightModelId = rightId;
    this.layoutKey = '';
  }

  private switchToPerfectTier(tier: 1 | 2 | 3 | 4): void {
    const id = perfectModelForTier(tier);
    this.perfectDanceActive = true;
    this.activePerfectTier = tier;
    this.pendingLeft = id;
    this.pendingRight = id;
    this.pendingLoopOnce = true;
    this.queueLoad(id);
    if (this.templates.has(id)) {
      this.pendingLoopOnce = false;
      const force = this.leftModelId === id && this.rightModelId === id;
      this.applyPair(id, id, { loopOnce: true, force });
    }
  }

  private pickPair(songPhase: SongPhase): [DancerModelId, DancerModelId] {
    return pickPhasePair(songPhase);
  }

  private ensureModels(songPhase: SongPhase, perfectBoost: number): void {
    const targetTier = getPerfectDancerTier(perfectBoost);

    if (this.perfectDanceActive) {
      if (targetTier > this.activePerfectTier) {
        this.switchToPerfectTier(targetTier as 1 | 2 | 3 | 4);
      }
      return;
    }

    if (targetTier > 0) {
      this.lastSongPhase = songPhase;
      this.switchToPerfectTier(targetTier as 1 | 2 | 3 | 4);
      return;
    }

    const phaseChanged = this.lastSongPhase !== songPhase;
    const mounted = this.leftRoot.children.length > 0 && this.rightRoot.children.length > 0;

    if (!phaseChanged && mounted && this.leftModelId && this.rightModelId) {
      return;
    }

    if (phaseChanged || !this.pendingLeft || !this.pendingRight) {
      const [leftId, rightId] = this.pickPair(songPhase);
      this.pendingLeft = leftId;
      this.pendingRight = rightId;
      this.pendingLoopOnce = false;
      this.lastSongPhase = songPhase;
    }

    this.queueLoad(this.pendingLeft);
    this.queueLoad(this.pendingRight);

    if (
      this.templates.has(this.pendingLeft)
      && this.templates.has(this.pendingRight)
    ) {
      this.applyPair(this.pendingLeft, this.pendingRight);
    }
  }

  show(): void {
    this.visible = true;
    this.layer.classList.remove('hidden');
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  hide(): void {
    this.visible = false;
    this.previewMode = false;
    this.layer.classList.add('hidden');
    this.leftModelId = null;
    this.rightModelId = null;
    this.pendingLeft = null;
    this.pendingRight = null;
    this.pendingLoopOnce = false;
    this.lastSongPhase = null;
    this.perfectDanceActive = false;
    this.activePerfectTier = 0;
    this.unbindPerfectFinishHandlers();
    this.layoutKey = '';
    this.clearRoots();
  }

  startPreview(leftId: DancerModelId, rightId: DancerModelId): void {
    this.previewMode = true;
    this.previewLeft = leftId;
    this.previewRight = rightId;
    this.lastSongPhase = null;
    this.perfectDanceActive = false;
    this.activePerfectTier = 0;
    this.show();
    this.pendingLeft = leftId;
    this.pendingRight = rightId;
    this.queueLoad(leftId);
    this.queueLoad(rightId);
    if (this.templates.has(leftId) && this.templates.has(rightId)) {
      this.applyPair(leftId, rightId);
    }
  }

  setPreviewPair(leftId: DancerModelId, rightId: DancerModelId): void {
    if (!this.previewMode) return;
    this.previewLeft = leftId;
    this.previewRight = rightId;
    this.pendingLeft = leftId;
    this.pendingRight = rightId;
    this.queueLoad(leftId);
    this.queueLoad(rightId);
    if (this.templates.has(leftId) && this.templates.has(rightId)) {
      this.applyPair(leftId, rightId);
    }
  }

  stopPreview(): void {
    this.previewMode = false;
    this.previewLeft = null;
    this.previewRight = null;
    this.hide();
  }

  resize(screenW: number, screenH: number, bounds: LaneBounds): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.panelBounds = bounds;
    this.layoutKey = '';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(screenW, screenH, false);
    this.canvas.style.width = `${screenW}px`;
    this.canvas.style.height = `${screenH}px`;

    this.camera.left = 0;
    this.camera.right = screenW;
    this.camera.top = screenH;
    this.camera.bottom = 0;
    this.camera.position.set(0, 0, 50);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private toWorldY(canvasY: number): number {
    return this.screenH - canvasY;
  }

  private placeDancer(
    root: THREE.Group,
    centerX: number,
    maxWidth: number,
    footWorldY: number,
    targetHeight: number,
    template: DancerTemplate,
  ): void {
    const modelH = Math.max(template.height, 0.01);
    const modelW = Math.max(template.width, 0.01);
    let scale = targetHeight / modelH;
    if (modelW * scale > maxWidth) scale = maxWidth / modelW;
    root.scale.setScalar(scale);
    root.position.set(centerX, footWorldY, 0);
  }

  private layoutDancers(bounds: LaneBounds): void {
    const leftTemplate = this.leftModelId ? this.templates.get(this.leftModelId) : null;
    const rightTemplate = this.rightModelId ? this.templates.get(this.rightModelId) : null;
    if (!leftTemplate || !rightTemplate) return;

    const laneEnd = bounds.startX + bounds.width;
    const footWorldY = this.toWorldY(bounds.hitLineY - 4);
    const availH = Math.max(100, bounds.hitLineY - bounds.topY);
    const targetHeight = availH * 0.8;

    const leftW = Math.max(56, bounds.startX);
    const rightW = Math.max(56, this.screenW - laneEnd);

    this.placeDancer(this.leftRoot, leftW * 0.5, leftW * 0.92, footWorldY, targetHeight, leftTemplate);
    this.placeDancer(
      this.rightRoot,
      laneEnd + rightW * 0.5,
      rightW * 0.92,
      footWorldY,
      targetHeight,
      rightTemplate,
    );
  }

  private update(dt: number): void {
    this.leftMixer?.update(dt);
    this.rightMixer?.update(dt);
  }

  render(
    dt: number,
    bounds: LaneBounds,
    songPhase: SongPhase,
    perfectBoost: number,
    screenW: number,
    screenH: number,
  ): void {
    if (!this.visible) return;

    if (screenW > 0 && screenH > 0 && (screenW !== this.screenW || screenH !== this.screenH)) {
      this.resize(screenW, screenH, bounds);
    }

    this.panelBounds = bounds;
    if (!this.previewMode) {
      this.ensureModels(songPhase, perfectBoost);
    }

    if (!this.leftModelId || !this.rightModelId) return;
    if (this.leftRoot.children.length === 0 || this.rightRoot.children.length === 0) return;

    const layoutKey = [
      bounds.startX, bounds.width, bounds.hitLineY, bounds.topY,
      screenW, screenH, this.leftModelId, this.rightModelId,
    ].join('|');

    if (layoutKey !== this.layoutKey) {
      this.layoutDancers(bounds);
      this.layoutKey = layoutKey;
    }

    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    this.clearRoots();
    this.renderer.dispose();
    this.layer.remove();
  }
}
