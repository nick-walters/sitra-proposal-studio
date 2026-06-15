-- Fix 1: evaluation_cost_log is server-side only (run-panel-evaluation uses service role)
DROP POLICY IF EXISTS "Authenticated users can insert evaluation_cost_log" ON public.evaluation_cost_log;
DROP POLICY IF EXISTS "Authenticated users can insert cost log" ON public.evaluation_cost_log;
DROP POLICY IF EXISTS "authenticated_insert_evaluation_cost_log" ON public.evaluation_cost_log;

-- Fix 2: restrict organisations directory to authenticated users
DROP POLICY IF EXISTS "Anyone can view organisations" ON public.organisations;
DROP POLICY IF EXISTS "Public can view organisations" ON public.organisations;
CREATE POLICY "Authenticated users can view organisations"
ON public.organisations FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.organisations FROM anon;