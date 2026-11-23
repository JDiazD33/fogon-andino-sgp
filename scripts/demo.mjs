import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareDatabase } from './start-postgres.mjs';

const projectDir = fileURLToPath(new URL('..', import.meta.url));

try {
  const databaseUrl = prepareDatabase();
  const build = spawnSync('npm', ['run', 'build'], { cwd: projectDir, stdio: 'inherit' });
  if (build.error) throw build.error;

  if (build.status !== 0) {
    process.exitCode = build.status ?? 1;
  } else {
    const server = spawn(process.execPath, ['server.mjs'], {
      cwd: projectDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    for (const signal of ['SIGINT', 'SIGTERM']) {
      const forward = () => server.kill(signal);
      process.on(signal, forward);
      server.once('close', () => process.off(signal, forward));
    }

    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.on('exit', (code, signal) => {
      process.exitCode = code ?? (128 + constants.signals[signal]);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
