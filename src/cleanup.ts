import * as core from '@actions/core'
import {generateReports} from './features/reports'

/**
 * The save process is best-effort, and it should not make the workflow fail
 * even though this process throws an error.
 * @param promise the promise to ignore error from
 * @returns Promise that will ignore error reported by the given promise
 */
async function ignoreErrors(promise: Promise<void>): Promise<unknown> {
  /* eslint-disable github/no-then */
  return new Promise(resolve => {
    promise
      .catch(error => {
        core.warning(error)
        resolve(void 0)
      })
      .then(resolve)
  })
}

export async function run(): Promise<void> {
  await ignoreErrors(generateReports())
}

if (require.main === module) {
  run()
} else {
  // https://nodejs.org/api/modules.html#modules_accessing_the_main_module
  core.info('the script is loaded as a module, so skipping the execution')
}
