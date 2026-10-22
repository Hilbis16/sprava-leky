import { readConfig } from './config';
import { createPool, migrate } from './db';

const pool = createPool(readConfig().DATABASE_URL);
try { await migrate(pool); console.log('Databázové migrace byly provedeny.'); }
finally { await pool.end(); }
