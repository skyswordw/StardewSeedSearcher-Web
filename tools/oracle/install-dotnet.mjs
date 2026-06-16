#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { chmod, rm } from 'node:fs/promises'
import { get } from 'node:https'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const scriptPath = resolve(root, 'tools/oracle/.cache/dotnet-install.sh')
const dotnetDir = resolve(root, '.dotnet')

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      DOTNET_ROOT: dotnetDir,
      DOTNET_CLI_HOME: resolve(root, '.dotnet-home'),
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
      NUGET_PACKAGES: resolve(root, '.nuget/packages'),
      PATH: `${dotnetDir}:${process.env.PATH ?? ''}`,
    },
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

async function download(url, target) {
  ensureDir(dirname(target))
  await new Promise((resolvePromise, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location, target).then(resolvePromise, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`))
        return
      }
      const file = createWriteStream(target)
      response.pipe(file)
      file.on('finish', () => file.close(resolvePromise))
      file.on('error', reject)
    })
    request.on('error', reject)
  })
}

async function main() {
  ensureDir(dotnetDir)
  ensureDir(resolve(root, '.dotnet-home'))
  ensureDir(resolve(root, '.nuget/packages'))

  const dotnetPath = resolve(dotnetDir, 'dotnet')
  if (!existsSync(dotnetPath)) {
    await rm(scriptPath, { force: true })
    await download('https://dot.net/v1/dotnet-install.sh', scriptPath)
    await chmod(scriptPath, 0o755)
    run(scriptPath, ['--channel', '9.0', '--install-dir', dotnetDir])
  }

  run(dotnetPath, ['--info'])
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
