-- Add order_index columns to milestones and risks tables for drag-drop reordering
ALTER TABLE public.b31_milestones ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;
ALTER TABLE public.b31_risks ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- Update existing rows to have sequential order_index based on number
UPDATE public.b31_milestones SET order_index = number - 1 WHERE order_index = 0;
UPDATE public.b31_risks SET order_index = number - 1 WHERE order_index = 0;