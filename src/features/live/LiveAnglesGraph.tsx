// Canlı pratik modu için kayan-pencere açı grafiği — AnglesGraph.tsx'in (offline analiz sayfası)
// canlı karşılığı. Fark: sabit bir video yerine sürekli büyüyen/kayan bir veri akışını çiziyor,
// tıklayarak frame atlama yok (canlı akışta "geçmişe git" anlamsız), faz/anomali overlay'i yok.
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { LiveGraphPoint } from '../../lib/liveMetrics'
import type { LiveAngles } from '../../lib/poseAngles'

interface LiveAnglesGraphProps {
  data: LiveGraphPoint[]
  windowSec: number
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
  Dirsek: [
    { key: 'L Elbow', color: '#c084fc', label: 'Sol Dirsek' },
    { key: 'R Elbow', color: '#a855f7', label: 'Sağ Dirsek' },
  ],
} as const satisfies Record<string, { key: keyof LiveAngles; color: string; label: string }[]>

type GroupKey = keyof typeof GROUPS

export function LiveAnglesGraph({ data, windowSec }: LiveAnglesGraphProps) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('Diz')
  const lines = GROUPS[activeGroup]
  const maxT = data.length > 0 ? data[data.length - 1].t : windowSec
  const minT = Math.max(0, maxT - windowSec)

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
        <span className="ml-auto text-xs text-slate-600">son {windowSec}sn</span>
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[minT, maxT]}
            allowDataOverflow
            tickFormatter={v => `${(v as number).toFixed(0)}s`}
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
            labelFormatter={v => `t=${(v as number).toFixed(1)}s`}
            formatter={(v, name) => [`${Number(v).toFixed(1)}°`, String(name)]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            formatter={(v) => lines.find(l => l.key === v)?.label ?? v}
          />
          {lines.map(l => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
