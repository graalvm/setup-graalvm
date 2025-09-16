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
 * Forked from https://github.com/actions/setup-java/blob/5b36705a13905facb447b6812d613a06a07e371d/__tests__/cache.test.ts
 */

import { jest } from '@jest/globals'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as cache from '../__fixtures__/cache.js'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/cache', () => cache)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { restore, save } = await import('../src/features/cache.js')

describe('dependency cache', () => {
  const ORIGINAL_RUNNER_OS = process.env['RUNNER_OS']
  const ORIGINAL_GITHUB_WORKSPACE = process.env['GITHUB_WORKSPACE']
  const ORIGINAL_CWD = process.cwd()
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'setup-graalvm-cache-'))
    switch (os.platform()) {
      case 'darwin':
        process.env['RUNNER_OS'] = 'macOS'
        break
      case 'win32':
        process.env['RUNNER_OS'] = 'Windows'
        break
      case 'linux':
        process.env['RUNNER_OS'] = 'Linux'
        break
      default:
        throw new Error(`unknown platform: ${os.platform()}`)
    }
    process.chdir(workspace)
    // This hack is necessary because @actions/glob ignores files not in the GITHUB_WORKSPACE
    // https://git.io/Jcxig
    process.env['GITHUB_WORKSPACE'] = projectRoot(workspace)
  })

  beforeEach(() => {
    core.info.mockImplementation(() => null)
    core.warning.mockImplementation(() => null)
    core.debug.mockImplementation(() => null)
  })

  afterEach(() => {
    process.chdir(ORIGINAL_CWD)
    process.env['GITHUB_WORKSPACE'] = ORIGINAL_GITHUB_WORKSPACE
    process.env['RUNNER_OS'] = ORIGINAL_RUNNER_OS
    resetState()
  })

  describe('restore', () => {
    beforeEach(() => {
      cache.restoreCache.mockImplementation((_paths: string[], _primaryKey: string) => Promise.resolve(undefined))
    })

    it('throws error if unsupported package manager specified', () => {
      return expect(restore('ant')).rejects.toThrow('unknown package manager specified: ant')
    })

    describe('for maven', () => {
      it('throws error if no pom.xml found', async () => {
        await expect(restore('maven')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/pom.xml], make sure you have checked out the target repository`
        )
      })
      it('downloads cache', async () => {
        createFile(join(workspace, 'pom.xml'))

        await restore('maven')
        expect(cache.restoreCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith('maven cache is not found')
      })
    })
    describe('for gradle', () => {
      it('throws error if no build.gradle found', async () => {
        await expect(restore('gradle')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/*.gradle*,**/gradle-wrapper.properties,buildSrc/**/Versions.kt,buildSrc/**/Dependencies.kt], make sure you have checked out the target repository`
        )
      })
      it('downloads cache based on build.gradle', async () => {
        createFile(join(workspace, 'build.gradle'))

        await restore('gradle')
        expect(cache.restoreCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith('gradle cache is not found')
      })
      it('downloads cache based on build.gradle.kts', async () => {
        createFile(join(workspace, 'build.gradle.kts'))

        await restore('gradle')
        expect(cache.restoreCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith('gradle cache is not found')
      })
    })
    it('downloads cache based on buildSrc/Versions.kt', async () => {
      createDirectory(join(workspace, 'buildSrc'))
      createFile(join(workspace, 'buildSrc', 'Versions.kt'))

      await restore('gradle')
      expect(cache.restoreCache).toHaveBeenCalled()
      expect(core.warning).not.toHaveBeenCalled()
      expect(core.info).toHaveBeenCalledWith('gradle cache is not found')
    })
    describe('for sbt', () => {
      it('throws error if no build.sbt found', async () => {
        await expect(restore('sbt')).rejects.toThrow(
          `No file in ${projectRoot(
            workspace
          )} matched to [**/*.sbt,**/project/build.properties,**/project/**.{scala,sbt}], make sure you have checked out the target repository`
        )
      })
      it('downloads cache', async () => {
        createFile(join(workspace, 'build.sbt'))

        await restore('sbt')
        expect(cache.restoreCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith('sbt cache is not found')
      })
    })
  })
  describe('save', () => {
    beforeEach(() => {
      cache.saveCache.mockImplementation((_paths: string[], _key: string) => Promise.resolve(0))
      core.warning.mockImplementation(() => null)
    })

    it('throws error if unsupported package manager specified', () => {
      return expect(save('ant')).rejects.toThrow('unknown package manager specified: ant')
    })

    it('save with -1 cacheId , should not fail workflow', async () => {
      cache.saveCache.mockImplementation(() => Promise.resolve(-1))
      createStateForMissingBuildFile()

      await save('maven')
      expect(cache.saveCache).toHaveBeenCalled()
      expect(core.warning).not.toHaveBeenCalled()
      expect(core.info).toHaveBeenCalled()
      expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
    })

    it('saves with error from toolkit, should fail workflow', async () => {
      cache.saveCache.mockImplementation(() => Promise.reject(new cache.ValidationError('Validation failed')))
      createStateForMissingBuildFile()

      expect.assertions(1)
      await expect(save('maven')).rejects.toEqual(new cache.ValidationError('Validation failed'))
    })

    describe('for maven', () => {
      it('uploads cache even if no pom.xml found', async () => {
        createStateForMissingBuildFile()
        await save('maven')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
      })
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'pom.xml'))

        await save('maven')
        expect(cache.saveCache).not.toHaveBeenCalled()
        expect(core.warning).toHaveBeenCalledWith('Error retrieving key from state.')
      })
      it('uploads cache', async () => {
        createFile(join(workspace, 'pom.xml'))
        createStateForSuccessfulRestore()

        await save('maven')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
      })
    })
    describe('for gradle', () => {
      it('uploads cache even if no build.gradle found', async () => {
        createStateForMissingBuildFile()

        await save('gradle')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
      })
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'build.gradle'))

        await save('gradle')
        expect(cache.saveCache).not.toHaveBeenCalled()
        expect(core.warning).toHaveBeenCalledWith('Error retrieving key from state.')
      })
      it('uploads cache based on build.gradle', async () => {
        createFile(join(workspace, 'build.gradle'))
        createStateForSuccessfulRestore()

        await save('gradle')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
      })
      it('uploads cache based on build.gradle.kts', async () => {
        createFile(join(workspace, 'build.gradle.kts'))
        createStateForSuccessfulRestore()

        await save('gradle')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
      })
      it('uploads cache based on buildSrc/Versions.kt', async () => {
        createDirectory(join(workspace, 'buildSrc'))
        createFile(join(workspace, 'buildSrc', 'Versions.kt'))
        createStateForSuccessfulRestore()

        await save('gradle')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
      })
    })
    describe('for sbt', () => {
      it('uploads cache even if no build.sbt found', async () => {
        createStateForMissingBuildFile()
        await save('sbt')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
      })
      it('does not upload cache if no restore run before', async () => {
        createFile(join(workspace, 'build.sbt'))

        await save('sbt')
        expect(cache.saveCache).not.toHaveBeenCalled()
        expect(core.warning).toHaveBeenCalledWith('Error retrieving key from state.')
      })
      it('uploads cache', async () => {
        createFile(join(workspace, 'build.sbt'))
        createStateForSuccessfulRestore()

        await save('sbt')
        expect(cache.saveCache).toHaveBeenCalled()
        expect(core.warning).not.toHaveBeenCalled()
        expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/^Cache saved with the key:.*/))
      })
    })
  })
})

function resetState() {
  core.getState.mockReset()
}

/**
 * Create states to emulate a restore process without build file.
 */
function createStateForMissingBuildFile() {
  core.getState.mockImplementation((name) => {
    switch (name) {
      case 'cache-primary-key':
        return 'setup-graalvm-cache-'
      default:
        return ''
    }
  })
}

/**
 * Create states to emulate a successful restore process.
 */
function createStateForSuccessfulRestore() {
  core.getState.mockImplementation((name) => {
    switch (name) {
      case 'cache-primary-key':
        return 'setup-graalvm-cache-primary-key'
      case 'cache-matched-key':
        return 'setup-graalvm-cache-matched-key'
      default:
        return ''
    }
  })
}

function createFile(path: string) {
  core.info(`created a file at ${path}`)
  fs.writeFileSync(path, '')
}

function createDirectory(path: string) {
  core.info(`created a directory at ${path}`)
  fs.mkdirSync(path)
}

function projectRoot(workspace: string): string {
  if (os.platform() === 'darwin') {
    return `/private${workspace}`
  } else {
    return workspace
  }
}
