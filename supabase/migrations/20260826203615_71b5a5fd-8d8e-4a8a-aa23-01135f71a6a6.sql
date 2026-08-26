CREATE OR REPLACE FUNCTION public.b31_mirror_card_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.template_key = 'b31.table_h'
     AND (TG_OP = 'INSERT' OR NEW.is_visible IS DISTINCT FROM OLD.is_visible) THEN
    UPDATE public.proposals SET
      b31_show_purchase_costs            = NEW.is_visible,
      b31_show_travel_justification      = NEW.is_visible,
      b31_show_equipment_justification   = NEW.is_visible,
      b31_show_other_goods_justification = NEW.is_visible,
      updated_at = now()
    WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b31_mirror_card_visibility ON public.proposal_cards;
CREATE TRIGGER trg_b31_mirror_card_visibility
AFTER INSERT OR UPDATE OF is_visible ON public.proposal_cards
FOR EACH ROW EXECUTE FUNCTION public.b31_mirror_card_visibility();