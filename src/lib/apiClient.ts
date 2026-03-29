const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface JobStatus {
  status: 'queued' | 'processing' | 'done' | 'error'
  step: string
  progress: number
  has_video: boolean
  has_features: boolean
  has_analysis: boolean
}

export async function uploadToBackend(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(`Backend upload hatası: ${res.status} ${res.statusText}`)
  const data = await res.json() as { job_id: string }
  return data.job_id
}

export async function pollStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/status/${jobId}`)
  if (!res.ok) throw new Error(`Status sorgu hatası: ${res.status}`)
  return res.json() as Promise<JobStatus>
}

export function getDownloadUrl(jobId: string, type: 'video' | 'features'): string {
  return `${API_BASE}/download/${type}/${jobId}`
}

export function getAnalysisUrl(jobId: string): string {
  return `${API_BASE}/analysis/${jobId}`
}

export async function fetchAnalysis(jobId: string) {
  const res = await fetch(`${API_BASE}/analysis/${jobId}`)
  if (!res.ok) throw new Error(`Analysis fetch hatası: ${res.status} ${res.statusText}`)
  return res.json()
}
