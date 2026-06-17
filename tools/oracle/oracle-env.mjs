import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

export const root = resolve(import.meta.dirname, '../..')
export const dotnetDir = resolve(root, '.dotnet')
export const dotnet = resolve(dotnetDir, 'dotnet')
export const upstreamDir = resolve(root, 'tools/oracle/upstream/StardewSeedSearcher')
export const upstreamUrl = 'https://github.com/CuiYinYin2023/StardewSeedSearcher.git'
export const upstreamCommit = '0e7d0df08f14f2c342747ca9a22c90d8edc9d892'
const upstreamLockDir = resolve(root, '.dotnet-home/oracle-upstream.lock')

export function dotnetEnv() {
  return {
    ...process.env,
    DOTNET_ROOT: dotnetDir,
    DOTNET_CLI_HOME: resolve(root, '.dotnet-home'),
    DOTNET_NOLOGO: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    NUGET_PACKAGES: resolve(root, '.nuget/packages'),
    PATH: `${dotnetDir}:${process.env.PATH ?? ''}`,
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: dotnetEnv(),
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

export function output(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: dotnetEnv(),
    ...options,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result.stdout
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function ensureDotnet() {
  if (!existsSync(dotnet)) {
    run(process.execPath, ['tools/oracle/install-dotnet.mjs'])
  }
}

export function ensureUpstream() {
  withUpstreamLock(prepareUpstream)
}

function prepareUpstream() {
  if (existsSync(resolve(upstreamDir, '.git'))) {
    run('git', ['remote', 'set-url', 'origin', upstreamUrl], { cwd: upstreamDir })
    try {
      run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
      run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
      return
    } catch {
      rmSync(upstreamDir, { recursive: true, force: true })
    }
  }

  const tmpClone = '/tmp/codex-stardew-seed-searcher'
  if (existsSync(resolve(tmpClone, '.git'))) {
    ensureDir(dirname(upstreamDir))
    rmSync(upstreamDir, { recursive: true, force: true })
    try {
      run('git', ['clone', '--depth', '1', `file://${tmpClone}`, upstreamDir])
      run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
      run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
      return
    } catch {
      rmSync(upstreamDir, { recursive: true, force: true })
      rmSync(tmpClone, { recursive: true, force: true })
    }
  }

  ensureDir(dirname(upstreamDir))
  run('git', ['clone', '--depth', '1', upstreamUrl, upstreamDir])
  run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
  run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
}

function withUpstreamLock(callback) {
  const startedAt = Date.now()
  ensureDir(dirname(upstreamLockDir))

  while (true) {
    try {
      mkdirSync(upstreamLockDir)
      writeFileSync(resolve(upstreamLockDir, 'pid'), `${process.pid}\n`)
      break
    } catch {
      if (Date.now() - startedAt > 120_000) {
        rmSync(upstreamLockDir, { recursive: true, force: true })
        continue
      }
      sleep(250)
    }
  }

  try {
    callback()
  } finally {
    rmSync(upstreamLockDir, { recursive: true, force: true })
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function prepareOracleProject(startupObject, runnerFileName, runnerSource) {
  const projectPath = resolve(upstreamDir, 'StardewSeedSearcher/StardewSeedSearcher.csproj')
  const original = readFileSync(projectPath, 'utf8')
  const patched = original.replace(
    /<StartupObject>[^<]+<\/StartupObject>/,
    `<StartupObject>${startupObject}</StartupObject>`,
  )
  writeFileSync(projectPath, patched)
  writeFileSync(resolve(upstreamDir, 'StardewSeedSearcher', runnerFileName), runnerSource)
}
