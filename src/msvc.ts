import * as core from '@actions/core'
import * as semver from 'semver'
import {execSync} from 'child_process'
import {existsSync} from 'fs'
import {VERSION_DEV} from './constants'

// Keep in sync with https://github.com/actions/virtual-environments
const KNOWN_VISUAL_STUDIO_INSTALLATIONS = [
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise', // 'windows-2022' and 'windows-latest'
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise', // 'windows-2019'
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Enterprise' // 'windows-2016' (deprecated and removed)
]
if (process.env['VSINSTALLDIR']) {
  // if VSINSTALLDIR is set, make it the first known installation
  KNOWN_VISUAL_STUDIO_INSTALLATIONS.unshift(
    process.env['VSINSTALLDIR'].replace(/\\$/, '')
  )
}
const VCVARSALL_SUBPATH = 'VC\\Auxiliary\\Build\\vcvarsall.bat'

function findVcvarsallPath(): string {
  for (const installation of KNOWN_VISUAL_STUDIO_INSTALLATIONS) {
    const candidate = `${installation}\\${VCVARSALL_SUBPATH}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error('Failed to find vcvarsall.bat')
}

export function needsWindowsEnvironmentSetup(
  javaVersion: string,
  graalVMVersion: string,
  isGraalVMforJDK17OrLater: boolean
): boolean {
  if (javaVersion === VERSION_DEV || graalVMVersion === VERSION_DEV) {
    return false // no longer required in dev builds
  } else if (isGraalVMforJDK17OrLater) {
    return false // no longer required in GraalVM for JDK 17 and later.
  }
  return true
}

export function setUpWindowsEnvironment(
  javaVersion: string,
  graalVMVersion: string,
  isGraalVMforJDK17OrLater: boolean
): void {
  if (
    !needsWindowsEnvironmentSetup(
      javaVersion,
      graalVMVersion,
      isGraalVMforJDK17OrLater
    )
  ) {
    return
  }

  core.startGroup('Updating Windows environment...')

  const vcvarsallPath = findVcvarsallPath()
  core.debug(`Calling "${vcvarsallPath}"...`)
  const [originalEnv, vcvarsallOutput, updatedEnv] = execSync(
    `set && cls && "${vcvarsallPath}" x64 && cls && set`,
    {shell: 'cmd'}
  )
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
