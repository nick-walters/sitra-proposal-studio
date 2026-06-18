SELECT cron.alter_job(
  job_id := 2,
  schedule := '0 * * * *',
  command := $cmd$
  SELECT net.http_post(
    url := 'https://nfeoyxjstfehwrkgapho.supabase.co/functions/v1/generate-proposal-backups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZW95eGpzdGZlaHdya2dhcGhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTA0OTcsImV4cCI6MjA4NDEyNjQ5N30.984nXIg-fYtkN-qDKG8hBppUud2P5TkSzZEVZMeY9Vc',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron-deadline-secret' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron', 'fired_at', now()::text)
  );
  $cmd$
);