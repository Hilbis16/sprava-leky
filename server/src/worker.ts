import { readConfig } from './config';
import { createPool } from './db';
import { deliverAlerts } from './push';
import { setTimeout as wait } from 'node:timers/promises';

const config = readConfig();
const pool = createPool(config.DATABASE_URL);
const shutdown = new AbortController();
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => shutdown.abort());
while (!shutdown.signal.aborted) {
  try { console.log(await deliverAlerts(pool,config.MISSED_DOSE_DELAY_MINUTES,config.EXPO_ACCESS_TOKEN)); }
  catch { console.error('Kontrola upozornění selhala; bude opakována.'); }
  try { await wait(60_000,undefined,{ signal: shutdown.signal }); } catch { /* Ukončení čekání při vypnutí. */ }
}
await pool.end();
