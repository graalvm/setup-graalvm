/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 GitHub, Inc. and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Forked from https://github.com/actions/setup-java/blob/5b36705a13905facb447b6812d613a06a07e371d/src/cleanup-java.ts
 */

import * as core from '@actions/core'
import * as constants from './constants'
import {save} from './cache'
import {generateReports} from './features/reports'

/**
 * Check given input and run a save process for the specified package manager
 * @returns Promise that will be resolved when the save process finishes
 */
async function saveCache(): Promise<void> {
  const cache = core.getInput(constants.INPUT_CACHE)
  return cache ? save(cache) : Promise.resolve()
}

/**
 * The save process is best-effort, and it should not make the workflow fail
 * even though this process throws an error.
 * @param promise the promise to ignore error from
 * @returns Promise that will ignore error reported by the given promise
 */
async function ignoreError(promise: Promise<void>): Promise<unknown> {
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
  generateReports()
  await ignoreError(saveCache())
}

if (require.main === module) {
  run()
} else {
  // https://nodejs.org/api/modules.html#modules_accessing_the_main_module
  core.info('the script is loaded as a module, so skipping the execution')
}
