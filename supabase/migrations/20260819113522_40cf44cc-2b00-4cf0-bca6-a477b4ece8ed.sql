update section_content
set content = regexp_replace(content, 'Models applied and iteratively refined through pilots[\s\S]*?</p></td>', 'Models applied and iteratively refined through pilots</p></td>')
where proposal_id='af325ea2-ae8c-4f59-8625-283d5437efba' and section_id='b1-1';