import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const dist = join(project, 'dist');
const data = join(project, 'data');
const cluster = join(data, 'propuesta-pg');
const versionFile = join(cluster, 'PG_VERSION');
const passwordFile = join(cluster, 'fogon-password');
const host = '127.0.0.1';
const role = 'fogon';
const database = 'fogon_propuesta';
const windows = process.platform === 'win32';
const executable = name => windows ? `${name}.exe` : name;

function portFrom(name, fallback) {
  const port = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} debe ser un puerto entre 1024 y 65535.`);
  }
  return port;
}

function run(binary, args, options = {}) {
  return spawnSync(binary, args, { cwd: project, encoding: 'utf8', windowsHide: true, ...options });
}

function requireSuccess(result, message) {
  if (result.status === 0) return result.stdout?.trim();
  throw new Error([message, result.error?.message || result.stderr?.trim() || result.stdout?.trim()].filter(Boolean).join('\n'));
}

function nodeRuntime() {
  if (Number(process.versions.node.split('.')[0]) >= 24 && !process.env.FOGON_NODE) return process.execPath;
  const configured = process.env.FOGON_NODE;
  const bundled = join(data, 'runtime', 'node_modules', 'node', 'bin', executable('node'));
  const node = configured ? resolve(configured) : bundled;
  const version = run(node, ['--version']);
  if (version.status === 0 && Number(version.stdout.match(/^v(\d+)/)?.[1]) >= 24) return node;
  throw new Error('La propuesta requiere Node.js 24 o superior. Instálalo o indica su ejecutable con FOGON_NODE.');
}

function postgresBin() {
  const requiredVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : null;
  const candidates = process.env.PG_BIN ? [resolve(process.env.PG_BIN)] : [
    join(data, 'runtime', 'pgsql', 'bin'),
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
    ...(windows ? [join(process.env.ProgramFiles ?? 'C:/Program Files', 'PostgreSQL', '17', 'bin')] : [
      '/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin',
    ]),
  ];
  const tools = ['pg_ctl', 'postgres', 'initdb', 'psql'];
  for (const dir of new Set(candidates)) {
    if (!tools.every(tool => existsSync(join(dir, executable(tool))))) continue;
    const version = run(join(dir, executable('pg_ctl')), ['--version']);
    if (version.status === 0 && (!requiredVersion || version.stdout.match(/\(PostgreSQL\) (\d+)/)?.[1] === requiredVersion)) return dir;
  }
  throw new Error(`Selecciona los binarios de PostgreSQL ${requiredVersion ?? '17'} con PG_BIN.`);
}

function prepareDatabase(port) {
  const bin = postgresBin();
  const pg = (name, args, options) => run(join(bin, executable(name)), args, options);
  mkdirSync(data, { recursive: true });
  if (!existsSync(versionFile)) {
    if (existsSync(cluster)) throw new Error(`No se pudo reconocer el clúster local en ${cluster}.`);
    const staging = mkdtempSync(join(data, 'propuesta-pg-init-'));
    const password = join(staging, 'password');
    writeFileSync(password, `${randomBytes(24).toString('hex')}\n`, { mode: 0o600 });
    try {
      const candidate = join(staging, 'pg');
      requireSuccess(pg('initdb', ['-D', candidate, '-U', role, '--encoding=UTF8', '--locale=C',
        '--auth=scram-sha-256', '--pwfile', password]), 'No se pudo inicializar PostgreSQL para la propuesta.');
      renameSync(password, join(candidate, 'fogon-password'));
      renameSync(candidate, cluster);
    } finally {
      if (existsSync(password)) unlinkSync(password);
    }
  }

  const password = readFileSync(passwordFile, 'utf8').trim();
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('La credencial de la base local de la propuesta es inválida.');
  const statusArgs = ['status', '-D', cluster];
  const status = pg('pg_ctl', statusArgs);
  if (status.status === 3) {
    const log = join(data, 'propuesta-postgres.log');
    const started = pg('pg_ctl', ['start', '-D', cluster, '-l', log, '-w', '-t', '20',
      '-o', `-h ${host} -p ${port} -c unix_socket_directories=`], { stdio: 'ignore' });
    if (started.status !== 0 && pg('pg_ctl', statusArgs).status !== 0) {
      requireSuccess(started, `No se pudo iniciar PostgreSQL en ${host}:${port}. Registro: ${log}`);
    }
  } else {
    requireSuccess(status, 'No se pudo consultar el clúster PostgreSQL de la propuesta.');
  }
  const runningPort = Number(readFileSync(join(cluster, 'postmaster.pid'), 'utf8').split('\n')[3]);
  if (runningPort !== port) throw new Error(`El clúster usa el puerto ${runningPort}. Ejecuta con FOGON_PG_PORT=${runningPort}.`);

  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')));
  env.PGPASSWORD = password;
  env.PGCONNECT_TIMEOUT = '5';
  const args = ['-XwqAt', '--set=ON_ERROR_STOP=1', '-h', host, '-p', String(port), '-U', role, '-d', 'postgres'];
  const attached = requireSuccess(pg('psql', [...args, '-c', 'SHOW data_directory'], { env }), 'No se pudo verificar la base de la propuesta.');
  if (realpathSync(attached) !== realpathSync(cluster)) throw new Error('El puerto pertenece a otro clúster PostgreSQL.');
  requireSuccess(pg('psql', args, {
    env,
    input: `SELECT pg_advisory_lock(830641171);
SELECT 'CREATE DATABASE ${database}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')
\\gexec
`,
  }), 'No se pudo preparar la base PostgreSQL de la propuesta.');
  return `postgresql://${role}:${password}@${host}:${port}/${database}`;
}

function publishProposalFiles() {
  const file = 'propuesta-fogon-andino.html';
  const source = readFileSync(join(project, file), 'utf8');
  const proposal = join(project, 'propuesta');
  const publicDir = join(project, 'public');
  const hash = createHash('sha256').update(source).update(readFileSync(join(publicDir, 'sw.js')));
  for (const asset of readdirSync(proposal, { recursive: true }).filter(name => /\.(js|css)$/.test(name)).sort()) {
    hash.update(readFileSync(join(proposal, asset)));
  }
  const version = hash.digest('hex').slice(0, 16);
  // La copia editable usa public/. Vite sirve esos recursos desde la raíz del sitio.
  const html = source
    .replace(/(["'])public\/(?=(?:fonts|img|video)\/)/g, '$1/')
    .replace(/\b(src|href)="propuesta\/([^"]+)"/g, `$1="/propuesta/$2?v=${version}"`)
    .replace('</head>', `  <link rel="manifest" href="/manifest.webmanifest">
  <script>
    if ('serviceWorker' in navigator && window.isSecureContext) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?build=${version}').catch(error => {
          console.warn('No se pudo activar el modo sin conexión.', error);
        });
      });
    }
  </script>
</head>`);
  cpSync(proposal, join(dist, 'propuesta'), { recursive: true });
  for (const asset of ['fonts', 'img', 'video', 'openapi.json', 'sw.js', 'manifest.webmanifest']) {
    cpSync(join(publicDir, asset), join(dist, asset), { recursive: true });
  }
  writeFileSync(join(dist, file), html);
  writeFileSync(join(dist, 'index.html'), html);
}

function start() {
  if (process.argv.includes('--actualizar')) {
    publishProposalFiles();
    console.log('Archivos de la propuesta actualizados.');
    return;
  }
  const node = nodeRuntime();
  const vite = join(project, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error('Instala las dependencias con npm ci.');
  const port = portFrom('PORT', 4173);
  const pgPort = portFrom('FOGON_PG_PORT', 55433);
  const databaseUrl = prepareDatabase(pgPort);
  requireSuccess(run(node, [vite, 'build'], { stdio: 'inherit' }), 'No se pudo compilar la aplicación.');
  publishProposalFiles();
  const server = spawn(node, ['server.mjs'], {
    cwd: project,
    env: { ...process.env, HOST: host, PORT: String(port), DATABASE_URL: databaseUrl, NODE_ENV: 'development' },
    stdio: 'inherit',
    windowsHide: true,
  });
  console.log(`Propuesta conectada: http://${host}:${port}/`);
  const stop = () => server.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.once('error', error => { console.error(error.message); process.exitCode = 1; });
  server.once('exit', code => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.exitCode = code ?? 0;
  });
}

try {
  start();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
