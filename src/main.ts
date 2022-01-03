import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    let graalVMHome
    core.exportVariable('GRAALVM_HOME', graalVMHome)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
