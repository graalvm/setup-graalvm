import * as c from './constants'
import * as core from '@actions/core'
import * as graalvm from './graalvm'
import {join} from 'path'
import {setUpDependencies} from './dependencies'
import {setUpGUComponents} from './gu'
import {setUpMandrel} from './mandrel'
import {setUpNativeImageMusl} from './features'
import {setUpWindowsEnvironment} from './msvc'

async function run(): Promise<void> {
  try {
    const graalvmVersion = core.getInput('version', {required: true})
    const javaVersion = core.getInput('java-version', {required: true})
    const componentsString: string = core.getInput('components')
    const components: string[] =
      componentsString.length > 0 ? componentsString.split(',') : []
    const setJavaHome = core.getInput('set-java-home') === 'true'
    const enableNativeImageMusl = core.getInput('native-image-musl') === 'true'

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
        graalVMHome = await graalvm.setUpGraalVMLatest(javaVersion)
        break
      case c.VERSION_DEV:
        graalVMHome = await graalvm.setUpGraalVMDevBuild(javaVersion)
        break
      default:
        if (graalvmVersion.startsWith(c.MANDREL_NAMESPACE)) {
          graalVMHome = await setUpMandrel(graalvmVersion, javaVersion)
        } else {
          graalVMHome = await graalvm.setUpGraalVMRelease(
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
        await setUpGUComponents(graalVMHome, components)
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
