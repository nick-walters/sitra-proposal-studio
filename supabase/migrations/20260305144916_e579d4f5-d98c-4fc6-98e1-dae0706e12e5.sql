CREATE OR REPLACE FUNCTION public.notify_feedback_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fb RECORD;
  mentioned_id uuid;
  mentioned_ids uuid[] := '{}';
  recipient_id uuid;
  commenter_name TEXT;
  cat_label TEXT;
  mention_match TEXT[];
BEGIN
  -- Get the feedback item
  SELECT * INTO fb FROM public.feedback WHERE id = NEW.feedback_id;
  IF fb IS NULL THEN RETURN NEW; END IF;

  -- Get commenter name
  SELECT COALESCE(full_name, email, 'Someone') INTO commenter_name FROM public.profiles WHERE id = NEW.user_id;

  cat_label := CASE WHEN fb.category = 'feature_request' THEN 'Feature request' ELSE 'Bug report' END;

  -- Extract mentioned user IDs from @[Name](uuid) patterns
  FOR mention_match IN SELECT regexp_matches(NEW.content, '@\[([^\]]+)\]\(([^)]+)\)', 'g') LOOP
    mentioned_id := mention_match[2]::uuid;
    mentioned_ids := array_append(mentioned_ids, mentioned_id);
    
    -- Notify mentioned user (skip self)
    IF mentioned_id != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, proposal_id, type, title, message, metadata)
      VALUES (
        mentioned_id,
        '00000000-0000-0000-0000-000000000000',
        'mention',
        'Mentioned in feedback: ' || fb.title,
        commenter_name || ' mentioned you in a comment',
        jsonb_build_object('source', 'feedback_comment', 'feedback_id', fb.id, 'comment_id', NEW.id)
      );
    END IF;
  END LOOP;

  -- Notify the feedback submitter (if not the commenter and not already mentioned)
  IF fb.user_id != NEW.user_id AND NOT (fb.user_id = ANY(mentioned_ids)) THEN
    INSERT INTO public.notifications (user_id, proposal_id, type, title, message, metadata)
    VALUES (
      fb.user_id,
      '00000000-0000-0000-0000-000000000000',
      'mention',
      'New comment on your feedback: ' || fb.title,
      commenter_name || ' commented on your ' || lower(cat_label),
      jsonb_build_object('source', 'feedback_comment', 'feedback_id', fb.id, 'comment_id', NEW.id)
    );
  END IF;

  -- Notify all owners (except commenter and already notified)
  FOR recipient_id IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'owner' AND ur.proposal_id IS NULL
      AND ur.user_id != NEW.user_id
      AND ur.user_id != fb.user_id
      AND NOT (ur.user_id = ANY(mentioned_ids))
  LOOP
    INSERT INTO public.notifications (user_id, proposal_id, type, title, message, metadata)
    VALUES (
      recipient_id,
      '00000000-0000-0000-0000-000000000000',
      'mention',
      'New comment on ' || cat_label || ': ' || fb.title,
      commenter_name || ' left a comment',
      jsonb_build_object('source', 'feedback_comment', 'feedback_id', fb.id, 'comment_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_feedback_comment
  AFTER INSERT ON public.feedback_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_feedback_comment();