import { walkStream as fsWalkStream, Entry } from "@nodelib/fs.walk"
import fs from "fs-extra"
import reporter from "gatsby-cli/lib/reporter"
import path from "path"
import { IGatsbyPage } from "../redux/types"
import { websocketManager } from "./websocket-manager"
import { isWebpackStatusPending } from "./webpack-status"
import { store } from "../redux"

import { IExecutionResult } from "../query/types"

interface IPageData {
  componentChunkName: IGatsbyPage["componentChunkName"]
  matchPath?: IGatsbyPage["matchPath"]
  path: IGatsbyPage["path"]
  staticQueryHashes: Array<string>
}

export interface IPageDataWithQueryResult extends IPageData {
  result: IExecutionResult
}

export function fixedPagePath(pagePath: string): string {
  return pagePath === `/` ? `index` : pagePath
}

function getFilePath(publicDir: string, pagePath: string): string {
  return path.join(
    publicDir,
    `page-data`,
    fixedPagePath(pagePath),
    `page-data.json`
  )
}

export async function readPageData(
  publicDir: string,
  pagePath: string
): Promise<IPageDataWithQueryResult> {
  const filePath = getFilePath(publicDir, pagePath)
  const rawPageData = await fs.readFile(filePath, `utf-8`)

  return JSON.parse(rawPageData)
}

export async function removePageData(
  publicDir: string,
  pagePath: string
): Promise<void> {
  const filePath = getFilePath(publicDir, pagePath)

  if (fs.existsSync(filePath)) {
    return await fs.remove(filePath)
  }

  return Promise.resolve()
}

export function pageDataExists(publicDir: string, pagePath: string): boolean {
  return fs.existsSync(getFilePath(publicDir, pagePath))
}

export async function writePageData(
  publicDir: string,
  {
    componentChunkName,
    matchPath,
    path: pagePath,
    staticQueryHashes,
  }: IPageData
): Promise<IPageDataWithQueryResult> {
  const inputFilePath = path.join(
    publicDir,
    `..`,
    `.cache`,
    `json`,
    `${pagePath.replace(/\//g, `_`)}.json`
  )
  const outputFilePath = getFilePath(publicDir, pagePath)
  const result = await fs.readJSON(inputFilePath)
  const body = {
    componentChunkName,
    path: pagePath,
    matchPath,
    result,
    staticQueryHashes,
  }
  const bodyStr = JSON.stringify(body)
  // transform asset size to kB (from bytes) to fit 64 bit to numbers
  const pageDataSize = Buffer.byteLength(bodyStr) / 1000

  store.dispatch({
    type: `ADD_PAGE_DATA_STATS`,
    payload: {
      filePath: outputFilePath,
      size: pageDataSize,
    },
  })

  await fs.outputFile(outputFilePath, bodyStr)
  return body
}

let isFlushPending = false
let isFlushing = false

export function isFlushEnqueued(): boolean {
  return isFlushPending
}

export async function flush(): Promise<void> {
  if (isFlushing) {
    // We're already in the middle of a flush
    return
  }
  isFlushPending = false
  isFlushing = true
  const {
    pendingPageDataWrites,
    components,
    pages,
    program,
    staticQueriesByTemplate,
  } = store.getState()

  const { pagePaths, templatePaths } = pendingPageDataWrites

  const pagesToWrite = Array.from(templatePaths).reduce(
    (set, componentPath) => {
      const templateComponent = components.get(componentPath)
      if (templateComponent) {
        templateComponent.pages.forEach(set.add.bind(set))
      }
      return set
    },
    new Set(pagePaths.values())
  )

  for (const pagePath of pagesToWrite) {
    const page = pages.get(pagePath)

    // It's a gloomy day in Bombay, let me tell you a short story...
    // Once upon a time, writing page-data.json files were atomic
    // After this change (#24808), they are not and this means that
    // between adding a pending write for a page and actually flushing
    // them, a page might not exist anymore щ（ﾟДﾟщ）
    // This is why we need this check
    if (page) {
      const staticQueryHashes =
        staticQueriesByTemplate.get(page.componentPath) || []

      const result = await writePageData(
        path.join(program.directory, `public`),
        {
          ...page,
          staticQueryHashes,
        }
      )

      if (program?._?.[0] === `develop`) {
        websocketManager.emitPageData({
          id: pagePath,
          result,
        })
      }
    }
  }

  store.dispatch({
    type: `CLEAR_PENDING_PAGE_DATA_WRITES`,
  })
  isFlushing = false
  return
}

export function enqueueFlush(): void {
  if (isWebpackStatusPending()) {
    isFlushPending = true
  } else {
    flush()
  }
}

export async function handleStalePageData(): Promise<void> {
  if (!(await fs.pathExists(`public/page-data`))) {
    return
  }

  // public directory might have stale page-data files from previous builds
  // we get the list of those and compare against expected page-data files
  // and remove ones that shouldn't be there anymore

  const activity = reporter.activityTimer(`Cleaning up stale page-data`)
  activity.start()

  const pageDataFilesFromPreviousBuilds = await new Promise<Set<string>>(
    (resolve, reject) => {
      const results = new Set<string>()

      const stream = fsWalkStream(`public/page-data`)

      stream.on(`data`, (data: Entry) => {
        if (data.name === `page-data.json`) {
          results.add(data.path)
        }
      })

      stream.on(`error`, e => {
        reject(e)
      })

      stream.on(`end`, () => resolve(results))
    }
  )

  const expectedPageDataFiles = new Set<string>()
  store.getState().pages.forEach(page => {
    expectedPageDataFiles.add(getFilePath(`public`, page.path))
  })

  const deletionPromises: Array<Promise<void>> = []
  pageDataFilesFromPreviousBuilds.forEach(pageDataFilePath => {
    if (!expectedPageDataFiles.has(pageDataFilePath)) {
      deletionPromises.push(fs.remove(pageDataFilePath))
    }
  })

  await Promise.all(deletionPromises)

  activity.end()
}
