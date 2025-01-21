import * as liberica from '../src/liberica'
import * as c from '../src/constants'
import * as path from 'path'
import * as semver from 'semver'
import {expect, test} from '@jest/globals'

process.env['RUNNER_TOOL_CACHE'] = path.join(__dirname, 'TOOL_CACHE')
process.env['RUNNER_TEMP'] = path.join(__dirname, 'TEMP')

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectLatestToBe", "expectURL"] }] */

test('find latest JDK version', async () => {
  // Make sure the action can find the latest Java version for known major versions
  await expectLatestToBe('11', atLeast('11.0.22+12'))
  await expectLatestToBe('11.0.22', upToBuild('11.0.22+12'))
  await expectLatestToBe('11.0.22+12', exactly('11.0.22+12'))

  await expectLatestToBe('17', atLeast('17.0.10+13'))
  await expectLatestToBe('17.0.10', upToBuild('17.0.10+13'))
  await expectLatestToBe('17.0.10+13', exactly('17.0.10+13'))

  await expectLatestToBe('21', atLeast('21.0.2+14'))
  await expectLatestToBe('21.0.2', upToBuild('21.0.2+14'))
  await expectLatestToBe('21.0.2+14', exactly('21.0.2+14'))

  // Outdated major version
  await expectLatestToFail('20')

  // Outdated CPU versions
  await expectLatestToFail('11.0.2') // should not resolve to 11.0.22
  await expectLatestToFail('17.0.1') // should not resolve to 17.0.10
  await expectLatestToFail('17.0.7+11')
  await expectLatestToFail('21.0.0+8')
  await expectLatestToFail('21.0.1')

  // Incorrect build number
  await expectLatestToFail('17.0.10+10')
}, 30000)

test('find asset URL', async () => {
  await expectURL('11.0.22+12', '', 'bellsoft-liberica-vm-openjdk11.0.22')
  await expectURL('17.0.10+13', 'jdk', 'bellsoft-liberica-vm-openjdk17.0.10')

  if (!c.IS_LINUX) {
    // This check can fail on Linux because there's no `jdk+fx` package for aarch64 and/or musl
    await expectURL(
      '21.0.2+14',
      'jdk+fx',
      'bellsoft-liberica-vm-full-openjdk21.0.2'
    )
  }
}, 10000)

type verifier = (
  version: string,
  major: number,
  minor: number,
  patch: number
) => void

function atLeast(expectedMinVersion: string): verifier {
  const expectedMajor = semver.major(expectedMinVersion)
  return function (
    version: string,
    major: number,
    _minor: number,
    _patch: number
  ) {
    expect(major).toBe(expectedMajor)
    if (semver.compareBuild(version, expectedMinVersion) < 0) {
      throw new Error(`Version ${version} is older than ${expectedMinVersion}`)
    }
  }
}

function upToBuild(expectedMinVersion: string): verifier {
  const expectedMinor = semver.minor(expectedMinVersion)
  const expectedPatch = semver.patch(expectedMinVersion)
  const atLeastVerifier = atLeast(expectedMinVersion)
  return function (
    version: string,
    major: number,
    minor: number,
    patch: number
  ) {
    atLeastVerifier(version, major, minor, patch)
    expect(minor).toBe(expectedMinor)
    expect(patch).toBe(expectedPatch)
  }
}

function exactly(expectedVersion: string): verifier {
  return function (
    version: string,
    _major: number,
    _minor: number,
    _patch: number
  ) {
    if (semver.compareBuild(version, expectedVersion) != 0) {
      throw new Error(`Expected version ${expectedVersion} but got ${version}`)
    }
  }
}

async function expectLatestToBe(pattern: string, verify: verifier) {
  const result = await liberica.findLatestLibericaJavaVersion(pattern)
  expect(semver.valid(result)).toBeDefined()
  const major = semver.major(result)
  const minor = semver.minor(result)
  const patch = semver.patch(result)
  verify(result, major, minor, patch)
}

async function expectLatestToFail(pattern: string) {
  try {
    const result = await liberica.findLatestLibericaJavaVersion(pattern)
    throw new Error(
      `findLatest(${pattern}) should have failed but returned ${result}`
    )
  } catch (err) {
    if (!(err instanceof Error)) {
      throw new Error(`Unexpected non-Error: ${err}`)
    }
    expect(err.message).toContain(
      `Unable to find the latest version for JDK${pattern}`
    )
  }
}

async function expectURL(
  javaVersion: string,
  javaPackage: string,
  expectedPrefix: string
) {
  const url = await liberica.findLibericaURL(javaVersion, javaPackage)
  expect(url).toBeDefined()
  const parts = url.split('/')
  const file = parts[parts.length - 1]
  expect(file.startsWith(expectedPrefix)).toBe(true)
}
