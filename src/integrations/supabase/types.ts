export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      budget_changes: {
        Row: {
          budget_item_id: string | null
          change_type: string
          created_at: string
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          proposal_id: string
          user_id: string
        }
        Insert: {
          budget_item_id?: string | null
          change_type: string
          created_at?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          proposal_id: string
          user_id: string
        }
        Update: {
          budget_item_id?: string | null
          change_type?: string
          created_at?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_changes_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_changes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          amount: number
          category: string
          cost_type: string | null
          created_at: string
          description: string | null
          id: string
          justification: string | null
          participant_id: string
          person_months: number | null
          proposal_id: string
          quantity: number | null
          subcategory: string | null
          unit_cost: number | null
          updated_at: string
          work_package: string | null
        }
        Insert: {
          amount?: number
          category: string
          cost_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          justification?: string | null
          participant_id: string
          person_months?: number | null
          proposal_id: string
          quantity?: number | null
          subcategory?: string | null
          unit_cost?: number | null
          updated_at?: string
          work_package?: string | null
        }
        Update: {
          amount?: number
          category?: string
          cost_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          justification?: string | null
          participant_id?: string
          person_months?: number | null
          proposal_id?: string
          quantity?: number | null
          subcategory?: string | null
          unit_cost?: number | null
          updated_at?: string
          work_package?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          proposal_id: string
          resolved: boolean | null
          section_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          proposal_id: string
          resolved?: boolean | null
          section_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          proposal_id?: string
          resolved?: boolean | null
          section_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ethics_assessment: {
        Row: {
          animals: boolean | null
          animals_details: string | null
          created_at: string
          dual_use: boolean | null
          dual_use_details: string | null
          environment: boolean | null
          environment_details: string | null
          human_cells: boolean | null
          human_cells_details: string | null
          human_subjects: boolean | null
          human_subjects_details: string | null
          id: string
          misuse: boolean | null
          misuse_details: string | null
          other_ethics: boolean | null
          other_ethics_details: string | null
          personal_data: boolean | null
          personal_data_details: string | null
          proposal_id: string
          third_countries: boolean | null
          third_countries_details: string | null
          updated_at: string
        }
        Insert: {
          animals?: boolean | null
          animals_details?: string | null
          created_at?: string
          dual_use?: boolean | null
          dual_use_details?: string | null
          environment?: boolean | null
          environment_details?: string | null
          human_cells?: boolean | null
          human_cells_details?: string | null
          human_subjects?: boolean | null
          human_subjects_details?: string | null
          id?: string
          misuse?: boolean | null
          misuse_details?: string | null
          other_ethics?: boolean | null
          other_ethics_details?: string | null
          personal_data?: boolean | null
          personal_data_details?: string | null
          proposal_id: string
          third_countries?: boolean | null
          third_countries_details?: string | null
          updated_at?: string
        }
        Update: {
          animals?: boolean | null
          animals_details?: string | null
          created_at?: string
          dual_use?: boolean | null
          dual_use_details?: string | null
          environment?: boolean | null
          environment_details?: string | null
          human_cells?: boolean | null
          human_cells_details?: string | null
          human_subjects?: boolean | null
          human_subjects_details?: string | null
          id?: string
          misuse?: boolean | null
          misuse_details?: string | null
          other_ethics?: boolean | null
          other_ethics_details?: string | null
          personal_data?: boolean | null
          personal_data_details?: string | null
          proposal_id?: string
          third_countries?: boolean | null
          third_countries_details?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ethics_assessment_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      figure_references: {
        Row: {
          created_at: string
          figure_id: string
          id: string
          position_in_text: number | null
          section_content_id: string
        }
        Insert: {
          created_at?: string
          figure_id: string
          id?: string
          position_in_text?: number | null
          section_content_id: string
        }
        Update: {
          created_at?: string
          figure_id?: string
          id?: string
          position_in_text?: number | null
          section_content_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "figure_references_figure_id_fkey"
            columns: ["figure_id"]
            isOneToOne: false
            referencedRelation: "figures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "figure_references_section_content_id_fkey"
            columns: ["section_content_id"]
            isOneToOne: false
            referencedRelation: "section_content"
            referencedColumns: ["id"]
          },
        ]
      }
      figures: {
        Row: {
          caption: string | null
          content: Json | null
          created_at: string
          figure_number: string
          figure_type: string
          id: string
          order_index: number
          proposal_id: string
          section_id: string
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          content?: Json | null
          created_at?: string
          figure_number: string
          figure_type?: string
          id?: string
          order_index?: number
          proposal_id: string
          section_id: string
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          content?: Json | null
          created_at?: string
          figure_number?: string
          figure_type?: string
          id?: string
          order_index?: number
          proposal_id?: string
          section_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "figures_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      member_wp_allocations: {
        Row: {
          created_at: string
          id: string
          member_id: string
          person_months: number
          role: string | null
          updated_at: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          person_months?: number
          role?: string | null
          updated_at?: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          person_months?: number
          role?: string | null
          updated_at?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_wp_allocations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "participant_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_wp_allocations_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          is_sme: boolean | null
          legal_entity_type: string | null
          logo_url: string | null
          name: string
          pic_number: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          name: string
          pic_number?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          name?: string
          pic_number?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      part_a_data: {
        Row: {
          additional_info: Json | null
          created_at: string
          declarations: string | null
          dependencies: string | null
          id: string
          participant_id: string
          previous_proposals: string | null
          resources: string | null
          updated_at: string
        }
        Insert: {
          additional_info?: Json | null
          created_at?: string
          declarations?: string | null
          dependencies?: string | null
          id?: string
          participant_id: string
          previous_proposals?: string | null
          resources?: string | null
          updated_at?: string
        }
        Update: {
          additional_info?: Json | null
          created_at?: string
          declarations?: string | null
          dependencies?: string | null
          id?: string
          participant_id?: string
          previous_proposals?: string | null
          resources?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_a_data_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_members: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary_contact: boolean | null
          participant_id: string
          person_months: number | null
          role_in_project: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary_contact?: boolean | null
          participant_id: string
          person_months?: number | null
          role_in_project?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary_contact?: boolean | null
          participant_id?: string
          person_months?: number | null
          role_in_project?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_members_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          address: string | null
          contact_email: string | null
          country: string | null
          created_at: string
          id: string
          is_sme: boolean | null
          legal_entity_type: string | null
          logo_url: string | null
          organisation_name: string
          organisation_short_name: string | null
          organisation_type: Database["public"]["Enums"]["participant_type"]
          participant_number: number | null
          pic_number: string | null
          proposal_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          organisation_name: string
          organisation_short_name?: string | null
          organisation_type?: Database["public"]["Enums"]["participant_type"]
          participant_number?: number | null
          pic_number?: string | null
          proposal_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          organisation_name?: string
          organisation_short_name?: string | null
          organisation_type?: Database["public"]["Enums"]["participant_type"]
          participant_number?: number | null
          pic_number?: string | null
          proposal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          address_line_2: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          department: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          organisation: string | null
          phone_number: string | null
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line_2?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          organisation?: string | null
          phone_number?: string | null
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line_2?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          organisation?: string | null
          phone_number?: string | null
          postcode?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          acronym: string
          budget_type: Database["public"]["Enums"]["budget_type"]
          created_at: string
          created_by: string | null
          deadline: string | null
          decision_date: string | null
          description: string | null
          destination: string | null
          id: string
          logo_url: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          submitted_at: string | null
          title: string
          topic_id: string | null
          topic_url: string | null
          total_budget: number | null
          type: Database["public"]["Enums"]["proposal_type"]
          updated_at: string
          work_programme: string | null
        }
        Insert: {
          acronym: string
          budget_type?: Database["public"]["Enums"]["budget_type"]
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          decision_date?: string | null
          description?: string | null
          destination?: string | null
          id?: string
          logo_url?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          submitted_at?: string | null
          title: string
          topic_id?: string | null
          topic_url?: string | null
          total_budget?: number | null
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
          work_programme?: string | null
        }
        Update: {
          acronym?: string
          budget_type?: Database["public"]["Enums"]["budget_type"]
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          decision_date?: string | null
          description?: string | null
          destination?: string | null
          id?: string
          logo_url?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          submitted_at?: string | null
          title?: string
          topic_id?: string | null
          topic_url?: string | null
          total_budget?: number | null
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
          work_programme?: string | null
        }
        Relationships: []
      }
      references: {
        Row: {
          authors: string[] | null
          citation_number: number
          created_at: string
          doi: string | null
          formatted_citation: string | null
          id: string
          journal: string | null
          pages: string | null
          proposal_id: string
          title: string
          updated_at: string
          verified: boolean | null
          volume: string | null
          year: number | null
        }
        Insert: {
          authors?: string[] | null
          citation_number: number
          created_at?: string
          doi?: string | null
          formatted_citation?: string | null
          id?: string
          journal?: string | null
          pages?: string | null
          proposal_id: string
          title: string
          updated_at?: string
          verified?: boolean | null
          volume?: string | null
          year?: number | null
        }
        Update: {
          authors?: string[] | null
          citation_number?: number
          created_at?: string
          doi?: string | null
          formatted_citation?: string | null
          id?: string
          journal?: string | null
          pages?: string | null
          proposal_id?: string
          title?: string
          updated_at?: string
          verified?: boolean | null
          volume?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "references_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      section_content: {
        Row: {
          content: string | null
          created_at: string
          id: string
          last_edited_by: string | null
          proposal_id: string
          section_id: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          last_edited_by?: string | null
          proposal_id: string
          section_id: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          last_edited_by?: string | null
          proposal_id?: string
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_content_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      section_footnotes: {
        Row: {
          created_at: string
          id: string
          position_in_text: number | null
          reference_id: string
          section_content_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position_in_text?: number | null
          reference_id: string
          section_content_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position_in_text?: number | null
          reference_id?: string
          section_content_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_footnotes_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_footnotes_section_content_id_fkey"
            columns: ["section_content_id"]
            isOneToOne: false
            referencedRelation: "section_content"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      versions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          proposal_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          proposal_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          proposal_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      work_packages: {
        Row: {
          created_at: string
          description: string | null
          end_month: number | null
          id: string
          lead_participant_id: string | null
          number: number
          proposal_id: string
          start_month: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_month?: number | null
          id?: string
          lead_participant_id?: string | null
          number: number
          proposal_id: string
          start_month?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_month?: number | null
          id?: string
          lead_participant_id?: string | null
          number?: number
          proposal_id?: string
          start_month?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_lead_participant_id_fkey"
            columns: ["lead_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_proposal: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
      has_any_proposal_role: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
      has_proposal_role: {
        Args: {
          _proposal_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_proposal_admin: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      budget_type: "traditional" | "lump_sum"
      participant_type:
        | "beneficiary"
        | "affiliated_entity"
        | "associated_partner"
        | "third_party_against_payment"
        | "third_party_free_of_charge"
        | "subcontractor"
        | "international_partner"
        | "associated_country_partner"
      proposal_status: "draft" | "submitted" | "funded" | "not_funded"
      proposal_type: "RIA" | "IA" | "CSA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      budget_type: ["traditional", "lump_sum"],
      participant_type: [
        "beneficiary",
        "affiliated_entity",
        "associated_partner",
        "third_party_against_payment",
        "third_party_free_of_charge",
        "subcontractor",
        "international_partner",
        "associated_country_partner",
      ],
      proposal_status: ["draft", "submitted", "funded", "not_funded"],
      proposal_type: ["RIA", "IA", "CSA"],
    },
  },
} as const
