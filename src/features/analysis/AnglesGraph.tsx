import { useMemo, useState, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceArea,
} from 'recharts'
import type { AnalysisFrame } from '../../types'

interface AnglesGraphProps {
  frames: AnalysisFrame[]
  onFrameChange: (idx: number) => void
  anomalyMap?: Map<string, Set<number>>
}

const GROUPS = {
  Diz: [
    { key: 'L Knee', color: '#60a5fa', label: 'Sol Diz' },
    { key: 'R Knee', color: '#3b82f6', label: 'Sağ Diz' },
  ],
  Kalça: [
    { key: 'L Hip', color: '#34d399', label: 'Sol Kalça' },
    { key: 'R Hip', color: '#10b981', label: 'Sağ Kalça' },
  ],
  Ayak: [
    { key: 'L Ankle', color: '#fb923c', label: 'Sol Ayak' },
    { key: 'R Ankle', color: '#f97316', label: 'Sağ Ayak' },
  ],
} as const

type GroupKey = keyof typeof GROUPS

const PHASE_FILL: Record<string, string> = {
  swing:            'rgba(59,130,246,0.10)',
  stance:           'rgba(16,185,129,0.10)',
  mid_stance:       'rgba(16,185,129,0.16)',
  loading_response: 'rgba(251,191,36,0.10)',
  terminal_stance:  'rgba(139,92,246,0.10)',
}

export function AnglesGraph({ frames, onFrameChange, anomalyMap }: AnglesGraphProps) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('Diz')
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const handleMouseClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = chartContainerRef.current
    if (!container || frames.length === 0) return
    const grid = container.querySelector('.recharts-cartesian-grid')
    const rect = grid ? grid.getBoundingClientRect() : container.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left)
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const duration = frames[frames.length - 1].t
    const targetT = pct * duration
    const idx = frames.reduce((best, f, i) =>
      Math.abs(f.t - targetT) < Math.abs(frames[best].t - targetT) ? i : best, 0)
    onFrameChange(idx)
  }

  const frameCount = frames.length

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(frameCount / 400))
    return frames
      .filter((_, i) => i % step === 0)
      .map((f, si) => ({
        _frameIdx: si * step,
        t: parseFloat(f.t.toFixed(2)),
        'L Knee': f.angles['L Knee'],
        'R Knee': f.angles['R Knee'],
        'L Hip': f.angles['L Hip'],
        'R Hip': f.angles['R Hip'],
        'L Ankle': f.angles['L Ankle'],
        'R Ankle': f.angles['R Ankle'],
      }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount])

  const phaseSegments = useMemo(() => {
    if (frameCount === 0) return []
    const step = Math.max(1, Math.floor(frameCount / 600))
    const sampled = frames.filter((_, i) => i % step === 0)
    const segs: { start: number; end: number; phase: string }[] = []
    let start = sampled[0].t
    let cur = sampled[0].gait_phase
    for (let i = 1; i < sampled.length; i++) {
      if (sampled[i].gait_phase !== cur) {
        segs.push({ start, end: sampled[i].t, phase: cur })
        start = sampled[i].t
        cur = sampled[i].gait_phase
      }
    }
    segs.push({ start, end: sampled[sampled.length - 1].t, phase: cur })
    return segs
  }, [frames])

  const lines = GROUPS[activeGroup]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {(Object.keys(GROUPS) as GroupKey[]).map(g => (
          <button
            key={g}
            type="button"
            onClick={() => setActiveGroup(g)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              activeGroup === g
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {g}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-600">tıkla → frame atla</span>
      </div>

      <div ref={chartContainerRef} onClick={handleMouseClick} className="cursor-crosshair">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: -10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

          {phaseSegments.map((seg, i) => (
            <ReferenceArea
              key={i}
              x1={seg.start}
              x2={seg.end}
              fill={PHASE_FILL[seg.phase] ?? 'transparent'}
              strokeOpacity={0}
            />
          ))}

          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => `${(v as number).toFixed(1)}s`}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 200]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            tickFormatter={v => `${v}°`}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
            labelFormatter={v => `t=${(v as number).toFixed(2)}s`}
            formatter={(v, name) => [`${Number(v).toFixed(1)}°`, String(name)]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            formatter={(v) => lines.find(l => l.key === v)?.label ?? v}
          />
          {/* Reference line removed — AnalysisViewer draws it via DOM ref for perf */}
          {lines.map(l => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={1.5}
              activeDot={{ r: 3 }}
              dot={(props: { cx?: number; cy?: number; payload?: Record<string, number> }) => {
                const { cx, cy, payload } = props
                if (cx == null || cy == null || !payload) return <g key={`${cx}-${cy}`} />
                if (anomalyMap?.get(l.key)?.has(payload._frameIdx)) {
                  return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#ef4444" stroke="#1e293b" strokeWidth={1} />
                }
                return <g key={`${cx}-${cy}`} />
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
