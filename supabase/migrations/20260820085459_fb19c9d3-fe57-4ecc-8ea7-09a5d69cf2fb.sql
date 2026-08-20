-- Trigger functions must not be callable through the Data API.
REVOKE ALL ON FUNCTION public.tg_reseq_deliverables_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_deliverables_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_deliverables_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_tasks_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_tasks_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_tasks_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_tasks_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_dlinks_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_dlinks_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_ms_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_ms_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_reseq_ms_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reseq_guard_on(text) FROM PUBLIC, anon, authenticated;