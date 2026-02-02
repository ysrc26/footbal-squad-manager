export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'admin' | 'moderator' | 'user';

export type GameStatus = 'scheduled' | 'open_for_residents' | 'open_for_all' | 'closed' | 'completed' | 'cancelled';

export type RegistrationStatus = 'active' | 'standby' | 'cancelled' | 'no_show';

export type CheckInStatus = 'pending' | 'checked_in' | 'no_show';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          phone_number: string | null
          avatar_url: string | null
          is_resident: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          is_resident?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          is_resident?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: AppRole
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: AppRole
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: AppRole
          created_at?: string
        }
      }
      app_settings: {
        Row: {
          id: string
          field_latitude: number | null
          field_longitude: number | null
          rules_content: string | null
          qr_secret_key: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          field_latitude?: number | null
          field_longitude?: number | null
          rules_content?: string | null
          qr_secret_key: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          field_latitude?: number | null
          field_longitude?: number | null
          rules_content?: string | null
          qr_secret_key?: string
          created_at?: string
          updated_at?: string
        }
      }
      games: {
        Row: {
          id: string
          date: string
          shabbat_end: string | null
          candle_lighting: string | null
          deadline_time: string
          kickoff_time: string
          status: GameStatus
          is_auto_generated: boolean
          max_players: number
          max_standby: number
          registration_opens_at: string | null
          wave1_registration_opens_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          shabbat_end?: string | null
          candle_lighting?: string | null
          deadline_time: string
          kickoff_time: string
          status?: GameStatus
          is_auto_generated?: boolean
          max_players?: number
          max_standby?: number
          registration_opens_at?: string | null
          wave1_registration_opens_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          shabbat_end?: string | null
          candle_lighting?: string | null
          deadline_time?: string
          kickoff_time?: string
          status?: GameStatus
          is_auto_generated?: boolean
          max_players?: number
          max_standby?: number
          registration_opens_at?: string | null
          wave1_registration_opens_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      registrations: {
        Row: {
          id: string
          user_id: string
          game_id: string
          status: RegistrationStatus
          check_in_status: CheckInStatus
          eta_minutes: number | null
          queue_position: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          game_id: string
          status?: RegistrationStatus
          check_in_status?: CheckInStatus
          eta_minutes?: number | null
          queue_position?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          game_id?: string
          status?: RegistrationStatus
          check_in_status?: CheckInStatus
          eta_minutes?: number | null
          queue_position?: number | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      has_role: {
        Args: {
          _user_id: string
          _role: AppRole
        }
        Returns: boolean
      }
      register_for_game: {
        Args: {
          _game_id: string
        }
        Returns: {
          registration_id: string
          status: RegistrationStatus
          queue_position: number | null
        }[]
      }
      cancel_registration_for_game: {
        Args: {
          _game_id: string
        }
        Returns: {
          cancelled_registration_id: string
          promoted_registration_id: string | null
          promoted_user_id: string | null
        }[]
      }
      process_late_swaps: {
        Args: {
          _game_id: string
        }
        Returns: {
          swaps_count: number
          swaps: Json
        }[]
      }
    }
    Enums: {
      app_role: AppRole
      game_status: GameStatus
      registration_status: RegistrationStatus
      check_in_status: CheckInStatus
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
