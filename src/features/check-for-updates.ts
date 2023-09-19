import * as core from '@actions/core'

export function checkForUpdates(
  graalVMVersion: string,
  javaVersion: string
): void {
  if (javaVersion === '20') {
    core.notice(
      'A new GraalVM release is available! Please consider upgrading to GraalVM for JDK 21: https://medium.com/graalvm/graalvm-for-jdk-21-is-here-ee01177dd12d'
    )
    return
  }
  if (
    graalVMVersion.length > 0 &&
    (javaVersion === '17' || javaVersion === '19')
  ) {
    const recommendedJDK = javaVersion === '17' ? '17' : '21'
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
  // TODO: add support for JDK-specific update checks (e.g., 17.0.X)
}
