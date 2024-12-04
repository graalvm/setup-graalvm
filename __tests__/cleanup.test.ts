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

import {run as cleanup} from '../src/cleanup'
import * as core from '@actions/core'
import * as cache from '@actions/cache'

describe('cleanup', () => {
  let spyWarning: jest.SpyInstance<void, Parameters<typeof core.warning>>
  let spyInfo: jest.SpyInstance<void, Parameters<typeof core.info>>
  let spyCacheSave: jest.SpyInstance<
    ReturnType<typeof cache.saveCache>,
    Parameters<typeof cache.saveCache>
  >
  let spyJobStatusSuccess: jest.SpyInstance

  beforeEach(() => {
    spyWarning = jest.spyOn(core, 'warning')
    spyWarning.mockImplementation(() => null)
    spyInfo = jest.spyOn(core, 'info')
    spyInfo.mockImplementation(() => null)
    spyCacheSave = jest.spyOn(cache, 'saveCache')
    createStateForSuccessfulRestore()
  })
  afterEach(() => {
    resetState()
  })

  it('does not fail nor warn even when the save process throws a ReserveCacheError', async () => {
    spyCacheSave.mockImplementation((paths: string[], key: string) =>
      Promise.reject(
        new cache.ReserveCacheError(
          'Unable to reserve cache with key, another job may be creating this cache.'
        )
      )
    )
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return name === 'cache' ? 'gradle' : ''
    })
    await cleanup()
    expect(spyCacheSave).toHaveBeenCalled()
    expect(spyWarning).not.toHaveBeenCalled()
  })

  it('does not fail even though the save process throws error', async () => {
    spyCacheSave.mockImplementation((paths: string[], key: string) =>
      Promise.reject(new Error('Unexpected error'))
    )
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return name === 'cache' ? 'gradle' : ''
    })
    await cleanup()
    expect(spyCacheSave).toHaveBeenCalled()
  })
})

function resetState() {
  jest.spyOn(core, 'getState').mockReset()
}

/**
 * Create states to emulate a successful restore process.
 */
function createStateForSuccessfulRestore() {
  jest.spyOn(core, 'getState').mockImplementation(name => {
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
