// Canlı pratik modu için eğitim gerektirmeyen, basit tekrar sayacı.
//
// Yöntem: açı sinyalinde çevrimiçi tepe-vadi (pivot) tespiti — finans grafiklerindeki "ZigZag"
// göstergesiyle aynı mantık. Bir yön değişimini (örn. düşüşten yükselişe) "gerçek" bir pivot
// olarak saymak için, hareketin PROMINENCE_DEG'den (varsayılan 15°) daha büyük olması gerekiyor
// — küçük titremeler/algılama gürültüsü pivot sayılmaz. Eğitim verisi gerektirmiyor, bkz.
// docs/real-time-arastirma-raporu.md §2.1.
//
// "Tekrar" tanımı: bu projedeki açı kuralına göre (uzamış ~180°, bükülmüş daha küçük açı),
// tüm eklemlerde (diz/kalça/dirsek) VADİ = hareketin en bükülü/alt noktası. Her onaylanan vadi
// bir tekrar olarak sayılır — squat'ta "aşağı iniş", kol kıvırmada "kıvırma" anına denk gelir.

import type { LiveAngles } from './poseAngles'

const PROMINENCE_DEG = 15

type PivotDirection = 'up' | 'down'

interface JointRepState {
  direction: PivotDirection
  extreme: number // mevcut yönde şu ana kadar görülen en uç (aday pivot) değer
  reps: number
}

export class RepCounter {
  private state: Partial<Record<keyof LiveAngles, JointRepState>> = {}

  push(angles: LiveAngles): void {
    for (const key of Object.keys(angles) as (keyof LiveAngles)[]) {
      const val = angles[key]
      if (Number.isNaN(val)) continue

      const s = this.state[key]
      if (!s) {
        // İlk geçerli örnek — yön henüz bilinmiyor, 'up' varsayımıyla başla (ilk gerçek pivot
        // tespit edildiğinde kendini düzeltir, sayaç etkilenmez).
        this.state[key] = { direction: 'up', extreme: val, reps: 0 }
        continue
      }

      if (s.direction === 'up') {
        if (val > s.extreme) {
          s.extreme = val
        } else if (val <= s.extreme - PROMINENCE_DEG) {
          // Tepe onaylandı (extreme), şimdi vadiye doğru izleniyor.
          s.direction = 'down'
          s.extreme = val
        }
      } else {
        if (val < s.extreme) {
          s.extreme = val
        } else if (val >= s.extreme + PROMINENCE_DEG) {
          // Vadi onaylandı = 1 tekrar.
          s.reps += 1
          s.direction = 'up'
          s.extreme = val
        }
      }
    }
  }

  getReps(): Partial<Record<keyof LiveAngles, number>> {
    const out: Partial<Record<keyof LiveAngles, number>> = {}
    for (const key of Object.keys(this.state) as (keyof LiveAngles)[]) {
      out[key] = this.state[key]!.reps
    }
    return out
  }

  reset(): void {
    this.state = {}
  }
}
