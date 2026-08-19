-- One-off repair: cross-reference badge spans stored without contenteditable="false".
-- Only the attribute is added; no label text, id or other attribute is touched.
CREATE TABLE IF NOT EXISTS public._badge_ce_repair_report (
  table_name text,
  column_name text,
  rows_changed bigint
);

DO $$
DECLARE
  r record;
  n bigint;
  marker constant text :=
    'data-wp-reference|data-wp-id|data-task-reference|data-task-id|data-deliverable-reference|data-deliverable-id|data-milestone-reference|data-milestone-id|data-participant-reference|data-participant-id|data-case-reference|data-case-id|data-acronym-reference|data-inline-reference|data-badge';
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.data_type IN ('text', 'character varying')
      AND c.table_name <> '_badge_ce_repair_report'
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = regexp_replace(%I,
         ''<span(?![^>]*contenteditable)([^>]*(%s)[^>]*)>'',
         ''<span contenteditable="false"\1>'', ''g'')
       WHERE %I ~ ''<span(?![^>]*contenteditable)[^>]*(%s)''',
      r.table_name, r.column_name, r.column_name, marker, r.column_name, marker
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      INSERT INTO public._badge_ce_repair_report VALUES (r.table_name, r.column_name, n);
    END IF;
  END LOOP;
END $$;

GRANT SELECT ON public._badge_ce_repair_report TO service_role;