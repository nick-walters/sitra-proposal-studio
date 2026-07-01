
DO $migration$
DECLARE
  v_proposal_id uuid := 'dd66432e-dccb-4303-9db3-dcba9e16bfc9';
  v_row record;
  v_part record;
  v_badge text;
  v_new_content text;
  v_style_outer text := 'display: inline-flex; align-items: center; background-color: rgb(0, 0, 0); border: 1.5px solid rgb(0, 0, 0); padding: 0px 5px; border-radius: 9999px; white-space: nowrap; vertical-align: baseline; cursor: pointer;';
  v_style_inner text := 'color: rgb(255, 255, 255); font-family: &quot;Times New Roman&quot;, Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;';
BEGIN
  -- Helper function: replace whole-word matches of `search` with `replacement`
  -- in text-node positions only (i.e. outside any HTML tag and outside existing
  -- *-reference badge spans which may already contain the bare label text).
  CREATE OR REPLACE FUNCTION pg_temp.replace_in_text_nodes(html text, search text, replacement text)
  RETURNS text AS $fn$
  DECLARE
    result text := '';
    remaining text := html;
    pos int;
    tag_start text;
    close_idx int;
    inside_ref boolean;
    chunk text;
    tag_chunk text;
    pat text;
  BEGIN
    pat := '\m' || search || '\M';
    WHILE length(remaining) > 0 LOOP
      pos := position('<' IN remaining);
      IF pos = 0 THEN
        result := result || regexp_replace(remaining, pat, replacement, 'g');
        EXIT;
      END IF;
      IF pos > 1 THEN
        chunk := substring(remaining FROM 1 FOR pos - 1);
        result := result || regexp_replace(chunk, pat, replacement, 'g');
        remaining := substring(remaining FROM pos);
      END IF;
      -- now remaining starts with '<'
      close_idx := position('>' IN remaining);
      IF close_idx = 0 THEN
        result := result || remaining;
        EXIT;
      END IF;
      tag_chunk := substring(remaining FROM 1 FOR close_idx);
      result := result || tag_chunk;
      remaining := substring(remaining FROM close_idx + 1);
      -- If this opening tag is a *-reference badge, skip its full subtree
      -- (badge structure is <span data-X-reference ...><span ...>LABEL</span></span>).
      inside_ref := tag_chunk ~ 'data-(participant|wp|case|acronym)-reference';
      IF inside_ref THEN
        -- Skip until matching </span></span> sequence (greedy single occurrence).
        DECLARE
          end_idx int;
        BEGIN
          end_idx := position('</span></span>' IN remaining);
          IF end_idx > 0 THEN
            result := result || substring(remaining FROM 1 FOR end_idx + length('</span></span>') - 1);
            remaining := substring(remaining FROM end_idx + length('</span></span>'));
          ELSE
            -- Fallback: skip to next </span>
            end_idx := position('</span>' IN remaining);
            IF end_idx > 0 THEN
              result := result || substring(remaining FROM 1 FOR end_idx + length('</span>') - 1);
              remaining := substring(remaining FROM end_idx + length('</span>'));
            END IF;
          END IF;
        END;
      END IF;
    END LOOP;
    RETURN result;
  END;
  $fn$ LANGUAGE plpgsql IMMUTABLE;

  FOR v_row IN
    SELECT sc.id, sc.content
    FROM section_content sc
    WHERE sc.proposal_id = v_proposal_id
      AND sc.section_id LIKE 'b%'
  LOOP
    v_new_content := v_row.content;
    FOR v_part IN
      SELECT id, participant_number, organisation_short_name
      FROM participants
      WHERE proposal_id = v_proposal_id
      ORDER BY length(organisation_short_name) DESC, participant_number
    LOOP
      v_badge := format(
        '<span data-participant-number="%s" data-participant-short-name="%s" data-participant-id="%s" data-participant-reference="" class="participant-reference-badge" contenteditable="false" style="%s"><span style="%s">%s</span></span>',
        v_part.participant_number,
        v_part.organisation_short_name,
        v_part.id,
        v_style_outer,
        v_style_inner,
        v_part.organisation_short_name
      );
      v_new_content := pg_temp.replace_in_text_nodes(v_new_content, v_part.organisation_short_name, v_badge);
    END LOOP;
    IF v_new_content IS DISTINCT FROM v_row.content THEN
      UPDATE section_content SET content = v_new_content, updated_at = now() WHERE id = v_row.id;
    END IF;
  END LOOP;
END
$migration$;
