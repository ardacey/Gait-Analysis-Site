export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: number
          created_at: string
          username: string
          role: 'patient' | 'doctor'
        }
        Insert: {
          id?: number
          created_at?: string
          username: string
          role: 'patient' | 'doctor'
        }
        Update: {
          id?: number
          created_at?: string
          username?: string
          role?: 'patient' | 'doctor'
        }
      }
      videos: {
        Row: {
          id: number
          created_at: string
          user_name: string
          file_name: string
          file_path: string
          file_url: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          user_name: string
          file_name: string
          file_path: string
          file_url: string | null
        }
        Update: {
          id?: number
          created_at?: string
          user_name?: string
          file_name?: string
          file_path?: string
          file_url?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
