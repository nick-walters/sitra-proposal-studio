ALTER TABLE public.instrument_types
  ADD COLUMN IF NOT EXISTS overall_threshold_full   numeric,
  ADD COLUMN IF NOT EXISTS overall_threshold_stage1 numeric;

UPDATE public.instrument_types SET overall_threshold_full = 10,   overall_threshold_stage1 = 4 WHERE code = 'ria';
UPDATE public.instrument_types SET overall_threshold_full = 10,   overall_threshold_stage1 = 4 WHERE code = 'ia';
UPDATE public.instrument_types SET overall_threshold_full = 10,   overall_threshold_stage1 = NULL WHERE code = 'csa';