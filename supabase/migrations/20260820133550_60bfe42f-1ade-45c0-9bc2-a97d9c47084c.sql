DELETE FROM public.user_roles
WHERE user_id = 'f102cc7b-632b-462e-bdbc-7b77fa8e0c67'
  AND proposal_id IN ('251316ee-3080-4285-ae27-ada1a04488f0','4d1f719a-ae3f-4a35-bc99-7835d05a8ce5');

DELETE FROM public.proposals
WHERE id IN ('251316ee-3080-4285-ae27-ada1a04488f0','4d1f719a-ae3f-4a35-bc99-7835d05a8ce5');