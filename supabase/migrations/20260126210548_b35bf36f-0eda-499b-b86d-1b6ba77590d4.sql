-- WP Drafts Feature - Complete Database Schema

-- 1. WP Color Palette (proposal-level)
CREATE TABLE public.wp_color_palette (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  colors jsonb NOT NULL DEFAULT '["#2563EB", "#059669", "#D97706", "#E11D48", "#7C3AED", "#0891B2", "#EA580C", "#DB2777", "#475569", "#65A30D", "#4F46E5", "#0D9488"]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wp_color_palette_proposal_unique UNIQUE (proposal_id)
);

-- 2. WP Draft Templates (system templates for DEC, COORD, etc.)
CREATE TABLE public.wp_draft_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  short_name text,
  title text,
  methodology_template text,
  objectives_template text,
  default_tasks jsonb DEFAULT '[]'::jsonb,
  default_deliverables jsonb DEFAULT '[]'::jsonb,
  is_system boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. WP Drafts (main work package drafts)
CREATE TABLE public.wp_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number integer NOT NULL,
  short_name text,
  title text,
  lead_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  methodology text,
  objectives text,
  color text NOT NULL DEFAULT '#2563EB',
  inputs_question text,
  outputs_question text,
  bottlenecks_question text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wp_drafts_proposal_number_unique UNIQUE (proposal_id, number)
);

-- 4. WP Draft Tasks
CREATE TABLE public.wp_draft_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text,
  description text,
  lead_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  start_month integer,
  end_month integer,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 5. WP Draft Task Participants (many-to-many)
CREATE TABLE public.wp_draft_task_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.wp_draft_tasks(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wp_draft_task_participants_unique UNIQUE (task_id, participant_id)
);

-- 6. WP Draft Task Effort (person-months per task per participant)
CREATE TABLE public.wp_draft_task_effort (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.wp_draft_tasks(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  person_months decimal(10,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wp_draft_task_effort_unique UNIQUE (task_id, participant_id)
);

-- 7. WP Draft Deliverables
CREATE TABLE public.wp_draft_deliverables (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text,
  type text,
  dissemination_level text DEFAULT 'PU',
  responsible_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  due_month integer,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 8. WP Draft Risks
CREATE TABLE public.wp_draft_risks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text,
  likelihood text,
  severity text,
  mitigation text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 9. WP Dependencies (for PERT chart)
CREATE TABLE public.wp_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  from_wp_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  to_wp_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wp_dependencies_unique UNIQUE (from_wp_id, to_wp_id),
  CONSTRAINT wp_dependencies_no_self_reference CHECK (from_wp_id != to_wp_id)
);

-- Create indexes for performance
CREATE INDEX idx_wp_drafts_proposal ON public.wp_drafts(proposal_id);
CREATE INDEX idx_wp_draft_tasks_wp ON public.wp_draft_tasks(wp_draft_id);
CREATE INDEX idx_wp_draft_task_participants_task ON public.wp_draft_task_participants(task_id);
CREATE INDEX idx_wp_draft_task_effort_task ON public.wp_draft_task_effort(task_id);
CREATE INDEX idx_wp_draft_deliverables_wp ON public.wp_draft_deliverables(wp_draft_id);
CREATE INDEX idx_wp_draft_risks_wp ON public.wp_draft_risks(wp_draft_id);
CREATE INDEX idx_wp_dependencies_proposal ON public.wp_dependencies(proposal_id);

-- Enable RLS on all tables
ALTER TABLE public.wp_color_palette ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_task_effort ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_draft_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wp_draft_templates (public read, no write via API)
CREATE POLICY "Templates are viewable by all authenticated users"
ON public.wp_draft_templates FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for wp_color_palette
CREATE POLICY "Color palette viewable by proposal members"
ON public.wp_color_palette FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Color palette editable by admins"
ON public.wp_color_palette FOR INSERT
WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Color palette updatable by admins"
ON public.wp_color_palette FOR UPDATE
USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- RLS Policies for wp_drafts
CREATE POLICY "WP drafts viewable by proposal members"
ON public.wp_drafts FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "WP drafts insertable by admins"
ON public.wp_drafts FOR INSERT
WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "WP drafts updatable by editors"
ON public.wp_drafts FOR UPDATE
USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "WP drafts deletable by admins"
ON public.wp_drafts FOR DELETE
USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- RLS Policies for wp_draft_tasks
CREATE POLICY "Tasks viewable by proposal members"
ON public.wp_draft_tasks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.has_any_proposal_role(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Tasks insertable by editors"
ON public.wp_draft_tasks FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Tasks updatable by editors"
ON public.wp_draft_tasks FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Tasks deletable by editors"
ON public.wp_draft_tasks FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

-- RLS Policies for wp_draft_task_participants
CREATE POLICY "Task participants viewable by proposal members"
ON public.wp_draft_task_participants FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.has_any_proposal_role(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Task participants insertable by editors"
ON public.wp_draft_task_participants FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Task participants deletable by editors"
ON public.wp_draft_task_participants FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

-- RLS Policies for wp_draft_task_effort
CREATE POLICY "Task effort viewable by proposal members"
ON public.wp_draft_task_effort FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.has_any_proposal_role(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Task effort insertable by editors"
ON public.wp_draft_task_effort FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Task effort updatable by editors"
ON public.wp_draft_task_effort FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Task effort deletable by editors"
ON public.wp_draft_task_effort FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.wp_draft_tasks t
  JOIN public.wp_drafts wd ON wd.id = t.wp_draft_id
  WHERE t.id = task_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

-- RLS Policies for wp_draft_deliverables
CREATE POLICY "Deliverables viewable by proposal members"
ON public.wp_draft_deliverables FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.has_any_proposal_role(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Deliverables insertable by editors"
ON public.wp_draft_deliverables FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Deliverables updatable by editors"
ON public.wp_draft_deliverables FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Deliverables deletable by editors"
ON public.wp_draft_deliverables FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

-- RLS Policies for wp_draft_risks
CREATE POLICY "Risks viewable by proposal members"
ON public.wp_draft_risks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.has_any_proposal_role(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Risks insertable by editors"
ON public.wp_draft_risks FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Risks updatable by editors"
ON public.wp_draft_risks FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

CREATE POLICY "Risks deletable by editors"
ON public.wp_draft_risks FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.wp_drafts wd
  WHERE wd.id = wp_draft_id
  AND public.can_edit_proposal(auth.uid(), wd.proposal_id)
));

-- RLS Policies for wp_dependencies
CREATE POLICY "Dependencies viewable by proposal members"
ON public.wp_dependencies FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Dependencies insertable by admins"
ON public.wp_dependencies FOR INSERT
WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Dependencies deletable by admins"
ON public.wp_dependencies FOR DELETE
USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- Triggers for updated_at
CREATE TRIGGER update_wp_color_palette_updated_at
  BEFORE UPDATE ON public.wp_color_palette
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wp_drafts_updated_at
  BEFORE UPDATE ON public.wp_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wp_draft_tasks_updated_at
  BEFORE UPDATE ON public.wp_draft_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wp_draft_task_effort_updated_at
  BEFORE UPDATE ON public.wp_draft_task_effort
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wp_draft_deliverables_updated_at
  BEFORE UPDATE ON public.wp_draft_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wp_draft_risks_updated_at
  BEFORE UPDATE ON public.wp_draft_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert system templates (DEC and Coordination)
INSERT INTO public.wp_draft_templates (name, short_name, title, methodology_template, objectives_template, default_tasks, default_deliverables, is_system)
VALUES 
(
  'DEC Standard',
  'DEC',
  'Dissemination, Exploitation & Communication',
  'This work package will implement a comprehensive strategy for disseminating project results, exploiting research outcomes, and communicating with stakeholders. The methodology combines targeted academic dissemination with industry engagement and public outreach activities.',
  '• Maximize the visibility and impact of project results through targeted dissemination activities
• Develop and implement an exploitation strategy to ensure uptake of project outcomes
• Engage with relevant stakeholders and the wider public through effective communication',
  '[
    {"number": 1, "title": "Dissemination strategy and activities", "description": "Develop and implement the project dissemination strategy"},
    {"number": 2, "title": "Exploitation planning and implementation", "description": "Develop the exploitation plan and ensure uptake of results"},
    {"number": 3, "title": "Communication and public engagement", "description": "Manage project communications and public outreach"}
  ]'::jsonb,
  '[
    {"number": 1, "title": "Dissemination, Exploitation and Communication Plan", "type": "R", "dissemination_level": "PU", "due_month": 6},
    {"number": 2, "title": "Project website and communication materials", "type": "DEC", "dissemination_level": "PU", "due_month": 3},
    {"number": 3, "title": "Final DEC report", "type": "R", "dissemination_level": "PU", "due_month": null}
  ]'::jsonb,
  true
),
(
  'Coordination',
  'COORD',
  'Project Coordination and Management',
  'This work package will ensure effective project coordination, quality assurance, and financial management. The methodology follows established best practices for EU project management, with regular monitoring, reporting, and risk management procedures.',
  '• Ensure efficient day-to-day coordination and management of the project
• Guarantee high-quality deliverables through quality assurance procedures
• Manage project finances and ensure compliance with grant agreement requirements',
  '[
    {"number": 1, "title": "Project management and coordination", "description": "Day-to-day project coordination and consortium management"},
    {"number": 2, "title": "Quality assurance and risk management", "description": "Implement QA procedures and monitor project risks"},
    {"number": 3, "title": "Financial and administrative management", "description": "Manage project finances and administrative requirements"}
  ]'::jsonb,
  '[
    {"number": 1, "title": "Project Management Handbook", "type": "R", "dissemination_level": "CO", "due_month": 3},
    {"number": 2, "title": "Periodic progress reports", "type": "R", "dissemination_level": "CO", "due_month": 18},
    {"number": 3, "title": "Final project report", "type": "R", "dissemination_level": "CO", "due_month": null}
  ]'::jsonb,
  true
);

-- Function to initialize WP drafts for a new proposal
CREATE OR REPLACE FUNCTION public.initialize_wp_drafts()
RETURNS TRIGGER AS $$
DECLARE
  default_colors text[] := ARRAY['#2563EB', '#059669', '#D97706', '#E11D48', '#7C3AED', '#0891B2', '#EA580C', '#DB2777', '#475569', '#65A30D', '#4F46E5', '#0D9488'];
  dec_template wp_draft_templates%ROWTYPE;
  coord_template wp_draft_templates%ROWTYPE;
  new_wp_id uuid;
  wp_num integer;
  task_data jsonb;
  deliv_data jsonb;
  task_num integer;
  deliv_num integer;
BEGIN
  -- Get system templates
  SELECT * INTO dec_template FROM public.wp_draft_templates WHERE short_name = 'DEC' AND is_system = true LIMIT 1;
  SELECT * INTO coord_template FROM public.wp_draft_templates WHERE short_name = 'COORD' AND is_system = true LIMIT 1;

  -- Create color palette for the proposal
  INSERT INTO public.wp_color_palette (proposal_id, colors)
  VALUES (NEW.id, to_jsonb(default_colors));

  -- Create 9 WPs
  FOR wp_num IN 1..9 LOOP
    IF wp_num = 8 AND dec_template.id IS NOT NULL THEN
      -- WP8: DEC template
      INSERT INTO public.wp_drafts (proposal_id, number, short_name, title, methodology, objectives, color, order_index)
      VALUES (NEW.id, wp_num, dec_template.short_name, dec_template.title, dec_template.methodology_template, dec_template.objectives_template, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;
      
      -- Create default tasks for DEC
      FOR task_data IN SELECT * FROM jsonb_array_elements(dec_template.default_tasks)
      LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, title, description, order_index)
        VALUES (new_wp_id, (task_data->>'number')::integer, task_data->>'title', task_data->>'description', (task_data->>'number')::integer - 1);
      END LOOP;
      
      -- Create default deliverables for DEC
      FOR deliv_data IN SELECT * FROM jsonb_array_elements(dec_template.default_deliverables)
      LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, title, type, dissemination_level, due_month, order_index)
        VALUES (new_wp_id, (deliv_data->>'number')::integer, deliv_data->>'title', deliv_data->>'type', deliv_data->>'dissemination_level', (deliv_data->>'due_month')::integer, (deliv_data->>'number')::integer - 1);
      END LOOP;
      
    ELSIF wp_num = 9 AND coord_template.id IS NOT NULL THEN
      -- WP9: Coordination template
      INSERT INTO public.wp_drafts (proposal_id, number, short_name, title, methodology, objectives, color, order_index)
      VALUES (NEW.id, wp_num, coord_template.short_name, coord_template.title, coord_template.methodology_template, coord_template.objectives_template, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;
      
      -- Create default tasks for COORD
      FOR task_data IN SELECT * FROM jsonb_array_elements(coord_template.default_tasks)
      LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, title, description, order_index)
        VALUES (new_wp_id, (task_data->>'number')::integer, task_data->>'title', task_data->>'description', (task_data->>'number')::integer - 1);
      END LOOP;
      
      -- Create default deliverables for COORD
      FOR deliv_data IN SELECT * FROM jsonb_array_elements(coord_template.default_deliverables)
      LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, title, type, dissemination_level, due_month, order_index)
        VALUES (new_wp_id, (deliv_data->>'number')::integer, deliv_data->>'title', deliv_data->>'type', deliv_data->>'dissemination_level', (deliv_data->>'due_month')::integer, (deliv_data->>'number')::integer - 1);
      END LOOP;
      
    ELSE
      -- Regular WP (1-7): empty template with 3 tasks and 3 deliverables
      INSERT INTO public.wp_drafts (proposal_id, number, color, order_index)
      VALUES (NEW.id, wp_num, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;
      
      -- Create 3 empty tasks
      FOR task_num IN 1..3 LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, order_index)
        VALUES (new_wp_id, task_num, task_num - 1);
      END LOOP;
      
      -- Create 3 empty deliverables
      FOR deliv_num IN 1..3 LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, order_index)
        VALUES (new_wp_id, deliv_num, deliv_num - 1);
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to initialize WP drafts when a new proposal is created
CREATE TRIGGER initialize_proposal_wp_drafts
  AFTER INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_wp_drafts();