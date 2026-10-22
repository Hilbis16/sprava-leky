import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp,mkdtemp,writeFile,unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

async function command(binary: string,args: string[]) {
  await new Promise<void>((resolve,reject) => {
    const child = spawn(binary,args,{ windowsHide: true });
    let errors = '';
    child.stderr.on('data',(chunk) => { errors += String(chunk); });
    child.on('error',reject);
    child.on('close',(code) => code === 0 ? resolve() : reject(new Error(`PostgreSQL (${code}): ${errors}`)));
  });
}
export async function startPostgres() {
  const net = createServer();
  await new Promise<void>((done) => net.listen(0,'127.0.0.1',done));
  const port = (net.address() as { port: number }).port;
  await new Promise<void>((done) => net.close(() => done()));
  const password = randomUUID();
  const root = await mkdtemp(join(tmpdir(),'moje-leky-pg-'));
  const data = join(root,'data');
  const connectionString = `postgres://test:${password}@127.0.0.1:${port}/postgres`;
  if (process.platform !== 'win32') {
    const pg = new EmbeddedPostgres({ databaseDir: data,user: 'test',password,port,persistent: true,onLog: () => {},onError: () => {} });
    await pg.initialise(); await pg.start();
    return { connectionString,stop: () => pg.stop() };
  }
  // Copy the Windows binaries to an ASCII path; PostgreSQL cannot bootstrap
  // reliably from paths containing Czech characters. This does not modify the installation.
  const entry = createRequire(import.meta.url).resolve('@embedded-postgres/windows-x64');
  const binaries = join(root,'native');
  await cp(join(dirname(entry),'../native'),binaries,{ recursive: true });
  const bin = (name: string) => join(binaries,'bin',`${name}.exe`);
  const passwordFile = join(root,'password');
  await writeFile(passwordFile,password+'\n',{ mode: 0o600 });
  try { await command(bin('initdb'),['-D',data,'--username=test','--auth=scram-sha-256',`--pwfile=${passwordFile}`,'--encoding=UTF8','--locale=C']); }
  finally { await unlink(passwordFile); }
  const child = spawn(bin('postgres'),['-D',data,'-h','127.0.0.1','-p',String(port)],{ windowsHide: true });
  await new Promise<void>((done,reject) => {
    child.on('error',reject);
    child.on('exit',(code) => reject(new Error(`PostgreSQL ukončen před startem (${code}).`)));
    child.stderr.on('data',(chunk) => { if (String(chunk).includes('database system is ready to accept connections')) done(); });
  });
  return { connectionString,stop: () => command(bin('pg_ctl'),['-D',data,'-m','fast','-w','stop']) };
}
