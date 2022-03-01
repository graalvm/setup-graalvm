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
  return findJavaHomeInSubfolder(await downloadAndExtract(downloadUrl))
}

export async function downloadExtractAndCacheJDK(
  downloadUrl: string,
  toolName: string,
  version: string
): Promise<string> {
  let toolPath = tc.find(toolName, version)
  if (toolPath) {
    core.info(`Found ${toolName} ${version} in tool-cache @ ${toolPath}`)
  } else {
    const extractDir = await downloadAndExtract(downloadUrl)
    core.info(`Adding ${toolName} ${version} to tool-cache ...`)
    toolPath = await tc.cacheDir(extractDir, toolName, version)
  }
  return findJavaHomeInSubfolder(toolPath)
}

async function downloadAndExtract(downloadUrl: string): Promise<string> {
  const downloadPath = await tc.downloadTool(downloadUrl)
  if (downloadUrl.endsWith('.tar.gz')) {
    return await tc.extractTar(downloadPath)
  } else if (downloadUrl.endsWith('.zip')) {
    return await tc.extractZip(downloadPath)
  } else {
    throw new Error(`Unexpected filetype downloaded: ${downloadUrl}`)
  }
}

function findJavaHomeInSubfolder(searchPath: string): string {
  const baseContents = readdirSync(searchPath)
  if (baseContents.length === 1) {
    return join(searchPath, baseContents[0], c.JDK_HOME_SUFFIX)
  } else {
    throw new Error(
      `Unexpected amount of directory items found: ${baseContents.length}`
    )
  }
}
