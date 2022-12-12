import * as c from './constants'
import * as core from '@actions/core'
import * as graalvm from './graalvm'
import {join} from 'path'
import {setUpDependencies} from './dependencies'
import {setUpGUComponents} from './gu'
import {setUpMandrel} from './mandrel'
import {checkForUpdates} from './features/check-for-updates'
import {setUpNativeImageMusl} from './features/musl'
import {setUpWindowsEnvironment} from './msvc'
import {setUpNativeImageBuildReports} from './features/reports'

async function run(): Promise<void> {
  try {
    const graalvmVersion = core.getInput(c.INPUT_VERSION, {required: true})
    const gdsToken = core.getInput(c.INPUT_GDS_TOKEN)
    const javaVersion = core.getInput(c.INPUT_JAVA_VERSION, {required: true})
    const componentsString: string = core.getInput(c.INPUT_COMPONENTS)
    const components: string[] =
      componentsString.length > 0 ? componentsString.split(',') : []
    const setJavaHome = core.getInput(c.INPUT_SET_JAVA_HOME) === 'true'
    const enableCheckForUpdates =
      core.getInput(c.INPUT_CHECK_FOR_UPDATES) === 'true'
    const enableNativeImageMusl = core.getInput(c.INPUT_NI_MUSL) === 'true'

    if (c.IS_WINDOWS) {
      setUpWindowsEnvironment()
    }
    await setUpDependencies(components)
    if (enableNativeImageMusl) {
      await setUpNativeImageMusl()
    }

    // Download or build GraalVM
    let graalVMHome
    switch (graalvmVersion) {
      case c.VERSION_LATEST:
        graalVMHome = await graalvm.setUpGraalVMLatest(gdsToken, javaVersion)
        break
      case c.VERSION_DEV:
        graalVMHome = await graalvm.setUpGraalVMDevBuild(gdsToken, javaVersion)
        break
      default:
        if (graalvmVersion.startsWith(c.MANDREL_NAMESPACE)) {
          graalVMHome = await setUpMandrel(graalvmVersion, javaVersion)
        } else {
          if (enableCheckForUpdates) {
            await checkForUpdates(graalvmVersion, javaVersion)
          }
          graalVMHome = await graalvm.setUpGraalVMRelease(
            gdsToken,
            graalvmVersion,
            javaVersion
          )
        }
        break
    }

    // Activate GraalVM
    core.debug(`Activating GraalVM located at '${graalVMHome}'...`)
    core.exportVariable('GRAALVM_HOME', graalVMHome)
    core.addPath(join(graalVMHome, 'bin'))
    if (setJavaHome) {
      core.exportVariable('JAVA_HOME', graalVMHome)
    }

    // Set up GraalVM components (if any)
    if (components.length > 0) {
      if (graalvmVersion.startsWith(c.MANDREL_NAMESPACE)) {
        core.warning(
          `Mandrel does not support GraalVM components: ${componentsString}`
        )
      } else {
        await setUpGUComponents(gdsToken, graalVMHome, components)
      }
    }

    setUpNativeImageBuildReports(graalvmVersion)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
