DO $$
DECLARE
  v_pid uuid := 'af325ea2-ae8c-4f59-8625-283d5437efba';
  v_scope jsonb := public.capture_scope_predicates();
  v_tbl text; v_predicate text; v_rows jsonb;
  v_snapshot jsonb; v_counts jsonb;
BEGIN
  CREATE TEMP TABLE _snap_p100(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows FROM proposals t WHERE t.id = v_pid;
  INSERT INTO _snap_p100(k, v) VALUES ('proposals', v_rows);
  FOR v_tbl, v_predicate IN SELECT key, value FROM jsonb_each_text(v_scope) LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s t WHERE %s', v_tbl, v_predicate)
      INTO v_rows USING v_pid;
    INSERT INTO _snap_p100(k, v) VALUES (replace(v_tbl, '"', ''), v_rows);
  END LOOP;
  SELECT jsonb_object_agg(k, v) INTO v_snapshot FROM _snap_p100;
  SELECT jsonb_object_agg(k, jsonb_array_length(v)) INTO v_counts FROM _snap_p100;
  IF NOT (v_snapshot ? 'case_drafts') OR jsonb_array_length(v_snapshot->'case_drafts') <> 3 THEN
    RAISE EXCEPTION 'Snapshot did not capture all case drafts';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_snapshot->'case_drafts') e
      WHERE COALESCE(e->'subsection_content','{}'::jsonb) <> '{}'::jsonb) < 3 THEN
    RAISE EXCEPTION 'Snapshot missing subsection content';
  END IF;
  INSERT INTO proposal_snapshots (proposal_id, snapshot, label, source, table_counts)
  VALUES (v_pid, v_snapshot, 'Pre case-subsection migration (prompt 100)', 'manual', v_counts);
END $$;