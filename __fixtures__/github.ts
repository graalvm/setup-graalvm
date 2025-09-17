import * as github from '@actions/github'
import { jest } from '@jest/globals'

export const context = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  },
  sha: 'test-sha',
  ref: 'test-ref',
  workflow: 'test-workflow',
  job: 'test-job',
  runId: '12345'
}
export const getOctokit = jest.fn<typeof github.getOctokit>()
