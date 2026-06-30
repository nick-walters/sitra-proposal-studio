
-- Set Sonnet 5 as the default evaluation + synthesis model.
UPDATE public.ai_platform_config SET value = 'claude-sonnet-5' WHERE key IN ('evaluation_model','synthesis_model');

-- Correct Opus 4.8 pricing: $5 in / $25 out per MTok.
UPDATE public.ai_platform_config SET value = '5.00'  WHERE key = 'opus_price_input_per_mtok';
UPDATE public.ai_platform_config SET value = '25.00' WHERE key = 'opus_price_output_per_mtok';

-- Sonnet 5 pricing — intro ($2/$10) through 2026-08-31, standard ($3/$15) from 2026-09-01.
INSERT INTO public.ai_platform_config (key, value) VALUES
  ('sonnet_price_input_intro_per_mtok',     '2.00'),
  ('sonnet_price_output_intro_per_mtok',    '10.00'),
  ('sonnet_price_input_standard_per_mtok',  '3.00'),
  ('sonnet_price_output_standard_per_mtok', '15.00'),
  ('sonnet_pricing_standard_effective_date','2026-09-01')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
