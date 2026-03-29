export interface VideoRecord {
  id: number
  created_at: string
  user_name: string
  file_name: string
  file_path: string
  file_url: string | null
  job_id: string | null
  job_status: string | null
  annotated_url: string | null
  features_url: string | null
  analysis_url: string | null
}

export type UserRole = 'patient' | 'doctor'
export type AuthMode = 'login' | 'register'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export interface AnalysisFrame {
  t: number
  joints: [number, number, number][]
  angles: {
    'L Knee': number
    'R Knee': number
    'L Hip': number
    'R Hip': number
    'L Ankle': number
    'R Ankle': number
    'L Elbow': number
    'R Elbow': number
  }
  gait_phase: string
}

export interface AnalysisData {
  meta: { fps: number; frame_count: number; duration: number }
  joint_names: string[]
  edges: [number, number][]
  frames: AnalysisFrame[]
  timeseries: Record<string, number[]>
  summary: Record<string, number>
}