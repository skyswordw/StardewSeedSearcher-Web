#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const dotnetDir = resolve(root, '.dotnet')
const dotnet = resolve(dotnetDir, 'dotnet')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
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
  })
  process.exit(result.status ?? 1)
}

if (!existsSync(dotnet)) {
  const install = spawnSync(process.execPath, ['tools/oracle/install-dotnet.mjs'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (install.status !== 0) process.exit(install.status ?? 1)
}

run(dotnet, process.argv.slice(2))
