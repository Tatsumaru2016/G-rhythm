import type { JudgmentType, LaneIndex } from '../types';
import { LANE_COLORS } from '../types';
import { JUDGMENT_COLORS } from './Judgment';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface BurstTier {
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  sizeMin: number;
  sizeMax: number;
  lift: number;
  sparkRing: number;
  shockCount: number;
  useJudgmentColor: boolean;
}

const BURST_TIERS: Partial<Record<JudgmentType, BurstTier>> = {
  marvelous: {
    speedMin: 220,
    speedMax: 340,
    lifeMin: 0.72,
    lifeMax: 1.08,
    sizeMin: 3.5,
    sizeMax: 8,
    lift: 105,
    sparkRing: 18,
    shockCount: 2,
    useJudgmentColor: true,
  },
  perfect: {
    speedMin: 200,
    speedMax: 300,
    lifeMin: 0.65,
    lifeMax: 1.0,
    sizeMin: 3,
    sizeMax: 7,
    lift: 90,
    sparkRing: 16,
    shockCount: 1,
    useJudgmentColor: false,
  },
  great: {
    speedMin: 170,
    speedMax: 260,
    lifeMin: 0.55,
    lifeMax: 0.9,
    sizeMin: 2.5,
    sizeMax: 6,
    lift: 70,
    sparkRing: 14,
    shockCount: 1,
    useJudgmentColor: true,
  },
  good: {
    speedMin: 150,
    speedMax: 240,
    lifeMin: 0.5,
    lifeMax: 0.8,
    sizeMin: 2.5,
    sizeMax: 5.5,
    lift: 60,
    sparkRing: 12,
    shockCount: 1,
    useJudgmentColor: true,
  },
  bad: {
    speedMin: 130,
    speedMax: 220,
    lifeMin: 0.45,
    lifeMax: 0.75,
    sizeMin: 2,
    sizeMax: 5,
    lift: 50,
    sparkRing: 10,
    shockCount: 1,
    useJudgmentColor: true,
  },
};

const DEFAULT_TIER: BurstTier = {
  speedMin: 100,
  speedMax: 150,
  lifeMin: 0.35,
  lifeMax: 0.55,
  sizeMin: 2,
  sizeMax: 3,
  lift: 40,
  sparkRing: 0,
  shockCount: 0,
  useJudgmentColor: true,
};

export class ParticleSystem {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private reducedFlash = false;

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
  }

  constructor(poolSize = 280) {
    for (let i = 0; i < poolSize; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: '#fff',
        size: 3,
      });
    }
  }

  burst(x: number, y: number, lane: LaneIndex, count = 24, judgment?: JudgmentType) {
    const tier = (judgment && BURST_TIERS[judgment]) || DEFAULT_TIER;
    const baseColor =
      judgment && tier.useJudgmentColor ? JUDGMENT_COLORS[judgment] : LANE_COLORS[lane];
    const burstCount = this.reducedFlash ? Math.max(4, Math.floor(count * 0.4)) : count;

    for (let i = 0; i < burstCount; i++) {
      const p = this.spawn();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.55;
      const speed = tier.speedMin + Math.random() * (tier.speedMax - tier.speedMin);
      const mixWhite = judgment === 'perfect' ? 0.55 : judgment === 'great' ? 0.35 : 0.2;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - tier.lift;
      p.life = tier.lifeMin + Math.random() * (tier.lifeMax - tier.lifeMin);
      p.maxLife = p.life;
      p.color = Math.random() < mixWhite ? '#ffffff' : baseColor;
      p.size = tier.sizeMin + Math.random() * (tier.sizeMax - tier.sizeMin);

      this.active.push(p);
    }

    if (!this.reducedFlash && tier.sparkRing > 0) {
      this.sparkRing(x, y, baseColor, tier.sparkRing, judgment);
    }

    for (let s = 0; s < tier.shockCount; s++) {
      if (this.reducedFlash) break;
      this.shockwave(x, y, baseColor, judgment);
    }
  }

  private sparkRing(x: number, y: number, color: string, count: number, judgment?: JudgmentType) {
    const speed = judgment === 'bad' ? 220 : judgment === 'good' ? 260 : 300;
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) break;
      const angle = (Math.PI * 2 * i) / count;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed * 0.35 - 30;
      p.life = 0.28 + Math.random() * 0.22;
      p.maxLife = p.life;
      p.color = i % 2 === 0 ? '#ffffff' : color;
      p.size = 2 + Math.random() * 2.5;
      this.active.push(p);
    }
  }

  private shockwave(x: number, y: number, color: string, judgment?: JudgmentType) {
    const shards = judgment === 'bad' ? 10 : judgment === 'good' ? 12 : 14;
    for (let i = 0; i < shards; i++) {
      const p = this.spawn();
      if (!p) break;
      const angle = (Math.PI * 2 * i) / shards + (Math.random() - 0.5) * 0.2;
      const speed = 80 + Math.random() * 120;
      p.x = x + Math.cos(angle) * 6;
      p.y = y + Math.sin(angle) * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 20;
      p.life = 0.35 + Math.random() * 0.25;
      p.maxLife = p.life;
      p.color = color;
      p.size = 3 + Math.random() * 4;
      this.active.push(p);
    }
  }

  private spawn(): Particle | undefined {
    return this.pool.pop();
  }

  laneFlash(lane: LaneIndex, x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const p = this.spawn();
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 40;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 60;
      p.vy = -30 - Math.random() * 50;
      p.life = 0.3 + Math.random() * 0.2;
      p.maxLife = p.life;
      p.color = LANE_COLORS[lane];
      p.size = 4 + Math.random() * 3;
      this.active.push(p);
    }
  }

  clear(): void {
    for (const p of this.active) {
      this.pool.push(p);
    }
    this.active.length = 0;
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        this.active.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.vx *= 0.98;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.active) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = this.reducedFlash ? 0 : 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
