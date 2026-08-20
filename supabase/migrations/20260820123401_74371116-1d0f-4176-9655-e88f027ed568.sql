-- Internal numbering/versioning helpers must not be callable by end users.
-- They carry no permission checks of their own; every legitimate caller is a
-- trigger or a SECURITY DEFINER RPC that has already authorised the user.

REVOKE EXECUTE ON FUNCTION public.resequence_numbered(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.versioned_row_proposal(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.numbered_order_expr(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.numbered_parent_column(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.versioned_table_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reseq_guard_on(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_row_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_reseq_tasks_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resequence_card_fields(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resequence_section_cards(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalise_section_card_order(uuid) FROM PUBLIC, anon, authenticated;

-- Static helper predicates with no data access; still no reason for anon.
REVOKE EXECUTE ON FUNCTION public.card_html_is_blank(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.capture_scope_predicates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_scope_predicates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_in_scope_tables() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_excluded_tables() FROM PUBLIC, anon, authenticated;

-- Trigger-only guards: never invoked directly.
REVOKE EXECUTE ON FUNCTION public.prevent_card_field_version_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_card_field_version_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_card_field() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_proposal_card() FROM PUBLIC, anon, authenticated;