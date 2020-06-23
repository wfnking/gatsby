const locksLookup = new Map<string, ServiceLock>()
const pendingRuns = new Map<
  string,
  {
    deps: string[]
    callback: Function
  }
>()

function getRunningDeps(
  dependencies: string[],
  collectedDeps: Set<string> = new Set()
): Set<string> {
  if (dependencies.length === 0) {
    return collectedDeps
  }

  dependencies.forEach(depName => {
    const runningLock = locksLookup.get(depName)
    if (!runningLock) {
      return
    }

    if (runningLock.isPending || runningLock.isRunning > 0) {
      collectedDeps.add(runningLock.name)
    }

    getRunningDeps(runningLock.deps, collectedDeps)
  })

  return collectedDeps
}

class ServiceLock {
  isPending = false
  isRunning = 0
  deps: string[]
  name: string

  constructor(name: string, deps: string[] = []) {
    this.name = name
    this.deps = deps

    locksLookup.set(name, this)
  }

  markAsPending(): void {
    this.isPending = true
  }

  markStartRun(): void {
    this.isPending = false
    this.isRunning++
  }

  markEndRun(): void {
    this.isRunning--

    if (this.isRunning === 0 && !this.isPending) {
      // if this service is no longer running - see if any pending dependant runs
      // were unblocked and run those
      pendingRuns.forEach((pendingRun, serviceName) => {
        const runningDeps = getRunningDeps(pendingRun.deps)
        if (runningDeps.size === 0) {
          pendingRuns.delete(serviceName)
          pendingRun.callback()
        }
      })
    }
  }

  runOrEnqueue(arg: Function | { run: Function; enqueue: Function }): void {
    let run: Function, enqueue: Function

    if (typeof arg === `function`) {
      run = enqueue = arg
    } else if (typeof arg === `object` && arg.run && arg.enqueue) {
      run = arg.run
      enqueue = arg.enqueue
    } else {
      throw new Error(`Invalid runOrEnqueue argument: ${arg}`)
    }

    if (pendingRuns.has(this.name)) {
      return
    }

    const runningDeps = getRunningDeps(this.deps)
    if (runningDeps.size === 0) {
      run()
      return
    }

    pendingRuns.set(this.name, {
      deps: this.deps,
      callback: enqueue,
    })
  }
}

export const schemaRebuildLock = new ServiceLock(`schema-rebuild`)
export const createPagesLock = new ServiceLock(`create-pages`, [
  `schema-rebuild`,
])
export const queryRunningLock = new ServiceLock(`query-running`, [
  `create-pages`,
  `schema-rebuild`,
])
export const requiresWriterLock = new ServiceLock(`requires-writer`, [
  `create-pages`,
])
export const webpackLock = new ServiceLock(`webpack`, [`requires-writer`])
export const pageDataFlushLock = new ServiceLock(`page-data-flush`, [
  `webpack`,
  `query-running`,
])
