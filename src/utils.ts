import * as c from './constants'
import * as core from '@actions/core'
import * as httpClient from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import {Octokit} from '@octokit/core'
import {join} from 'path'
import {readdirSync} from 'fs'

// Set up Octokit in the same way as @actions/github (see https://git.io/Jy9YP)
const baseUrl = process.env['GITHUB_API_URL'] || 'https://api.github.com'
const GitHub = Octokit.defaults({
  baseUrl,
  request: {
    agent: new httpClient.HttpClient().getAgent(baseUrl)
  }
})

export async function getLatestRelease(
  repo: string
): Promise<c.LatestReleaseResponse['data']> {
  const githubToken = core.getInput('github-token')
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHub(options)
  return (
    await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
      owner: c.GRAALVM_GH_USER,
      repo
    })
  ).data
}

export async function downloadAndExtractJDK(
  downloadUrl: string
): Promise<string> {
  const downloadPath = await tc.downloadTool(downloadUrl)
  if (downloadUrl.endsWith('.tar.gz')) {
    await tc.extractTar(downloadPath, c.GRAALVM_BASE)
  } else if (downloadUrl.endsWith('.zip')) {
    await tc.extractZip(downloadPath, c.GRAALVM_BASE)
  } else {
    throw new Error(`Unexpected filetype downloaded: ${downloadUrl}`)
  }
  return findJavaHomeInSubfolder(c.GRAALVM_BASE)
}

export function findJavaHomeInSubfolder(searchPath: string): string {
  const baseContents = readdirSync(searchPath)
  if (baseContents.length === 1) {
    return join(searchPath, baseContents[0], c.JDK_HOME_SUFFIX)
  } else {
    throw new Error(
      `Unexpected amount of directory items found: ${baseContents.length}`
    )
  }
}
