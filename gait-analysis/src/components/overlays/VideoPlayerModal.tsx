import { X } from 'lucide-react'

interface VideoPlayerModalProps {
  src: string
  onClose: () => void
}

export function VideoPlayerModal({ src, onClose }: VideoPlayerModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
          aria-label="Video kapat"
        >
          <X className="h-5 w-5" />
        </button>
        <video src={src} controls autoPlay className="w-full max-h-[80vh]" />
      </div>
    </div>
  )
}
