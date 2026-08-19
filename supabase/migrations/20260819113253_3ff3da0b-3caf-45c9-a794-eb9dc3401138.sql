update section_content
set content = regexp_replace(content, '<p style="text-align: justify;"><span><span data-wp-number="1"[\s\S]*$', '')
where proposal_id='af325ea2-ae8c-4f59-8625-283d5437efba' and section_id='b1-1';