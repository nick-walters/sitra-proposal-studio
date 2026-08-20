-- Statement-level resequencing triggers.
-- Postgres forbids column lists on triggers that use transition tables, so the
-- update triggers see both OLD and NEW rows and decide for themselves whether an
-- ordering input actually changed. Re-entrancy is guarded by the app.reseq_<table>
-- flags set inside resequence_numbered(); the version-bump carve-out keeps an
-- automatic renumber from looking like a user edit.

CREATE OR REPLACE FUNCTION public.reseq_guard_on(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(current_setting('app.reseq_' || p_table, true), '') = 'on';
$$;

-- ── Deliverables: due month, lowest linked task number, order_index, id ───────
CREATE OR REPLACE FUNCTION public.tg_reseq_deliverables_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_deliverables') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT wp_draft_id AS p FROM new_rows WHERE wp_draft_id IS NOT NULL LOOP
    PERFORM public.resequence_numbered('wp_draft_deliverables', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_deliverables_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_deliverables') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT wp_draft_id AS p FROM old_rows WHERE wp_draft_id IS NOT NULL LOOP
    PERFORM public.resequence_numbered('wp_draft_deliverables', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_deliverables_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_deliverables') THEN RETURN NULL; END IF;
  FOR r IN
    SELECT DISTINCT p FROM (
      SELECT n.wp_draft_id AS p FROM new_rows n JOIN old_rows o ON o.id = n.id
       WHERE n.due_month IS DISTINCT FROM o.due_month
          OR n.order_index IS DISTINCT FROM o.order_index
          OR n.wp_draft_id IS DISTINCT FROM o.wp_draft_id
          OR n.number IS DISTINCT FROM o.number
      UNION
      SELECT o.wp_draft_id FROM new_rows n JOIN old_rows o ON o.id = n.id
       WHERE n.wp_draft_id IS DISTINCT FROM o.wp_draft_id
    ) s WHERE p IS NOT NULL
  LOOP
    PERFORM public.resequence_numbered('wp_draft_deliverables', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── Tasks: drag order. A task renumber also reorders the deliverables that link
--    to them, so the task trigger drives the deliverable pass itself. ──────────
CREATE OR REPLACE FUNCTION public.tg_reseq_tasks_for(p_wp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.resequence_numbered('wp_draft_tasks', p_wp);
  IF NOT public.reseq_guard_on('wp_draft_deliverables') THEN
    PERFORM public.resequence_numbered('wp_draft_deliverables', p_wp);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_tasks_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_tasks') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT wp_draft_id AS p FROM new_rows WHERE wp_draft_id IS NOT NULL LOOP
    PERFORM public.tg_reseq_tasks_for(r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_tasks_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_tasks') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT wp_draft_id AS p FROM old_rows WHERE wp_draft_id IS NOT NULL LOOP
    PERFORM public.tg_reseq_tasks_for(r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_tasks_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_tasks') THEN RETURN NULL; END IF;
  FOR r IN
    SELECT DISTINCT p FROM (
      SELECT n.wp_draft_id AS p FROM new_rows n JOIN old_rows o ON o.id = n.id
       WHERE n.order_index IS DISTINCT FROM o.order_index
          OR n.wp_draft_id IS DISTINCT FROM o.wp_draft_id
          OR n.number IS DISTINCT FROM o.number
      UNION
      SELECT o.wp_draft_id FROM new_rows n JOIN old_rows o ON o.id = n.id
       WHERE n.wp_draft_id IS DISTINCT FROM o.wp_draft_id
    ) s WHERE p IS NOT NULL
  LOOP
    PERFORM public.tg_reseq_tasks_for(r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── Link table: which task a deliverable hangs off is an ordering input ───────
CREATE OR REPLACE FUNCTION public.tg_reseq_dlinks_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_deliverables') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT d.wp_draft_id AS p FROM new_rows a
             JOIN public.wp_draft_deliverables d ON d.id = a.deliverable_id LOOP
    PERFORM public.resequence_numbered('wp_draft_deliverables', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_dlinks_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('wp_draft_deliverables') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT d.wp_draft_id AS p FROM old_rows a
             JOIN public.wp_draft_deliverables d ON d.id = a.deliverable_id LOOP
    PERFORM public.resequence_numbered('wp_draft_deliverables', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── Milestones: due month, then order_index ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_reseq_ms_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('proposal_milestones') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT proposal_id AS p FROM new_rows WHERE proposal_id IS NOT NULL LOOP
    PERFORM public.resequence_numbered('proposal_milestones', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_ms_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('proposal_milestones') THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT proposal_id AS p FROM old_rows WHERE proposal_id IS NOT NULL LOOP
    PERFORM public.resequence_numbered('proposal_milestones', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reseq_ms_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF public.reseq_guard_on('proposal_milestones') THEN RETURN NULL; END IF;
  FOR r IN
    SELECT DISTINCT n.proposal_id AS p FROM new_rows n JOIN old_rows o ON o.id = n.id
     WHERE (n.due_month IS DISTINCT FROM o.due_month
         OR n.order_index IS DISTINCT FROM o.order_index
         OR n.number IS DISTINCT FROM o.number)
       AND n.proposal_id IS NOT NULL
  LOOP
    PERFORM public.resequence_numbered('proposal_milestones', r.p);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── Wire them up ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reseq_deliverables_ins ON public.wp_draft_deliverables;
DROP TRIGGER IF EXISTS trg_reseq_deliverables_upd ON public.wp_draft_deliverables;
DROP TRIGGER IF EXISTS trg_reseq_deliverables_del ON public.wp_draft_deliverables;
CREATE TRIGGER trg_reseq_deliverables_ins AFTER INSERT ON public.wp_draft_deliverables
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_deliverables_ins();
CREATE TRIGGER trg_reseq_deliverables_upd AFTER UPDATE ON public.wp_draft_deliverables
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_deliverables_upd();
CREATE TRIGGER trg_reseq_deliverables_del AFTER DELETE ON public.wp_draft_deliverables
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_deliverables_del();

DROP TRIGGER IF EXISTS trg_reseq_tasks_ins ON public.wp_draft_tasks;
DROP TRIGGER IF EXISTS trg_reseq_tasks_upd ON public.wp_draft_tasks;
DROP TRIGGER IF EXISTS trg_reseq_tasks_del ON public.wp_draft_tasks;
CREATE TRIGGER trg_reseq_tasks_ins AFTER INSERT ON public.wp_draft_tasks
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_tasks_ins();
CREATE TRIGGER trg_reseq_tasks_upd AFTER UPDATE ON public.wp_draft_tasks
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_tasks_upd();
CREATE TRIGGER trg_reseq_tasks_del AFTER DELETE ON public.wp_draft_tasks
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_tasks_del();

DROP TRIGGER IF EXISTS trg_reseq_dlinks_ins ON public.wp_draft_deliverable_tasks;
DROP TRIGGER IF EXISTS trg_reseq_dlinks_del ON public.wp_draft_deliverable_tasks;
CREATE TRIGGER trg_reseq_dlinks_ins AFTER INSERT ON public.wp_draft_deliverable_tasks
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_dlinks_ins();
CREATE TRIGGER trg_reseq_dlinks_del AFTER DELETE ON public.wp_draft_deliverable_tasks
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_dlinks_del();

DROP TRIGGER IF EXISTS trg_reseq_milestones_ins ON public.proposal_milestones;
DROP TRIGGER IF EXISTS trg_reseq_milestones_upd ON public.proposal_milestones;
DROP TRIGGER IF EXISTS trg_reseq_milestones_del ON public.proposal_milestones;
CREATE TRIGGER trg_reseq_milestones_ins AFTER INSERT ON public.proposal_milestones
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_ms_ins();
CREATE TRIGGER trg_reseq_milestones_upd AFTER UPDATE ON public.proposal_milestones
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_ms_upd();
CREATE TRIGGER trg_reseq_milestones_del AFTER DELETE ON public.proposal_milestones
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.tg_reseq_ms_del();