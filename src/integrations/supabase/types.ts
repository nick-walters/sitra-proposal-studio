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
      b31_deliverables: {
        Row: {
          created_at: string
          description: string
          dissemination_level: string | null
          due_month: number | null
          id: string
          lead_participant_id: string | null
          name: string
          number: string
          order_index: number
          proposal_id: string
          task_id: string | null
          type: string | null
          updated_at: string
          wp_number: number | null
        }
        Insert: {
          created_at?: string
          description?: string
          dissemination_level?: string | null
          due_month?: number | null
          id?: string
          lead_participant_id?: string | null
          name?: string
          number: string
          order_index?: number
          proposal_id: string
          task_id?: string | null
          type?: string | null
          updated_at?: string
          wp_number?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          dissemination_level?: string | null
          due_month?: number | null
          id?: string
          lead_participant_id?: string | null
          name?: string
          number?: string
          order_index?: number
          proposal_id?: string
          task_id?: string | null
          type?: string | null
          updated_at?: string
          wp_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "b31_deliverables_lead_participant_id_fkey"
            columns: ["lead_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b31_deliverables_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b31_deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_draft_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      b31_milestones: {
        Row: {
          created_at: string
          due_month: number | null
          id: string
          means_of_verification: string
          name: string
          number: number
          order_index: number | null
          proposal_id: string
          task_id: string | null
          updated_at: string
          wps: string
        }
        Insert: {
          created_at?: string
          due_month?: number | null
          id?: string
          means_of_verification?: string
          name?: string
          number: number
          order_index?: number | null
          proposal_id: string
          task_id?: string | null
          updated_at?: string
          wps?: string
        }
        Update: {
          created_at?: string
          due_month?: number | null
          id?: string
          means_of_verification?: string
          name?: string
          number?: number
          order_index?: number | null
          proposal_id?: string
          task_id?: string | null
          updated_at?: string
          wps?: string
        }
        Relationships: [
          {
            foreignKeyName: "b31_milestones_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b31_milestones_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_draft_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      b31_risks: {
        Row: {
          created_at: string
          description: string
          id: string
          likelihood: string | null
          mitigation: string
          number: number
          order_index: number | null
          proposal_id: string
          severity: string | null
          updated_at: string
          wps: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          likelihood?: string | null
          mitigation?: string
          number: number
          order_index?: number | null
          proposal_id: string
          severity?: string | null
          updated_at?: string
          wps?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          likelihood?: string | null
          mitigation?: string
          number?: number
          order_index?: number | null
          proposal_id?: string
          severity?: string | null
          updated_at?: string
          wps?: string
        }
        Relationships: [
          {
            foreignKeyName: "b31_risks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
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
      budget_cost_justifications: {
        Row: {
          budget_row_id: string
          category: string
          created_at: string
          id: string
          justification_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_row_id: string
          category: string
          created_at?: string
          id?: string
          justification_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_row_id?: string
          category?: string
          created_at?: string
          id?: string
          justification_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_cost_justifications_budget_row_id_fkey"
            columns: ["budget_row_id"]
            isOneToOne: false
            referencedRelation: "budget_rows"
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
      budget_rows: {
        Row: {
          created_at: string
          financial_contributions: number
          funding_rate_override: number | null
          id: string
          income_generated: number
          indirect_costs_override: number | null
          internally_invoiced: number
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          own_resources: number
          participant_id: string
          personnel_costs: number
          proposal_id: string
          purchase_equipment: number
          purchase_other_goods: number
          purchase_travel: number
          role_label: string
          subcontracting_costs: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          financial_contributions?: number
          funding_rate_override?: number | null
          id?: string
          income_generated?: number
          indirect_costs_override?: number | null
          internally_invoiced?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          own_resources?: number
          participant_id: string
          personnel_costs?: number
          proposal_id: string
          purchase_equipment?: number
          purchase_other_goods?: number
          purchase_travel?: number
          role_label?: string
          subcontracting_costs?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          financial_contributions?: number
          funding_rate_override?: number | null
          id?: string
          income_generated?: number
          indirect_costs_override?: number | null
          internally_invoiced?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          own_resources?: number
          participant_id?: string
          personnel_costs?: number
          proposal_id?: string
          purchase_equipment?: number
          purchase_other_goods?: number
          purchase_travel?: number
          role_label?: string
          subcontracting_costs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_rows_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_rows_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_templates: {
        Row: {
          budget_type: string
          categories: Json
          created_at: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          template_type_id: string | null
          updated_at: string
        }
        Insert: {
          budget_type: string
          categories: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          template_type_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_type?: string
          categories?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          template_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_templates_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      case_drafts: {
        Row: {
          background_context: string | null
          case_type: string
          color: string
          created_at: string
          custom_type_name: string | null
          description: string | null
          expected_outcomes: string | null
          guideline_background: string | null
          guideline_outcomes: string | null
          guideline_replicability: string | null
          guideline_solutions: string | null
          guideline_stakeholders: string | null
          heading_background: string | null
          heading_outcomes: string | null
          heading_replicability: string | null
          heading_solutions: string | null
          heading_stakeholders: string | null
          id: string
          key_stakeholders: string | null
          lead_participant_id: string | null
          number: number
          order_index: number
          proposal_id: string
          proposed_solutions: string | null
          replicability: string | null
          short_name: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          background_context?: string | null
          case_type?: string
          color?: string
          created_at?: string
          custom_type_name?: string | null
          description?: string | null
          expected_outcomes?: string | null
          guideline_background?: string | null
          guideline_outcomes?: string | null
          guideline_replicability?: string | null
          guideline_solutions?: string | null
          guideline_stakeholders?: string | null
          heading_background?: string | null
          heading_outcomes?: string | null
          heading_replicability?: string | null
          heading_solutions?: string | null
          heading_stakeholders?: string | null
          id?: string
          key_stakeholders?: string | null
          lead_participant_id?: string | null
          number: number
          order_index?: number
          proposal_id: string
          proposed_solutions?: string | null
          replicability?: string | null
          short_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          background_context?: string | null
          case_type?: string
          color?: string
          created_at?: string
          custom_type_name?: string | null
          description?: string | null
          expected_outcomes?: string | null
          guideline_background?: string | null
          guideline_outcomes?: string | null
          guideline_replicability?: string | null
          guideline_solutions?: string | null
          guideline_stakeholders?: string | null
          heading_background?: string | null
          heading_outcomes?: string | null
          heading_replicability?: string | null
          heading_solutions?: string | null
          heading_stakeholders?: string | null
          id?: string
          key_stakeholders?: string | null
          lead_participant_id?: string | null
          number?: number
          order_index?: number
          proposal_id?: string
          proposed_solutions?: string | null
          replicability?: string | null
          short_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_drafts_lead_participant_id_fkey"
            columns: ["lead_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_drafts_proposal_id_fkey"
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
      common_figures: {
        Row: {
          category: string | null
          content: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          figure_type: string
          id: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          figure_type?: string
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          figure_type?: string
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      ethics_assessment: {
        Row: {
          animals: boolean | null
          animals_cloned: boolean | null
          animals_cloned_page: string | null
          animals_details: string | null
          animals_endangered: boolean | null
          animals_endangered_page: string | null
          animals_non_human_primates: boolean | null
          animals_non_human_primates_page: string | null
          animals_page: string | null
          animals_transgenic: boolean | null
          animals_transgenic_page: string | null
          animals_vertebrates: boolean | null
          animals_vertebrates_page: string | null
          artificial_intelligence: boolean | null
          artificial_intelligence_page: string | null
          clinical_study: boolean | null
          clinical_study_page: string | null
          clinical_trial: boolean | null
          clinical_trial_page: string | null
          created_at: string
          dual_use: boolean | null
          dual_use_details: string | null
          environment: boolean | null
          environment_details: string | null
          environment_health: boolean | null
          environment_health_endangered: boolean | null
          environment_health_endangered_page: string | null
          environment_health_harmful: boolean | null
          environment_health_harmful_page: string | null
          environment_health_page: string | null
          ethics_confirmation: boolean | null
          ethics_self_assessment_compliance: string | null
          ethics_self_assessment_objectives: string | null
          hesc_derived_from_embryos: boolean | null
          hesc_derived_from_embryos_page: string | null
          hesc_established_lines: boolean | null
          hesc_established_lines_page: string | null
          hesc_european_registry: boolean | null
          hesc_european_registry_page: string | null
          human_biological_samples: boolean | null
          human_biological_samples_page: string | null
          human_cells: boolean | null
          human_cells_biobank: boolean | null
          human_cells_biobank_page: string | null
          human_cells_commercial: boolean | null
          human_cells_commercial_page: string | null
          human_cells_details: string | null
          human_cells_embryonic_foetal: boolean | null
          human_cells_embryonic_foetal_page: string | null
          human_cells_obtained_other: boolean | null
          human_cells_obtained_other_page: string | null
          human_cells_obtained_within: boolean | null
          human_cells_obtained_within_page: string | null
          human_cells_page: string | null
          human_children: boolean | null
          human_children_page: string | null
          human_embryonic_stem_cells: boolean | null
          human_embryonic_stem_cells_page: string | null
          human_embryos_destruction: boolean | null
          human_embryos_destruction_page: string | null
          human_embryos_section1: boolean | null
          human_embryos_section1_page: string | null
          human_interventions: boolean | null
          human_interventions_page: string | null
          human_invasive: boolean | null
          human_invasive_page: string | null
          human_participants: boolean | null
          human_participants_page: string | null
          human_patients: boolean | null
          human_patients_page: string | null
          human_subjects: boolean | null
          human_subjects_details: string | null
          human_unable_consent: boolean | null
          human_unable_consent_page: string | null
          human_volunteers_medical: boolean | null
          human_volunteers_medical_page: string | null
          human_volunteers_non_medical: boolean | null
          human_volunteers_non_medical_page: string | null
          human_vulnerable: boolean | null
          human_vulnerable_page: string | null
          id: string
          low_intervention_trial: boolean | null
          low_intervention_trial_page: string | null
          misuse: boolean | null
          misuse_details: string | null
          non_eu_countries: boolean | null
          non_eu_countries_details: string | null
          non_eu_countries_ethics_issues: boolean | null
          non_eu_countries_ethics_issues_details: string | null
          non_eu_countries_ethics_issues_page: string | null
          non_eu_countries_lmic: boolean | null
          non_eu_countries_lmic_page: string | null
          non_eu_countries_material_export: boolean | null
          non_eu_countries_material_export_details: string | null
          non_eu_countries_material_export_page: string | null
          non_eu_countries_material_import: boolean | null
          non_eu_countries_material_import_details: string | null
          non_eu_countries_material_import_page: string | null
          non_eu_countries_page: string | null
          non_eu_countries_risk: boolean | null
          non_eu_countries_risk_page: string | null
          other_ethics: boolean | null
          other_ethics_details: string | null
          other_ethics_page: string | null
          personal_data: boolean | null
          personal_data_criminal: boolean | null
          personal_data_criminal_page: string | null
          personal_data_details: string | null
          personal_data_export_non_eu: boolean | null
          personal_data_export_non_eu_details: string | null
          personal_data_export_non_eu_page: string | null
          personal_data_genetic: boolean | null
          personal_data_genetic_page: string | null
          personal_data_import_non_eu: boolean | null
          personal_data_import_non_eu_details: string | null
          personal_data_import_non_eu_page: string | null
          personal_data_page: string | null
          personal_data_previously_collected: boolean | null
          personal_data_previously_collected_page: string | null
          personal_data_profiling: boolean | null
          personal_data_profiling_page: string | null
          personal_data_special_categories: boolean | null
          personal_data_special_categories_page: string | null
          proposal_id: string
          security_dual_use: boolean | null
          security_dual_use_page: string | null
          security_eu_classified: boolean | null
          security_eu_classified_level: string | null
          security_eu_classified_page: string | null
          security_euci_background: boolean | null
          security_euci_background_page: string | null
          security_euci_foreground: boolean | null
          security_euci_foreground_page: string | null
          security_euci_non_eu_access: boolean | null
          security_euci_non_eu_access_page: string | null
          security_euci_non_eu_agreement: boolean | null
          security_euci_non_eu_agreement_page: string | null
          security_exclusively_defence: boolean | null
          security_exclusively_defence_page: string | null
          security_misuse: boolean | null
          security_misuse_cbrn: boolean | null
          security_misuse_cbrn_page: string | null
          security_misuse_crime_terrorism: boolean | null
          security_misuse_crime_terrorism_page: string | null
          security_misuse_page: string | null
          security_other_issues: boolean | null
          security_other_issues_details: string | null
          security_other_issues_page: string | null
          security_other_national: boolean | null
          security_other_national_details: string | null
          security_other_national_page: string | null
          security_self_assessment: string | null
          self_assessment_text: string | null
          third_countries: boolean | null
          third_countries_details: string | null
          updated_at: string
        }
        Insert: {
          animals?: boolean | null
          animals_cloned?: boolean | null
          animals_cloned_page?: string | null
          animals_details?: string | null
          animals_endangered?: boolean | null
          animals_endangered_page?: string | null
          animals_non_human_primates?: boolean | null
          animals_non_human_primates_page?: string | null
          animals_page?: string | null
          animals_transgenic?: boolean | null
          animals_transgenic_page?: string | null
          animals_vertebrates?: boolean | null
          animals_vertebrates_page?: string | null
          artificial_intelligence?: boolean | null
          artificial_intelligence_page?: string | null
          clinical_study?: boolean | null
          clinical_study_page?: string | null
          clinical_trial?: boolean | null
          clinical_trial_page?: string | null
          created_at?: string
          dual_use?: boolean | null
          dual_use_details?: string | null
          environment?: boolean | null
          environment_details?: string | null
          environment_health?: boolean | null
          environment_health_endangered?: boolean | null
          environment_health_endangered_page?: string | null
          environment_health_harmful?: boolean | null
          environment_health_harmful_page?: string | null
          environment_health_page?: string | null
          ethics_confirmation?: boolean | null
          ethics_self_assessment_compliance?: string | null
          ethics_self_assessment_objectives?: string | null
          hesc_derived_from_embryos?: boolean | null
          hesc_derived_from_embryos_page?: string | null
          hesc_established_lines?: boolean | null
          hesc_established_lines_page?: string | null
          hesc_european_registry?: boolean | null
          hesc_european_registry_page?: string | null
          human_biological_samples?: boolean | null
          human_biological_samples_page?: string | null
          human_cells?: boolean | null
          human_cells_biobank?: boolean | null
          human_cells_biobank_page?: string | null
          human_cells_commercial?: boolean | null
          human_cells_commercial_page?: string | null
          human_cells_details?: string | null
          human_cells_embryonic_foetal?: boolean | null
          human_cells_embryonic_foetal_page?: string | null
          human_cells_obtained_other?: boolean | null
          human_cells_obtained_other_page?: string | null
          human_cells_obtained_within?: boolean | null
          human_cells_obtained_within_page?: string | null
          human_cells_page?: string | null
          human_children?: boolean | null
          human_children_page?: string | null
          human_embryonic_stem_cells?: boolean | null
          human_embryonic_stem_cells_page?: string | null
          human_embryos_destruction?: boolean | null
          human_embryos_destruction_page?: string | null
          human_embryos_section1?: boolean | null
          human_embryos_section1_page?: string | null
          human_interventions?: boolean | null
          human_interventions_page?: string | null
          human_invasive?: boolean | null
          human_invasive_page?: string | null
          human_participants?: boolean | null
          human_participants_page?: string | null
          human_patients?: boolean | null
          human_patients_page?: string | null
          human_subjects?: boolean | null
          human_subjects_details?: string | null
          human_unable_consent?: boolean | null
          human_unable_consent_page?: string | null
          human_volunteers_medical?: boolean | null
          human_volunteers_medical_page?: string | null
          human_volunteers_non_medical?: boolean | null
          human_volunteers_non_medical_page?: string | null
          human_vulnerable?: boolean | null
          human_vulnerable_page?: string | null
          id?: string
          low_intervention_trial?: boolean | null
          low_intervention_trial_page?: string | null
          misuse?: boolean | null
          misuse_details?: string | null
          non_eu_countries?: boolean | null
          non_eu_countries_details?: string | null
          non_eu_countries_ethics_issues?: boolean | null
          non_eu_countries_ethics_issues_details?: string | null
          non_eu_countries_ethics_issues_page?: string | null
          non_eu_countries_lmic?: boolean | null
          non_eu_countries_lmic_page?: string | null
          non_eu_countries_material_export?: boolean | null
          non_eu_countries_material_export_details?: string | null
          non_eu_countries_material_export_page?: string | null
          non_eu_countries_material_import?: boolean | null
          non_eu_countries_material_import_details?: string | null
          non_eu_countries_material_import_page?: string | null
          non_eu_countries_page?: string | null
          non_eu_countries_risk?: boolean | null
          non_eu_countries_risk_page?: string | null
          other_ethics?: boolean | null
          other_ethics_details?: string | null
          other_ethics_page?: string | null
          personal_data?: boolean | null
          personal_data_criminal?: boolean | null
          personal_data_criminal_page?: string | null
          personal_data_details?: string | null
          personal_data_export_non_eu?: boolean | null
          personal_data_export_non_eu_details?: string | null
          personal_data_export_non_eu_page?: string | null
          personal_data_genetic?: boolean | null
          personal_data_genetic_page?: string | null
          personal_data_import_non_eu?: boolean | null
          personal_data_import_non_eu_details?: string | null
          personal_data_import_non_eu_page?: string | null
          personal_data_page?: string | null
          personal_data_previously_collected?: boolean | null
          personal_data_previously_collected_page?: string | null
          personal_data_profiling?: boolean | null
          personal_data_profiling_page?: string | null
          personal_data_special_categories?: boolean | null
          personal_data_special_categories_page?: string | null
          proposal_id: string
          security_dual_use?: boolean | null
          security_dual_use_page?: string | null
          security_eu_classified?: boolean | null
          security_eu_classified_level?: string | null
          security_eu_classified_page?: string | null
          security_euci_background?: boolean | null
          security_euci_background_page?: string | null
          security_euci_foreground?: boolean | null
          security_euci_foreground_page?: string | null
          security_euci_non_eu_access?: boolean | null
          security_euci_non_eu_access_page?: string | null
          security_euci_non_eu_agreement?: boolean | null
          security_euci_non_eu_agreement_page?: string | null
          security_exclusively_defence?: boolean | null
          security_exclusively_defence_page?: string | null
          security_misuse?: boolean | null
          security_misuse_cbrn?: boolean | null
          security_misuse_cbrn_page?: string | null
          security_misuse_crime_terrorism?: boolean | null
          security_misuse_crime_terrorism_page?: string | null
          security_misuse_page?: string | null
          security_other_issues?: boolean | null
          security_other_issues_details?: string | null
          security_other_issues_page?: string | null
          security_other_national?: boolean | null
          security_other_national_details?: string | null
          security_other_national_page?: string | null
          security_self_assessment?: string | null
          self_assessment_text?: string | null
          third_countries?: boolean | null
          third_countries_details?: string | null
          updated_at?: string
        }
        Update: {
          animals?: boolean | null
          animals_cloned?: boolean | null
          animals_cloned_page?: string | null
          animals_details?: string | null
          animals_endangered?: boolean | null
          animals_endangered_page?: string | null
          animals_non_human_primates?: boolean | null
          animals_non_human_primates_page?: string | null
          animals_page?: string | null
          animals_transgenic?: boolean | null
          animals_transgenic_page?: string | null
          animals_vertebrates?: boolean | null
          animals_vertebrates_page?: string | null
          artificial_intelligence?: boolean | null
          artificial_intelligence_page?: string | null
          clinical_study?: boolean | null
          clinical_study_page?: string | null
          clinical_trial?: boolean | null
          clinical_trial_page?: string | null
          created_at?: string
          dual_use?: boolean | null
          dual_use_details?: string | null
          environment?: boolean | null
          environment_details?: string | null
          environment_health?: boolean | null
          environment_health_endangered?: boolean | null
          environment_health_endangered_page?: string | null
          environment_health_harmful?: boolean | null
          environment_health_harmful_page?: string | null
          environment_health_page?: string | null
          ethics_confirmation?: boolean | null
          ethics_self_assessment_compliance?: string | null
          ethics_self_assessment_objectives?: string | null
          hesc_derived_from_embryos?: boolean | null
          hesc_derived_from_embryos_page?: string | null
          hesc_established_lines?: boolean | null
          hesc_established_lines_page?: string | null
          hesc_european_registry?: boolean | null
          hesc_european_registry_page?: string | null
          human_biological_samples?: boolean | null
          human_biological_samples_page?: string | null
          human_cells?: boolean | null
          human_cells_biobank?: boolean | null
          human_cells_biobank_page?: string | null
          human_cells_commercial?: boolean | null
          human_cells_commercial_page?: string | null
          human_cells_details?: string | null
          human_cells_embryonic_foetal?: boolean | null
          human_cells_embryonic_foetal_page?: string | null
          human_cells_obtained_other?: boolean | null
          human_cells_obtained_other_page?: string | null
          human_cells_obtained_within?: boolean | null
          human_cells_obtained_within_page?: string | null
          human_cells_page?: string | null
          human_children?: boolean | null
          human_children_page?: string | null
          human_embryonic_stem_cells?: boolean | null
          human_embryonic_stem_cells_page?: string | null
          human_embryos_destruction?: boolean | null
          human_embryos_destruction_page?: string | null
          human_embryos_section1?: boolean | null
          human_embryos_section1_page?: string | null
          human_interventions?: boolean | null
          human_interventions_page?: string | null
          human_invasive?: boolean | null
          human_invasive_page?: string | null
          human_participants?: boolean | null
          human_participants_page?: string | null
          human_patients?: boolean | null
          human_patients_page?: string | null
          human_subjects?: boolean | null
          human_subjects_details?: string | null
          human_unable_consent?: boolean | null
          human_unable_consent_page?: string | null
          human_volunteers_medical?: boolean | null
          human_volunteers_medical_page?: string | null
          human_volunteers_non_medical?: boolean | null
          human_volunteers_non_medical_page?: string | null
          human_vulnerable?: boolean | null
          human_vulnerable_page?: string | null
          id?: string
          low_intervention_trial?: boolean | null
          low_intervention_trial_page?: string | null
          misuse?: boolean | null
          misuse_details?: string | null
          non_eu_countries?: boolean | null
          non_eu_countries_details?: string | null
          non_eu_countries_ethics_issues?: boolean | null
          non_eu_countries_ethics_issues_details?: string | null
          non_eu_countries_ethics_issues_page?: string | null
          non_eu_countries_lmic?: boolean | null
          non_eu_countries_lmic_page?: string | null
          non_eu_countries_material_export?: boolean | null
          non_eu_countries_material_export_details?: string | null
          non_eu_countries_material_export_page?: string | null
          non_eu_countries_material_import?: boolean | null
          non_eu_countries_material_import_details?: string | null
          non_eu_countries_material_import_page?: string | null
          non_eu_countries_page?: string | null
          non_eu_countries_risk?: boolean | null
          non_eu_countries_risk_page?: string | null
          other_ethics?: boolean | null
          other_ethics_details?: string | null
          other_ethics_page?: string | null
          personal_data?: boolean | null
          personal_data_criminal?: boolean | null
          personal_data_criminal_page?: string | null
          personal_data_details?: string | null
          personal_data_export_non_eu?: boolean | null
          personal_data_export_non_eu_details?: string | null
          personal_data_export_non_eu_page?: string | null
          personal_data_genetic?: boolean | null
          personal_data_genetic_page?: string | null
          personal_data_import_non_eu?: boolean | null
          personal_data_import_non_eu_details?: string | null
          personal_data_import_non_eu_page?: string | null
          personal_data_page?: string | null
          personal_data_previously_collected?: boolean | null
          personal_data_previously_collected_page?: string | null
          personal_data_profiling?: boolean | null
          personal_data_profiling_page?: string | null
          personal_data_special_categories?: boolean | null
          personal_data_special_categories_page?: string | null
          proposal_id?: string
          security_dual_use?: boolean | null
          security_dual_use_page?: string | null
          security_eu_classified?: boolean | null
          security_eu_classified_level?: string | null
          security_eu_classified_page?: string | null
          security_euci_background?: boolean | null
          security_euci_background_page?: string | null
          security_euci_foreground?: boolean | null
          security_euci_foreground_page?: string | null
          security_euci_non_eu_access?: boolean | null
          security_euci_non_eu_access_page?: string | null
          security_euci_non_eu_agreement?: boolean | null
          security_euci_non_eu_agreement_page?: string | null
          security_exclusively_defence?: boolean | null
          security_exclusively_defence_page?: string | null
          security_misuse?: boolean | null
          security_misuse_cbrn?: boolean | null
          security_misuse_cbrn_page?: string | null
          security_misuse_crime_terrorism?: boolean | null
          security_misuse_crime_terrorism_page?: string | null
          security_misuse_page?: string | null
          security_other_issues?: boolean | null
          security_other_issues_details?: string | null
          security_other_issues_page?: string | null
          security_other_national?: boolean | null
          security_other_national_details?: string | null
          security_other_national_page?: string | null
          security_self_assessment?: string | null
          self_assessment_text?: string | null
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
      feedback: {
        Row: {
          ai_analysis: string | null
          category: string
          created_at: string
          description: string
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      funding_programmes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      funding_rules: {
        Row: {
          conditions: Json
          created_at: string
          description: string | null
          funding_rate: number
          id: string
          is_active: boolean | null
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          description?: string | null
          funding_rate: number
          id?: string
          is_active?: boolean | null
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          description?: string | null
          funding_rate?: number
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
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
      message_stars: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_stars_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "proposal_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          proposal_id: string
          section_id: string | null
          section_title: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          proposal_id: string
          section_id?: string | null
          section_title?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          proposal_id?: string
          section_id?: string | null
          section_title?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organisations: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          english_name: string | null
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
          english_name?: string | null
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
          english_name?: string | null
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
      participant_achievements: {
        Row: {
          achievement_type: string
          created_at: string
          description: string
          id: string
          order_index: number | null
          participant_id: string
          updated_at: string
        }
        Insert: {
          achievement_type: string
          created_at?: string
          description: string
          id?: string
          order_index?: number | null
          participant_id: string
          updated_at?: string
        }
        Update: {
          achievement_type?: string
          created_at?: string
          description?: string
          id?: string
          order_index?: number | null
          participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_achievements_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_departments: {
        Row: {
          country: string | null
          created_at: string
          department_name: string
          id: string
          order_index: number | null
          participant_id: string
          postcode: string | null
          same_as_organisation: boolean | null
          street: string | null
          town: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          department_name: string
          id?: string
          order_index?: number | null
          participant_id: string
          postcode?: string | null
          same_as_organisation?: boolean | null
          street?: string | null
          town?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          department_name?: string
          id?: string
          order_index?: number | null
          participant_id?: string
          postcode?: string | null
          same_as_organisation?: boolean | null
          street?: string | null
          town?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_departments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_dependencies: {
        Row: {
          created_at: string
          id: string
          link_type: string
          linked_participant_id: string | null
          notes: string | null
          participant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_type: string
          linked_participant_id?: string | null
          notes?: string | null
          participant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_type?: string
          linked_participant_id?: string | null
          notes?: string | null
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_dependencies_linked_participant_id_fkey"
            columns: ["linked_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_dependencies_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_infrastructure: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number | null
          participant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          participant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_infrastructure_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_members: {
        Row: {
          access_granted: boolean | null
          access_granted_at: string | null
          access_granted_by: string | null
          access_granted_role: string | null
          access_requested: boolean | null
          access_requested_by: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary_contact: boolean | null
          participant_id: string
          person_id: string | null
          person_months: number | null
          role_in_project: string | null
          updated_at: string
          user_id: string | null
          wants_platform_access: boolean | null
        }
        Insert: {
          access_granted?: boolean | null
          access_granted_at?: string | null
          access_granted_by?: string | null
          access_granted_role?: string | null
          access_requested?: boolean | null
          access_requested_by?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary_contact?: boolean | null
          participant_id: string
          person_id?: string | null
          person_months?: number | null
          role_in_project?: string | null
          updated_at?: string
          user_id?: string | null
          wants_platform_access?: boolean | null
        }
        Update: {
          access_granted?: boolean | null
          access_granted_at?: string | null
          access_granted_by?: string | null
          access_granted_role?: string | null
          access_requested?: boolean | null
          access_requested_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary_contact?: boolean | null
          participant_id?: string
          person_id?: string | null
          person_months?: number | null
          role_in_project?: string | null
          updated_at?: string
          user_id?: string | null
          wants_platform_access?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_members_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_organisation_roles: {
        Row: {
          created_at: string
          id: string
          other_description: string | null
          participant_id: string
          role_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          other_description?: string | null
          participant_id: string
          role_type: string
        }
        Update: {
          created_at?: string
          id?: string
          other_description?: string | null
          participant_id?: string
          role_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_organisation_roles_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_previous_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number | null
          participant_id: string
          project_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number | null
          participant_id: string
          project_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number | null
          participant_id?: string
          project_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_previous_projects_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_researchers: {
        Row: {
          career_stage: string | null
          created_at: string
          email: string | null
          first_name: string
          gender: string | null
          id: string
          identifier_type: string | null
          last_name: string
          nationality: string | null
          order_index: number | null
          participant_id: string
          reference_identifier: string | null
          role_in_project: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          career_stage?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          identifier_type?: string | null
          last_name: string
          nationality?: string | null
          order_index?: number | null
          participant_id: string
          reference_identifier?: string | null
          role_in_project?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          career_stage?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          identifier_type?: string | null
          last_name?: string
          nationality?: string | null
          order_index?: number | null
          participant_id?: string
          reference_identifier?: string | null
          role_in_project?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_researchers_participant_id_fkey"
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
          department: string | null
          departments_not_applicable: boolean | null
          dependency_declaration: string | null
          english_name: string | null
          gep_data_collection: boolean | null
          gep_dedicated_resources: boolean | null
          gep_gender_leadership: boolean | null
          gep_gender_violence: boolean | null
          gep_publication: boolean | null
          gep_recruitment_progression: boolean | null
          gep_research_teaching: boolean | null
          gep_training: boolean | null
          gep_work_life_balance: boolean | null
          has_gender_equality_plan: boolean | null
          id: string
          is_sme: boolean | null
          legal_entity_type: string | null
          logo_url: string | null
          main_contact_access_granted: boolean | null
          main_contact_access_granted_at: string | null
          main_contact_access_granted_by: string | null
          main_contact_access_granted_role: string | null
          main_contact_access_requested: boolean | null
          main_contact_access_requested_by: string | null
          main_contact_country: string | null
          main_contact_first_name: string | null
          main_contact_gender: string | null
          main_contact_last_name: string | null
          main_contact_phone: string | null
          main_contact_position: string | null
          main_contact_postcode: string | null
          main_contact_street: string | null
          main_contact_title: string | null
          main_contact_town: string | null
          organisation_category: string | null
          organisation_name: string
          organisation_short_name: string | null
          organisation_type: Database["public"]["Enums"]["participant_type"]
          participant_number: number | null
          personnel_cost_rate: number | null
          pic_number: string | null
          postcode: string | null
          proposal_id: string
          street: string | null
          town: string | null
          updated_at: string
          use_organisation_address: boolean | null
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          departments_not_applicable?: boolean | null
          dependency_declaration?: string | null
          english_name?: string | null
          gep_data_collection?: boolean | null
          gep_dedicated_resources?: boolean | null
          gep_gender_leadership?: boolean | null
          gep_gender_violence?: boolean | null
          gep_publication?: boolean | null
          gep_recruitment_progression?: boolean | null
          gep_research_teaching?: boolean | null
          gep_training?: boolean | null
          gep_work_life_balance?: boolean | null
          has_gender_equality_plan?: boolean | null
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          main_contact_access_granted?: boolean | null
          main_contact_access_granted_at?: string | null
          main_contact_access_granted_by?: string | null
          main_contact_access_granted_role?: string | null
          main_contact_access_requested?: boolean | null
          main_contact_access_requested_by?: string | null
          main_contact_country?: string | null
          main_contact_first_name?: string | null
          main_contact_gender?: string | null
          main_contact_last_name?: string | null
          main_contact_phone?: string | null
          main_contact_position?: string | null
          main_contact_postcode?: string | null
          main_contact_street?: string | null
          main_contact_title?: string | null
          main_contact_town?: string | null
          organisation_category?: string | null
          organisation_name: string
          organisation_short_name?: string | null
          organisation_type?: Database["public"]["Enums"]["participant_type"]
          participant_number?: number | null
          personnel_cost_rate?: number | null
          pic_number?: string | null
          postcode?: string | null
          proposal_id: string
          street?: string | null
          town?: string | null
          updated_at?: string
          use_organisation_address?: boolean | null
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          departments_not_applicable?: boolean | null
          dependency_declaration?: string | null
          english_name?: string | null
          gep_data_collection?: boolean | null
          gep_dedicated_resources?: boolean | null
          gep_gender_leadership?: boolean | null
          gep_gender_violence?: boolean | null
          gep_publication?: boolean | null
          gep_recruitment_progression?: boolean | null
          gep_research_teaching?: boolean | null
          gep_training?: boolean | null
          gep_work_life_balance?: boolean | null
          has_gender_equality_plan?: boolean | null
          id?: string
          is_sme?: boolean | null
          legal_entity_type?: string | null
          logo_url?: string | null
          main_contact_access_granted?: boolean | null
          main_contact_access_granted_at?: string | null
          main_contact_access_granted_by?: string | null
          main_contact_access_granted_role?: string | null
          main_contact_access_requested?: boolean | null
          main_contact_access_requested_by?: string | null
          main_contact_country?: string | null
          main_contact_first_name?: string | null
          main_contact_gender?: string | null
          main_contact_last_name?: string | null
          main_contact_phone?: string | null
          main_contact_position?: string | null
          main_contact_postcode?: string | null
          main_contact_street?: string | null
          main_contact_title?: string | null
          main_contact_town?: string | null
          organisation_category?: string | null
          organisation_name?: string
          organisation_short_name?: string | null
          organisation_type?: Database["public"]["Enums"]["participant_type"]
          participant_number?: number | null
          personnel_cost_rate?: number | null
          pic_number?: string | null
          postcode?: string | null
          proposal_id?: string
          street?: string | null
          town?: string | null
          updated_at?: string
          use_organisation_address?: boolean | null
          website?: string | null
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
      people: {
        Row: {
          created_at: string
          default_role: string | null
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_role?: string | null
          email?: string | null
          full_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_role?: string | null
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pinned_proposals: {
        Row: {
          created_at: string
          id: string
          order_index: number
          proposal_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          proposal_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_proposals_proposal_id_fkey"
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
          bluesky: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          department: string | null
          email: string
          facebook: string | null
          first_name: string | null
          full_name: string | null
          gdpr_consented_at: string | null
          id: string
          instagram: string | null
          last_name: string | null
          linkedin: string | null
          organisation: string | null
          other_links: Json | null
          phone_number: string | null
          postcode: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          address_line_2?: string | null
          avatar_url?: string | null
          bluesky?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          email: string
          facebook?: string | null
          first_name?: string | null
          full_name?: string | null
          gdpr_consented_at?: string | null
          id: string
          instagram?: string | null
          last_name?: string | null
          linkedin?: string | null
          organisation?: string | null
          other_links?: Json | null
          phone_number?: string | null
          postcode?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          address_line_2?: string | null
          avatar_url?: string | null
          bluesky?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          email?: string
          facebook?: string | null
          first_name?: string | null
          full_name?: string | null
          gdpr_consented_at?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          linkedin?: string | null
          organisation?: string | null
          other_links?: Json | null
          phone_number?: string | null
          postcode?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      proposal_message_recipients: {
        Row: {
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "proposal_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_messages: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_high_priority: boolean
          is_pinned: boolean
          is_resolved: boolean
          is_system_message: boolean
          parent_id: string | null
          priority_level: number
          proposal_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          content?: string
          created_at?: string
          id?: string
          is_high_priority?: boolean
          is_pinned?: boolean
          is_resolved?: boolean
          is_system_message?: boolean
          parent_id?: string | null
          priority_level?: number
          proposal_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_high_priority?: boolean
          is_pinned?: boolean
          is_resolved?: boolean
          is_system_message?: boolean
          parent_id?: string | null
          priority_level?: number
          proposal_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "proposal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_progress: {
        Row: {
          id: string
          notes: string | null
          progress_percent: number
          proposal_id: string
          section_id: string
          section_label: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          id?: string
          notes?: string | null
          progress_percent?: number
          proposal_id: string
          section_id: string
          section_label?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          notes?: string | null
          progress_percent?: number
          proposal_id?: string
          section_id?: string
          section_label?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_progress_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_section_guidelines: {
        Row: {
          content: string
          created_at: string
          guideline_type: string
          id: string
          is_active: boolean | null
          order_index: number
          proposal_section_id: string
          source_guideline_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          guideline_type: string
          id?: string
          is_active?: boolean | null
          order_index?: number
          proposal_section_id: string
          source_guideline_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          guideline_type?: string
          id?: string
          is_active?: boolean | null
          order_index?: number
          proposal_section_id?: string
          source_guideline_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_section_guidelines_proposal_section_id_fkey"
            columns: ["proposal_section_id"]
            isOneToOne: false
            referencedRelation: "proposal_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_section_guidelines_source_guideline_id_fkey"
            columns: ["source_guideline_id"]
            isOneToOne: false
            referencedRelation: "section_guidelines"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_task_assignees: {
        Row: {
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "proposal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_tasks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          order_index: number
          proposal_id: string
          responsible_user_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          order_index?: number
          proposal_id: string
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          order_index?: number
          proposal_id?: string
          responsible_user_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_tasks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_template_sections: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          editor_type: string
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          is_locked: boolean | null
          is_required: boolean | null
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          order_index: number
          page_limit: number | null
          parent_section_id: string | null
          part: string
          placeholder_content: string | null
          proposal_template_id: string
          section_number: string
          section_tag: string | null
          source_section_id: string | null
          title: string
          updated_at: string
          word_limit: number | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          editor_type?: string
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_locked?: boolean | null
          is_required?: boolean | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          order_index?: number
          page_limit?: number | null
          parent_section_id?: string | null
          part: string
          placeholder_content?: string | null
          proposal_template_id: string
          section_number: string
          section_tag?: string | null
          source_section_id?: string | null
          title: string
          updated_at?: string
          word_limit?: number | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          editor_type?: string
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_locked?: boolean | null
          is_required?: boolean | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          order_index?: number
          page_limit?: number | null
          parent_section_id?: string | null
          part?: string
          placeholder_content?: string | null
          proposal_template_id?: string
          section_number?: string
          section_tag?: string | null
          source_section_id?: string | null
          title?: string
          updated_at?: string
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_template_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "proposal_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_template_sections_proposal_template_id_fkey"
            columns: ["proposal_template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_template_sections_source_section_id_fkey"
            columns: ["source_section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          applied_extension_ids: string[] | null
          applied_modifier_ids: string[] | null
          base_page_limit: number | null
          created_at: string
          id: string
          includes_branding: boolean | null
          includes_participant_table: boolean | null
          is_customized: boolean | null
          proposal_id: string
          source_template_type_id: string | null
          updated_at: string
        }
        Insert: {
          applied_extension_ids?: string[] | null
          applied_modifier_ids?: string[] | null
          base_page_limit?: number | null
          created_at?: string
          id?: string
          includes_branding?: boolean | null
          includes_participant_table?: boolean | null
          is_customized?: boolean | null
          proposal_id: string
          source_template_type_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_extension_ids?: string[] | null
          applied_modifier_ids?: string[] | null
          base_page_limit?: number | null
          created_at?: string
          id?: string
          includes_branding?: boolean | null
          includes_participant_table?: boolean | null
          is_customized?: boolean | null
          proposal_id?: string
          source_template_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_templates_source_template_type_id_fkey"
            columns: ["source_template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_user_onboarding: {
        Row: {
          id: string
          onboarded_at: string
          proposal_id: string
          user_id: string
        }
        Insert: {
          id?: string
          onboarded_at?: string
          proposal_id: string
          user_id: string
        }
        Update: {
          id?: string
          onboarded_at?: string
          proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_user_onboarding_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          acronym: string
          acronym_segments: Json | null
          budget_template_id: string | null
          budget_type: Database["public"]["Enums"]["budget_type"]
          cases_enabled: boolean
          cases_type: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          decision_date: string | null
          decision_date_is_estimated: boolean
          description: string | null
          destination: string | null
          destination_footnotes: Json | null
          duration: number | null
          expected_projects: string | null
          fstp_budget: string | null
          fstp_budget_per_third_party: string | null
          id: string
          indicative_budget_per_project: string | null
          is_two_stage_second_stage: boolean | null
          logo_url: string | null
          opening_date: string | null
          outcome_footnotes: Json | null
          reporting_periods: Json | null
          scope_footnotes: Json | null
          status: Database["public"]["Enums"]["proposal_status"]
          submission_stage: string | null
          submitted_at: string | null
          template_type_id: string | null
          title: string
          topic_content_imported_at: string | null
          topic_description: string | null
          topic_destination_description: string | null
          topic_expected_outcome: string | null
          topic_footnotes: Json | null
          topic_id: string | null
          topic_scope: string | null
          topic_title: string | null
          topic_url: string | null
          total_budget: number | null
          total_budget_text: string | null
          type: Database["public"]["Enums"]["proposal_type"]
          updated_at: string
          use_wp_themes: boolean
          uses_fstp: boolean
          work_programme: string | null
        }
        Insert: {
          acronym: string
          acronym_segments?: Json | null
          budget_template_id?: string | null
          budget_type?: Database["public"]["Enums"]["budget_type"]
          cases_enabled?: boolean
          cases_type?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          decision_date?: string | null
          decision_date_is_estimated?: boolean
          description?: string | null
          destination?: string | null
          destination_footnotes?: Json | null
          duration?: number | null
          expected_projects?: string | null
          fstp_budget?: string | null
          fstp_budget_per_third_party?: string | null
          id?: string
          indicative_budget_per_project?: string | null
          is_two_stage_second_stage?: boolean | null
          logo_url?: string | null
          opening_date?: string | null
          outcome_footnotes?: Json | null
          reporting_periods?: Json | null
          scope_footnotes?: Json | null
          status?: Database["public"]["Enums"]["proposal_status"]
          submission_stage?: string | null
          submitted_at?: string | null
          template_type_id?: string | null
          title: string
          topic_content_imported_at?: string | null
          topic_description?: string | null
          topic_destination_description?: string | null
          topic_expected_outcome?: string | null
          topic_footnotes?: Json | null
          topic_id?: string | null
          topic_scope?: string | null
          topic_title?: string | null
          topic_url?: string | null
          total_budget?: number | null
          total_budget_text?: string | null
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
          use_wp_themes?: boolean
          uses_fstp?: boolean
          work_programme?: string | null
        }
        Update: {
          acronym?: string
          acronym_segments?: Json | null
          budget_template_id?: string | null
          budget_type?: Database["public"]["Enums"]["budget_type"]
          cases_enabled?: boolean
          cases_type?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          decision_date?: string | null
          decision_date_is_estimated?: boolean
          description?: string | null
          destination?: string | null
          destination_footnotes?: Json | null
          duration?: number | null
          expected_projects?: string | null
          fstp_budget?: string | null
          fstp_budget_per_third_party?: string | null
          id?: string
          indicative_budget_per_project?: string | null
          is_two_stage_second_stage?: boolean | null
          logo_url?: string | null
          opening_date?: string | null
          outcome_footnotes?: Json | null
          reporting_periods?: Json | null
          scope_footnotes?: Json | null
          status?: Database["public"]["Enums"]["proposal_status"]
          submission_stage?: string | null
          submitted_at?: string | null
          template_type_id?: string | null
          title?: string
          topic_content_imported_at?: string | null
          topic_description?: string | null
          topic_destination_description?: string | null
          topic_expected_outcome?: string | null
          topic_footnotes?: Json | null
          topic_id?: string | null
          topic_scope?: string | null
          topic_title?: string | null
          topic_url?: string | null
          total_budget?: number | null
          total_budget_text?: string | null
          type?: Database["public"]["Enums"]["proposal_type"]
          updated_at?: string
          use_wp_themes?: boolean
          uses_fstp?: boolean
          work_programme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_budget_template_id_fkey"
            columns: ["budget_template_id"]
            isOneToOne: false
            referencedRelation: "budget_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
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
      section_comments: {
        Row: {
          anchor_payload: Json | null
          anchor_type: string | null
          content: string
          created_at: string
          id: string
          is_suggestion: boolean | null
          parent_comment_id: string | null
          proposal_id: string
          section_id: string
          selected_text: string | null
          selection_end: number | null
          selection_start: number | null
          status: string | null
          suggested_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_payload?: Json | null
          anchor_type?: string | null
          content: string
          created_at?: string
          id?: string
          is_suggestion?: boolean | null
          parent_comment_id?: string | null
          proposal_id: string
          section_id: string
          selected_text?: string | null
          selection_end?: number | null
          selection_start?: number | null
          status?: string | null
          suggested_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_payload?: Json | null
          anchor_type?: string | null
          content?: string
          created_at?: string
          id?: string
          is_suggestion?: boolean | null
          parent_comment_id?: string | null
          proposal_id?: string
          section_id?: string
          selected_text?: string | null
          selection_end?: number | null
          selection_start?: number | null
          status?: string | null
          suggested_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "section_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_basic"
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
      section_guidelines: {
        Row: {
          content: string
          created_at: string
          guideline_type: string
          id: string
          is_active: boolean | null
          order_index: number
          section_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          guideline_type: string
          id?: string
          is_active?: boolean | null
          order_index?: number
          section_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          guideline_type?: string
          id?: string
          is_active?: boolean | null
          order_index?: number
          section_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_guidelines_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      section_reviews: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          proposal_id: string
          reviewer_id: string
          score: number | null
          section_id: string
          status: string
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          proposal_id: string
          reviewer_id: string
          score?: number | null
          section_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          proposal_id?: string
          reviewer_id?: string
          score?: number | null
          section_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_reviews_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      section_tracked_changes: {
        Row: {
          author_color: string
          author_id: string | null
          author_name: string
          change_id: string
          change_type: string
          content: string | null
          created_at: string
          from_pos: number
          id: string
          proposal_id: string
          section_id: string
          to_pos: number
          updated_at: string
        }
        Insert: {
          author_color?: string
          author_id?: string | null
          author_name: string
          change_id: string
          change_type: string
          content?: string | null
          created_at?: string
          from_pos: number
          id?: string
          proposal_id: string
          section_id: string
          to_pos: number
          updated_at?: string
        }
        Update: {
          author_color?: string
          author_id?: string | null
          author_name?: string
          change_id?: string
          change_type?: string
          content?: string | null
          created_at?: string
          from_pos?: number
          id?: string
          proposal_id?: string
          section_id?: string
          to_pos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_tracked_changes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_tracked_changes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_tracked_changes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      section_versions: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          is_auto_save: boolean | null
          is_major: boolean
          is_pinned: boolean
          label: string | null
          proposal_id: string
          section_id: string
          version_number: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto_save?: boolean | null
          is_major?: boolean
          is_pinned?: boolean
          label?: string | null
          proposal_id: string
          section_id: string
          version_number?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto_save?: boolean | null
          is_major?: boolean
          is_pinned?: boolean
          label?: string | null
          proposal_id?: string
          section_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      snippet_library: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string
          id: string
          section_ids: string[] | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          section_ids?: string[] | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          section_ids?: string[] | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_captions: {
        Row: {
          caption: string
          id: string
          proposal_id: string
          table_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          caption: string
          id?: string
          proposal_id: string
          table_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          caption?: string
          id?: string
          proposal_id?: string
          table_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_captions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      table_column_widths: {
        Row: {
          column_widths: Json
          id: string
          proposal_id: string
          table_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          column_widths?: Json
          id?: string
          proposal_id: string
          table_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          column_widths?: Json
          id?: string
          proposal_id?: string
          table_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_column_widths_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      template_form_fields: {
        Row: {
          created_at: string
          field_label: string
          field_name: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_participant_specific: boolean | null
          is_required: boolean | null
          options: Json | null
          order_index: number
          placeholder: string | null
          section_id: string
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          field_label: string
          field_name: string
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_participant_specific?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          section_id: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          field_label?: string
          field_name?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_participant_specific?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          section_id?: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "template_form_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      template_modifiers: {
        Row: {
          code: string
          conditions: Json
          created_at: string
          description: string | null
          effects: Json
          id: string
          is_active: boolean | null
          is_admin_editable: boolean | null
          name: string
          priority: number | null
          updated_at: string
        }
        Insert: {
          code: string
          conditions?: Json
          created_at?: string
          description?: string | null
          effects?: Json
          id?: string
          is_active?: boolean | null
          is_admin_editable?: boolean | null
          name: string
          priority?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          conditions?: Json
          created_at?: string
          description?: string | null
          effects?: Json
          id?: string
          is_active?: boolean | null
          is_admin_editable?: boolean | null
          name?: string
          priority?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      template_sections: {
        Row: {
          created_at: string
          description: string | null
          editor_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          order_index: number
          page_limit: number | null
          parent_section_id: string | null
          part: string
          placeholder_content: string | null
          section_number: string
          section_tag: string | null
          template_type_id: string
          title: string
          updated_at: string
          word_limit: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          editor_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index?: number
          page_limit?: number | null
          parent_section_id?: string | null
          part: string
          placeholder_content?: string | null
          section_number: string
          section_tag?: string | null
          template_type_id: string
          title: string
          updated_at?: string
          word_limit?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          editor_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index?: number
          page_limit?: number | null
          parent_section_id?: string | null
          part?: string
          placeholder_content?: string | null
          section_number?: string
          section_tag?: string | null
          template_type_id?: string
          title?: string
          updated_at?: string
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_sections_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      template_types: {
        Row: {
          action_types: string[] | null
          base_page_limit: number | null
          code: string
          created_at: string
          description: string | null
          funding_programme_id: string | null
          id: string
          includes_branding: boolean | null
          includes_participant_table: boolean | null
          is_active: boolean | null
          name: string
          parent_type_id: string | null
          submission_stage: string | null
          updated_at: string
        }
        Insert: {
          action_types?: string[] | null
          base_page_limit?: number | null
          code: string
          created_at?: string
          description?: string | null
          funding_programme_id?: string | null
          id?: string
          includes_branding?: boolean | null
          includes_participant_table?: boolean | null
          is_active?: boolean | null
          name: string
          parent_type_id?: string | null
          submission_stage?: string | null
          updated_at?: string
        }
        Update: {
          action_types?: string[] | null
          base_page_limit?: number | null
          code?: string
          created_at?: string
          description?: string | null
          funding_programme_id?: string | null
          id?: string
          includes_branding?: boolean | null
          includes_participant_table?: boolean | null
          is_active?: boolean | null
          name?: string
          parent_type_id?: string | null
          submission_stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_types_funding_programme_id_fkey"
            columns: ["funding_programme_id"]
            isOneToOne: false
            referencedRelation: "funding_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_types_parent_type_id_fkey"
            columns: ["parent_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_availability: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          unavailable_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          unavailable_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          unavailable_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_availability_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          proposal_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string | null
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
      work_programme_extensions: {
        Row: {
          created_at: string
          description: string | null
          extra_part_a_fields: Json | null
          extra_section_ids: string[] | null
          funding_overrides: Json | null
          id: string
          is_active: boolean | null
          name: string
          page_limit_delta: number | null
          updated_at: string
          work_programme_code: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          extra_part_a_fields?: Json | null
          extra_section_ids?: string[] | null
          funding_overrides?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          page_limit_delta?: number | null
          updated_at?: string
          work_programme_code: string
        }
        Update: {
          created_at?: string
          description?: string | null
          extra_part_a_fields?: Json | null
          extra_section_ids?: string[] | null
          funding_overrides?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          page_limit_delta?: number | null
          updated_at?: string
          work_programme_code?: string
        }
        Relationships: []
      }
      wp_color_palette: {
        Row: {
          colors: Json
          created_at: string
          id: string
          proposal_id: string
          updated_at: string
        }
        Insert: {
          colors?: Json
          created_at?: string
          id?: string
          proposal_id: string
          updated_at?: string
        }
        Update: {
          colors?: Json
          created_at?: string
          id?: string
          proposal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_color_palette_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_dependencies: {
        Row: {
          created_at: string
          direction: string
          from_wp_id: string
          id: string
          proposal_id: string
          to_wp_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          from_wp_id: string
          id?: string
          proposal_id: string
          to_wp_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          from_wp_id?: string
          id?: string
          proposal_id?: string
          to_wp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_dependencies_from_wp_id_fkey"
            columns: ["from_wp_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_dependencies_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_dependencies_to_wp_id_fkey"
            columns: ["to_wp_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_deliverables: {
        Row: {
          created_at: string
          description: string | null
          dissemination_level: string | null
          due_month: number | null
          id: string
          number: number
          order_index: number
          responsible_participant_id: string | null
          task_id: string | null
          title: string | null
          type: string | null
          updated_at: string
          wp_draft_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          dissemination_level?: string | null
          due_month?: number | null
          id?: string
          number: number
          order_index?: number
          responsible_participant_id?: string | null
          task_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          wp_draft_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          dissemination_level?: string | null
          due_month?: number | null
          id?: string
          number?: number
          order_index?: number
          responsible_participant_id?: string | null
          task_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          wp_draft_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_deliverables_responsible_participant_id_fkey"
            columns: ["responsible_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_draft_deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_draft_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_draft_deliverables_wp_draft_id_fkey"
            columns: ["wp_draft_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_milestones: {
        Row: {
          created_at: string
          due_month: number | null
          id: string
          means_of_verification: string | null
          number: number
          order_index: number
          related_wps: string | null
          title: string | null
          updated_at: string
          wp_draft_id: string
        }
        Insert: {
          created_at?: string
          due_month?: number | null
          id?: string
          means_of_verification?: string | null
          number?: number
          order_index?: number
          related_wps?: string | null
          title?: string | null
          updated_at?: string
          wp_draft_id: string
        }
        Update: {
          created_at?: string
          due_month?: number | null
          id?: string
          means_of_verification?: string | null
          number?: number
          order_index?: number
          related_wps?: string | null
          title?: string | null
          updated_at?: string
          wp_draft_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_milestones_wp_draft_id_fkey"
            columns: ["wp_draft_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_risks: {
        Row: {
          created_at: string
          id: string
          likelihood: string | null
          mitigation: string | null
          number: number
          order_index: number
          severity: string | null
          title: string | null
          updated_at: string
          wp_draft_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          likelihood?: string | null
          mitigation?: string | null
          number: number
          order_index?: number
          severity?: string | null
          title?: string | null
          updated_at?: string
          wp_draft_id: string
        }
        Update: {
          created_at?: string
          id?: string
          likelihood?: string | null
          mitigation?: string | null
          number?: number
          order_index?: number
          severity?: string | null
          title?: string | null
          updated_at?: string
          wp_draft_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_risks_wp_draft_id_fkey"
            columns: ["wp_draft_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_task_effort: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          person_months: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          person_months?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          person_months?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_task_effort_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_draft_task_effort_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_draft_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_task_participants: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_task_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_draft_task_participants_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "wp_draft_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_tasks: {
        Row: {
          created_at: string
          description: string | null
          end_month: number | null
          id: string
          lead_participant_id: string | null
          number: number
          order_index: number
          start_month: number | null
          title: string | null
          updated_at: string
          wp_draft_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_month?: number | null
          id?: string
          lead_participant_id?: string | null
          number: number
          order_index?: number
          start_month?: number | null
          title?: string | null
          updated_at?: string
          wp_draft_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_month?: number | null
          id?: string
          lead_participant_id?: string | null
          number?: number
          order_index?: number
          start_month?: number | null
          title?: string | null
          updated_at?: string
          wp_draft_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_draft_tasks_lead_participant_id_fkey"
            columns: ["lead_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_draft_tasks_wp_draft_id_fkey"
            columns: ["wp_draft_id"]
            isOneToOne: false
            referencedRelation: "wp_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_draft_templates: {
        Row: {
          created_at: string
          default_deliverables: Json | null
          default_tasks: Json | null
          id: string
          is_system: boolean | null
          methodology_template: string | null
          name: string
          objectives_template: string | null
          short_name: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          default_deliverables?: Json | null
          default_tasks?: Json | null
          id?: string
          is_system?: boolean | null
          methodology_template?: string | null
          name: string
          objectives_template?: string | null
          short_name?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          default_deliverables?: Json | null
          default_tasks?: Json | null
          id?: string
          is_system?: boolean | null
          methodology_template?: string | null
          name?: string
          objectives_template?: string | null
          short_name?: string | null
          title?: string | null
        }
        Relationships: []
      }
      wp_drafts: {
        Row: {
          bottlenecks_question: string | null
          color: string
          created_at: string
          id: string
          inputs_question: string | null
          lead_participant_id: string | null
          manual_duration: string | null
          manual_person_months: number | null
          methodology: string | null
          number: number
          objectives: string | null
          order_index: number
          outputs_question: string | null
          proposal_id: string
          short_name: string | null
          theme_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          bottlenecks_question?: string | null
          color?: string
          created_at?: string
          id?: string
          inputs_question?: string | null
          lead_participant_id?: string | null
          manual_duration?: string | null
          manual_person_months?: number | null
          methodology?: string | null
          number: number
          objectives?: string | null
          order_index?: number
          outputs_question?: string | null
          proposal_id: string
          short_name?: string | null
          theme_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          bottlenecks_question?: string | null
          color?: string
          created_at?: string
          id?: string
          inputs_question?: string | null
          lead_participant_id?: string | null
          manual_duration?: string | null
          manual_person_months?: number | null
          methodology?: string | null
          number?: number
          objectives?: string | null
          order_index?: number
          outputs_question?: string | null
          proposal_id?: string
          short_name?: string | null
          theme_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_drafts_lead_participant_id_fkey"
            columns: ["lead_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_drafts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_drafts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "wp_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_themes: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string | null
          number: number
          order_index: number
          proposal_id: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name?: string | null
          number: number
          order_index?: number
          proposal_id: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string | null
          number?: number
          order_index?: number
          proposal_id?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wp_themes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_basic: {
        Row: {
          avatar_url: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_name: string | null
          organisation: string | null
          phone_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          last_name?: string | null
          organisation?: string | null
          phone_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          last_name?: string | null
          organisation?: string | null
          phone_number?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_edit_proposal: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
      create_proposal_with_role: {
        Args: {
          p_acronym: string
          p_budget_type: Database["public"]["Enums"]["budget_type"]
          p_deadline?: string
          p_destination?: string
          p_submission_stage?: string
          p_template_type_id?: string
          p_title: string
          p_topic_url?: string
          p_type: Database["public"]["Enums"]["proposal_type"]
          p_uses_fstp?: boolean
          p_work_programme?: string
        }
        Returns: string
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
      insert_section_version: {
        Args: {
          p_content: string
          p_created_by: string
          p_is_auto_save?: boolean
          p_proposal_id: string
          p_section_id: string
        }
        Returns: number
      }
      is_coordinator_or_above: { Args: { _user_id: string }; Returns: boolean }
      is_global_admin: { Args: { _user_id: string }; Returns: boolean }
      is_message_recipient: {
        Args: { _message_id: string; _user_id: string }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_proposal_admin: {
        Args: { _proposal_id: string; _user_id: string }
        Returns: boolean
      }
      thin_section_versions: {
        Args: { p_proposal_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer" | "owner" | "coordinator"
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
      app_role: ["admin", "editor", "viewer", "owner", "coordinator"],
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
