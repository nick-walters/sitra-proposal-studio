ALTER TABLE public.ls_mirror_settings DROP CONSTRAINT IF EXISTS ls_mirror_settings_cost_line_check;

ALTER TABLE public.ls_mirror_settings
  ADD CONSTRAINT ls_mirror_settings_cost_line_check
  CHECK (cost_line IN (
    'C.1',
    'C.2',
    'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets',
    'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other'
  ));