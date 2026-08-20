// Toplu metrik dışa aktarımı — tüm analizlerin summary metriklerini TEK CSV'de (satır = video,
// sütun = metrik) toplar. NEDEN: metrikler şu an video başına ayrı CSV'lerde; hastane
// çalışmasının istatistikleri (R/SPSS/Excel) için hasta × metrik matrisi gerekiyor.
// Analiz JSON'ları public URL'lerden okunuyor; sütun kümesi tüm kayıtların birleşimi,
// eksik hücreler boş bırakılıyor.
import type { VideoRecord } from '../types'

interface AnalysisSummaryShape {
  meta?: { fps?: number; frame_count?: number; duration?: number }
  summary?: Record<string, number>
  classification?: { label?: string; confidence?: number }
}

const META_COLS = [
  'video_id', 'patient', 'file_name', 'created_at', 'analysis_method', 'model_version',
  'classification', 'confidence', 'doctor_note', 'duration_sec', 'fps',
]

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Tamamlanmış kayıtların metriklerini tek CSV'ye çevirir. Dönüş: {csv, exported, skipped}. */
export async function buildMetricsCsv(videos: VideoRecord[]): Promise<{ csv: string; exported: number; skipped: number }> {
  const rows: Record<string, unknown>[] = []
  const metricCols = new Set<string>()
  let skipped = 0

  const done = videos.filter(v => v.job_status === 'done' && v.analysis_url)
  // Sıralı değil paralel: onlarca kayıtta fark hissedilir; hata veren kayıt atlanır.
  const results = await Promise.all(done.map(async v => {
    try {
      const res = await fetch(v.analysis_url as string)
      if (!res.ok) return null
      return { v, d: (await res.json()) as AnalysisSummaryShape }
    } catch {
      return null
    }
  }))

  for (const r of results) {
    if (!r) { skipped++; continue }
    const { v, d } = r
    const row: Record<string, unknown> = {
      video_id: v.id,
      patient: v.user_name,
      file_name: v.file_name,
      created_at: v.created_at,
      analysis_method: v.analysis_method,
      model_version: v.model_version ?? '',
      classification: d.classification?.label ?? v.stgcn_label ?? '',
      confidence: d.classification?.confidence ?? v.stgcn_confidence ?? '',
      doctor_note: v.doctor_note ?? '',
      duration_sec: d.meta?.duration != null ? d.meta.duration.toFixed(2) : '',
      fps: d.meta?.fps != null ? d.meta.fps.toFixed(2) : '',
    }
    for (const [k, val] of Object.entries(d.summary ?? {})) {
      row[k] = typeof val === 'number' ? val.toFixed(4) : val
      metricCols.add(k)
    }
    rows.push(row)
  }

  const cols = [...META_COLS, ...[...metricCols].sort()]
  const lines = [cols.join(',')]
  for (const row of rows) lines.push(cols.map(c => csvCell(row[c])).join(','))
  return { csv: lines.join('\n'), exported: rows.length, skipped }
}

export function downloadCsv(csv: string, filename: string) {
  // BOM: Excel'in UTF-8 Türkçe karakterleri doğru açması için
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
