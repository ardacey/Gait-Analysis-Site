// Kural-tabanlı (ML DEĞİL) canlı geri bildirim üretici.
//
// ST-GCN/nedensel model tabanlı gerçek "doğru/yanlış icra" sınıflandırması (roadmap madde C/E,
// bkz. docs/real-time-arastirma-raporu.md) henüz yapılmadı — GAVD-artırılmış ST-GCN eğitimi
// bitene kadar bekletiliyor (bkz. konuşma geçmişi). Bu modül ONUN YERİNE değil, o zamana kadar
// basit, açıklanabilir eşik kurallarıyla bir ARA katman sağlıyor.
//
// Girdiler: lib/liveMetrics.ts (JointStat: oturum boyu ortalama/ROM/açısal hız RMS) ve
// lib/gaitMetrics.ts (kadans/adım uzunluğu/hız, YAKLAŞIK — bkz. o dosyanın başlık yorumu).
// Çıktı, offline analiz sayfasındaki components/analysis/GaitFeedback.tsx ile AYNI
// FeedbackItem şeklini kullanıyor — o bileşen (ve görsel dili) doğrudan tekrar kullanılabiliyor.
//
// Eşikler burada bağımsız seçildi (offline/TRUBA pipeline'ının sunucu-taraflı eşikleriyle AYNI
// DEĞİL, o kod bu repoda değil) — repCounter.ts'teki gait-biyomekaniği yorumuna dayanıyor:
// normal salınım fazı diz fleksiyonu ~60-65°, duruş fazı küçük bükülme ~15-20°.

import type { FeedbackItem } from '../components/analysis/GaitFeedback'
import type { LiveAngles } from './poseAngles'
import type { JointStat } from './liveMetrics'
import type { GaitStats } from './gaitMetrics'
import type { StepTimingStats } from './stepTiming'

// Bu kadar adım/tekrar birikmeden yorum üretme — oturum başında (2-3 kare) erken/gürültülü
// bir "asimetri" ya da "yetersiz ROM" uyarısı vermeyelim.
export const MIN_STEPS_FOR_FEEDBACK = 4

// Diz ROM (romMax-romMin): salınım fazındaki asıl bükülmeyi (~60-65°) yakalayan sağlıklı bir
// açıklık genelde 45°+ civarında. Belirgin altı, bacağın yeterince kaldırılmadığının işareti
// (rehab/yaşlı hastalarda azalmış ROM de bu bandın altına düşebilir — bu beklenen bir sinyal).
const KNEE_ROM_WARN_DEG = 35
const KNEE_ROM_GOOD_DEG = 45

// L/R arasındaki fark bu kadarı aşarsa asimetri uyarısı, bunun altı simetrik kabul edilir.
export const SYMMETRY_WARN_DEG = 15
export const SYMMETRY_GOOD_DEG = 8

// Kadans YAKLAŞIK bir metrik (bkz. gaitMetrics.ts, piksel->metre varsayımına dayanıyor) —
// burada geniş, temkinli bir "olağan aralık" bandı kullanılıyor, kesin klinik referans değil.
const CADENCE_LOW = 70
const CADENCE_HIGH = 140

// Adım ritmi (bkz. stepTiming.ts) — webcam/MoveNet hassasiyeti laboratuvar mocap'ından çok daha
// düşük olduğu için klinik CV eşikleri (~%3-4) yerine kasıtlı olarak geniş bir bant kullanılıyor.
const STEP_CV_WARN_PCT = 30 // bunun üstü belirgin ritim düzensizliği
const STEP_CV_GOOD_PCT = 15
const STEP_LR_DIFF_WARN_PCT = 25 // sol/sağ adım süresi farkı bunun üstündeyse bacak favorileme sinyali
const STEP_LR_DIFF_GOOD_PCT = 12

/** Bir eklemin oturum boyu hareket açıklığı (derece). Yetersiz veri varsa null. */
export function romSpan(s: JointStat | undefined): number | null {
  if (!s || Number.isNaN(s.romMin) || Number.isNaN(s.romMax)) return null
  return s.romMax - s.romMin
}

export function buildLiveFeedback(
  stats: Partial<Record<keyof LiveAngles, JointStat>>,
  gait: GaitStats,
  stepCount: number,
  stepTiming?: StepTimingStats,
): FeedbackItem[] {
  if (stepCount < MIN_STEPS_FOR_FEEDBACK) return []
  const items: FeedbackItem[] = []

  // Diz ROM yeterliliği (sol/sağ ayrı ayrı) — "bacağınızı yeterince kaldırmıyorsunuz" sinyali.
  for (const [key, side, metric] of [
    ['L Knee', 'Sol', 'left_knee_rom'],
    ['R Knee', 'Sağ', 'right_knee_rom'],
  ] as const) {
    const span = romSpan(stats[key])
    if (span == null) continue
    if (span < KNEE_ROM_WARN_DEG) {
      items.push({
        type: 'warning', metric, label: `${side} Diz Hareket Açıklığı`, value: span, unit: '°',
        message: `${side} bacağınızı yeterince kaldırmıyor olabilirsiniz — adım atarken diz hareketini artırmayı deneyin.`,
      })
    } else if (span >= KNEE_ROM_GOOD_DEG) {
      items.push({
        type: 'good', metric, label: `${side} Diz Hareket Açıklığı`, value: span, unit: '°',
        message: `${side} diz hareket açıklığınız normal aralıkta.`,
      })
    }
  }

  // Diz simetrisi (L vs R ROM farkı).
  const lKneeRom = romSpan(stats['L Knee'])
  const rKneeRom = romSpan(stats['R Knee'])
  if (lKneeRom != null && rKneeRom != null) {
    const diff = Math.abs(lKneeRom - rKneeRom)
    if (diff >= SYMMETRY_WARN_DEG) {
      items.push({
        type: 'warning', metric: 'knee_symmetry', label: 'Diz Simetrisi', value: diff, unit: '°',
        message: 'Sol ve sağ diz hareketleriniz arasında belirgin bir fark var — bacaklarınızı dengeli kullanmaya dikkat edin.',
      })
    } else if (diff <= SYMMETRY_GOOD_DEG) {
      items.push({
        type: 'good', metric: 'knee_symmetry', label: 'Diz Simetrisi', value: diff, unit: '°',
        message: 'Sol ve sağ diz hareketleriniz simetrik.',
      })
    }
  }

  // Kalça simetrisi (oturum boyu ortalama açı farkı).
  const lHip = stats['L Hip'], rHip = stats['R Hip']
  if (lHip && rHip) {
    const diff = Math.abs(lHip.mean - rHip.mean)
    if (diff >= SYMMETRY_WARN_DEG) {
      items.push({
        type: 'warning', metric: 'hip_symmetry', label: 'Kalça Simetrisi', value: diff, unit: '°',
        message: 'Sol ve sağ kalça açılarınız arasında belirgin bir fark var.',
      })
    } else if (diff <= SYMMETRY_GOOD_DEG) {
      items.push({
        type: 'good', metric: 'hip_symmetry', label: 'Kalça Simetrisi', value: diff, unit: '°',
        message: 'Sol ve sağ kalça hareketleriniz simetrik.',
      })
    }
  }

  // Kadans (YAKLAŞIK) — bkz. gaitMetrics.ts.
  if (gait.cadence != null) {
    if (gait.cadence < CADENCE_LOW) {
      items.push({
        type: 'warning', metric: 'cadence', label: 'Kadans (yaklaşık)', value: gait.cadence, unit: 'adım/dk',
        message: 'Adım hızınız düşük görünüyor.',
      })
    } else if (gait.cadence > CADENCE_HIGH) {
      items.push({
        type: 'warning', metric: 'cadence', label: 'Kadans (yaklaşık)', value: gait.cadence, unit: 'adım/dk',
        message: 'Adım hızınız normalden yüksek görünüyor, tempoyu biraz düşürebilirsiniz.',
      })
    } else {
      items.push({
        type: 'good', metric: 'cadence', label: 'Kadans (yaklaşık)', value: gait.cadence, unit: 'adım/dk',
        message: 'Adım hızınız normal aralıkta.',
      })
    }
  }

  // Adım ritmi (bkz. stepTiming.ts) — düzensizlik (CV) ve sol/sağ adım süresi farkı.
  if (stepTiming?.stepTimeCvPct != null) {
    if (stepTiming.stepTimeCvPct > STEP_CV_WARN_PCT) {
      items.push({
        type: 'warning', metric: 'step_rhythm', label: 'Adım Ritmi', value: stepTiming.stepTimeCvPct, unit: '%',
        message: 'Adımlarınız arasındaki süre düzensiz görünüyor — daha sabit bir tempoda yürümeyi deneyin.',
      })
    } else if (stepTiming.stepTimeCvPct <= STEP_CV_GOOD_PCT) {
      items.push({
        type: 'good', metric: 'step_rhythm', label: 'Adım Ritmi', value: stepTiming.stepTimeCvPct, unit: '%',
        message: 'Adımlarınız düzenli bir ritimde.',
      })
    }
  }
  if (stepTiming?.lrDiffPct != null) {
    if (stepTiming.lrDiffPct > STEP_LR_DIFF_WARN_PCT) {
      items.push({
        type: 'warning', metric: 'step_time_symmetry', label: 'Adım Süresi Simetrisi', value: stepTiming.lrDiffPct, unit: '%',
        message: 'Bir bacağınızı diğerinden belirgin daha uzun süre kullanıyor olabilirsiniz.',
      })
    } else if (stepTiming.lrDiffPct <= STEP_LR_DIFF_GOOD_PCT) {
      items.push({
        type: 'good', metric: 'step_time_symmetry', label: 'Adım Süresi Simetrisi', value: stepTiming.lrDiffPct, unit: '%',
        message: 'Sol ve sağ adım süreleriniz dengeli.',
      })
    }
  }

  return items
}
