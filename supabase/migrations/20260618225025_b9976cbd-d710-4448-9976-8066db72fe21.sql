SELECT net.http_post(
  url := 'https://nfeoyxjstfehwrkgapho.supabase.co/functions/v1/generate-proposal-backups?force=1',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron-deadline-secret' LIMIT 1)
  ),
  body := jsonb_build_object('trigger', 'manual', 'force', true)
) AS request_id;