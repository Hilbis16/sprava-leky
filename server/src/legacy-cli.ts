import { readFile, writeFile } from 'node:fs/promises';
import { createPool } from './db';
import { exportLegacy, importLegacy } from './legacy';

const mode = process.argv[2];
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index+1] || process.argv[index+1]!.startsWith('--')) throw new Error(`Chybí parametr ${name}.`);
  return process.argv[index+1]!;
};
const connectionString = mode === 'export' ? process.env.LEGACY_DATABASE_URL : process.env.DATABASE_URL;
if (!connectionString) throw new Error('Chybí připojení k příslušné databázi.');
const pool = createPool(connectionString);
try {
  if (mode === 'export') {
    const output = argument('--output');
    await writeFile(output,JSON.stringify(await exportLegacy(pool)),{ encoding: 'utf8',flag: 'wx',mode: 0o600 });
    console.log('Export uložen. Soubor obsahuje citlivá data; nezveřejňujte jej.');
  } else if (mode === 'import') {
    const data: unknown = JSON.parse(await readFile(argument('--file'),'utf8'));
    const mapping: unknown = JSON.parse(await readFile(argument('--mapping'),'utf8'));
    console.log(await importLegacy(pool,data,mapping,process.argv.includes('--apply')));
  } else throw new Error('Použijte export nebo import.');
} catch {
  console.error('Přenos selhal. Ověřte připojení, prázdný cíl, úplnost mapování a shodu exportu se schématem. Transakce nebyla použita.');
  process.exitCode = 1;
} finally { await pool.end(); }
