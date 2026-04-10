import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { fetchAnalysis } from '../../lib/apiClient'
import { GaitFeedback, type FeedbackItem } from './GaitFeedback'
import type { VideoRecord } from '../../types'

interface AnalysisModalProps {
  video: VideoRecord
  onClose: () => void
}

export function AnalysisModal({ video, onClose }: AnalysisModalProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!video.job_id) return
    setLoading(true)
    fetchAnalysis(video.job_id)
      .then((data: { feedback?: FeedbackItem[] }) => {
        setFeedback(data.feedback ?? [])
      })
      .catch((err: unknown) => {
        console.error('Analiz verisi alınamadı:', err)
        setFeedback([])
      })
      .finally(() => setLoading(false))
  }, [video.job_id])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div>
            <p className="font-bold text-slate-800 truncate max-w-sm">{video.file_name}</p>
            <p className="text-xs text-slate-500">{video.user_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition-all hover:bg-slate-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row overflow-hidden flex-1 min-h-0">
          {/* Video */}
          <div className="bg-black md:w-[58%] shrink-0 flex items-center">
            {video.annotated_url ? (
              <video
                src={video.annotated_url}
                controls
                autoPlay
                className="w-full max-h-[70vh]"
              />
            ) : (
              <p className="text-white/50 text-sm text-center w-full py-12">Video bulunamadı.</p>
            )}
          </div>

          {/* Feedback */}
          <div className="md:w-[42%] overflow-y-auto p-5 bg-slate-50">
            <h2 className="text-base font-bold text-slate-800 mb-4">Analiz Sonuçları</h2>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
              </div>
            ) : feedback !== null ? (
              <GaitFeedback feedback={feedback} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
