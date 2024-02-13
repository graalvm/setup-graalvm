import * as path from 'path'
import {expect, test} from '@jest/globals'
import {toSemVer} from '../src/utils'

test('convert version', async () => {
  for (var inputAndExpectedOutput of [
    ['22', '22.0.0'],
    ['22.0', '22.0.0'],
    ['22.0.0', '22.0.0'],
    ['22.0.0.2', '22.0.0-2'],
    ['22-ea', '22.0.0-ea'],
    ['22.0-ea', '22.0.0-ea'],
    ['22.0.0-ea', '22.0.0-ea']
  ]) {
    expect(toSemVer(inputAndExpectedOutput[0])).toBe(inputAndExpectedOutput[1])
  }
})

test('convert invalid version', async () => {
  for (var input of ['dev', 'abc', 'a.b.c']) {
    let error = new Error('unexpected')
    try {
      toSemVer(input)
    } catch (err) {
      if (!(err instanceof Error)) {
        fail(`Unexpected non-Error: ${err}`)
      }
      error = err
    }

    expect(error).not.toBeUndefined()
    expect(error.message).toContain('Unable to convert')
  }
})
