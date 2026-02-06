-- Add all missing ethics assessment columns for the full ethics form

-- Section 1: Human Embryonic Stem Cells and Human Embryos
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryonic_stem_cells BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryonic_stem_cells_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_derived_from_embryos BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_derived_from_embryos_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_established_lines BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_established_lines_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_european_registry BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS hesc_european_registry_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryos_section1 BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryos_section1_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryos_destruction BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_embryos_destruction_page TEXT;

-- Section 2: Humans
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_participants BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_participants_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_volunteers_non_medical BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_volunteers_non_medical_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_volunteers_medical BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_volunteers_medical_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_patients BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_patients_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_vulnerable BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_vulnerable_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_children BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_children_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_unable_consent BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_unable_consent_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_interventions BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_interventions_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_invasive BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_invasive_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_biological_samples BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_biological_samples_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS clinical_study BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS clinical_study_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS clinical_trial BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS clinical_trial_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS low_intervention_trial BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS low_intervention_trial_page TEXT;

-- Section 3: Human Cells/Tissues (add missing page field)
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_embryonic_foetal BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_embryonic_foetal_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_commercial BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_commercial_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_obtained_within BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_obtained_within_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_obtained_other BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_obtained_other_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_biobank BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS human_cells_biobank_page TEXT;

-- Section 4: Personal Data (add missing page and detail fields)
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_special_categories BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_special_categories_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_genetic BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_genetic_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_profiling BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_profiling_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_previously_collected BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_previously_collected_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_export_non_eu BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_export_non_eu_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_export_non_eu_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_import_non_eu BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_import_non_eu_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_import_non_eu_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_criminal BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS personal_data_criminal_page TEXT;

-- Section 5: Animals (add missing page and detail fields)
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_vertebrates BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_vertebrates_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_non_human_primates BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_non_human_primates_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_transgenic BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_transgenic_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_cloned BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_cloned_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_endangered BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS animals_endangered_page TEXT;

-- Section 6: Non-EU Countries
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_ethics_issues BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_ethics_issues_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_ethics_issues_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_export BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_export_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_export_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_import BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_import_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_material_import_details TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_lmic BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_lmic_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_risk BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS non_eu_countries_risk_page TEXT;

-- Section 7: Environment, Health & Safety (add page fields)
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health_endangered BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health_endangered_page TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health_harmful BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS environment_health_harmful_page TEXT;

-- Section 8: Artificial Intelligence
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS artificial_intelligence BOOLEAN;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS artificial_intelligence_page TEXT;

-- Section 9: Other Ethics Issues (add page field)
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS other_ethics_page TEXT;