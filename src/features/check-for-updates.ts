import * as core from '@actions/core'
import {getTaggedRelease, toSemVer} from '../utils'
import {lt, major, minor, valid} from 'semver'
import {findGraalVMVersion} from '../graalvm'
import {GRAALVM_RELEASES_REPO} from '../constants'

export async function checkForUpdates(
  graalVMVersion: string,
  javaVersion: string
): Promise<void> {
  if (graalVMVersion.startsWith('22.3.') && javaVersion === '11') {
    core.notice(
      'Please consider upgrading your project to Java 17+. GraalVM 22.3.X releases are the last to support JDK11: https://github.com/oracle/graal/issues/5063'
    )
    return
  }

  const latestRelease = await getTaggedRelease(
    GRAALVM_RELEASES_REPO,
    'vm-22.3.1'
  )
  const latestGraalVMVersion = findGraalVMVersion(latestRelease)
  const selectedVersion = toSemVer(graalVMVersion)
  const latestVersion = toSemVer(latestGraalVMVersion)
  if (
    valid(selectedVersion) &&
    valid(latestVersion) &&
    lt(selectedVersion, latestVersion)
  ) {
    core.notice(
      `A new GraalVM release is available! Please consider upgrading to GraalVM ${latestGraalVMVersion}. Release notes: https://www.graalvm.org/release-notes/${major(
        latestVersion
      )}_${minor(latestVersion)}/`
    )
  }
}
