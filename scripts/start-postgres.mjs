import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const dataDir = join(projectDir, 'data');
const clusterDir = join(dataDir, 'pg');
const versionFile = join(clusterDir, 'PG_VERSION');
const passwordName = 'fogon-password';
const database = 'fogon';
const user = 'fogon';
const host = '127.0.0.1';

function command(binary, args, options = {}) {
  return spawnSync(binary, args, { encoding: 'utf8', ...options });
}

function check(result, explanation) {
  if (result.status === 0) return result.stdout.trim();

  const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim();
  throw new Error([explanation, detail].filter(Boolean).join('\n'));
}

function versionedBins(directory, filter) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => filter.test(name))
    .sort((first, second) => second.localeCompare(first, 'en', { numeric: true }))
    .map((name) => join(directory, name, 'bin'));
}

function findPostgresBin() {
  const requiredVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : null;
  const configuredDir = process.env.PG_BIN;
  const homebrewRoots = ['/opt/homebrew/opt', '/usr/local/opt'];
  const candidates = configuredDir ? [resolve(configuredDir)] : [
    ...(process.env.PATH || '').split(delimiter).filter(Boolean),
    ...homebrewRoots.flatMap((directory) => [
      ...versionedBins(directory, /^postgresql@\d+$/),
      join(directory, 'postgresql', 'bin'),
    ]),
    ...versionedBins('/Library/PostgreSQL', /^\d+$/),
    ...versionedBins('/Applications/Postgres.app/Contents/Versions', /^\d+$/),
    ...versionedBins('/usr/lib/postgresql', /^\d+$/),
  ];

  for (const directory of new Set(candidates)) {
    try {
      for (const binary of ['pg_ctl', 'postgres', 'initdb', 'psql']) {
        accessSync(join(directory, binary), constants.X_OK);
      }
    } catch {
      continue;
    }

    const result = command(join(directory, 'pg_ctl'), ['--version']);
    const version = result.stdout?.match(/\(PostgreSQL\) (\d+)/)?.[1];
    if (result.status === 0 && (!requiredVersion || version === requiredVersion)) return directory;
  }

  const wanted = requiredVersion || '17';
  throw new Error(
    `No se encontraron los binarios de PostgreSQL${requiredVersion ? ` ${requiredVersion}` : ''}. ` +
    `En macOS puedes instalarlo con brew install postgresql@${wanted}. ` +
    'Usa PG_BIN para indicar el directorio de binarios o DATABASE_URL para usar una base existente.',
  );
}

function initializeCluster(bin) {
  if (existsSync(versionFile)) return;

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const setupDir = mkdtempSync(join(dataDir, 'pg-setup-'));
  const stagedCluster = join(setupDir, 'cluster');
  const passwordFile = join(setupDir, 'password');
  const password = randomBytes(24).toString('hex');

  try {
    writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
    check(command(join(bin, 'initdb'), [
      '-D', stagedCluster, '-U', user, '--encoding=UTF8', '--locale=C',
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile', passwordFile,
    ]), 'No se pudo inicializar el clúster local de Fogón Andino.');
    renameSync(passwordFile, join(stagedCluster, passwordName));

    try {
      renameSync(stagedCluster, clusterDir);
    } catch (error) {
      // Another launch may have initialized a complete cluster first.
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !existsSync(versionFile)) throw error;
    }
  } finally {
    rmSync(setupDir, { recursive: true, force: true });
  }
}

function startCluster(bin, port) {
  const pgCtl = join(bin, 'pg_ctl');
  const statusArgs = ['status', '-D', clusterDir];
  const status = command(pgCtl, statusArgs);

  if (status.status === 3) {
    const fingerprint = createHash('sha256').update(realpathSync(clusterDir)).digest('hex').slice(0, 16);
    const socketDir = `/tmp/fogon-pg-${process.getuid()}-${fingerprint}`;
    mkdirSync(socketDir, { mode: 0o700, recursive: true });
    const socketInfo = lstatSync(socketDir);
    if (!socketInfo.isDirectory() || socketInfo.uid !== process.getuid() || (socketInfo.mode & 0o077)) {
      throw new Error(`PostgreSQL necesita un directorio de socket privado en ${socketDir}.`);
    }

    const logPath = join(dataDir, 'postgres.log');
    const started = command(pgCtl, [
      'start', '-D', clusterDir, '-l', logPath, '-w', '-t', '20',
      '-o', `-h ${host} -p ${port} -k ${socketDir}`,
    ]);

    if (started.status !== 0 && command(pgCtl, statusArgs).status !== 0) {
      check(started, `No se pudo iniciar PostgreSQL en ${host}:${port}. Registro: ${logPath}`);
    }
  } else {
    check(status, 'No se pudo consultar el estado del clúster local.');
  }

  const runningPort = Number(readFileSync(join(clusterDir, 'postmaster.pid'), 'utf8').split('\n')[3]);
  if (runningPort !== port) {
    throw new Error(`El clúster local usa el puerto ${runningPort}. Ejecuta con FOGON_PG_PORT=${runningPort}.`);
  }
}

export function prepareDatabase() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const port = Number(process.env.FOGON_PG_PORT ?? 55432);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('FOGON_PG_PORT debe ser un puerto entre 1024 y 65535.');
  }

  const bin = findPostgresBin();
  initializeCluster(bin);

  const password = readFileSync(join(clusterDir, passwordName), 'utf8').trim();
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('La credencial del clúster local de Fogón Andino es inválida.');
  startCluster(bin, port);

  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')));
  environment.PGPASSWORD = password;
  environment.PGCONNECT_TIMEOUT = '5';
  const psqlArgs = ['-XwqAt', '--set=ON_ERROR_STOP=1', '-h', host, '-p', String(port), '-U', user, '-d', 'postgres'];
  const psql = join(bin, 'psql');
  const actualDirectory = check(
    command(psql, [...psqlArgs, '-c', 'SHOW data_directory'], { env: environment }),
    `No se pudo conectar con el clúster local de PostgreSQL en ${host}:${port}.`,
  );
  if (realpathSync(actualDirectory) !== realpathSync(clusterDir)) {
    throw new Error(`El puerto ${port} pertenece a otro clúster de PostgreSQL.`);
  }

  check(command(psql, psqlArgs, {
    env: environment,
    input: `SELECT pg_advisory_lock(830641170);
SELECT 'CREATE DATABASE ${database}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')
\\gexec
`,
  }), 'No se pudo preparar la base local de Fogón Andino.');

  console.log(`PostgreSQL local disponible en ${host}:${port}/${database}.`);
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}
