// Adım zamanlaması (ritim) — RepCounter.getTimestamps()'in ham vadi zaman damgalarından
// (bkz. lib/repCounter.ts) gait-özel yorumlama: adımlar arası süre, ritim düzensizliği
// (varyasyon katsayısı) ve sol/sağ adım-döngüsü süresi asimetrisi.
//
// Önemli sınırlama (diğer gait modülleriyle AYNI): "adım" burada gerçek topuk vuruşu değil,
// dizin en çok büktüğü an (bkz. repCounter.ts PROMINENCE_DEG yorumu) — bu yüzden mutlak süre
// değerleri laboratuvar-kalite mocap ile birebir karşılaştırılabilir DEĞİL, ama aynı kişinin
// oturum içi göreli düzenliliği/simetrisi için anlamlı bir sinyal.

const MIN_INTERVALS_COMBINED = 3 // birleşik (sol+sağ) seri için en az bu kadar ardışık aralık
const MIN_INTERVALS_PER_SIDE = 2 // sol/sağ karşılaştırması için taraf başına en az bu kadar aralık

// Bu aralığın dışındaki ardışık-zaman-damgası farkları (duraklama, takip kaybından sonra ilk
// adım, ya da algılama gürültüsünden çok kısa çift-tetikleme) rythm istatistiğini bozmasın diye
// filtreleniyor.
const MIN_PLAUSIBLE_INTERVAL_SEC = 0.15
const MAX_PLAUSIBLE_INTERVAL_SEC = 5

export interface StepTimingStats {
  stepTimeMeanSec: number | null // ardışık adım (sol+sağ karışık) arası ortalama süre
  stepTimeCvPct: number | null   // varyasyon katsayısı (std/mean*100) — düşük = düzenli ritim
  lrDiffPct: number | null       // sol/sağ ortalama adım-döngüsü süresi farkı, % olarak
}

function intervals(sortedTimestamps: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < sortedTimestamps.length; i++) out.push(sortedTimestamps[i] - sortedTimestamps[i - 1])
  return out
}

function plausible(xs: number[]): number[] {
  return xs.filter(x => x >= MIN_PLAUSIBLE_INTERVAL_SEC && x <= MAX_PLAUSIBLE_INTERVAL_SEC)
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdDev(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

export function computeStepTimingStats(lTimestamps: number[], rTimestamps: number[]): StepTimingStats {
  const combined = [...lTimestamps, ...rTimestamps].sort((a, b) => a - b)
  const combinedIntervals = plausible(intervals(combined))

  let stepTimeMeanSec: number | null = null
  let stepTimeCvPct: number | null = null
  if (combinedIntervals.length >= MIN_INTERVALS_COMBINED) {
    const m = mean(combinedIntervals)
    stepTimeMeanSec = m
    stepTimeCvPct = m > 0 ? (stdDev(combinedIntervals, m) / m) * 100 : null
  }

  let lrDiffPct: number | null = null
  const lIntervals = plausible(intervals(lTimestamps))
  const rIntervals = plausible(intervals(rTimestamps))
  if (lIntervals.length >= MIN_INTERVALS_PER_SIDE && rIntervals.length >= MIN_INTERVALS_PER_SIDE) {
    const lMean = mean(lIntervals), rMean = mean(rIntervals)
    const avg = (lMean + rMean) / 2
    lrDiffPct = avg > 0 ? (Math.abs(lMean - rMean) / avg) * 100 : null
  }

  return { stepTimeMeanSec, stepTimeCvPct, lrDiffPct }
}
