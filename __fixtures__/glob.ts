import * as glob from '@actions/glob'
import { jest } from '@jest/globals'

export const create = jest.fn<typeof glob.create>()
