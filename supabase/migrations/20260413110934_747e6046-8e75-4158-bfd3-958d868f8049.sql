UPDATE section_content 
SET content = (SELECT content FROM section_versions WHERE id = '11e66232-1df2-45ef-a3be-48d76e8fa335'),
    updated_at = now()
WHERE id = '0e54b212-9649-464a-9598-3833a5fba742';