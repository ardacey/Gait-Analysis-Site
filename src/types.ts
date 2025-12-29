export interface VideoRecord {
  id: number
  created_at: string
  user_name: string
  file_name: string
  file_path: string
  file_url: string | null
}

export type UserRole = 'patient' | 'doctor'
export type AuthMode = 'login' | 'register'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}