// Canlı pratik modu için çalışan (running) metrik takibi.
//
// Kapsam: analiz sayfasındaki (AnalysisViewer) "Metrikler" sekmesinin canlı karşılığı — açı
// ortalaması ve açısal hız (derece/sn) RMS'i, offline HRNet-2D pipeline'ıyla (bkz.
// scripts/stgcn/feature_extraction_2d.py: `{slug}_angle_mean`, `{slug}_angular_velocity_rms`,
// "derece/sn" yorumu) AYNI tanımları kullanır. Buna ek olarak ROM (hareket açıklığı, min-max)
// takip edilir. MeTRAbs'in kadans/adım uzunluğu/yürüyüş hızı gibi metrik (mm, mm/s) özellikleri
// buraya DAHİL DEĞİL — bunlar derinlik/3D gerektiriyor, MoveNet (2D) ile hesaplanamaz (bkz.
// docs/real-time-arastirma-raporu.md §5).
//
// Performans: her kare çağrılacağı için (30-60fps) tüm geçmişi saklamak yerine Welford çevrimiçi
// ortalama/varyans algoritması kullanılıyor (O(1) güncelleme, sabit bellek). Sadece grafik için
// sınırlı bir kayan pencere (GRAPH_WINDOW_SEC) tutuluyor.

import type { LiveAngles } from './poseAngles'

export interface JointStat {
  mean: number
  angularVelocityRms: number
  romMin: number
  romMax: number
}

interface JointAccumulator {
  n: number
  mean: number
  velN: number
  velMean: number
  velM2: number // Welford — E[v^2] = Var(v) + Mean(v)^2 üzerinden RMS türetmek için
  min: number
  max: number
  lastValue: number | null
  lastT: number | null
}

function freshAccumulator(): JointAccumulator {
  return { n: 0, mean: 0, velN: 0, velMean: 0, velM2: 0, min: Infinity, max: -Infinity, lastValue: null, lastT: null }
}

export type LiveGraphPoint = { t: number } & Partial<Record<keyof LiveAngles, number>>

const GRAPH_WINDOW_SEC = 12
// Algılama sıçramalarından (kısa süreli kaybolup başka bir konumda yeniden beliren nokta vb.)
// kaynaklanan gerçekçi olmayan açısal hız uç değerlerini ele — insan hareketinde bu kadar hızlı
// açı değişimi fizyolojik olarak beklenmez.
const MAX_VELOCITY_DEG_S = 2000

export class LiveMetricsTracker {
  private acc: Partial<Record<keyof LiveAngles, JointAccumulator>> = {}
  private graphBuffer: LiveGraphPoint[] = []
  private startT: number | null = null

  push(angles: LiveAngles, tSec: number): void {
    if (this.startT == null) this.startT = tSec
    const relT = tSec - this.startT
    const point: LiveGraphPoint = { t: relT }

    for (const key of Object.keys(angles) as (keyof LiveAngles)[]) {
      const val = angles[key]
      if (Number.isNaN(val)) continue
      point[key] = val

      const a = (this.acc[key] ??= freshAccumulator())
      // Running mean (Welford)
      a.n += 1
      a.mean += (val - a.mean) / a.n
      // ROM
      if (val < a.min) a.min = val
      if (val > a.max) a.max = val
      // Açısal hız (derece/sn) — ardışık geçerli örnekler arasında
      if (a.lastValue != null && a.lastT != null) {
        const dt = tSec - a.lastT
        if (dt > 0.001) {
          const v = (val - a.lastValue) / dt
          if (Math.abs(v) < MAX_VELOCITY_DEG_S) {
            a.velN += 1
            const vDelta = v - a.velMean
            a.velMean += vDelta / a.velN
            const vDelta2 = v - a.velMean
            a.velM2 += vDelta * vDelta2
          }
        }
      }
      a.lastValue = val
      a.lastT = tSec
    }

    this.graphBuffer.push(point)
    const cutoff = relT - GRAPH_WINDOW_SEC
    while (this.graphBuffer.length > 1 && this.graphBuffer[0].t < cutoff) this.graphBuffer.shift()
  }

  getStats(): Partial<Record<keyof LiveAngles, JointStat>> {
    const out: Partial<Record<keyof LiveAngles, JointStat>> = {}
    for (const key of Object.keys(this.acc) as (keyof LiveAngles)[]) {
      const a = this.acc[key]
      if (!a || a.n === 0) continue
      const velVariance = a.velN > 0 ? a.velM2 / a.velN : 0
      const velRms = Math.sqrt(velVariance + a.velMean * a.velMean)
      out[key] = {
        mean: a.mean,
        angularVelocityRms: velRms,
        romMin: a.min === Infinity ? NaN : a.min,
        romMax: a.max === -Infinity ? NaN : a.max,
      }
    }
    return out
  }

  getGraphData(): LiveGraphPoint[] {
    return this.graphBuffer
  }

  reset(): void {
    this.acc = {}
    this.graphBuffer = []
    this.startT = null
  }
}
