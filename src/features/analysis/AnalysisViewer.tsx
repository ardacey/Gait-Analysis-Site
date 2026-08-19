import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  X, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Activity, Loader2, AlertCircle, FileText, CheckCircle2, XCircle,
} from 'lucide-react'
import type { AnalysisData, AnalysisFrame, FeedbackItem, VideoRecord } from '../../types'
import { GaitFeedback } from '../../components/analysis/GaitFeedback'
import { Skeleton3D, type Skeleton3DHandle } from './Skeleton3D'
import { AnglesGraph } from './AnglesGraph'
import { getAngleColor } from '../../lib/angleRanges'

interface AnalysisViewerProps {
  video: VideoRecord
  onClose: () => void
}

const GAIT_PHASE_LABELS: Record<string, { label: string; color: string }> = {
  // MeTRAbs dönemi etiketleri (eski kayıtlar)
  swing:             { label: 'Salınım',        color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  terminal_stance:   { label: 'Terminal Duruş', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  loading_response:  { label: 'Yük Aktarımı',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  mid_stance:        { label: 'Orta Duruş',     color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  stance:            { label: 'Duruş',          color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  // HRNet bacak-başına faz etiketleri (feature_extraction_2d.compute_gait_events)
  double_support:    { label: 'Çift Destek',    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  l_swing:           { label: 'Sol Salınım',    color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  r_swing:           { label: 'Sağ Salınım',    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  double_float:      { label: 'Belirsiz',       color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
}

const PHASE_BAR_CLASS: Record<string, string> = {
  swing:            'bg-blue-500',
  terminal_stance:  'bg-purple-500',
  loading_response: 'bg-yellow-500',
  mid_stance:       'bg-emerald-500',
  stance:           'bg-slate-500',
  // HRNet bacak-başına fazlar — GAIT_PHASE_LABELS ile aynı renk aileleri; eksik kalınca
  // hepsi gri fallback'e düşüyordu (dağılım çubuğu tek renk görünüyordu)
  double_support:   'bg-emerald-500',
  l_swing:          'bg-blue-500',
  r_swing:          'bg-cyan-500',
  double_float:     'bg-slate-500',
}

const ANGLE_LABELS: Record<string, string> = {
  'L Knee': 'Sol Diz', 'R Knee': 'Sağ Diz',
  'L Hip': 'Sol Kalça', 'R Hip': 'Sağ Kalça',
  'L Ankle': 'Sol Ayak', 'R Ankle': 'Sağ Ayak',
  'L Elbow': 'Sol Dirsek', 'R Elbow': 'Sağ Dirsek',
}

const METRIC_LABELS: Record<string, string> = {
  // Spatio-temporal
  cadence:                            'Kadans',
  walking_speed:                      'Yürüyüş Hızı',
  stride_length_mean:                 'Adım Uzunluğu (Ort.)',
  stride_length_mean_normalized:      'Adım Uzunluğu (Normalize)',
  step_width_mean:                    'Adım Genişliği (Ort.)',
  step_width_mean_normalized:         'Adım Genişliği (Normalize)',
  walking_speed_normalized:           'Yürüyüş Hızı (Normalize)',
  leg_length_mean:                    'Bacak Uzunluğu (Ort.)',
  // Temporal
  step_time_mean:                     'Adım Süresi (Ort.)',
  stride_time_mean:                   'Yürüyüş Çevrimi Süresi (Ort.)',
  stance_time_mean:                   'Duruş Fazı Süresi (Ort.)',
  swing_time_mean:                    'Salınım Fazı Süresi (Ort.)',
  // Kinematics — ankle
  ankle_angle_mean:                   'Ayak Bileği Açısı (Ort.)',
  ankle_angular_velocity_rms:         'Ayak Bileği Açısal Hız (RMS)',
  ankle_angular_velocity_std:         'Ayak Bileği Açısal Hız (Std)',
  ankle_angular_acceleration_rms:     'Ayak Bileği Açısal İvme (RMS)',
  // Kinematics — knee
  knee_angular_velocity_rms:          'Diz Açısal Hız (RMS)',
  knee_angular_velocity_std:          'Diz Açısal Hız (Std)',
  knee_angular_acceleration_rms:      'Diz Açısal İvme (RMS)',
  // Kinematics — hip
  hip_angular_velocity_rms:           'Kalça Açısal Hız (RMS)',
  hip_angular_velocity_std:           'Kalça Açısal Hız (Std)',
  hip_angular_acceleration_rms:       'Kalça Açısal İvme (RMS)',
  // Kinematics — trunk & pelvis
  trunk_angular_velocity_rms:         'Gövde Açısal Hız (RMS)',
  trunk_angular_velocity_std:         'Gövde Açısal Hız (Std)',
  trunk_angular_acceleration_rms:     'Gövde Açısal İvme (RMS)',
  pelvis_tilt_angular_velocity_rms:   'Pelvis Eğim Açısal Hız (RMS)',
  pelvis_tilt_angular_acceleration_rms:'Pelvis Eğim Açısal İvme (RMS)',
  // HRNet-2D eklem açı istatistikleri (feature_extraction_2d summary — taraf-önekli anahtarlar,
  // yukarıdaki MeTRAbs-dönemi önek-siz anahtarlarla karışmasın)
  l_knee_angle_mean:                  'Sol Diz Açısı (Ort.)',
  r_knee_angle_mean:                  'Sağ Diz Açısı (Ort.)',
  l_hip_angle_mean:                   'Sol Kalça Açısı (Ort.)',
  r_hip_angle_mean:                   'Sağ Kalça Açısı (Ort.)',
  l_elbow_angle_mean:                 'Sol Dirsek Açısı (Ort.)',
  r_elbow_angle_mean:                 'Sağ Dirsek Açısı (Ort.)',
  l_knee_angular_velocity_rms:        'Sol Diz Açısal Hız (RMS)',
  r_knee_angular_velocity_rms:        'Sağ Diz Açısal Hız (RMS)',
  l_hip_angular_velocity_rms:         'Sol Kalça Açısal Hız (RMS)',
  r_hip_angular_velocity_rms:         'Sağ Kalça Açısal Hız (RMS)',
  l_elbow_angular_velocity_rms:       'Sol Dirsek Açısal Hız (RMS)',
  r_elbow_angular_velocity_rms:       'Sağ Dirsek Açısal Hız (RMS)',
  // HRNet-2D yürüyüş metrikleri (feature_extraction_2d.compute_gait_metrics — canlı
  // pratik modülüyle aynı tanımlar: adım=diz vadisi, uzunluk/hız gövde-ölçek yaklaşımı)
  step_count:                         'Adım Sayısı',
  step_time_cv_pct:                   'Adım Ritmi Düzensizliği (CV)',
  step_time_lr_diff_pct:              'Sol/Sağ Adım Süresi Farkı',
  knee_rom_lr_diff:                   'Diz ROM Sol/Sağ Farkı',
  hip_angle_mean_lr_diff:             'Kalça Açısı Sol/Sağ Farkı',
  l_knee_rom:                         'Sol Diz ROM',
  r_knee_rom:                         'Sağ Diz ROM',
  l_hip_rom:                          'Sol Kalça ROM',
  r_hip_rom:                          'Sağ Kalça ROM',
  l_elbow_rom:                        'Sol Dirsek ROM',
  r_elbow_rom:                        'Sağ Dirsek ROM',
  valid_frame_ratio:                  'Geçerli Kare Oranı',
  // Olay tespiti / faz metrikleri (compute_gait_events)
  stance_pct_l:                       'Sol Duruş Fazı',
  stance_pct_r:                       'Sağ Duruş Fazı',
  swing_pct_l:                        'Sol Salınım Fazı',
  swing_pct_r:                        'Sağ Salınım Fazı',
  double_support_pct:                 'Çift Destek',
  stride_time_l_mean:                 'Sol Yürüyüş Döngü Süresi',
  stride_time_r_mean:                 'Sağ Yürüyüş Döngü Süresi',
  step_time_l_mean:                   'Sol Adım Süresi',
  step_time_r_mean:                   'Sağ Adım Süresi',
  step_length_l_mean:                 'Sol Adım Uzunluğu',
  step_length_r_mean:                 'Sağ Adım Uzunluğu',
  step_length_cv_pct:                 'Adım Uzunluğu Değişkenliği (CV)',
  step_length_lr_diff_pct:            'Sol/Sağ Adım Uzunluğu Farkı',
  trunk_sway_rms_mm:                  'Gövde Salınımı (RMS)',
  l_knee_stance_mean:                 'Sol Diz Açısı — Duruş Fazı',
  r_knee_stance_mean:                 'Sağ Diz Açısı — Duruş Fazı',
  l_knee_swing_mean:                  'Sol Diz Açısı — Salınım Fazı',
  r_knee_swing_mean:                  'Sağ Diz Açısı — Salınım Fazı',
  l_knee_swing_min_angle:             'Sol Diz Tepe Fleksiyon (Salınım)',
  r_knee_swing_min_angle:             'Sağ Diz Tepe Fleksiyon (Salınım)',
  l_hip_stance_mean:                  'Sol Kalça Açısı — Duruş Fazı',
  r_hip_stance_mean:                  'Sağ Kalça Açısı — Duruş Fazı',
  l_hip_swing_mean:                   'Sol Kalça Açısı — Salınım Fazı',
  r_hip_swing_mean:                   'Sağ Kalça Açısı — Salınım Fazı',
}

interface MetricInfo { label: string; value: string; unit: string }
function processMetric(key: string, raw: number): MetricInfo {
  const k = key.toLowerCase()
  const label = METRIC_LABELS[key] ?? key.replace(/_/g, ' ')
  // Normalized (dimensionless ratio) — check before length/speed
  if (k.includes('normalized'))           return { label, value: raw.toFixed(3), unit: '' }
  // HRNet-2D yürüyüş metrikleri
  if (k === 'step_count')                return { label, value: raw.toFixed(0), unit: 'adım' }
  if (k === 'valid_frame_ratio')         return { label, value: (raw * 100).toFixed(0), unit: '%' }
  if (k.endsWith('_pct'))                return { label, value: raw.toFixed(1), unit: '%' }
  if (k.includes('_rom') || k.endsWith('_lr_diff')) return { label, value: raw.toFixed(1), unit: '°' }
  if (k.includes('step_length'))         return { label, value: (raw / 1000).toFixed(3), unit: 'm' }
  if (k.includes('sway'))                return { label, value: raw.toFixed(0), unit: 'mm' }
  if (k.includes('stance_mean') || k.includes('swing_mean') || k.includes('swing_min')) return { label, value: raw.toFixed(1), unit: '°' }
  // Distance in mm → m
  if (k.includes('leg_length'))           return { label, value: (raw / 1000).toFixed(3), unit: 'm' }
  if (k.includes('stride_length') || k.includes('step_width')) return { label, value: (raw / 1000).toFixed(3), unit: 'm' }
  // Speed in mm/s → m/s
  if (k.includes('walking_speed'))        return { label, value: (raw / 1000).toFixed(3), unit: 'm/s' }
  // Cadence
  if (k.includes('cadence'))              return { label, value: raw.toFixed(1), unit: 'adım/dk' }
  // Time
  if (k.includes('_time_'))              return { label, value: raw.toFixed(3), unit: 's' }
  // Angle
  if (k.includes('angle_mean'))          return { label, value: raw.toFixed(1), unit: '°' }
  // Angular velocity (rad/s)
  if (k.includes('angular_velocity'))    return { label, value: raw.toFixed(4), unit: 'rad/s' }
  // Angular acceleration (rad/s²)
  if (k.includes('angular_acceleration')) return { label, value: raw.toFixed(4), unit: 'rad/s²' }
  return { label, value: raw.toFixed(3), unit: '' }
}

// Metrikler sekmesi gruplama — 30+ anahtarlı düz liste okunmuyordu; klinik mantıkla
// bölümleniyor. Sıra: en çok bakılan yukarıda. Eşleşmeyen anahtar 'Diğer'e düşer.
const METRIC_GROUPS: { title: string; match: (k: string) => boolean }[] = [
  { title: 'Zamansal-Mekânsal', match: k =>
    ['cadence', 'walking_speed', 'stride_length_mean', 'step_count'].includes(k) ||
    k.startsWith('step_length_l') || k.startsWith('step_length_r') ||
    k.startsWith('step_time_') || k.startsWith('stride_time_') || k === 'step_time_mean' },
  { title: 'Yürüyüş Fazları', match: k =>
    k.startsWith('stance_pct') || k.startsWith('swing_pct') || k === 'double_support_pct' },
  { title: 'Simetri & Değişkenlik', match: k =>
    k.includes('_lr_diff') || k.endsWith('_cv_pct') || k.includes('sway') },
  { title: 'Eklem Kinematiği', match: k =>
    k.includes('_rom') || k.includes('angle_mean') || k.includes('angular_') ||
    k.includes('stance_mean') || k.includes('swing_mean') || k.includes('swing_min') },
  { title: 'Kalite', match: k => k === 'valid_frame_ratio' },
]

function groupMetrics(summary: Record<string, number>): { title: string; items: [string, number][] }[] {
  const used = new Set<string>()
  const groups = METRIC_GROUPS.map(g => {
    const items = Object.entries(summary).filter(([k]) => !used.has(k) && g.match(k))
    items.forEach(([k]) => used.add(k))
    return { title: g.title, items }
  }).filter(g => g.items.length > 0)
  const rest = Object.entries(summary).filter(([k]) => !used.has(k))
  if (rest.length > 0) groups.push({ title: 'Diğer', items: rest })
  return groups
}

// ─── PDF report ───────────────────────────────────────────────────────────────
const PHASE_TR: Record<string, string> = {
  swing: 'Salınım', stance: 'Duruş', mid_stance: 'Orta Duruş',
  loading_response: 'Yük Aktarımı', terminal_stance: 'Terminal Duruş',
  double_support: 'Çift Destek', l_swing: 'Sol Salınım', r_swing: 'Sağ Salınım',
  double_float: 'Belirsiz', 'n/a': 'Geçersiz Kare',
}

function generateReport(data: AnalysisData, filename: string) {
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) { alert('Açılır pencere engellendi.'); return }
  const phaseDist: Record<string, number> = {}
  for (const f of data.frames) phaseDist[f.gait_phase] = (phaseDist[f.gait_phase] ?? 0) + 1
  const totalF = data.frames.length
  const romRows = Object.entries(data.timeseries).map(([key, vals]) => {
    const v = vals.filter(x => x > 0 && x < 350)
    if (v.length === 0) return null
    const min = Math.min(...v).toFixed(1), max = Math.max(...v).toFixed(1)
    const mean = (v.reduce((a, b) => a + b) / v.length).toFixed(1)
    const rom = (Math.max(...v) - Math.min(...v)).toFixed(1)
    return `<tr><td>${ANGLE_LABELS[key] ?? key.replace(/_/g,' ')}</td><td>${min}°</td><td>${max}°</td><td>${mean}°</td><td>${rom}°</td></tr>`
  }).filter(Boolean).join('')
  const metricRows = Object.entries(data.summary).map(([k, v]) => {
    const m = processMetric(k, v)
    return `<tr><td>${m.label}</td><td>${m.value}${m.unit ? ' '+m.unit : ''}</td></tr>`
  }).join('')
  const phaseRows = Object.entries(phaseDist).map(([ph, cnt]) =>
    `<tr><td>${PHASE_TR[ph] ?? ph}</td><td>${((cnt/totalF)*100).toFixed(1)}%</td></tr>`
  ).join('')
  // Sınıflandırma banner'ı + geri bildirim bölümü (normatif sapma mesajları dahil)
  const cls = data.classification
  const clsBanner = cls
    ? `<div class="meta" style="margin-top:8px"><div class="meta-item"><label>ST-GCN Sınıflandırma</label><span style="color:${cls.label === 'normal' || cls.label === 'correct' ? '#059669' : '#dc2626'}">${
        cls.label === 'normal' ? 'Normal Yürüyüş' : cls.label === 'abnormal' ? 'Anormal Yürüyüş' :
        cls.label === 'correct' ? 'Doğru İcra' : 'Hatalı İcra'} · %${(cls.confidence * 100).toFixed(0)} güven</span></div></div>`
    : ''
  const feedbackRows = (data.feedback ?? []).map(fb =>
    `<tr><td style="white-space:nowrap">${fb.type === 'good' ? '✓' : '⚠'} ${fb.label}</td><td>${fb.message}</td></tr>`
  ).join('')
  const feedbackSection = feedbackRows
    ? `<h2>Geri Bildirim ve Normatif Karşılaştırma</h2><table><thead><tr><th>Değerlendirme</th><th>Açıklama</th></tr></thead><tbody>${feedbackRows}</tbody></table>`
    : ''
  const now = new Date().toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' })
  w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Yürüyüş Analiz Raporu</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b;font-size:13px}h1{background:#1d4ed8;color:white;margin:-24px -24px 24px;padding:20px 24px;font-size:18px}h2{font-size:14px;color:#1d4ed8;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f1f5f9;text-align:left;padding:6px 10px;font-size:12px}td{padding:5px 10px;border-bottom:1px solid #e2e8f0}tr:last-child td{border-bottom:none}.meta{display:flex;gap:40px;background:#f8fafc;padding:12px 16px;border-radius:6px;margin-bottom:8px}.meta-item label{font-size:11px;color:#64748b;display:block}.meta-item span{font-weight:bold}.note{margin-top:32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:12px}h1{margin:-12px -12px 16px}}</style>
</head><body>
<h1>Yürüyüş Analiz Raporu</h1>
<div class="meta"><div class="meta-item"><label>Video</label><span>${filename}</span></div><div class="meta-item"><label>Süre</label><span>${data.meta.duration.toFixed(2)}s</span></div><div class="meta-item"><label>FPS</label><span>${data.meta.fps.toFixed(0)}</span></div><div class="meta-item"><label>Rapor Tarihi</label><span>${now}</span></div></div>
${clsBanner}
${feedbackSection}
<h2>Temporal-Spatial Parametreler</h2><table><thead><tr><th>Parametre</th><th>Değer</th></tr></thead><tbody>${metricRows}</tbody></table>
<h2>Eklem Hareket Açıklığı (ROM)</h2><table><thead><tr><th>Eklem</th><th>Min</th><th>Max</th><th>Ortalama</th><th>ROM</th></tr></thead><tbody>${romRows}</tbody></table>
<h2>Yürüyüş Fazı Dağılımı</h2><table><thead><tr><th>Faz</th><th>Süre Oranı</th></tr></thead><tbody>${phaseRows}</tbody></table>
<div class="note">Bu rapor otomatik görüntü analizi ile üretilmiştir. Klinik karar için uzman değerlendirmesi gereklidir.</div>
</body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 600)
}

// ─── AnglePanel: updates via DOM refs during playback ─────────────────────────
type PanelTab = 'angles' | 'metrics' | 'feedback'

interface AnglePanelHandle { update: (f: AnalysisFrame, frameIdx: number) => void; openTab: (t: PanelTab) => void }


interface AnomalyMoment { joint: string; frameIdx: number; t: number; value: number; deviation: number }

function AnglePanel({
  initialFrame, summary, frameCount,
  panelRef, feedback, anomalyMoments, onJumpToFrame,
}: {
  initialFrame: AnalysisFrame
  summary: Record<string, number>
  frameCount: number
  panelRef: React.MutableRefObject<AnglePanelHandle | null>
  feedback?: FeedbackItem[]
  anomalyMoments?: AnomalyMoment[]
  onJumpToFrame?: (n: number) => void
}) {
  const [tab, setTab] = useState<PanelTab>('angles')
  const angleRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const angleDivRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const frameNumRef = useRef<HTMLSpanElement | null>(null)
  const timeRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    panelRef.current = {
      openTab(t: PanelTab) { setTab(t) },
      update(f: AnalysisFrame, frameIdx: number) {
        if (timeRef.current) timeRef.current.textContent = `t = ${f.t.toFixed(2)}s`
        // "Frame N / toplam" sayacı — ref'e yazan tek yer burası (önceden hiç güncellenmiyordu,
        // gösterge 1'de takılı kalıyordu)
        if (frameNumRef.current) frameNumRef.current.textContent = String(frameIdx + 1)
        for (const [key, val] of Object.entries(f.angles) as [string, number][]) {
          const span = angleRefs.current[key]
          if (span) span.textContent = `${val.toFixed(1)}°`
          const div = angleDivRefs.current[key]
          if (div) {
            const { bg, text } = getAngleColor(key, val)
            div.className = `rounded-lg px-3 py-2 ${bg}`
            if (span) span.className = `text-sm font-bold font-mono ${text}`
          }
        }
      }
    }
  }, [panelRef])

  const tabs: { id: PanelTab; label: string; disabled?: boolean }[] = [
    { id: 'angles',   label: 'Açılar' },
    { id: 'metrics',  label: 'Metrikler' },
    { id: 'feedback', label: 'Geri Bildirim', disabled: !feedback?.length },
  ]

  return (
    <div className="w-80 shrink-0 border-l border-slate-800 flex flex-col bg-slate-950/60">

      {/* Frame counter */}
      <div className="text-xs text-slate-500 flex justify-between px-4 pt-3 pb-2 shrink-0">
        <span>Frame <span ref={frameNumRef} className="text-slate-300 font-mono">1</span> / {frameCount}</span>
        <span ref={timeRef} className="font-mono text-slate-300">t = {initialFrame.t.toFixed(2)}s</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 shrink-0 px-2">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors rounded-t
              ${t.disabled
                ? 'text-slate-700 cursor-not-allowed'
                : tab === t.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — angles section always rendered (refs must stay mounted) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* AÇILAR — hidden via CSS, never unmounted */}
        <div className={tab !== 'angles' ? 'hidden' : ''}>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(initialFrame.angles) as [string, number][]).map(([key, val]) => {
              const { bg, text } = getAngleColor(key, val)
              return (
                <div
                  key={key}
                  ref={el => { angleDivRefs.current[key] = el }}
                  className={`rounded-lg px-3 py-2 ${bg}`}
                >
                  <div className="text-xs text-slate-500">{ANGLE_LABELS[key] ?? key}</div>
                  <span
                    ref={el => { angleRefs.current[key] = el }}
                    className={`text-sm font-bold font-mono ${text}`}
                  >
                    {val.toFixed(1)}°
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* METRİKLER */}
        {tab === 'metrics' && Object.keys(summary).length > 0 && (
          <div className="flex flex-col gap-3">
            {groupMetrics(summary).map(g => (
              <div key={g.title} className="rounded-xl bg-slate-900/70 border border-slate-800/80 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-800/40">
                  {g.title}
                </div>
                <div className="px-3 py-1">
                  {g.items.map(([key, val]) => {
                    const m = processMetric(key, val)
                    return (
                      <div key={key} className="flex justify-between items-center gap-2 py-1 border-b border-slate-800/60 last:border-0">
                        <span className="text-xs text-slate-400">{m.label}</span>
                        <span className="text-xs font-mono font-bold text-slate-200 whitespace-nowrap">{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GERİ BİLDİRİM */}
        {tab === 'feedback' && feedback && (
          <div className="flex flex-col gap-3">
            {anomalyMoments && anomalyMoments.length > 0 && (
              <div className="rounded-xl bg-slate-900/70 border border-slate-800/80 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-800/40">
                  En Belirgin Sapma Anları
                </div>
                <div className="px-1 py-1">
                  {anomalyMoments.map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onJumpToFrame?.(m.frameIdx)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/70 transition-colors text-left"
                      title="O ana git"
                    >
                      <span className="text-xs text-slate-300">{ANGLE_LABELS[m.joint] ?? m.joint}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        t={m.t.toFixed(1)}s · {m.value.toFixed(0)}° <span className="text-red-400">({m.deviation > 0 ? '+' : ''}{m.deviation.toFixed(0)}°)</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <GaitFeedback feedback={feedback} variant="dark" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AnalysisViewer({ video, onClose }: AnalysisViewerProps) {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [frameIdx, setFrameIdx] = useState(0)     // only used for scrubbing + graph
  const [playing, setPlaying] = useState(false)
  // Annotate'li video görünümü: 'both' = video + iskelet yan yana (annotated_url varsa
  // varsayılan), 'skeleton' = sadece 3D iskelet. Oynatma sırasında video ana saat kaynağıdır
  // (rAF ile currentTime okunup iskelet o kareye senkronlanır) — iki ayrı saat kaymaz.
  const [viewMode, setViewMode] = useState<'both' | 'skeleton'>(video.annotated_url ? 'both' : 'skeleton')
  const annotatedVideoRef = useRef<HTMLVideoElement | null>(null)

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skeletonRef = useRef<Skeleton3DHandle>(null)
  const anglePanelRef = useRef<AnglePanelHandle | null>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)
  const timeDisplayRef = useRef<HTMLSpanElement>(null)
  const phaseBadgeRef = useRef<HTMLSpanElement>(null)
  const graphLineRef = useRef<HTMLDivElement>(null)
  const frameIdxRef = useRef(0)
  const dataRef = useRef<AnalysisData | null>(null)

  useEffect(() => {
    if (!video.analysis_url) return
    setLoading(true)
    fetch(video.analysis_url)
      .then(res => { if (!res.ok) throw new Error(`Analiz yüklenemedi: ${res.status}`); return res.json() })
      .then((d: AnalysisData) => { setData(d); dataRef.current = d; setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [video.analysis_url])

  useEffect(() => {
    if (!playing || !dataRef.current) return
    const data = dataRef.current
    const fps = Math.min(data.meta.fps, 30)

    // Video-sürücülü mod: annotate'li video görünürse gerçek saat video'dur.
    const vid = annotatedVideoRef.current
    if (vid) {
      let raf = 0
      const nativeFps = data.meta.fps || 30
      vid.currentTime = data.frames[frameIdxRef.current]?.t ?? 0
      void vid.play()
      const tick = () => {
        const n = Math.max(0, Math.min(data.frames.length - 1, Math.round(vid.currentTime * nativeFps)))
        if (n !== frameIdxRef.current) {
          frameIdxRef.current = n
          const f = data.frames[n]
          skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
          anglePanelRef.current?.update(f, n)
          syncUI(n)
        }
        if (vid.ended) {
          setPlaying(false)
          setFrameIdx(frameIdxRef.current)
          return
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); vid.pause() }
    }

    playIntervalRef.current = setInterval(() => {
      const next = frameIdxRef.current + 1
      if (next >= data.frames.length) {
        setPlaying(false)
        setFrameIdx(frameIdxRef.current)
        return
      }
      frameIdxRef.current = next
      const f = data.frames[next]

      // All updates bypass React — direct DOM + Three.js
      skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
      anglePanelRef.current?.update(f, next)
      if (scrubberRef.current) scrubberRef.current.value = String(next)
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${f.t.toFixed(2)}s / ${data.meta.duration.toFixed(2)}s · ${data.meta.fps.toFixed(0)} fps`
      // Update gait phase badge
      if (phaseBadgeRef.current) {
        const info = GAIT_PHASE_LABELS[f.gait_phase]
        if (info) {
          phaseBadgeRef.current.textContent = info.label
          phaseBadgeRef.current.className = `text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`
        } else {
          // 'n/a' (geçersiz kare) — eski fazda takılı kalmasın, nötr göster
          phaseBadgeRef.current.textContent = '—'
          phaseBadgeRef.current.className = 'text-xs px-2 py-0.5 rounded-full border font-medium bg-slate-500/20 text-slate-400 border-slate-500/40'
        }
      }
      // Move graph cursor line (accounts for recharts margins: left≈30px, right≈8px)
      if (graphLineRef.current) {
        const parent = graphLineRef.current.parentElement
        const grid = parent?.querySelector('.recharts-cartesian-grid')
        if (parent && grid) {
          const pct = data.meta.duration > 0 ? f.t / data.meta.duration : 0
          const parentRect = parent.getBoundingClientRect()
          const gridRect = grid.getBoundingClientRect()
          graphLineRef.current.style.left = `${gridRect.left - parentRect.left + pct * gridRect.width}px`
        }
      }
    }, 1000 / fps)

    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, viewMode])

  // Sync all non-skeleton UI to a given frame (used on scrub/step — not during playback)
  const syncUI = useCallback((n: number) => {
    const data = dataRef.current
    if (!data) return
    const f = data.frames[n]
    // Scrub/adim/pencere-atlama: annotate'li video duraklatilmissa ayni ana tasi
    // (oynatma sirasinda video zaten ana saat — geri yazma yapma, titretir).
    const vid = annotatedVideoRef.current
    if (vid && vid.paused) vid.currentTime = f.t
    anglePanelRef.current?.update(f, n)
    if (scrubberRef.current) scrubberRef.current.value = String(n)
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${f.t.toFixed(2)}s / ${data.meta.duration.toFixed(2)}s · ${data.meta.fps.toFixed(0)} fps`
    if (phaseBadgeRef.current) {
      const info = GAIT_PHASE_LABELS[f.gait_phase]
      if (info) {
        phaseBadgeRef.current.textContent = info.label
        phaseBadgeRef.current.className = `text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`
      } else {
        phaseBadgeRef.current.textContent = '—'
        phaseBadgeRef.current.className = 'text-xs px-2 py-0.5 rounded-full border font-medium bg-slate-500/20 text-slate-400 border-slate-500/40'
      }
    }
    if (graphLineRef.current) {
      // Oynatma döngüsüyle AYNI geometri: imleç konumu gerçek grid dikdörtgeninden hesaplanır.
      // Önceki sabit 30px/38px marj tahmini gerçek recharts yerleşiminden sapıyordu — grafiğe
      // tıklanınca çizgi tıklanan noktanın soluna düşüyordu.
      const parent = graphLineRef.current.parentElement
      const grid = parent?.querySelector('.recharts-cartesian-grid')
      if (parent && grid) {
        const pct = data.meta.duration > 0 ? f.t / data.meta.duration : 0
        const parentRect = parent.getBoundingClientRect()
        const gridRect = grid.getBoundingClientRect()
        graphLineRef.current.style.left = `${gridRect.left - parentRect.left + pct * gridRect.width}px`
      }
    }
  }, [])

  const step = useCallback((delta: number) => {
    const data = dataRef.current
    if (!data) return
    const next = Math.max(0, Math.min(data.frames.length - 1, frameIdxRef.current + delta))
    frameIdxRef.current = next
    syncUI(next)
    setFrameIdx(next)
  }, [syncUI])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step])

  // perJoint: her joint için anomali frame index seti (grafik için)
  // anyJoint: herhangi bir joint'te anomali olan frame'ler (slider için)
  const { anomalyMap } = useMemo(() => {
    const empty = { anomalyMap: new Map<string, Set<number>>() }
    if (!data || data.frames.length < 8) return empty
    const keys = Object.keys(data.frames[0].angles) as string[]
    const perJoint = new Map<string, Set<number>>()
    for (const key of keys) {
      const vals = data.frames
        .map(f => (f.angles as Record<string, number>)[key])
        .filter(v => v != null && !isNaN(v))
      if (vals.length < 8) continue
      const sorted = [...vals].sort((a, b) => a - b)
      const q1 = sorted[Math.floor(sorted.length * 0.25)]
      const q3 = sorted[Math.floor(sorted.length * 0.75)]
      const iqr = q3 - q1
      const low = q1 - 1.5 * iqr
      const high = q3 + 1.5 * iqr
      const jointSet = new Set<number>()
      data.frames.forEach((f, i) => {
        const val = (f.angles as Record<string, number>)[key]
        if (val != null && (val < low || val > high)) jointSet.add(i)
      })
      if (jointSet.size > 0) perJoint.set(key, jointSet)
    }
    return { anomalyMap: perJoint }
  }, [data])

  // "En belirgin sapma anları" — anomali karelerini medyandan sapma büyüklüğüne göre sırala,
  // aynı eklemde ±15 kare içindeki tekrarları ele (bir sapma olayı bir kez listelensin), ilk 5.
  const anomalyMoments = useMemo(() => {
    if (!data) return []
    const out: { joint: string; frameIdx: number; t: number; value: number; deviation: number }[] = []
    for (const [joint, idxSet] of anomalyMap) {
      const vals = data.frames
        .map(f => (f.angles as Record<string, number>)[joint])
        .filter(v => v != null && !isNaN(v))
        .sort((a, b) => a - b)
      if (vals.length === 0) continue
      const median = vals[Math.floor(vals.length / 2)]
      const cand = [...idxSet]
        .map(i => {
          const v = (data.frames[i].angles as Record<string, number>)[joint]
          return { joint, frameIdx: i, t: data.frames[i].t, value: v, deviation: v - median }
        })
        .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
      const picked: typeof cand = []
      for (const c of cand) {
        if (picked.some(pk => Math.abs(pk.frameIdx - c.frameIdx) <= 15)) continue
        picked.push(c)
        if (picked.length >= 3) break
      }
      out.push(...picked)
    }
    return out.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)).slice(0, 5)
  }, [data, anomalyMap])

  const phaseDist = useMemo(() => {
    if (!data) return []
    // 'n/a' kareler (geçersiz/faz üretilmemiş) dağılıma katılmaz — HRNet yolunda videonun
    // kuyruğu (kişi kadraj dışı) n/a kalabiliyor, dağılım sadece yürüyüş bölgesini yansıtsın.
    const counts: Record<string, number> = {}
    let total = 0
    for (const f of data.frames) {
      if (f.gait_phase === 'n/a') continue
      counts[f.gait_phase] = (counts[f.gait_phase] ?? 0) + 1
      total++
    }
    if (total === 0) return []
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([phase, count]) => ({ phase, pct: (count / total) * 100 }))
  }, [data])

  const frame: AnalysisFrame | undefined = data?.frames[frameIdx]
  // hrnet_stgcn pipeline'ında gait_phase her zaman 'n/a' (bkz. feature_extraction_2d.py) —
  // bu videolar için anlamsız faz rozeti/dağılımı yerine ST-GCN sınıflandırma sonucunu gösteriyoruz.
  const isHrnetStgcn = video.analysis_method === 'hrnet_stgcn'
  // ST-GCN etiket iki dönemden gelebilir (bkz. types.ts StgcnLabel): eski kayıtlar
  // correct/incorrect (egzersiz-doğruluğu), yeniler normal/abnormal (yürüyüş-anormalliği).
  // 'correct' ve 'normal' olumlu (yeşil) sınıf.
  const isPositiveLabel = (l: string) => l === 'correct' || l === 'normal'
  const labelText = (l: string, short = false) => {
    switch (l) {
      case 'correct': return short ? 'Doğru' : 'Doğru İcra'
      case 'incorrect': return short ? 'Hatalı' : 'Hatalı İcra'
      case 'normal': return short ? 'Normal' : 'Normal Yürüyüş'
      case 'abnormal': return short ? 'Anormal' : 'Anormal Yürüyüş'
      default: return l
    }
  }
  // Faz rozeti: gait_phase üretilmişse göster ('n/a' = HRNet yolunda olay tespiti yetersiz
  // kaldı ya da eski kayıt — rozet gizlenir). Eskiden hrnet_stgcn tamamen gizliyordu;
  // compute_gait_events eklendiğinden beri HRNet kayıtları da faz üretiyor.
  const phaseInfo = frame && frame.gait_phase !== 'n/a'
    ? (GAIT_PHASE_LABELS[frame.gait_phase] ?? { label: frame.gait_phase, color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' })
    : null
  const classification = data?.classification

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-slate-200 truncate max-w-[300px]">{video.file_name}</span>
          {phaseInfo && (
            <span ref={phaseBadgeRef} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${phaseInfo.color}`}>
              {phaseInfo.label}
            </span>
          )}
          {classification && (
            <span
              title={`ST-GCN: %${(classification.confidence * 100).toFixed(0)} güvenle ${labelText(classification.label)}`}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                isPositiveLabel(classification.label)
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
            >
              {isPositiveLabel(classification.label)
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <XCircle className="w-3.5 h-3.5" />}
              {labelText(classification.label)} · %{(classification.confidence * 100).toFixed(0)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <button type="button" onClick={() => generateReport(data, video.file_name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors">
              <FileText className="w-3.5 h-3.5" /> Rapor
            </button>
          )}
          <button type="button" onClick={onClose} title="Kapat"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" /><span>Analiz yükleniyor...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-red-400">
          <AlertCircle className="w-6 h-6" /><span>{error}</span>
        </div>
      ) : data && frame ? (
        <>
          {/* Özet şeridi — tek bakışta durum: hızlı istatistik çipleri + uyarı sayacı
              (tıklayınca Geri Bildirim sekmesi açılır). Sadece mevcut metrikler gösterilir. */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-slate-800/70 bg-slate-900/40 overflow-x-auto">
            {(() => {
              const sm = data.summary
              const chip = (label: string, value: string) => (
                <span key={label} className="flex items-baseline gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/50 whitespace-nowrap">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-mono font-bold text-slate-200">{value}</span>
                </span>
              )
              const chips: React.ReactNode[] = []
              if (sm.walking_speed != null) chips.push(chip('Hız', `${(sm.walking_speed / 1000).toFixed(2)} m/s`))
              if (sm.cadence != null) chips.push(chip('Kadans', `${sm.cadence.toFixed(0)} adım/dk`))
              if (sm.stride_length_mean != null) chips.push(chip('Adım', `${(sm.stride_length_mean / 1000).toFixed(2)} m`))
              if (sm.step_time_lr_diff_pct != null) chips.push(chip('Sol/Sağ Fark', `%${sm.step_time_lr_diff_pct.toFixed(0)}`))
              else if (sm.knee_rom_lr_diff != null) chips.push(chip('Diz Simetri', `${sm.knee_rom_lr_diff.toFixed(1)}°`))
              if (sm.valid_frame_ratio != null) chips.push(chip('Geçerli Kare', `%${(sm.valid_frame_ratio * 100).toFixed(0)}`))
              const nWarn = (data.feedback ?? []).filter(f => f.type === 'warning').length
              if (nWarn > 0) {
                chips.push(
                  <button
                    key="warn"
                    type="button"
                    onClick={() => anglePanelRef.current?.openTab('feedback')}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap"
                    title="Geri Bildirim sekmesini aç"
                  >
                    ⚠ {nWarn} uyarı
                  </button>
                )
              }
              return chips
            })()}
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 relative flex">
              {viewMode === 'both' && video.annotated_url && (
                <div className="flex-1 min-w-0 bg-black flex items-center justify-center border-r border-slate-800">
                  {/* preload=auto: scrub sirasinda currentTime atamalarinin aninda kare
                      gostermesi icin. muted: otomatik oynatma kisitlarina takilmasin. */}
                  <video
                    ref={annotatedVideoRef}
                    src={video.annotated_url}
                    muted
                    playsInline
                    preload="auto"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Skeleton3D
                  ref={skeletonRef}
                  joints={frame.joints}
                  jointNames={data.joint_names}
                  edges={data.edges}
                  angles={frame.angles as unknown as Record<string, number>}
                  flat={isHrnetStgcn}
                />
              </div>
              {video.annotated_url && (
                <div className="absolute top-2 left-2 flex gap-1 z-10">
                  {([['both', 'Video + İskelet'], ['skeleton', 'Sadece İskelet']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setPlaying(false); setViewMode(m) }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                        viewMode === m
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <AnglePanel
              initialFrame={frame}
              summary={data.summary}
              frameCount={data.meta.frame_count}
              panelRef={anglePanelRef}
              feedback={data.feedback}
              anomalyMoments={anomalyMoments}
              onJumpToFrame={n => {
                setPlaying(false)
                frameIdxRef.current = n
                const f = dataRef.current?.frames[n]
                if (f) skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
                syncUI(n)
                setFrameIdx(n)
              }}
            />
          </div>

          {/* Controls — zaman çizelgesi yığını: kaydırıcı + ST-GCN + faz şeritleri aynı
              sol-etiket kolonuyla hizalanır ki tek bir zaman ekseni gibi okunsun (önceden
              alt alta bağımsız çubuklar dağınık görünüyordu). */}
          <div className="shrink-0 border-t border-slate-800 px-4 py-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[10px] text-slate-600 select-none">Zaman</span>
              <input
                ref={scrubberRef}
                type="range"
                title="Frame seç"
                aria-label="Frame seç"
                min={0}
                max={data.frames.length - 1}
                defaultValue={0}
                onChange={e => {
                  setPlaying(false)
                  const n = Number(e.target.value)
                  frameIdxRef.current = n
                  const f = dataRef.current?.frames[n]
                  if (f) skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
                  syncUI(n)
                  setFrameIdx(n)
                }}
                className="w-full accent-blue-500 h-1.5 cursor-pointer"
              />
            </div>

            {/* ST-GCN pencere-bazlı doğruluk zaman çizelgesi (hrnet_stgcn için, faz dağılımı yerine) */}
            {isHrnetStgcn && classification?.windows && classification.windows.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-[10px] text-slate-600 select-none" title="ST-GCN pencere sonuçları — tıkla: o ana git">ST-GCN</span>
                <div className="relative h-2.5 rounded overflow-hidden w-full bg-slate-800">
                  {classification.windows.map((w, i) => {
                    const leftPct = (w.start_frame / Math.max(data.meta.frame_count - 1, 1)) * 100
                    const widthPct = ((w.end_frame - w.start_frame + 1) / Math.max(data.meta.frame_count, 1)) * 100
                    return (
                      <div
                        key={i}
                        title={`Pencere ${i + 1} (kare ${w.start_frame}-${w.end_frame}): ${labelText(w.label, true)} · %${(w.confidence * 100).toFixed(0)} — tıkla: o ana git`}
                        className={`absolute top-0 h-full opacity-70 cursor-pointer hover:opacity-100 ${isPositiveLabel(w.label) ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        onClick={() => {
                          // "Model burayı anormal buldu" → videoyu pencerenin başına atla
                          setPlaying(false)
                          const n = Math.min(w.start_frame, data.frames.length - 1)
                          frameIdxRef.current = n
                          const f = dataRef.current?.frames[n]
                          if (f) skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
                          syncUI(n)
                          setFrameIdx(n)
                        }}
                      />
                    )
                  })}
                </div>
                <span className="shrink-0 flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />{classification.windows.some(w => w.label === 'normal' || w.label === 'abnormal') ? 'Normal' : 'Doğru'}</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" />{classification.windows.some(w => w.label === 'normal' || w.label === 'abnormal') ? 'Anormal' : 'Hatalı'}</span>
                </span>
              </div>
            )}

            {/* Gait phase distribution bar */}
            {phaseDist.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-[10px] text-slate-600 select-none">Faz</span>
                <div className="flex h-2.5 rounded overflow-hidden w-full">
                  {phaseDist.map(({ phase, pct }) => (
                    <div
                      key={phase}
                      title={`${GAIT_PHASE_LABELS[phase]?.label ?? phase}: ${pct.toFixed(1)}%`}
                      className={`phase-bar-fill ${PHASE_BAR_CLASS[phase] ?? 'bg-slate-500'}`}
                      style={{ '--phase-w': `${pct}%` } as React.CSSProperties}
                    />
                  ))}
                </div>
                <span className="shrink-0 flex items-center gap-2 text-[10px] text-slate-400">
                  {phaseDist.slice(0, 3).map(({ phase, pct }) => (
                    <span key={phase} className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-sm ${PHASE_BAR_CLASS[phase] ?? 'bg-slate-500'}`} />
                      {GAIT_PHASE_LABELS[phase]?.label ?? phase} <span className="text-slate-500">%{pct.toFixed(0)}</span>
                    </span>
                  ))}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button type="button" title="Başa dön"
                  onClick={() => { setPlaying(false); frameIdxRef.current = 0; setFrameIdx(0) }}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button type="button" title="-10 frame" onClick={() => step(-10)}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button type="button" title={playing ? 'Durdur' : 'Oynat'}
                  onClick={() => setPlaying(p => !p)}
                  className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button type="button" title="+10 frame" onClick={() => step(10)}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" title="Sona git"
                  onClick={() => { setPlaying(false); const n = data.frames.length - 1; frameIdxRef.current = n; setFrameIdx(n) }}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
              <span ref={timeDisplayRef} className="text-xs text-slate-500 font-mono">
                {frame.t.toFixed(2)}s / {data.meta.duration.toFixed(2)}s &nbsp;·&nbsp; {data.meta.fps.toFixed(0)} fps
              </span>
            </div>
          </div>

          {/* Graph — currentTime only updates on scrub; cursor moves via DOM ref during playback */}
          <div className="shrink-0 border-t border-slate-800 px-4 pt-2 pb-3 relative">
            <AnglesGraph
              frames={data.frames}
              anomalyMap={anomalyMap}
              onFrameChange={n => {
                frameIdxRef.current = n
                const f = dataRef.current?.frames[n]
                if (f) skeletonRef.current?.updateFrame(f.joints, f.angles as unknown as Record<string, number>)
                syncUI(n)
                setFrameIdx(n)
              }}
            />
            {/* Imperative cursor line overlay — avoids recharts re-render during playback */}
            <div
              ref={graphLineRef}
              className="absolute top-7 bottom-8 w-px bg-amber-400 opacity-80 pointer-events-none left-[30px]"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
