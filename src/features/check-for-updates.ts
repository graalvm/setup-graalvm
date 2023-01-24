import * as core from '@actions/core'
import {getLatestRelease, toSemVer} from '../utils'
import {lt, major, minor, valid} from 'semver'
import {findGraalVMVersion} from '../graalvm'
import {GRAALVM_RELEASES_REPO} from '../constants'

export async function checkForUpdates(
  graalVMVersion: string,
  javaVersion: string
): Promise<void> {
  if (graalVMVersion === '22.3.0' && javaVersion === '11') {
    core.notice(
      'Please consider upgrading your project to Java 17+. The GraalVM 22.3.0 release is the last to support JDK11: https://github.com/oracle/graal/issues/5063'
    )
    return
  }

  const latestRelease = await getLatestRelease(GRAALVM_RELEASES_REPO)
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
