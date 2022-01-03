import * as c from './constants'
import * as core from '@actions/core'
import * as graalvm from './graalvm'
import {join} from 'path'
import {mkdirP} from '@actions/io'
import {setUpDependencies} from './dependencies'
import {setUpGUComponents} from './gu'
import {setUpGraalVMTrunk} from './graalvm-trunk'
import {setUpWindowsEnvironment} from './msvc'

async function run(): Promise<void> {
  try {
    const graalvmVersion: string = core.getInput('version', {required: true})
    const javaVersion: string = core.getInput('java-version', {required: true})
    const componentsString: string = core.getInput('components')
    const components: string[] =
      componentsString.length > 0 ? componentsString.split(',') : []
    const setJavaHome = core.getInput('set-java-home') === 'true'

    if (c.IS_WINDOWS) {
      setUpWindowsEnvironment()
    }
    setUpDependencies(components)

    await mkdirP(c.GRAALVM_BASE)

    // Download or build GraalVM
    let graalVMHome
    switch (graalvmVersion) {
      case c.VERSION_LATEST:
        graalVMHome = await graalvm.setUpGraalVMLatest(javaVersion)
        break
      case c.VERSION_DEV:
        graalVMHome = await graalvm.setUpGraalVMDevBuild(javaVersion)
        break
      case c.VERSION_TRUNK:
        graalVMHome = await setUpGraalVMTrunk(javaVersion, components)
        break
      default:
        graalVMHome = await graalvm.setUpGraalVMRelease(
          graalvmVersion,
          javaVersion
        )
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
      if (graalvmVersion === c.VERSION_TRUNK) {
        // components built from source, nothing to do
      } else {
        await setUpGUComponents(graalVMHome, components)
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
