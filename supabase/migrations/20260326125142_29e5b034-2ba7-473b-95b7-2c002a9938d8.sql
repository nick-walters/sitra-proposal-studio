-- Fix current WP numbering and colors for addgenai proposal
-- WP8 (DEC) should become WP5, WP9 (Coordination) should become WP6
UPDATE wp_drafts SET number = -1005, order_index = 4 WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4' AND number = 8;
UPDATE wp_drafts SET number = -1006, order_index = 5 WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4' AND number = 9;
UPDATE wp_drafts SET number = 5, color = '#7C3AED' WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4' AND number = -1005;
UPDATE wp_drafts SET number = 6, color = '#0891B2' WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4' AND number = -1006;