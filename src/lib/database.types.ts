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
        Relationships: []
      }
      videos: {
        Row: {
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
          analysis_method: 'metrabs' | 'hrnet_scgnet'
          scgnet_label: 'correct' | 'incorrect' | null
          scgnet_confidence: number | null
        }
        Insert: {
          id?: number
          created_at?: string
          user_name: string
          file_name: string
          file_path: string
          file_url: string | null
          job_id?: string | null
          job_status?: string | null
          annotated_url?: string | null
          features_url?: string | null
          analysis_url?: string | null
          analysis_method?: 'metrabs' | 'hrnet_scgnet'
          scgnet_label?: 'correct' | 'incorrect' | null
          scgnet_confidence?: number | null
        }
        Update: {
          id?: number
          created_at?: string
          user_name?: string
          file_name?: string
          file_path?: string
          file_url?: string | null
          job_id?: string | null
          job_status?: string | null
          annotated_url?: string | null
          features_url?: string | null
          analysis_url?: string | null
          analysis_method?: 'metrabs' | 'hrnet_scgnet'
          scgnet_label?: 'correct' | 'incorrect' | null
          scgnet_confidence?: number | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
