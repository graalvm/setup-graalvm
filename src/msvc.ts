import * as core from '@actions/core'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const VS_EDITIONS = ['Enterprise', 'Professional', 'Community', 'BuildTools']
const KNOWN_VISUAL_STUDIO_INSTALLATIONS = [
  // 'windows-2025' and 'windows-latest'
  ...VS_EDITIONS.map((e) => `C:\\Program Files\\Microsoft Visual Studio\\18\\${e}`),
  // 'windows-2022'
  ...VS_EDITIONS.map((e) => `C:\\Program Files\\Microsoft Visual Studio\\2022\\${e}`),
  // 'windows-2019'
  ...VS_EDITIONS.map((e) => `C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\${e}`),
  // 'windows-2017'
  ...VS_EDITIONS.map((e) => `C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\${e}`)
]
const VCVARSALL_SUBPATH = 'VC\\Auxiliary\\Build\\vcvarsall.bat'
const VSWHERE_PATH = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'

function findVcvarsallWithVswhere(): string | null {
  if (!existsSync(VSWHERE_PATH)) {
    core.debug('vswhere.exe not found, skipping')
    return null
  }
  try {
    const output = execSync(
      `"${VSWHERE_PATH}" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath -latest`,
      { shell: 'cmd' }
    )
      .toString()
      .trim()
    if (!output) {
      core.debug('vswhere.exe returned no results')
      return null
    }
    const installationPath = output.split(/\r?\n/)[0].trim()
    const candidate = `${installationPath}\\${VCVARSALL_SUBPATH}`
    if (existsSync(candidate)) {
      core.debug(`Found vcvarsall.bat via vswhere: ${candidate}`)
      return candidate
    }
    core.debug(`vswhere reported "${installationPath}" but vcvarsall.bat not found there`)
  } catch (e) {
    core.debug(`vswhere.exe failed: ${e}`)
  }
  return null
}

function findVcvarsallPath(): string {
  if (process.env['VSINSTALLDIR']) {
    const vsinstalldir = process.env['VSINSTALLDIR'].replace(/\\$/, '')
    const candidate = `${vsinstalldir}\\${VCVARSALL_SUBPATH}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  const vswhereResult = findVcvarsallWithVswhere()
  if (vswhereResult) {
    return vswhereResult
  }
  for (const installation of KNOWN_VISUAL_STUDIO_INSTALLATIONS) {
    const candidate = `${installation}\\${VCVARSALL_SUBPATH}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error('Failed to find vcvarsall.bat')
}

export function setUpWindowsEnvironment(): void {
  core.startGroup('Updating Windows environment...')

  const vcvarsallPath = findVcvarsallPath()
  core.debug(`Calling "${vcvarsallPath}"...`)
  const [originalEnv, vcvarsallOutput, updatedEnv] = execSync(`set && cls && "${vcvarsallPath}" x64 && cls && set`, {
    shell: 'cmd'
  })
    .toString()
    .split('\f') // form feed page break (printed by `cls`)
  core.debug(vcvarsallOutput)

  const originalEnvMap = new Map<string, string>()
  for (const line of originalEnv.split('\r\n')) {
    if (line.includes('=')) {
      const [name, value] = line.split('=')
      originalEnvMap.set(name, value)
    } else if (line) {
      core.debug(`Skipping ${line} (does not include '=')...`)
    }
  }

  for (const line of updatedEnv.split('\r\n')) {
    if (line.includes('=')) {
      const [name, value] = line.split('=')
      const originalValue = originalEnvMap.get(name)
      if (value !== originalValue) {
        core.exportVariable(name, value)
        core.debug(`"${name}" set to "${value}"`)
      }
    } else if (line) {
      core.debug(`Skipping ${line} (does not include '=')...`)
    }
  }

  core.endGroup()
}
