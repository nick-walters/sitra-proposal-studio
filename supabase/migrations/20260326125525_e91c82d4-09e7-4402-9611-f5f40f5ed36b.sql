-- Fix task numbering gap in WP1 of addgenai: task number 7 should be 4
UPDATE wp_draft_tasks SET number = 4, order_index = 3
WHERE id = '3a9c4c2c-bf71-43f7-a510-ce63478ec68c';