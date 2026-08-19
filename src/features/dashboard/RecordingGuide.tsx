// Çekim rehberi — hastane pilotu için "nasıl video çekmeliyim" kontrol listesi.
// Amaç: hemşire/tekniker/hasta çekim hatalarını (önden çekim, kısa video, yarım boy)
// yüklemeden ÖNCE engellemek; ön-kontrol (useVideos.checkVideoFile) teknik hataları,
// bu rehber içerik hatalarını hedefler.
import { X, Video, Ruler, User, Timer, Smartphone, Sun, Footprints } from 'lucide-react'
import { useLang } from '../../lib/i18n'

interface RecordingGuideProps {
  onClose: () => void
}

const GUIDE_ITEMS_EN = [
  { icon: Video, title: 'Record from the side (90°)', text: 'The camera must be perpendicular to the walking direction — the person walks across the screen. Frontal/back recordings reduce reliability.' },
  { icon: Ruler, title: '3-5 meters distance', text: 'The whole body (head to feet) must stay in frame throughout the walk.' },
  { icon: User, title: 'Single person in frame', text: 'No one but the analyzed person should be visible — the system tracks a single person.' },
  { icon: Timer, title: 'At least 10 seconds of continuous walking', text: 'Start from standing and take at least 5-6 steps. Videos shorter than 5 seconds cannot be analyzed.' },
  { icon: Smartphone, title: 'Keep the phone steady', text: 'Use a tripod or a stable surface if possible; do not pan or zoom. Landscape orientation recommended.' },
  { icon: Sun, title: 'Good lighting', text: 'Avoid backlighting (no silhouette in front of a window); body contours must be clearly visible.' },
  { icon: Footprints, title: 'Natural pace', text: 'The person should walk at their own normal speed — deliberately slowed or exaggerated walking distorts results.' },
]

const GUIDE_ITEMS = [
  {
    icon: Video,
    title: 'Yandan çekin (90°)',
    text: 'Kamera yürüyüş yönüne dik olmalı — kişi ekranda soldan sağa (veya sağdan sola) yürümeli. Önden/arkadan çekimlerde analiz güvenilirliği düşer.',
  },
  {
    icon: Ruler,
    title: '3-5 metre mesafe',
    text: 'Kişinin tüm vücudu (baş-ayak) kadrajda kalacak kadar uzaktan çekin; yürüyüş boyunca kadrajdan çıkmamalı.',
  },
  {
    icon: User,
    title: 'Kadrajda tek kişi',
    text: 'Analiz edilen kişi dışında kimse görünmemeli — sistem tek kişiyi takip eder, ikinci kişi karışıklık yaratır.',
  },
  {
    icon: Timer,
    title: 'En az 10 saniye kesintisiz yürüyüş',
    text: 'Ayakta duruştan başlayıp en az 5-6 adım atılmalı. 5 saniyeden kısa videolar analiz edilemez.',
  },
  {
    icon: Smartphone,
    title: 'Telefonu sabit tutun',
    text: 'Mümkünse tripod veya sabit bir yüzey kullanın; kişiyi kamerayla takip etmeyin (pan/zoom yapmayın). Yatay çekim önerilir.',
  },
  {
    icon: Sun,
    title: 'İyi aydınlatma',
    text: 'Kişi ışığı arkasına almamalı (pencere önünde siluet kalmasın); vücut hatları net seçilebilmeli.',
  },
  {
    icon: Footprints,
    title: 'Doğal tempo',
    text: 'Kişi kendi normal hızında yürümeli — özellikle yavaşlatılmış ya da abartılı yürüyüş sonucu bozar.',
  },
]

export function RecordingGuide({ onClose }: RecordingGuideProps) {
  const { lang } = useLang()
  const items = lang === 'en' ? GUIDE_ITEMS_EN : GUIDE_ITEMS
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-slate-800">{lang === 'en' ? 'How Should I Record?' : 'Nasıl Video Çekmeliyim?'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={lang === 'en' ? 'Close' : 'Kapat'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {items.map(item => (
            <div key={item.title} className="flex gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <item.icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{item.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {lang === 'en'
              ? 'Videos that break these rules are still processed, but reliability drops — the system automatically discards invalid segments and reports them in the "Valid Frame Ratio" metric.'
              : 'Bu kurallara uymayan videolar da işlenir, ancak sonuçların güvenilirliği düşer — sistem geçersiz bölümleri otomatik ayıklar ve "Geçerli Kare Oranı" metriğinde raporlar.'}
          </p>
        </div>
      </div>
    </div>
  )
}
