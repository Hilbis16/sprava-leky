import { createApp } from './app';
import { readConfig } from './config';
import { createPool } from './db';

const config = readConfig();
const pool = createPool(config.DATABASE_URL);
const app = await createApp(config,pool);
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { void app.close(); });
await app.listen({ host: config.HOST, port: config.PORT });
