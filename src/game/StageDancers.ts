import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createGltfLoader, disposeGltfLoaders } from './gltfLoaders';
import type { LaneBounds } from './SideStageFX';
import type { SongPhase, DancerSubPhase } from './scrollPhase';
import { getDancerSubPhase } from './scrollPhase';
import {
  ALL_DANCER_MODEL_IDS,
  clipIndexFromModelId,
  createDancerRotationPlan,
  FIRST_MODELS,
  getPerfectDancerTier,
  perfectModelForTier,
  PHASE_MODEL_POOLS,
  type DancerModelId,
  type PerfectDancerTier,
} from './dancerCatalog';
import { dancerModelUrl } from './dancerModelUrl';
import { readCachedModel, writeCachedModel } from './dancerModelCache';
import { dancerPreloadConcurrency, IS_PROD_WEB } from '../perf/webPerf';

export type { DancerModelId } from './dancerCatalog';

const MODEL_FILES: Record<DancerModelId, string> = Object.fromEntries(
  ALL_DANCER_MODEL_IDS.map((id) => [id, `${id}.glb`]),
) as Record<DancerModelId, string>;

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
  private loader: GLTFLoader;
  private templates = new Map<DancerModelId, DancerTemplate>();
  private leftRoot = new THREE.Group();
  private rightRoot = new THREE.Group();
  private leftMixer: THREE.AnimationMixer | null = null;
  private rightMixer: THREE.AnimationMixer | null = null;
  private leftModelId: DancerModelId | null = null;
  private rightModelId: DancerModelId | null = null;
  private activeClipIndex = 0;
  private pendingClipIndex = 0;
  private lastSubPhase: DancerSubPhase | null = null;
  private pendingSubPhase: DancerSubPhase | null = null;
  private rotationPlan: Record<DancerSubPhase, DancerModelId> | null = null;
  private perfectDanceActive = false;
  private activePerfectTier: PerfectDancerTier = 0;
  private maxPerfectTierPlayed: PerfectDancerTier = 0;
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
  private stageBackdrops: THREE.Mesh[] = [];

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
      antialias: !IS_PROD_WEB,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.loader = createGltfLoader(this.renderer);

    this.scene.add(this.leftRoot);
    this.scene.add(this.rightRoot);

    const key = new THREE.DirectionalLight(0xccffff, 3.4);
    key.position.set(2, 3, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff88ee, 3.2);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x88aaff, 2.0);
    fill.position.set(0, 1, 6);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x90b8d8, 1.35));
    this.ensureStageBackdrops(2);
  }

  private createStageBackdropTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
    grad.addColorStop(0.42, 'rgba(0, 0, 0, 0.52)');
    grad.addColorStop(0.72, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private ensureStageBackdrops(count: number): void {
    while (this.stageBackdrops.length < count) {
      const tex = this.createStageBackdropTexture();
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = -10;
      this.scene.add(mesh);
      this.stageBackdrops.push(mesh);
    }
    for (let i = 0; i < this.stageBackdrops.length; i++) {
      this.stageBackdrops[i].visible = i < count;
    }
  }

  private layoutStageBackdrop(
    index: number,
    centerX: number,
    centerCanvasY: number,
    width: number,
    height: number,
  ): void {
    const mesh = this.stageBackdrops[index];
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.set(centerX, this.toWorldY(centerCanvasY), -2);
    mesh.scale.set(Math.max(width, 80), Math.max(height, 120), 1);
  }

  private hideStageBackdrops(): void {
    for (const mesh of this.stageBackdrops) mesh.visible = false;
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

  /** 指定IDを並列プリロード（同時2本まで） */
  async preloadIds(
    ids: readonly DancerModelId[],
    onProgress?: (loaded: number, total: number) => void,
    concurrency = 2,
  ): Promise<void> {
    const pending = ids.filter((id) => !this.templates.has(id));
    const total = pending.length;
    onProgress?.(0, total);
    if (total === 0) return;

    let loaded = 0;
    const queue = [...pending];

    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        await this.ensureLoaded(id);
        loaded++;
        onProgress?.(loaded, total);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, total) }, () => worker()),
    );
  }

  /** 序盤8体をバックグラウンド向けに先読み */
  preloadEarlyPhase(): Promise<void> {
    return this.preloadIds([...FIRST_MODELS]);
  }

  /** 全モデル（デバッグ向け・通常起動では使わない） */
  async preloadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    await this.preloadIds(ALL_DANCER_MODEL_IDS, onProgress, dancerPreloadConcurrency());
  }

  /** 序盤以外をバックグラウンド向けに読み込み */
  async preloadRemaining(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const remaining = ALL_DANCER_MODEL_IDS.filter((id) => !this.templates.has(id));
    if (!remaining.length) return;
    await this.preloadIds(remaining, onProgress, dancerPreloadConcurrency());
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
      && this.templates.has(this.pendingLeft)
      && (this.previewMode
        ? this.pendingRight && this.templates.has(this.pendingRight)
        : true)
    ) {
      const loopOnce = this.pendingLoopOnce;
      this.pendingLoopOnce = false;
      const clipIndex = this.previewMode
        ? clipIndexFromModelId(this.pendingLeft)
        : this.pendingClipIndex;
      const force = !this.previewMode
        && (
          this.leftModelId !== this.pendingLeft
          || this.activeClipIndex !== clipIndex
          || this.pendingSubPhase !== this.lastSubPhase
        );
      this.applyPair(
        this.pendingLeft,
        this.pendingRight ?? this.pendingLeft,
        { loopOnce, force, clipIndex },
      );
      if (!this.previewMode && this.pendingSubPhase) {
        this.lastSubPhase = this.pendingSubPhase;
      }
      if (this.panelBounds) {
        this.resize(this.screenW, this.screenH, this.panelBounds);
      }
    }
  }

  private modelUrl(id: DancerModelId): string {
    return dancerModelUrl(id, MODEL_FILES[id]);
  }

  private async fetchModelBytes(id: DancerModelId, url: string): Promise<ArrayBuffer | null> {
    const cached = await readCachedModel(id);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[StageDancers] fetch failed:', url, response.status);
      return null;
    }
    const data = await response.arrayBuffer();
    writeCachedModel(id, data);
    return data;
  }

  private loadTemplate(id: DancerModelId): Promise<void> {
    const url = this.modelUrl(id);
    return this.fetchModelBytes(id, url).then((data) => {
      if (!data) return;
      return new Promise<void>((resolve) => {
        this.loader.parse(
          data,
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
          (err) => {
            console.error('[StageDancers] parse failed:', url, err);
            resolve();
          },
        );
      });
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
        color: 0x3a88b8,
        emissive: 0x66eeff,
        emissiveIntensity: 1.35,
        metalness: 0.38,
        roughness: 0.26,
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
    this.activeClipIndex = 0;
    this.pendingClipIndex = 0;
    this.pendingLeft = null;
    this.pendingRight = null;
    this.pendingLoopOnce = false;
    this.lastSubPhase = null;
    this.pendingSubPhase = null;
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
    clipIndex = 0,
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
      const idx = Math.min(Math.max(0, clipIndex), template.clips.length - 1);
      const action = mixer.clipAction(template.clips[idx]);
      if (loopOnce) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.reset().play();
      if (mirror) this.rightMixer = mixer;
      else this.leftMixer = mixer;
      return mixer;
    }
    return null;
  }

  private applyPair(
    leftId: DancerModelId,
    rightId: DancerModelId,
    options?: { loopOnce?: boolean; force?: boolean; clipIndex?: number },
  ): void {
    const clipIndex = options?.clipIndex ?? clipIndexFromModelId(leftId);

    if (this.previewMode) {
      if (!options?.force && this.leftModelId === leftId && this.rightModelId === rightId) return;
      const leftTemplate = this.templates.get(leftId);
      const rightTemplate = this.templates.get(rightId);
      if (!leftTemplate || !rightTemplate) return;

      this.clearRoots();
      this.mountSide(this.leftRoot, leftTemplate, false, options?.loopOnce, clipIndexFromModelId(leftId));
      this.mountSide(this.rightRoot, rightTemplate, true, options?.loopOnce, clipIndexFromModelId(rightId));
      this.leftModelId = leftId;
      this.rightModelId = rightId;
      this.activeClipIndex = clipIndexFromModelId(leftId);
      this.layoutKey = '';
      return;
    }

    const dancerId = leftId;
    if (
      !options?.force
      && this.leftModelId === dancerId
      && this.rightModelId === null
      && this.activeClipIndex === clipIndex
    ) {
      return;
    }
    const template = this.templates.get(dancerId);
    if (!template) return;

    this.clearRoots();
    const mixer = this.mountSide(this.leftRoot, template, false, options?.loopOnce, clipIndex);
    if (options?.loopOnce && mixer) this.bindPerfectFinish(mixer);
    this.leftModelId = dancerId;
    this.rightModelId = null;
    this.activeClipIndex = clipIndex;
    this.layoutKey = '';
  }

  private switchToPerfectTier(tier: 1 | 2 | 3 | 4): void {
    const id = perfectModelForTier(tier);
    this.perfectDanceActive = true;
    this.activePerfectTier = tier;
    this.maxPerfectTierPlayed = tier;
    this.pendingLeft = id;
    this.pendingRight = this.previewMode ? id : null;
    this.pendingLoopOnce = true;
    this.queueLoad(id);
    if (this.templates.has(id)) {
      this.pendingLoopOnce = false;
      const force = this.leftModelId === id
        && this.rightModelId === (this.previewMode ? id : null);
      this.applyPair(id, id, { loopOnce: true, force });
    }
  }

  private beginRotation(): void {
    this.rotationPlan = createDancerRotationPlan();
    this.lastSubPhase = null;
    this.pendingSubPhase = null;
    this.pendingClipIndex = 0;
    this.activeClipIndex = 0;
    this.maxPerfectTierPlayed = 0;
    this.leftModelId = null;
    this.rightModelId = null;
    this.pendingLeft = null;
    this.pendingRight = null;
    this.clearRoots();

    const ids = new Set(Object.values(this.rotationPlan));
    for (const phase of ['early', 'mid', 'late'] as SongPhase[]) {
      for (const id of PHASE_MODEL_POOLS[phase]) ids.add(id);
    }
    for (const id of ids) this.queueLoad(id);
  }

  private ensureModels(subPhase: DancerSubPhase, perfectBoost: number): void {
    const targetTier = getPerfectDancerTier(perfectBoost);

    if (this.perfectDanceActive) {
      if (targetTier > this.activePerfectTier) {
        this.switchToPerfectTier(targetTier as 1 | 2 | 3 | 4);
      }
      return;
    }

    if (targetTier > this.maxPerfectTierPlayed) {
      this.pendingSubPhase = subPhase;
      this.switchToPerfectTier(targetTier as 1 | 2 | 3 | 4);
      return;
    }

    const plan = this.rotationPlan;
    if (!plan) return;

    const desiredId = plan[subPhase];
    const desiredClip = clipIndexFromModelId(desiredId);
    const mounted = this.leftRoot.children.length > 0;
    if (
      mounted
      && this.lastSubPhase === subPhase
      && this.leftModelId === desiredId
      && this.activeClipIndex === desiredClip
    ) {
      return;
    }

    this.pendingLeft = desiredId;
    this.pendingRight = null;
    this.pendingClipIndex = desiredClip;
    this.pendingLoopOnce = false;
    this.pendingSubPhase = subPhase;
    this.queueLoad(desiredId);

    if (this.templates.has(desiredId)) {
      this.applyPair(desiredId, desiredId, { force: true, clipIndex: desiredClip });
      this.lastSubPhase = subPhase;
    }
  }

  show(): void {
    this.visible = true;
    this.layer.classList.remove('hidden');
    this.beginRotation();
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
    this.activeClipIndex = 0;
    this.pendingClipIndex = 0;
    this.pendingLeft = null;
    this.pendingRight = null;
    this.pendingLoopOnce = false;
    this.lastSubPhase = null;
    this.pendingSubPhase = null;
    this.rotationPlan = null;
    this.perfectDanceActive = false;
    this.activePerfectTier = 0;
    this.maxPerfectTierPlayed = 0;
    this.unbindPerfectFinishHandlers();
    this.layoutKey = '';
    this.hideStageBackdrops();
    this.clearRoots();
  }

  startPreview(leftId: DancerModelId, rightId: DancerModelId): void {
    this.previewMode = true;
    this.previewLeft = leftId;
    this.previewRight = rightId;
    this.lastSubPhase = null;
    this.pendingSubPhase = null;
    this.rotationPlan = null;
    this.perfectDanceActive = false;
    this.activePerfectTier = 0;
    this.maxPerfectTierPlayed = 0;
    this.visible = true;
    this.layer.classList.remove('hidden');
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
    anchorCanvasY: number,
    targetHeight: number,
    template: DancerTemplate,
    anchor: 'feet' | 'center' = 'feet',
  ): void {
    const modelH = Math.max(template.height, 0.01);
    const modelW = Math.max(template.width, 0.01);
    let scale = targetHeight / modelH;
    if (modelW * scale > maxWidth) scale = maxWidth / modelW;
    const scaledH = modelH * scale;
    root.scale.setScalar(scale);
    const footCanvasY = anchor === 'feet' ? anchorCanvasY : anchorCanvasY + scaledH * 0.5;
    root.position.set(centerX, this.toWorldY(footCanvasY), 0);
  }

  private layoutDancers(bounds: LaneBounds): void {
    const leftTemplate = this.leftModelId ? this.templates.get(this.leftModelId) : null;
    if (!leftTemplate) return;

    const availH = Math.max(100, bounds.hitLineY - bounds.topY);

    if (this.previewMode) {
      const rightTemplate = this.rightModelId ? this.templates.get(this.rightModelId) : null;
      if (!rightTemplate) return;
      const targetHeight = availH * 0.82;
      const footCanvasY = bounds.hitLineY - 4;
      const stageCenterCanvasY = bounds.topY + availH * 0.5;
      this.rightRoot.visible = true;
      this.ensureStageBackdrops(2);
      this.layoutStageBackdrop(0, this.screenW * 0.26, stageCenterCanvasY, this.screenW * 0.24, availH * 0.88);
      this.layoutStageBackdrop(1, this.screenW * 0.74, stageCenterCanvasY, this.screenW * 0.24, availH * 0.88);
      this.placeDancer(this.leftRoot, this.screenW * 0.26, this.screenW * 0.22, footCanvasY, targetHeight, leftTemplate);
      this.placeDancer(this.rightRoot, this.screenW * 0.74, this.screenW * 0.22, footCanvasY, targetHeight, rightTemplate);
      return;
    }

    this.rightRoot.visible = false;
    const laneEnd = bounds.startX + bounds.width;
    const stageW = Math.max(120, this.screenW - laneEnd);
    const centerX = laneEnd + stageW * 0.5;
    const stageCenterCanvasY = bounds.topY + availH * 0.5 + 40;
    const targetHeight = availH * 0.78;
    this.ensureStageBackdrops(1);
    this.layoutStageBackdrop(0, centerX, stageCenterCanvasY, stageW * 0.96, availH * 0.9);
    this.placeDancer(
      this.leftRoot, centerX, stageW * 0.88, stageCenterCanvasY, targetHeight, leftTemplate, 'center',
    );
  }

  private update(dt: number): void {
    this.leftMixer?.update(dt);
    if (this.previewMode) this.rightMixer?.update(dt);
  }

  render(
    dt: number,
    bounds: LaneBounds,
    currentTime: number,
    songDuration: number,
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
      const subPhase = getDancerSubPhase(currentTime, songDuration);
      this.ensureModels(subPhase, perfectBoost);
    }

    if (!this.leftModelId) return;
    if (this.previewMode) {
      if (!this.rightModelId) return;
      if (this.leftRoot.children.length === 0 || this.rightRoot.children.length === 0) return;
    } else if (this.leftRoot.children.length === 0) {
      return;
    }

    const layoutKey = [
      bounds.startX, bounds.width, bounds.hitLineY, bounds.topY,
      screenW, screenH, this.leftModelId, this.rightModelId ?? 'solo', this.previewMode ? 'preview' : 'play',
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
    for (const mesh of this.stageBackdrops) {
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.map?.dispose();
        mat.dispose();
      }
    }
    this.stageBackdrops = [];
    this.renderer.dispose();
    disposeGltfLoaders();
    this.layer.remove();
  }
}
