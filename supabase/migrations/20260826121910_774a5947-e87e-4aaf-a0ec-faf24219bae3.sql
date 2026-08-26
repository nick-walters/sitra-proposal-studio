-- The R&I maturity BLOCK is author-owned furniture: it can be deleted or
-- hidden like any other B1.1 block. Only its MODULES are template-fixed
-- (enforced in the board via UNDELETABLE_MODULE_CARD_KEYS).
update public.card_templates
set is_deletable = true, is_hideable = true
where key = 'b11.maturity';

update public.proposal_cards
set is_deletable = true, is_hideable = true
where template_key = 'b11.maturity';