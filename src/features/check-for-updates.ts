import * as core from '@actions/core'
import {getTaggedRelease, toSemVer} from '../utils'
import {lt, major, minor, valid} from 'semver'
import {findGraalVMVersion} from '../graalvm'
import {GRAALVM_RELEASES_REPO} from '../constants'

export async function checkForUpdates(
  graalVMVersion: string,
  javaVersion: string
): Promise<void> {
  if (
    graalVMVersion.length > 0 &&
    (javaVersion === '17' || javaVersion === '19')
  ) {
    const recommendedJDK = javaVersion === '17' ? '17' : '20'
    core.notice(
      `A new GraalVM release is available! Please consider upgrading to GraalVM for JDK ${recommendedJDK}. Instructions: https://github.com/graalvm/setup-graalvm#migrating-from-graalvm-223-or-earlier-to-the-new-graalvm-for-jdk-17-and-later`
    )
    return
  }

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
