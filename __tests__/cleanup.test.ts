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
 * Forked from https://github.com/actions/setup-java/blob/5b36705a13905facb447b6812d613a06a07e371d/__tests__/cleanup-java.test.ts
 */

import { jest } from '@jest/globals'
import * as cache from '../__fixtures__/cache.js'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/cache', () => cache)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/cleanup.js')

describe('cleanup', () => {
  beforeEach(() => {
    core.info.mockImplementation(() => null)
    core.warning.mockImplementation(() => null)
    core.debug.mockImplementation(() => null)
    createStateForSuccessfulRestore()
  })
  afterEach(() => {
    resetState()
  })

  it('does not fail nor warn even when the save process throws a ReserveCacheError', async () => {
    cache.saveCache.mockImplementation((_paths: string[], _key: string) =>
      Promise.reject(
        new cache.ReserveCacheError('Unable to reserve cache with key, another job may be creating this cache.')
      )
    )
    core.getInput.mockImplementation((name: string) => {
      return name === 'cache' ? 'gradle' : ''
    })
    await run()
    expect(cache.saveCache).toHaveBeenCalled()
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('does not fail even though the save process throws error', async () => {
    cache.saveCache.mockImplementation((_paths: string[], _key: string) =>
      Promise.reject(new Error('Unexpected error'))
    )
    core.getInput.mockImplementation((name: string) => {
      return name === 'cache' ? 'gradle' : ''
    })
    await run()
    expect(cache.saveCache).toHaveBeenCalled()
  })
})

function resetState() {
  core.getState.mockReset()
}

/**
 * Create states to emulate a successful restore process.
 */
function createStateForSuccessfulRestore() {
  core.getState.mockImplementation((name) => {
    switch (name) {
      case 'cache-primary-key':
        return 'setup-java-cache-primary-key'
      case 'cache-matched-key':
        return 'setup-java-cache-matched-key'
      default:
        return ''
    }
  })
}
