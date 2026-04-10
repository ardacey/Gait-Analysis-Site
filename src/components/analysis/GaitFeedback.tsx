import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

export interface FeedbackItem {
  type: 'warning' | 'good' | 'info'
  metric: string
  label: string
  value: number
  unit: string
  message: string
}

const MESSAGE_MAP: Record<string, Partial<Record<FeedbackItem['type'], string>>> = {
  cadence: {
    warning: 'Adım hızınız normalden düşük. Daha hızlı adım atmayı deneyin.',
    good:    'Adım hızınız normal aralıkta.',
    info:    'Kadans ölçüldü.',
  },
  step_time: {
    warning: 'Adımlarınız normalden yavaş atılıyor.',
    good:    'Adım süreniz normal.',
  },
  stride_time: {
    warning: 'Adımlarınız normalden yavaş atılıyor.',
    good:    'Adım süreniz normal.',
  },
  trunk_angular_velocity: {
    warning: 'Yürürken gövdeniz fazla sallanıyor. Denge ve duruş kontrolüne dikkat edin.',
    good:    'Gövde hareketleriniz normal.',
  },
  left_knee_angle: {
    warning: 'Sol bacağınızı yeterince kaldırmıyorsunuz. Adım atarken bacağınızı daha fazla kaldırmayı deneyin.',
    good:    'Sol diz hareketleriniz normal.',
  },
  right_knee_angle: {
    warning: 'Sağ bacağınızı yeterince kaldırmıyorsunuz. Adım atarken bacağınızı daha fazla kaldırmayı deneyin.',
    good:    'Sağ diz hareketleriniz normal.',
  },
  knee_angle: {
    warning: 'Bacağınızı yeterince kaldırmıyorsunuz. Adım atarken bacağınızı daha fazla kaldırmayı deneyin.',
    good:    'Diz hareketleriniz normal.',
  },
  knee_angular_velocity: {
    warning: 'Diz hareket hızınız normalden yüksek.',
    good:    'Diz hareketleriniz normal.',
  },
  hip_angular_velocity: {
    warning: 'Kalça hareket hızınız normalden yüksek.',
    good:    'Kalça hareketleriniz normal.',
  },
  ankle_angular_velocity: {
    warning: 'Ayak bileği hareket hızınız normalden yüksek.',
    good:    'Ayak bileği hareketleriniz normal.',
  },
}

function simplify(item: FeedbackItem): string {
  return MESSAGE_MAP[item.metric]?.[item.type] ?? item.message
}

const LIGHT = {
  warning: { card: 'bg-amber-50 border border-amber-200',     icon: 'text-amber-500',   title: 'text-amber-800',   text: 'text-amber-700'   },
  good:    { card: 'bg-emerald-50 border border-emerald-200', icon: 'text-emerald-500', title: 'text-emerald-800', text: 'text-emerald-700' },
  info:    { card: 'bg-blue-50 border border-blue-200',       icon: 'text-blue-500',    title: 'text-blue-800',    text: 'text-blue-700'    },
}

const DARK = {
  warning: { card: 'bg-amber-950/50 border border-amber-800/50',     icon: 'text-amber-400',   title: 'text-amber-300',   text: 'text-amber-400/80'   },
  good:    { card: 'bg-emerald-950/50 border border-emerald-800/50', icon: 'text-emerald-400', title: 'text-emerald-300', text: 'text-emerald-400/80' },
  info:    { card: 'bg-blue-950/50 border border-blue-800/50',       icon: 'text-blue-400',    title: 'text-blue-300',    text: 'text-blue-400/80'    },
}

const ICONS = { warning: AlertTriangle, good: CheckCircle2, info: Info }

function FeedbackCard({ item, variant }: { item: FeedbackItem; variant: 'light' | 'dark' }) {
  const s = (variant === 'dark' ? DARK : LIGHT)[item.type]
  const Icon = ICONS[item.type]
  return (
    <div className={`flex gap-2 rounded-lg p-2.5 ${s.card}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
      <div>
        <p className={`text-xs font-semibold leading-tight ${s.title}`}>{item.label}</p>
        <p className={`text-xs mt-0.5 leading-snug ${s.text}`}>{simplify(item)}</p>
      </div>
    </div>
  )
}

interface GaitFeedbackProps {
  feedback: FeedbackItem[]
  variant?: 'light' | 'dark'
}

export function GaitFeedback({ feedback, variant = 'light' }: GaitFeedbackProps) {
  if (feedback.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-4">Henüz analiz sonucu yok.</p>
    )
  }

  const warnings = feedback.filter(f => f.type === 'warning' || f.type === 'info')
  const goods    = feedback.filter(f => f.type === 'good')

  const headingCls = variant === 'dark'
    ? 'text-xs font-semibold uppercase tracking-wider text-slate-500'
    : 'text-xs font-bold uppercase tracking-wide text-slate-500'

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={headingCls}>Dikkat Edilmesi Gerekenler</h3>
          {warnings.map((item, i) => (
            <FeedbackCard key={i} item={item} variant={variant} />
          ))}
        </section>
      )}
      {goods.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={headingCls}>İyi Giden Yönler</h3>
          {goods.map((item, i) => (
            <FeedbackCard key={i} item={item} variant={variant} />
          ))}
        </section>
      )}
    </div>
  )
}
