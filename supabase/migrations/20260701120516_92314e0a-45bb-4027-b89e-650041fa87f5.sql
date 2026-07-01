
CREATE OR REPLACE FUNCTION public.preview_proposal_restore(p_proposal_id uuid, p_snapshot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_snap_pid uuid;
  v_scope jsonb := public.capture_scope_predicates();
  v_in_scope text[] := public.restore_in_scope_tables();
  v_excluded text[] := public.restore_excluded_tables();
  v_tbl_quoted text;
  v_tbl_key text;
  v_predicate text;
  v_live jsonb;
  v_snap_rows jsonb;
  v_would_delete int;
  v_would_add int;
  v_would_change int;
  v_unchanged int;
  v_by_table jsonb := '{}'::jsonb;
  v_total_delete int := 0;
  v_total_add int := 0;
  v_total_change int := 0;
  v_total_unchanged int := 0;
  v_live_prop jsonb;
  v_snap_prop jsonb;
  v_prop_change int := 0;
  v_has_id boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  SELECT snapshot, proposal_id INTO v_snapshot, v_snap_pid
    FROM proposal_snapshots WHERE id = p_snapshot_id;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;
  IF v_snap_pid <> p_proposal_id THEN
    RAISE EXCEPTION 'Snapshot belongs to a different proposal';
  END IF;

  -- proposals row diff
  SELECT to_jsonb(p) INTO v_live_prop FROM proposals p WHERE id = p_proposal_id;
  v_snap_prop := (v_snapshot->'proposals'->0);
  IF v_snap_prop IS NOT NULL AND v_live_prop IS DISTINCT FROM v_snap_prop THEN
    v_prop_change := 1;
  END IF;
  v_by_table := v_by_table || jsonb_build_object('proposals', jsonb_build_object(
    'would_delete', 0, 'would_add', 0,
    'would_change', v_prop_change,
    'unchanged', CASE WHEN v_prop_change = 0 THEN 1 ELSE 0 END
  ));
  v_total_change := v_total_change + v_prop_change;
  v_total_unchanged := v_total_unchanged + (CASE WHEN v_prop_change = 0 THEN 1 ELSE 0 END);

  FOR v_tbl_quoted, v_predicate IN SELECT key, value FROM jsonb_each_text(v_scope) LOOP
    v_tbl_key := replace(v_tbl_quoted, '"', '');
    IF NOT (v_tbl_key = ANY(v_in_scope)) THEN CONTINUE; END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s t WHERE %s',
      v_tbl_quoted, v_predicate
    ) INTO v_live USING p_proposal_id;

    v_snap_rows := COALESCE(v_snapshot->v_tbl_key, '[]'::jsonb);

    -- Detect whether the table has an `id` column by looking at the first row
    -- of either side; if neither side has any rows there's nothing to diff.
    v_has_id := (
      (jsonb_array_length(v_live)     > 0 AND (v_live->0)     ? 'id') OR
      (jsonb_array_length(v_snap_rows) > 0 AND (v_snap_rows->0) ? 'id')
    );

    IF v_has_id THEN
      WITH
        snap AS (SELECT (e->>'id')::text AS id, e AS row FROM jsonb_array_elements(v_snap_rows) e),
        live AS (SELECT (e->>'id')::text AS id, e AS row FROM jsonb_array_elements(v_live) e),
        j    AS (SELECT snap.id AS sid, live.id AS lid, snap.row AS srow, live.row AS lrow
                 FROM snap FULL OUTER JOIN live ON snap.id = live.id)
      SELECT
        count(*) FILTER (WHERE sid IS NULL)::int,
        count(*) FILTER (WHERE lid IS NULL)::int,
        count(*) FILTER (WHERE sid IS NOT NULL AND lid IS NOT NULL AND srow IS DISTINCT FROM lrow)::int,
        count(*) FILTER (WHERE sid IS NOT NULL AND lid IS NOT NULL AND NOT (srow IS DISTINCT FROM lrow))::int
      INTO v_would_delete, v_would_add, v_would_change, v_unchanged
      FROM j;
    ELSE
      -- id-less table (e.g. composite PK): treat rows as a jsonb multiset.
      -- would_change is not meaningful without a stable key.
      WITH
        snap AS (SELECT e AS row, count(*) AS c FROM jsonb_array_elements(v_snap_rows) e GROUP BY e),
        live AS (SELECT e AS row, count(*) AS c FROM jsonb_array_elements(v_live)      e GROUP BY e),
        j AS (
          SELECT COALESCE(snap.row, live.row) AS row,
                 COALESCE(snap.c, 0) AS sc,
                 COALESCE(live.c, 0) AS lc
          FROM snap FULL OUTER JOIN live ON snap.row = live.row
        )
      SELECT
        COALESCE(sum(GREATEST(lc - sc, 0)), 0)::int, -- rows to delete from live
        COALESCE(sum(GREATEST(sc - lc, 0)), 0)::int, -- rows to add back
        0::int,
        COALESCE(sum(LEAST(sc, lc)), 0)::int
      INTO v_would_delete, v_would_add, v_would_change, v_unchanged
      FROM j;
    END IF;

    v_by_table := v_by_table || jsonb_build_object(v_tbl_key, jsonb_build_object(
      'would_delete', v_would_delete,
      'would_add', v_would_add,
      'would_change', v_would_change,
      'unchanged', v_unchanged
    ));

    v_total_delete    := v_total_delete    + v_would_delete;
    v_total_add       := v_total_add       + v_would_add;
    v_total_change    := v_total_change    + v_would_change;
    v_total_unchanged := v_total_unchanged + v_unchanged;
  END LOOP;

  RETURN jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'proposal_id', p_proposal_id,
    'totals', jsonb_build_object(
      'would_delete', v_total_delete,
      'would_add', v_total_add,
      'would_change', v_total_change,
      'unchanged', v_total_unchanged
    ),
    'by_table', v_by_table,
    'excluded_tables', to_jsonb(v_excluded),
    'excluded_note', 'These tables are captured for reference but NEVER written back by restore.',
    'read_only', true
  );
END;
$function$;
