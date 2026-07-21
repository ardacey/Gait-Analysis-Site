// Canlı pratik (yürüyüş) modu için eğitim gerektirmeyen, basit adım/tekrar sayacı.
//
// Yöntem: açı sinyalinde çevrimiçi tepe-vadi (pivot) tespiti — finans grafiklerindeki "ZigZag"
// göstergesiyle aynı mantık. Bir yön değişimini (örn. düşüşten yükselişe) "gerçek" bir pivot
// olarak saymak için, hareketin PROMINENCE_DEG'den daha büyük olması gerekiyor — küçük
// titremeler/algılama gürültüsü (ve gait'teki duruş-fazı ikincil bükülmesi, bkz. aşağıdaki
// PROMINENCE_DEG yorumu) pivot sayılmaz. Eğitim verisi gerektirmiyor, bkz.
// docs/real-time-arastirma-raporu.md §2.1.
//
// "Tekrar" tanımı: bu projedeki açı kuralına göre (uzamış ~180°, bükülmüş daha küçük açı),
// tüm eklemlerde (diz/kalça/dirsek) VADİ = hareketin en bükülü/alt noktası. Her onaylanan vadi
// bir tekrar olarak sayılır. Yürüyüşte L Knee + R Knee vadi toplamı = adım sayısı (bkz.
// LivePractice.tsx); genel amaçlı olduğu için ileride egzersiz tekrarları için de kullanılabilir.

import type { LiveAngles } from './poseAngles'

// Normal yürüyüşte diz açısı bir gait cycle'da İKİ kez küçülüyor: (1) topuk vuruşundan hemen
// sonraki küçük "yük aktarımı" bükülmesi (duruş fazı, ~15-20°), (2) asıl salınım fazındaki büyük
// bükülme (~60-65°). Eşik bu ikisinin arasında olmalı — yoksa her adım 2 kez sayılır (gözlemlendi:
// PROMINENCE_DEG=15 ile tam bu oluyordu). 30°, duruş-fazı bükülmesini güvenle eler, azalmış ROM'lu
// (rehab/yaşlı) hastalarda bile salınım-fazı bükülmesini (tipik >40°) hâlâ yakalar.
const PROMINENCE_DEG = 30

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
