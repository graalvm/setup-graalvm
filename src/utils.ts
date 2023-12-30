import * as c from './constants'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as httpClient from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import {exec as e, ExecOptions} from '@actions/exec'
import * as fs from 'fs'
import {readdirSync, readFileSync} from 'fs'
import {createHash, randomUUID} from 'crypto'
import {join} from 'path'
import {Base64} from "js-base64";
import {Octokit} from '@octokit/rest';
import fetch from "node-fetch";
import {Context} from "@actions/github/lib/context";
import {DateTime} from 'luxon'
import {NumberValue} from "d3";
import {JSDOM} from 'jsdom';

// Set up Octokit for github.com only and in the same way as @actions/github (see https://git.io/Jy9YP)
const baseUrl = 'https://api.github.com'
const GitHubDotCom = Octokit.defaults({
  baseUrl,
  request: {
    agent: new httpClient.HttpClient().getAgent(baseUrl)
  }
})

export async function exec(
    commandLine: string,
    args?: string[],
    options?: ExecOptions | undefined
): Promise<void> {
  const exitCode = await e(commandLine, args, options)
  if (exitCode !== 0) {
    throw new Error(
        `'${[commandLine]
            .concat(args || [])
            .join(' ')}' exited with a non-zero code: ${exitCode}`
    )
  }
}

export async function getLatestRelease(
    repo: string
): Promise<c.LatestReleaseResponse['data']> {
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
        owner: c.GRAALVM_GH_USER,
        repo
      })
  ).data
}

export async function getTaggedRelease(
    repo: string,
    tag: string
): Promise<c.LatestReleaseResponse['data']> {
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
        owner: c.GRAALVM_GH_USER,
        repo,
        tag
      })
  ).data
}

export async function getMatchingTags(
    tagPrefix: string
): Promise<c.MatchingRefsResponse['data']> {
  const githubToken = getGitHubToken()
  const options = githubToken.length > 0 ? {auth: githubToken} : {}
  const octokit = new GitHubDotCom(options)
  return (
      await octokit.request(
          'GET /repos/{owner}/{repo}/git/matching-refs/tags/{tagPrefix}',
          {
            owner: c.GRAALVM_GH_USER,
            repo: c.GRAALVM_RELEASES_REPO,
            tagPrefix
          }
      )
  ).data
}

export async function downloadAndExtractJDK(
    downloadUrl: string
): Promise<string> {
  return findJavaHomeInSubfolder(
      await extract(await tc.downloadTool(downloadUrl))
  )
}

export async function downloadExtractAndCacheJDK(
    downloader: () => Promise<string>,
    toolName: string,
    version: string
): Promise<string> {
  const semVersion = toSemVer(version)
  let toolPath = tc.find(toolName, semVersion)
  if (toolPath) {
    core.info(`Found ${toolName} ${version} in tool-cache @ ${toolPath}`)
  } else {
    const extractDir = await extract(await downloader())
    core.info(`Adding ${toolName} ${version} to tool-cache ...`)
    toolPath = await tc.cacheDir(extractDir, toolName, semVersion)
  }
  return findJavaHomeInSubfolder(toolPath)
}

export function calculateSHA256(filePath: string): string {
  const hashSum = createHash('sha256')
  hashSum.update(readFileSync(filePath))
  return hashSum.digest('hex')
}

async function extract(downloadPath: string): Promise<string> {
  if (c.GRAALVM_FILE_EXTENSION === '.tar.gz') {
    return await tc.extractTar(downloadPath)
  } else if (c.GRAALVM_FILE_EXTENSION === '.zip') {
    return await tc.extractZip(downloadPath)
  } else {
    throw new Error(
        `Unexpected filetype downloaded: ${c.GRAALVM_FILE_EXTENSION}`
    )
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

/**
 * This helper turns GraalVM version numbers (e.g., `22.0.0.2`) into valid
 * semver.org versions (e.g., `22.0.0-2`), which is needed because
 * @actions/tool-cache uses `semver` to validate versions.
 */
export function toSemVer(version: string): string {
  const parts = version.split('.')
  const major = parts[0]
  const minor = parts.length > 1 ? parts[1] : '0'
  const patch = parts.length > 2 ? parts.slice(2).join('-') : '0'
  return `${major}.${minor}.${patch}`
}

export function isPREvent(): boolean {
  return process.env[c.ENV_GITHUB_EVENT_NAME] === c.EVENT_NAME_PULL_REQUEST
}

function getGitHubToken(): string {
  return core.getInput(c.INPUT_GITHUB_TOKEN)
}

function getCommitSha(): string {
    return process.env.GITHUB_SHA || "default_sha"
}

function getPrBaseBranchSha(): string {
    return  process.env.GITHUB_BASE_REF || "default_branch"
}

export async function createPRComment(content: string): Promise<void> {
  if (!isPREvent()) {
    throw new Error('Not a PR event.')
  }
  const context = github.context
  try {
    await github.getOctokit(getGitHubToken()).rest.issues.createComment({
      ...context.repo,
      issue_number: context.payload.pull_request?.number as number,
      body: content
    })
  } catch (err) {
    core.error(
        `Failed to create pull request comment. Please make sure this job has 'write' permissions for the 'pull-requests' scope (see https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions)? Internal error: ${err}`
    )
  }
}

export async function createRef(sha: string) {
    try {
        const commitSha = getCommitSha()
        const ref = 'refs/' + c.METRIC_PATH + '/' + commitSha
        core.info(`creating reference with ref '${ref}' for metrics tree ${sha}`);
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        });
        await octokit.request(c.OCTOKIT_ROUTE_CREATE_REF,
            {
                ...github.context.repo,
                ref,
                sha,
            }
        );
    } catch(err) {
        core.error(
            `Failed to create ref. Please make sure that the referred sha '${sha}' exist.`
        )
    }
}

export async function createTree(metadataJson: string): Promise<string> {
    try {
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        });
        const context = github.context
        core.info(`creating tree at ${context.repo.owner}/${context.repo.repo}`);
        const response = await octokit.request(c.OCTOKIT_ROUTE_CREATE_TREE,
            {
                ...context.repo,
                tree: [
                    {
                        path: "metadataJson",
                        mode: "100644",
                        type: "blob",
                        content: metadataJson,
                    },
                ],
            }
        );

        return response.data.sha;
    } catch (err) {
        core.error(
            `Creating metrics tree failed.`
        )
        return ''
    }
}

export async function getPrBaseBranchMetrics(): Promise<string> {
    if (!isPREvent()) {
        throw new Error('Not a PR event.')
    }
    try {
        const context = github.context
        const octokit = new Octokit({
            auth: getGitHubToken(),
            request: {
                fetch: fetch,
            },
        })
        const baseCommitSha = await getBaseBranchCommitSha(octokit, context)
        const blobTreeSha = await getBlobTreeSha(octokit, context, baseCommitSha)
        const blobSha = await getBlobSha(octokit, context, blobTreeSha)
        return await getBlobContent(octokit, context, blobSha)
    } catch (err) {
        core.error('Failed to get build metrics for PR base branch.')
        return ''
    }
}

async function getBaseBranchCommitSha(octokit: Octokit, context: Context): Promise<string> {
    const prBaseBranchName = getPrBaseBranchSha()
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_REF + c.OCTOKIT_REF_BRANCHE_PREFIX + '/' + prBaseBranchName, {
        ...context.repo,
        ref: c.OCTOKIT_REF_BRANCHE_PREFIX + '/' + prBaseBranchName,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.object.sha
}

async function getBlobTreeSha(octokit: Octokit, context: Context, baseCommitSha: string): Promise<string> {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_REF_METRICS + baseCommitSha, {
        ...context.repo,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.object.sha
}

async function getBlobSha(octokit: Octokit, context: Context, blobTreeSha: string) {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_TREE + blobTreeSha,    {
        ...context.repo,
        tree_sha: blobTreeSha,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return data.tree[0].sha
}

async function getBlobContent(octokit: Octokit, context: Context, blobSha: string) {
    const { data } = await octokit.request(c.OCTOKIT_ROUTE_GET_BLOB + blobSha, {
        ...context.repo,
        file_sha: blobSha,
        headers: c.OCTOKIT_BASIC_HEADER
    })
    return Base64.decode(data.content)
}

function formatDate(date: string, n: number) {
    // Parse the timestamp and convert it to the desired timezone
    const commitTime = DateTime.fromISO(date, { zone: 'utc' });
    const commitTimeLocal = commitTime.setZone('Europe/Berlin');

    if (n >= 30) {
        return commitTimeLocal.toFormat('dd.MM.\nHH:mm');
    } else {
        return commitTimeLocal.toFormat('dd.MM.yyyy \n HH:mm');
    }
}

async function getImageData(commitSha: string) {
    const octokit = new Octokit({
        auth: getGitHubToken(),
        request: {
            fetch: fetch,
        },
    });

    try {

        const context = github.context
        const refSha = await getBlobTreeSha(octokit, context, commitSha)
        const blobSha = await getBlobSha(octokit, context, refSha)
        const content =  await getBlobContent(octokit, context, blobSha)
        // Get the reference SHA


        await console.log("refsha:" + refSha)

        // Get the tree SHA

        // Get the blob content

        //await console.log("blobsha:" + blobSha)
        const data = await JSON.parse(content);

        await console.log("data" + data.image_details.total_bytes / 1e6)

        return [
            data.image_details.total_bytes / 1e6,
            data.image_details.code_area.bytes / 1e6,
            data.image_details.image_heap.bytes / 1e6,
        ];
    } catch (error) {
        console.error('Error fetching image data: ', error);
        return [0, 0, 0];
    }
}

// Function to fetch data
async function fetchData(): Promise<any> {
    const octokit = new Octokit({
        auth: getGitHubToken(),
        request: {
            fetch: fetch,
        },
    });
    return new Promise(async (resolve, reject) => {

        const response = await octokit.request(c.OCTOKIT_ROUTE_GET_EVENTS, {
            ...github.context.repo,
            headers: c.OCTOKIT_BASIC_HEADER
        })

        // get push events
        const pushEvents = await getPushEvents(response);

        // Prepare data
        const timestamps = [];
        const shas = [];
        const commitMessages = []

        for (const pushEvent of pushEvents) {
            timestamps.push(pushEvent.created_at);
            shas.push(pushEvent.payload.commits[pushEvent.payload.commits.length - 1].sha);
            commitMessages.push(pushEvent.payload.commits[pushEvent.payload.commits.length - 1].message)
        }

        // Extract data for plotting
        const commitDates = timestamps.map(timestamp => formatDate(timestamp, Number(core.getInput('build-counts-for-metric-history'))));
        const imageDataPromises = shas.map(async sha => await getImageData(sha));
        const imageData = await Promise.all(imageDataPromises);
        await core.info(JSON.stringify(imageDataPromises))
        await core.info(JSON.stringify(imageData))
        const imageSizes = imageData.filter(entry => entry).map(entry => entry[0]);
        const codeAreaSizes = imageData.filter(entry => entry).map(entry => entry[1]);
        const imageHeapSizes = imageData.filter(entry => entry).map(entry => entry[2]);

        const data= {
            commitDates: commitDates,
            commitShas: shas,
            commitMessages: commitMessages,
            imageData: imageData,
            imageSizes: imageSizes,
            codeAreaSizes: codeAreaSizes,
            imageHeapSizes: imageHeapSizes
        }

        resolve(data);
    });
}

async function getPushEvents(response: any) {
    const eventsArray = response.data;
    var linkHeader = response.headers.link;
    const nextPageMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    var commitsLeft = Number(core.getInput('build-counts-for-metric-history'));
    var pushEvents = [];

    for (const event of eventsArray) {
        if (commitsLeft <= 0) {
            break;
        }
        if (event.type === "PushEvent" && event.payload.ref === process.env.GITHUB_REF) {
            pushEvents.push(event);
            commitsLeft -= 1;
        }
    }

    while (linkHeader && linkHeader.includes('rel="next"') && commitsLeft > 0) {
        // Extract the URL for the next page
        const nextPageMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        const nextPageUrl = nextPageMatch ? nextPageMatch[1] : null;

        // Make the request for the next page
        const response = await fetch(nextPageUrl, {
            headers: {
                Authorization: `Bearer ${getGitHubToken()}`,
            },
        });

        const responseJson = await response.json();

        for (const event of responseJson) {
            if (commitsLeft <= 0) {
                break;
            }
            if (event.type === "PushEvent" && event.payload.ref === process.env.GITHUB_REF) {
                pushEvents.push(event);
                commitsLeft -= 1;
            }
        }

        // Update linkHeader for the next iteration
        linkHeader = response.headers.get("link");
    }
    return pushEvents;
}

export async function createChart() {
    try {
        // Use dynamic import for d3
        const d3 = await import('d3');
        const data = await fetchData();
        const commitDates = data.commitDates.reverse();
        const chartData = [
            {
                label: 'Total Image Sizes',
                data: data.imageSizes.reverse(),
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
            },
            {
                label: 'Code Area Sizes',
                data: data.codeAreaSizes.reverse(),
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
            },
            {
                label: 'Image Heap Sizes',
                data: data.imageHeapSizes.reverse(),
                borderColor: 'rgba(255, 205, 86, 1)',
                backgroundColor: 'rgba(255, 205, 86, 0.2)',
            },
        ];

        const tableData = [
            {
                label: 'Commit Date',
                data: commitDates,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
            },
            {
                label: 'Commit Sha',
                data: data.commitShas.reverse(),
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
            },
            {
                label: 'Commit Message',
                data: data.commitMessages.reverse(),
                borderColor: 'rgba(255, 205, 86, 1)',
                backgroundColor: 'rgba(255, 205, 86, 0.2)',
            }
        ]


        // Use JSDOM to create a virtual DOM
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        global.document = dom.window.document;

        const svgWidth = 1000;
        const svgHeight = 400;

        const margin = {top: 20, right: 20, bottom: 60, left: 50};
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;

        const maxImageSizes: NumberValue = d3.max(convertToNumberValueIterable(data.imageSizes)) as NumberValue

        const xScale = d3.scaleBand().domain(commitDates).range([0, width - 200]).padding(0.1);
        const yScale = d3.scaleLinear().domain([0, 10]).range([height, 0]);

        const svg = d3.select('body')
            .append('svg')
            .attr('width', svgWidth)
            .attr('height', svgHeight);

        const chart = svg.append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Create a legend
        const legend = chart.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width - 190}, 0)`);

        // Add dashed grid lines for the x-axis
        chart.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0, ${height})`)
            .call(
                d3.axisBottom(xScale)
                    .tickSizeInner(-height)
                    .tickSizeOuter(0)
            )
            .selectAll('.tick line')
            .attr('stroke', 'lightgrey')
            .attr('stroke-dasharray', '2,2')
            .attr('stroke-width', 1);

        // Add dashed grid lines for the y-axis
        chart.append('g')
            .attr('class', 'grid')
            .call(
                d3.axisLeft(yScale)
                    .tickSizeInner(-width)
                    .tickSizeOuter(0)
            )
            .selectAll('.tick line')
            .attr('stroke', 'lightgrey')
            .attr('stroke-dasharray', '2,2')
            .attr('stroke-width', 1);

        // X-axis
        chart.append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('transform', 'rotate(-45)');

        // Y-axis
        chart.append('g')
            .call(d3.axisLeft(yScale))

        chart.append('text')
            .attr("text-anchor", "end")
            .attr('transform', 'rotate(-90)')
            .attr('y', -margin.left + 20)
            .attr('x', -margin.top - 100)
            //.attr('dy', '1em')
            .text('Size in MB');

        chartData.forEach((dataset, index) => {
            // Connect data points with lines
            chart.append('path')
                .datum(dataset.data)
                .attr('fill', 'none')
                .attr('stroke', dataset.borderColor)
                .attr('stroke-width', 2)
                .attr('d', d3.line<number>()
                    .x((d, i) => xScale(commitDates[i])! + xScale.bandwidth() / 2)
                    .y(d => yScale(d)!)
                );

            // Add circles at data points for each dataset
            const circles = chart.selectAll(`circle.${dataset.label}`)
                .data(dataset.data)
                .enter().append('circle')
                .attr('class', dataset.label)
                .attr('cx', (d, i) => xScale(commitDates[i])! + xScale.bandwidth() / 2)
                .attr('cy', d => yScale(<number | { valueOf(): number }>d))
                .attr('r', 5)
                .attr('fill', dataset.borderColor);

            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${index * 20})`);

            legendItem.append('rect')
                .attr('width', 18)
                .attr('height', 18)
                .attr('fill', dataset.borderColor);

            legendItem.append('text')
                .attr('x', 24)
                .attr('y', 9)
                .attr('dy', '.35em')
                .style('text-anchor', 'start')
                .text(dataset.label);
        });

        // Create a table
        const table = d3.select('body')
            .append('table')
            .style('margin-top', '20px')
            .style('margin-left', '50px');

        // Extract dataset labels
        const datasetLabels = tableData.map(d => d.label);

        // Create table headers
        const thead = table.append('thead');
        thead.append('tr')
            .selectAll('th')
            .data(datasetLabels) // Use your dataset labels here
            .enter()
            .append('th')
            .text(d => d);

        // Create table rows
        const tbody = table.append('tbody');
        const rows = tbody.selectAll('tr')
            .data(commitDates) // Assuming commitDates is used as the base data for rows
            .enter()
            .append('tr');

        // Populate table cells
        rows.selectAll('td')
            .data((d, i) => [commitDates[i], data.commitShas[i], data.commitMessages[i]]) // Adjust based on your data structure
            .enter()
            .append('td')
            .text(d => d);

        // Save the SVG as a file
        fs.writeFileSync('output_point_plot.svg', d3.select('body').html());
        console.log('The point plot SVG file was created.');
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function convertToNumberValueIterable(arr: (number | string | undefined)[]): Iterable<NumberValue> {
    // Filter out undefined values and convert strings to numbers
    const filteredArr: (number | string)[] = arr.filter(el => typeof el === 'number' || (typeof el === 'string' && !isNaN(Number(el)))) as (number | string)[];

    // Map the filtered array elements to NumberValue objects
    const numberValueIterable: Iterable<NumberValue> = {
        [Symbol.iterator]: function* () {
            for (let num of filteredArr) {
                if (typeof num === 'number' ) {
                    num = num +3
                }
                yield { value: typeof num === 'string' ? parseInt(num, 10) : num } as unknown as NumberValue;
            }
        },
    };

    return numberValueIterable;
}


export async function saveImage(content: string): Promise<string> {
    const octokit = new Octokit({
        auth: core.getInput("TOKEN"),
        request: {
            fetch: fetch,
        },
    });

    const reg = /(?<=<svg width=".*" height=".*".*)>/
    content = content.replace(reg, " xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">");
    content = content.replace(/\<table(.|\n)*<\/table>/, "");

    const svgContent =`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20001102//EN" "http://www.w3.org/TR/2000/CR-SVG-20001102/DTD/svg-20001103.dtd">
  <!-- Include the SVG content here -->
${content}
`
    const imageName = String(randomUUID()) + '.svg'

    const response = await octokit.gists.create({
        description: "build history metrics diagramm",
        public: false,
        files: {
            imageName: {
                content: svgContent
            }
        }
    });

    core.info(JSON.stringify(response.data.id))
    core.info(JSON.stringify(response))
    const gistsResponse = (await octokit.request(`GET /gists/${response.data.id}`, {
        gist_id: 'GIST_ID',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })).data

    core.info(JSON.stringify(gistsResponse))
    core.info(JSON.stringify(gistsResponse.files))
    core.info(JSON.stringify(gistsResponse.files[imageName].raw_url))
    return gistsResponse.files[imageName].raw_url
}