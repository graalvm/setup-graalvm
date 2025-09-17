import * as cache from '@actions/cache'
import { jest } from '@jest/globals'

export const ReserveCacheError = cache.ReserveCacheError
export const restoreCache = jest.fn<typeof cache.restoreCache>()
export const saveCache = jest.fn<typeof cache.saveCache>()
export const ValidationError = cache.ValidationError
