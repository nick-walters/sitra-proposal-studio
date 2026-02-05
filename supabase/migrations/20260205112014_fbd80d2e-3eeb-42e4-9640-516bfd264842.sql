-- Add personnel cost rate field to participants for effort→budget calculation
ALTER TABLE public.participants 
ADD COLUMN personnel_cost_rate numeric DEFAULT 5000;

-- Add comment for documentation
COMMENT ON COLUMN public.participants.personnel_cost_rate IS 'Monthly cost rate in EUR for calculating personnel costs from person-months';