ALTER TABLE public.evaluation_cost_log
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS payload_tokens bigint,
  ADD COLUMN IF NOT EXISTS tokens_input bigint,
  ADD COLUMN IF NOT EXISTS tokens_output bigint,
  ADD COLUMN IF NOT EXISTS tokens_cached bigint;