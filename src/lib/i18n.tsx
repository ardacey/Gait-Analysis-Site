// Hafif i18n — TR (varsayılan) / EN. Amaç: paper ekran görüntüleri ve uluslararası demo
// için arayüz dili; tam çeviri kapsamı analiz ekranı + ana ekran metinleri. Backend'in
// ürettiği metinler (geri bildirim mesajları, doktor notu) kaynak dilinde kalır.
// Kullanım: const { lang, t } = useLang(); t('analysis.tabs.angles') ya da lang === 'en' ?...
import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'tr' | 'en'

const STRINGS: Record<string, { tr: string; en: string }> = {
  // ── ortak ──
  'common.close': { tr: 'Kapat', en: 'Close' },
  'common.save': { tr: 'Kaydet', en: 'Save' },
  // ── analiz ekranı ──
  'analysis.tabs.angles': { tr: 'Açılar', en: 'Angles' },
  'analysis.tabs.metrics': { tr: 'Metrikler', en: 'Metrics' },
  'analysis.tabs.feedback': { tr: 'Geri Bildirim', en: 'Feedback' },
  'analysis.report': { tr: 'Rapor', en: 'Report' },
  'analysis.frame': { tr: 'Frame', en: 'Frame' },
  'analysis.timeline.time': { tr: 'Zaman', en: 'Time' },
  'analysis.timeline.phase': { tr: 'Faz', en: 'Phase' },
  'analysis.view.both': { tr: 'Video + İskelet', en: 'Video + Skeleton' },
  'analysis.view.skeleton': { tr: 'Sadece İskelet', en: 'Skeleton Only' },
  'analysis.deviations': { tr: 'En Belirgin Sapma Anları', en: 'Top Deviation Moments' },
  'analysis.loading': { tr: 'Analiz yükleniyor...', en: 'Loading analysis…' },
  'analysis.graphHint': { tr: 'kesikli bant = normal aralık · tıkla → frame atla', en: 'dashed band = normal range · click → jump to frame' },
  'analysis.warnings': { tr: 'uyarı', en: 'warnings' },
  // ── dashboard ──
  'dash.myVideos': { tr: 'Videolarım', en: 'My Videos' },
  'dash.pendingVideos': { tr: 'Bekleyen Hasta Videoları', en: 'Patient Videos' },
  'dash.newAnalysis': { tr: 'Yeni Analiz Başlat', en: 'Start New Analysis' },
  'dash.livePractice': { tr: 'Canlı Pratik', en: 'Live Practice' },
  'dash.stats.total': { tr: 'Toplam Video', en: 'Total Videos' },
  'dash.stats.done': { tr: 'Tamamlanan', en: 'Completed' },
  'dash.stats.pending': { tr: 'Bekleyen', en: 'Pending' },
  'dash.stats.abnormal': { tr: 'Anormal Bulgu', en: 'Abnormal Findings' },
  'dash.guide': { tr: '📋 Nasıl video çekmeliyim? — çekim rehberi', en: '📋 How should I record? — recording guide' },
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const Ctx = createContext<LangCtx>({ lang: 'tr', setLang: () => {}, t: k => STRINGS[k]?.tr ?? k })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'tr')
  const setLang = (l: Lang) => { localStorage.setItem('lang', l); setLangState(l) }
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const t = (key: string) => STRINGS[key]?.[lang] ?? STRINGS[key]?.tr ?? key
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  return useContext(Ctx)
}

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
      title={lang === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
      className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors ${className}`}
    >
      {lang === 'tr' ? 'EN' : 'TR'}
    </button>
  )
}
