CREATE OR REPLACE FUNCTION public.save_table_column_header(
  p_proposal_id uuid,
  p_table_key text,
  p_index integer,
  p_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_headers jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_table_key IS NULL OR p_table_key = '' OR p_index IS NULL OR p_index < 0 THEN
    RAISE EXCEPTION 'Invalid arguments';
  END IF;

  -- Merge server-side: only the one column changes, so a concurrent rename of
  -- another column of the same table survives, and the write is bound to the
  -- table key the caller passed rather than to a stale client-side map.
  INSERT INTO table_column_headers (proposal_id, table_key, headers, updated_at, updated_by)
  VALUES (
    p_proposal_id,
    p_table_key,
    CASE WHEN p_value IS NULL OR p_value = '' THEN '{}'::jsonb
         ELSE jsonb_build_object(p_index::text, p_value) END,
    now(),
    auth.uid()
  )
  ON CONFLICT (proposal_id, table_key) DO UPDATE
    SET headers = CASE
          WHEN p_value IS NULL OR p_value = ''
            THEN COALESCE(table_column_headers.headers, '{}'::jsonb) - p_index::text
          ELSE COALESCE(table_column_headers.headers, '{}'::jsonb)
                 || jsonb_build_object(p_index::text, p_value)
        END,
        updated_at = now(),
        updated_by = auth.uid()
  RETURNING headers INTO v_headers;

  RETURN COALESCE(v_headers, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.save_table_column_header(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_table_column_header(uuid, text, integer, text) TO authenticated;