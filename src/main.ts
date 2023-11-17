import * as c from './constants'
import * as core from '@actions/core'
import * as graalvm from './graalvm'
import * as semver from 'semver'
import {isFeatureAvailable as isCacheAvailable} from '@actions/cache'
import {join} from 'path'
import {restore} from './features/cache'
import {setUpDependencies} from './dependencies'
import {setUpGUComponents} from './gu'
import {setUpMandrel} from './mandrel'
import {checkForUpdates} from './features/check-for-updates'
import {setUpNativeImageMusl} from './features/musl'
import {setUpWindowsEnvironment} from './msvc'
import {setUpNativeImageBuildReports} from './features/reports'

async function run(): Promise<void> {
  try {
    const javaVersion = core.getInput(c.INPUT_JAVA_VERSION, {required: true})
    const distribution = core.getInput(c.INPUT_DISTRIBUTION)
    const graalVMVersion = core.getInput(c.INPUT_VERSION)
    const gdsToken = core.getInput(c.INPUT_GDS_TOKEN)
    const componentsString: string = core.getInput(c.INPUT_COMPONENTS)
    const components: string[] =
      componentsString.length > 0
        ? componentsString.split(',').map(x => x.trim())
        : []
    const setJavaHome = core.getInput(c.INPUT_SET_JAVA_HOME) === 'true'
    const cache = core.getInput(c.INPUT_CACHE)
    const enableCheckForUpdates =
      core.getInput(c.INPUT_CHECK_FOR_UPDATES) === 'true'
    const enableNativeImageMusl = core.getInput(c.INPUT_NI_MUSL) === 'true'

    if (c.IS_WINDOWS) {
      setUpWindowsEnvironment(graalVMVersion)
    }
    await setUpDependencies(components)
    if (enableNativeImageMusl) {
      await setUpNativeImageMusl()
    }

    // Download GraalVM JDK
    const isGraalVMforJDK17OrLater =
      distribution.length > 0 || graalVMVersion.length == 0
    let graalVMHome
    if (isGraalVMforJDK17OrLater) {
      if (
        enableCheckForUpdates &&
        (distribution === c.DISTRIBUTION_GRAALVM ||
          distribution === c.DISTRIBUTION_GRAALVM_COMMUNITY)
      ) {
        checkForUpdates(graalVMVersion, javaVersion)
      }
      switch (distribution) {
        case c.DISTRIBUTION_GRAALVM:
          graalVMHome = await graalvm.setUpGraalVMJDK(javaVersion)
          break
        case c.DISTRIBUTION_GRAALVM_COMMUNITY:
          graalVMHome = await graalvm.setUpGraalVMJDKCE(javaVersion)
          break
        case c.DISTRIBUTION_MANDREL:
          graalVMHome = await setUpMandrel(graalVMVersion, javaVersion)
          break
        case '':
          if (javaVersion === c.VERSION_DEV) {
            core.info(
              `This build is using GraalVM Community Edition. To select a specific distribution, use the 'distribution' option (see https://github.com/graalvm/setup-graalvm/tree/main#options).`
            )
            graalVMHome = await graalvm.setUpGraalVMJDKDevBuild()
          } else {
            core.info(
              `This build is using the new Oracle GraalVM. To select a specific distribution, use the 'distribution' option (see https://github.com/graalvm/setup-graalvm/tree/main#options).`
            )
            graalVMHome = await graalvm.setUpGraalVMJDK(javaVersion)
          }
          break
        default:
          throw new Error(`Unsupported distribution: ${distribution}`)
      }
    } else {
      const coercedJavaVersion = semver.coerce(javaVersion)
      switch (graalVMVersion) {
        case c.VERSION_LATEST:
          if (
            javaVersion.startsWith('17') ||
            (coercedJavaVersion !== null &&
              semver.gte(coercedJavaVersion, '20.0.0'))
          ) {
            core.info(
              `This build is using the new Oracle GraalVM. To select a specific distribution, use the 'distribution' option (see https://github.com/graalvm/setup-graalvm/tree/main#options).`
            )
            graalVMHome = await graalvm.setUpGraalVMJDK(javaVersion)
          } else {
            graalVMHome = await graalvm.setUpGraalVMLatest_22_X(
              gdsToken,
              javaVersion
            )
          }
          break
        case c.VERSION_DEV:
          if (gdsToken.length > 0) {
            throw new Error(
              'Downloading GraalVM EE dev builds is not supported'
            )
          }
          if (
            coercedJavaVersion !== null &&
            !semver.gte(coercedJavaVersion, '21.0.0')
          ) {
            core.warning(
              `GraalVM dev builds are only available for JDK 21. This build is now using a stable release of GraalVM for JDK ${javaVersion}.`
            )
            graalVMHome = await graalvm.setUpGraalVMJDK(javaVersion)
          } else {
            graalVMHome = await graalvm.setUpGraalVMJDKDevBuild()
          }
          break
        default:
          if (graalVMVersion.startsWith(c.MANDREL_NAMESPACE)) {
            graalVMHome = await setUpMandrel(graalVMVersion, javaVersion)
          } else {
            if (enableCheckForUpdates) {
              checkForUpdates(graalVMVersion, javaVersion)
            }
            graalVMHome = await graalvm.setUpGraalVMRelease(
              gdsToken,
              graalVMVersion,
              javaVersion
            )
          }
          break
      }
    }

    // Activate GraalVM
    core.debug(`Activating GraalVM located at '${graalVMHome}'...`)
    core.exportVariable('GRAALVM_HOME', graalVMHome)
    core.addPath(join(graalVMHome, 'bin'))
    if (setJavaHome) {
      core.exportVariable('JAVA_HOME', graalVMHome)
    }

    await setUpGUComponents(
      javaVersion,
      graalVMVersion,
      graalVMHome,
      components,
      gdsToken
    )

    if (cache && isCacheAvailable()) {
      await restore(cache)
    }
    setUpNativeImageBuildReports(isGraalVMforJDK17OrLater, graalVMVersion)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
