import * as c from './constants'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as httpClient from '@actions/http-client'
import * as io from '@actions/io'
import * as path from 'path'
import * as stream from 'stream'
import * as util from 'util'
import {IHeaders} from '@actions/http-client/interfaces'
import {IncomingHttpHeaders} from 'http'
import {RetryHelper} from '@actions/tool-cache/lib/retry-helper'
import {calculateSHA256} from './utils'
import {ok} from 'assert'
import {v4 as uuidv4} from 'uuid'

interface GDSArtifactsResponse {
  readonly items: GDSArtifact[]
}

interface GDSArtifact {
  readonly id: string
  readonly checksum: string
}

interface GDSErrorResponse {
  readonly code: string
  readonly message: string
}

export async function downloadGraalVMEELegacy(
  gdsToken: string,
  version: string,
  javaVersion: string
): Promise<string> {
  const userAgent = `GraalVMGitHubAction/1.1.5 (arch:${c.GRAALVM_ARCH}; os:${c.GRAALVM_PLATFORM}; java:${javaVersion})`
  const baseArtifact = await fetchArtifact(
    userAgent,
    'isBase:True',
    version,
    javaVersion
  )
  return downloadArtifact(gdsToken, userAgent, baseArtifact)
}

export async function fetchArtifact(
  userAgent: string,
  metadata: string,
  version: string,
  javaVersion: string
): Promise<GDSArtifact> {
  const http = new httpClient.HttpClient(userAgent)

  let filter
  if (version === c.VERSION_LATEST) {
    filter = `sortBy=displayName&sortOrder=DESC&limit=1` // latest and only one item
  } else {
    filter = `metadata=version:${version}`
  }

  const catalogOS = c.IS_MACOS ? 'macos' : c.GRAALVM_PLATFORM
  const requestUrl = `${c.GDS_BASE}/artifacts?productId=${c.GDS_GRAALVM_PRODUCT_ID}&${filter}&metadata=java:jdk${javaVersion}&metadata=os:${catalogOS}&metadata=arch:${c.GRAALVM_ARCH}&metadata=${metadata}&status=PUBLISHED&responseFields=id&responseFields=checksum`
  core.debug(`Requesting ${requestUrl}`)
  const response = await http.get(requestUrl, {accept: 'application/json'})
  if (response.message.statusCode !== 200) {
    throw new Error(
      `Unable to find JDK${javaVersion}-based GraalVM EE ${version}`
    )
  }
  const artifactResponse = JSON.parse(
    await response.readBody()
  ) as GDSArtifactsResponse
  if (artifactResponse.items.length !== 1) {
    throw new Error(
      artifactResponse.items.length > 1
        ? `Found more than one GDS artifact. ${c.ERROR_HINT}`
        : `Unable to find GDS artifact. Are you sure version: '${version}' is correct?`
    )
  }
  return artifactResponse.items[0]
}

async function downloadArtifact(
  gdsToken: string,
  userAgent: string,
  artifact: GDSArtifact
): Promise<string> {
  let downloadPath
  try {
    downloadPath = await downloadTool(
      `${c.GDS_BASE}/artifacts/${artifact.id}/content`,
      userAgent,
      {
        accept: 'application/x-yaml',
        'x-download-token': gdsToken
      }
    )
  } catch (err) {
    if (err instanceof HTTPError && err.httpStatusCode) {
      if (err.httpStatusCode === 401) {
        throw new Error(
          `The provided "gds-token" was rejected (reason: "${err.gdsError.message}", opc-request-id: ${err.headers['opc-request-id']})`
        )
      }
    }
    throw err
  }
  const sha256 = calculateSHA256(downloadPath)
  if (sha256.toLowerCase() !== artifact.checksum.toLowerCase()) {
    throw new Error(
      `Checksum does not match (expected: "${artifact.checksum}", got: "${sha256}")`
    )
  }
  return downloadPath
}

/**
 * Simplified fork of tool-cache's downloadTool [1] with the ability to set a custom user agent.
 * [1] https://github.com/actions/toolkit/blob/2f164000dcd42fb08287824a3bc3030dbed33687/packages/tool-cache/src/tool-cache.ts
 */

class HTTPError extends Error {
  constructor(
    readonly httpStatusCode: number | undefined,
    readonly gdsError: GDSErrorResponse,
    readonly headers: IncomingHttpHeaders
  ) {
    super(`Unexpected HTTP response: ${httpStatusCode}`)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

async function downloadTool(
  url: string,
  userAgent: string,
  headers?: IHeaders
): Promise<string> {
  const dest = path.join(getTempDirectory(), uuidv4())
  await io.mkdirP(path.dirname(dest))
  core.debug(`Downloading ${url}`)
  core.debug(`Destination ${dest}`)

  const maxAttempts = 3
  const minSeconds = 10
  const maxSeconds = 20
  const retryHelper = new RetryHelper(maxAttempts, minSeconds, maxSeconds)
  return await retryHelper.execute(
    async () => {
      return await downloadToolAttempt(url, userAgent, dest || '', headers)
    },
    (err: Error) => {
      if (err instanceof HTTPError && err.httpStatusCode) {
        // Don't retry anything less than 500, except 408 Request Timeout and 429 Too Many Requests
        if (
          err.httpStatusCode < 500 &&
          err.httpStatusCode !== 408 &&
          err.httpStatusCode !== 429
        ) {
          return false
        }
      }

      // Otherwise retry
      return true
    }
  )
}

async function downloadToolAttempt(
  url: string,
  userAgent: string,
  dest: string,
  headers?: IHeaders
): Promise<string> {
  if (fs.existsSync(dest)) {
    throw new Error(`Destination file path ${dest} already exists`)
  }

  // Get the response headers
  const http = new httpClient.HttpClient(userAgent, [], {
    allowRetries: false
  })

  const response: httpClient.HttpClientResponse = await http.get(url, headers)
  if (response.message.statusCode !== 200) {
    const errorResponse = JSON.parse(
      await response.readBody()
    ) as GDSErrorResponse
    const err = new HTTPError(
      response.message.statusCode,
      errorResponse,
      response.message.headers
    )
    core.debug(
      `Failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`
    )
    throw err
  }

  // Download the response body
  const pipeline = util.promisify(stream.pipeline)
  let succeeded = false
  try {
    await pipeline(response.message, fs.createWriteStream(dest))
    core.debug('Download complete')
    succeeded = true
    return dest
  } finally {
    // Error, delete dest before retry
    if (!succeeded) {
      core.debug('Download failed')
      try {
        await io.rmRF(dest)
      } catch (err) {
        core.debug(`Failed to delete '${dest}'. ${err}`)
      }
    }
  }
}

function getTempDirectory(): string {
  const tempDirectory = process.env['RUNNER_TEMP'] || ''
  ok(tempDirectory, 'Expected RUNNER_TEMP to be defined')
  return tempDirectory
}
