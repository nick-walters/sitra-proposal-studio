DO $$
DECLARE
  v_proposal uuid := '9d7716c3-e0cb-4bad-a862-1abc0acb97e4';
  v_section text := 'b1-2';
  v_author uuid;
  v_content text;
  v_cleaned text;
  v_new_ver int;
  before_len int; after_len int;
  before_tables int; after_tables int;
  before_h3 int; after_h3 int;
  before_typed_h int; after_typed_h int;
  before_typed_t int; after_typed_t int;
BEGIN
  -- Pick any global owner/admin as the author of the cleanup version.
  SELECT user_id INTO v_author FROM public.user_roles
   WHERE role IN ('owner','admin') AND proposal_id IS NULL LIMIT 1;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'No global owner/admin found to attribute the cleanup version to';
  END IF;

  -- Fetch the latest version content.
  SELECT content INTO v_content FROM public.section_versions
   WHERE proposal_id = v_proposal AND section_id = v_section
   ORDER BY version_number DESC LIMIT 1;

  before_len      := length(v_content);
  before_tables   := COALESCE(regexp_count(v_content, 'data-cases-table-node'), 0);
  before_h3       := COALESCE(regexp_count(v_content, '<h3'), 0);
  before_typed_h  := COALESCE(regexp_count(v_content, 'data-case-type-heading-id="'), 0);
  before_typed_t  := COALESCE(regexp_count(v_content, 'data-case-type-id="'), 0);

  v_cleaned := v_content;

  -- 1. Remove every casesTable div (typed AND untyped). Reconciler rebuilds typed units on next load.
  v_cleaned := regexp_replace(v_cleaned, '<div[^>]*data-cases-table-node[^>]*></div>', '', 'g');

  -- 2. Remove every <h3> tagged with data-case-type-heading-id (typed per-type headings).
  v_cleaned := regexp_replace(v_cleaned, '<h3[^>]*data-case-type-heading-id="[^"]+"[^>]*>[^<]*</h3>', '', 'g');

  -- 3. Remove stray per-type default subheadings whose text is one of the four type plurals.
  v_cleaned := regexp_replace(
    v_cleaned,
    '<h3 data-default-subheading="true" style="text-align: justify;">(Challenges|Case Studies|Lighthouses|Demonstrations)</h3>',
    '', 'g');

  -- 4. Collapse runs of identical empty paragraphs (3+ → 1, then 2 → 1).
  v_cleaned := regexp_replace(v_cleaned, '(<p style="text-align: justify;"></p>){2,}', '<p style="text-align: justify;"></p>', 'g');

  after_len      := length(v_cleaned);
  after_tables   := COALESCE(regexp_count(v_cleaned, 'data-cases-table-node'), 0);
  after_h3       := COALESCE(regexp_count(v_cleaned, '<h3'), 0);
  after_typed_h  := COALESCE(regexp_count(v_cleaned, 'data-case-type-heading-id="'), 0);
  after_typed_t  := COALESCE(regexp_count(v_cleaned, 'data-case-type-id="'), 0);

  RAISE NOTICE 'B1.2 cleanup AddGenAI-old:';
  RAISE NOTICE '  len        % -> %', before_len, after_len;
  RAISE NOTICE '  casesTable % -> %', before_tables, after_tables;
  RAISE NOTICE '  h3 count   % -> %', before_h3, after_h3;
  RAISE NOTICE '  typed h    % -> %', before_typed_h, after_typed_h;
  RAISE NOTICE '  typed tbl  % -> %', before_typed_t, after_typed_t;

  IF v_cleaned IS DISTINCT FROM v_content THEN
    v_new_ver := public.insert_section_version(v_proposal, v_section, v_cleaned, v_author, false);
    RAISE NOTICE '  wrote version %', v_new_ver;
  ELSE
    RAISE NOTICE '  no change — content already clean';
  END IF;
END $$;