-- Cron de Mercado Pago: cada 15 min llama a /api/mp/sync con CRON_SECRET.
-- Correr UNA vez en el SQL editor de Supabase. El secreto se carga a mano en Vault
-- (reemplazar <CRON_SECRET> por el valor de la env de Vercel; no commitearlo).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'mp_cron_secret');

select cron.schedule(
  'mp-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://gastos-danis.vercel.app/api/mp/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mp_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
