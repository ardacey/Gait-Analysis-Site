import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Activity, Loader2, AlertCircle, FileText,
} from 'lucide-react'
import type { AnalysisData, AnalysisFrame, FeedbackItem, VideoRecord } from '../../types'
import { GaitFeedback } from '../../components/analysis/GaitFeedback'
import { Skeleton3D, type Skeleton3DHandle } from './Skeleton3D'
import { AnglesGraph } from './AnglesGraph'

interface AnalysisViewerProps {
  video: VideoRecord
  onClose: () => void
}

const GAIT_PHASE_LABELS: Record<string, { label: string; color: string }> = {
  swing:             { label: 'Salınım',        color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  terminal_stance:   { label: 'Terminal Duruş', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  loading_response:  { label: 'Yük Aktarımı',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  mid_stance:        { label: 'Orta Duruş',     color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  stance:            { label: 'Duruş',          color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
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
}

interface MetricInfo { label: string; value: string; unit: string }
function processMetric(key: string, raw: number): MetricInfo {
  const k = key.toLowerCase()
  const label = METRIC_LABELS[key] ?? key.replace(/_/g, ' ')
  // Normalized (dimensionless ratio) — check before length/speed
  if (k.includes('normalized'))           return { label, value: raw.toFixed(3), unit: '' }
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

// ─── PDF report ───────────────────────────────────────────────────────────────
const PHASE_TR: Record<string, string> = {
  swing: 'Salınım', stance: 'Duruş', mid_stance: 'Orta Duruş',
  loading_response: 'Yük Aktarımı', terminal_stance: 'Terminal Duruş',
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
  const now = new Date().toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' })
  w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Yürüyüş Analiz Raporu</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b;font-size:13px}h1{background:#1d4ed8;color:white;margin:-24px -24px 24px;padding:20px 24px;font-size:18px}h2{font-size:14px;color:#1d4ed8;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f1f5f9;text-align:left;padding:6px 10px;font-size:12px}td{padding:5px 10px;border-bottom:1px solid #e2e8f0}tr:last-child td{border-bottom:none}.meta{display:flex;gap:40px;background:#f8fafc;padding:12px 16px;border-radius:6px;margin-bottom:8px}.meta-item label{font-size:11px;color:#64748b;display:block}.meta-item span{font-weight:bold}.note{margin-top:32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:12px}h1{margin:-12px -12px 16px}}</style>
</head><body>
<h1>Yürüyüş Analiz Raporu</h1>
<div class="meta"><div class="meta-item"><label>Video</label><span>${filename}</span></div><div class="meta-item"><label>Süre</label><span>${data.meta.duration.toFixed(2)}s</span></div><div class="meta-item"><label>FPS</label><span>${data.meta.fps.toFixed(0)}</span></div><div class="meta-item"><label>Rapor Tarihi</label><span>${now}</span></div></div>
<h2>Temporal-Spatial Parametreler</h2><table><thead><tr><th>Parametre</th><th>Değer</th></tr></thead><tbody>${metricRows}</tbody></table>
<h2>Eklem Hareket Açıklığı (ROM)</h2><table><thead><tr><th>Eklem</th><th>Min</th><th>Max</th><th>Ortalama</th><th>ROM</th></tr></thead><tbody>${romRows}</tbody></table>
<h2>Yürüyüş Fazı Dağılımı</h2><table><thead><tr><th>Faz</th><th>Süre Oranı</th></tr></thead><tbody>${phaseRows}</tbody></table>
<div class="note">Bu rapor otomatik görüntü analizi ile üretilmiştir. Klinik karar için uzman değerlendirmesi gereklidir.</div>
</body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 600)
}

// ─── AnglePanel: updates via DOM refs during playback ─────────────────────────
interface AnglePanelHandle { update: (f: AnalysisFrame) => void }

type PanelTab = 'angles' | 'metrics' | 'feedback'

function AnglePanel({
  initialFrame, summary, frameCount,
  panelRef, feedback,
}: {
  initialFrame: AnalysisFrame
  summary: Record<string, number>
  frameCount: number
  panelRef: React.MutableRefObject<AnglePanelHandle | null>
  feedback?: FeedbackItem[]
}) {
  const [tab, setTab] = useState<PanelTab>('angles')
  const angleRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const angleDivRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const frameNumRef = useRef<HTMLSpanElement | null>(null)
  const timeRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    panelRef.current = {
      update(f: AnalysisFrame) {
        if (timeRef.current) timeRef.current.textContent = `t = ${f.t.toFixed(2)}s`
        for (const [key, val] of Object.entries(f.angles) as [string, number][]) {
          const span = angleRefs.current[key]
          if (span) span.textContent = `${val.toFixed(1)}°`
          const div = angleDivRefs.current[key]
          if (div) {
            const isLow = val < 120, isMid = val >= 120 && val < 150
            div.className = `rounded-lg px-3 py-2 ${isLow ? 'bg-red-900/30' : isMid ? 'bg-yellow-900/20' : 'bg-slate-800/60'}`
            if (span) span.className = `text-sm font-bold font-mono ${isLow ? 'text-red-300' : isMid ? 'text-yellow-300' : 'text-slate-100'}`
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
    <div className="w-72 shrink-0 border-l border-slate-800 flex flex-col">

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
              const isLow = val < 120, isMid = val >= 120 && val < 150
              return (
                <div
                  key={key}
                  ref={el => { angleDivRefs.current[key] = el }}
                  className={`rounded-lg px-3 py-2 ${isLow ? 'bg-red-900/30' : isMid ? 'bg-yellow-900/20' : 'bg-slate-800/60'}`}
                >
                  <div className="text-xs text-slate-500">{ANGLE_LABELS[key] ?? key}</div>
                  <span
                    ref={el => { angleRefs.current[key] = el }}
                    className={`text-sm font-bold font-mono ${isLow ? 'text-red-300' : isMid ? 'text-yellow-300' : 'text-slate-100'}`}
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
          <div className="flex flex-col gap-1">
            {Object.entries(summary).map(([key, val]) => {
              const m = processMetric(key, val)
              return (
                <div key={key} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
                  <span className="text-xs text-slate-400">{m.label}</span>
                  <span className="text-xs font-mono font-bold text-slate-200">{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* GERİ BİLDİRİM */}
        {tab === 'feedback' && feedback && (
          <GaitFeedback feedback={feedback} variant="dark" />
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
      anglePanelRef.current?.update(f)
      if (scrubberRef.current) scrubberRef.current.value = String(next)
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${f.t.toFixed(2)}s / ${data.meta.duration.toFixed(2)}s · ${data.meta.fps.toFixed(0)} fps`
      // Update gait phase badge
      if (phaseBadgeRef.current) {
        const info = GAIT_PHASE_LABELS[f.gait_phase]
        if (info) {
          phaseBadgeRef.current.textContent = info.label
          phaseBadgeRef.current.className = `text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`
        }
      }
      // Move graph cursor line (accounts for recharts margins: left≈30px, right≈8px)
      if (graphLineRef.current) {
        const parent = graphLineRef.current.parentElement
        if (parent) {
          const w = parent.clientWidth - 38  // 30 left margin + 8 right margin
          const pct = data.meta.duration > 0 ? f.t / data.meta.duration : 0
          graphLineRef.current.style.left = `${30 + pct * w}px`
        }
      }
    }, 1000 / fps)

    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current) }
  }, [playing])

  // Sync all non-skeleton UI to a given frame (used on scrub/step — not during playback)
  const syncUI = useCallback((n: number) => {
    const data = dataRef.current
    if (!data) return
    const f = data.frames[n]
    anglePanelRef.current?.update(f)
    if (scrubberRef.current) scrubberRef.current.value = String(n)
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${f.t.toFixed(2)}s / ${data.meta.duration.toFixed(2)}s · ${data.meta.fps.toFixed(0)} fps`
    if (phaseBadgeRef.current) {
      const info = GAIT_PHASE_LABELS[f.gait_phase]
      if (info) {
        phaseBadgeRef.current.textContent = info.label
        phaseBadgeRef.current.className = `text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`
      }
    }
    if (graphLineRef.current) {
      const parent = graphLineRef.current.parentElement
      if (parent) {
        const w = parent.clientWidth - 38
        const pct = data.meta.duration > 0 ? f.t / data.meta.duration : 0
        graphLineRef.current.style.left = `${30 + pct * w}px`
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

  const frame: AnalysisFrame | undefined = data?.frames[frameIdx]
  const phaseInfo = frame
    ? (GAIT_PHASE_LABELS[frame.gait_phase] ?? { label: frame.gait_phase, color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' })
    : null

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
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <Skeleton3D
                ref={skeletonRef}
                joints={frame.joints}
                jointNames={data.joint_names}
                edges={data.edges}
                angles={frame.angles as unknown as Record<string, number>}
              />
            </div>
            <AnglePanel
              initialFrame={frame}
              summary={data.summary}
              frameCount={data.meta.frame_count}
              panelRef={anglePanelRef}
              feedback={data.feedback}
            />
          </div>

          {/* Controls */}
          <div className="shrink-0 border-t border-slate-800 px-4 py-2 flex flex-col gap-2">
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
