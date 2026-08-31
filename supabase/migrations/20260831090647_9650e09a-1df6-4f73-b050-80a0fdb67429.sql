
alter table public.figures
  drop column if exists figure_number,
  drop column if exists section_id,
  drop column if exists order_index;
