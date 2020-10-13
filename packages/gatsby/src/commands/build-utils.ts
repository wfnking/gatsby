import fs from "fs-extra"
import path from "path"

import {
  remove as removePageHtmlFile,
  getPageHtmlFilePath,
} from "../utils/page-html"
import { removePageData, fixedPagePath } from "../utils/page-data"
import { IGatsbyState } from "../redux/types"

const checkFolderIsEmpty = (path: string): boolean =>
  fs.existsSync(path) && !fs.readdirSync(path).length

export const getChangedPageDataKeys = (
  state: IGatsbyState,
  cachedPageData: Map<string, string>
): Array<string> => {
  if (cachedPageData && state.pageData) {
    const pageKeys: Array<string> = []
    state.pageData.forEach((newPageDataHash: string, key: string) => {
      if (!cachedPageData.has(key)) {
        pageKeys.push(key)
      } else {
        const previousPageDataHash = cachedPageData.get(key)
        if (newPageDataHash !== previousPageDataHash) {
          pageKeys.push(key)
        }
      }
    })
    return pageKeys
  }

  return [...state.pages.keys()]
}

export const collectRemovedPageData = (
  state: IGatsbyState,
  cachedPageData: Map<string, string>
): Array<string> => {
  if (cachedPageData && state.pageData) {
    const deletedPageKeys: Array<string> = []
    cachedPageData.forEach((_value: string, key: string) => {
      if (!state.pageData.has(key)) {
        deletedPageKeys.push(key)
      }
    })
    return deletedPageKeys
  }
  return []
}

const checkAndRemoveEmptyDir = (publicDir: string, pagePath: string): void => {
  const pageHtmlDirectory = path.dirname(
    getPageHtmlFilePath(publicDir, pagePath)
  )
  const pageDataDirectory = path.join(
    publicDir,
    `page-data`,
    fixedPagePath(pagePath)
  )
  // if page's folder is empty also remove matching page-data folder
  if (checkFolderIsEmpty(pageHtmlDirectory)) {
    fs.removeSync(pageHtmlDirectory)
  }
  if (checkFolderIsEmpty(pageDataDirectory)) {
    fs.removeSync(pageDataDirectory)
  }
}

const sortedPageKeysByNestedLevel = (pageKeys: Array<string>): Array<string> =>
  pageKeys.sort((a, b) => {
    const currentPagePathValue = a.split(`/`).length
    const previousPagePathValue = b.split(`/`).length
    return previousPagePathValue - currentPagePathValue
  })

export const removePageFiles = async (
  publicDir: string,
  pageKeys: Array<string>
): Promise<void> => {
  const removePages = pageKeys.map(pagePath =>
    removePageHtmlFile({ publicDir }, pagePath)
  )

  const removePageDataList = pageKeys.map(pagePath =>
    removePageData(publicDir, pagePath)
  )

  return Promise.all([...removePages, ...removePageDataList]).then(() => {
    // Sort removed pageKeys by nested directories and remove if empty.
    sortedPageKeysByNestedLevel(pageKeys).forEach(pagePath => {
      checkAndRemoveEmptyDir(publicDir, pagePath)
    })
  })
}
