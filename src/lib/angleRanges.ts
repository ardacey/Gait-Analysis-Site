// Klinik "normal" eklem açısı aralıkları — hem offline analiz sayfası (AnalysisViewer) hem de
// canlı pratik modu (LivePractice) tarafından paylaşılan TEK kaynak (önceden AnalysisViewer.tsx
// içinde gömülüydü, canlı tarafın da aynı eşikleri kullanması için buraya taşındı).
//
// low/high: bu aralığın dışına çıkınca "anormal" (kırmızı). warnLow/warnHigh: bu aralığın
// dışına çıkınca (ama low/high içindeyken) "dikkat" (sarı). İkisinin arası: normal.
export const ANGLE_RANGES: Record<string, { low: number; high: number; warnLow: number; warnHigh: number }> = {
  'L Knee':  { warnLow: 90,  low: 80,  high: 185, warnHigh: 185 },
  'R Knee':  { warnLow: 90,  low: 80,  high: 185, warnHigh: 185 },
  'L Hip':   { warnLow: 130, low: 120, high: 220, warnHigh: 225 },
  'R Hip':   { warnLow: 130, low: 120, high: 220, warnHigh: 225 },
  'L Ankle': { warnLow: 55,  low: 45,  high: 125, warnHigh: 130 },
  'R Ankle': { warnLow: 55,  low: 45,  high: 125, warnHigh: 130 },
  'L Elbow': { warnLow: 70,  low: 60,  high: 185, warnHigh: 185 },
  'R Elbow': { warnLow: 70,  low: 60,  high: 185, warnHigh: 185 },
}

/** val NaN ise (açı bu karede güvenilir hesaplanamadıysa) tüm karşılaştırmalar false döner,
 * yani varsayılan (nötr) renk verilir — takip kaybı yanlışlıkla "anormal" gibi gösterilmez. */
export function getAngleColor(key: string, val: number): { bg: string; text: string } {
  const r = ANGLE_RANGES[key]
  if (!r) return { bg: 'bg-slate-800/60', text: 'text-slate-100' }
  if (val < r.low || val > r.high)
    return { bg: 'bg-red-900/30', text: 'text-red-300' }
  if (val < r.warnLow || val > r.warnHigh)
    return { bg: 'bg-yellow-900/20', text: 'text-yellow-300' }
  return { bg: 'bg-slate-800/60', text: 'text-slate-100' }
}
