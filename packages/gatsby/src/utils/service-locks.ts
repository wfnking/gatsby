const chalk = require(`chalk`)

const locksLookup = new Map<string, ServiceLock>()
const pendingRuns = new Map<
  string,
  {
    deps: string[]
    callback: Function
  }
>()

let lastStatus = ``

function log(...args: any[]): void {
  const extraLogs: any[] = []

  // status of services
  const newStatusBuilder: {
    [record: string]: "IDLE" | "PENDING" | "RUNNING"
  } = {}
  locksLookup.forEach(runningLock => {
    newStatusBuilder[runningLock.name] =
      runningLock.isRunning > 0
        ? `RUNNING`
        : runningLock.isPending
        ? `PENDING`
        : `IDLE`
  })

  const newStatus = JSON.stringify(newStatusBuilder)
    .replace(/RUNNING/g, chalk.green(`RUNNING`))
    .replace(/PENDING/g, chalk.yellow(`PENDING`))
    .replace(/IDLE/g, chalk.gray(`IDLE`))

  if (newStatus !== lastStatus) {
    extraLogs.push(chalk.cyan(`STATUS CHANGED`), newStatus)
    lastStatus = newStatus
  } else {
    extraLogs.push(chalk.gray(`NOTHING CHANGED`), newStatus)
  }

  // pending execution
  const pendingExecutions: string[] = []
  pendingRuns.forEach((_pendingRun, serviceName) => {
    pendingExecutions.push(serviceName)
  })

  if (pendingExecutions.length > 0) {
    extraLogs.push(
      chalk.blueBright(`PENDING RUNS`),
      pendingExecutions.join(`, `)
    )
  } else {
    extraLogs.push(chalk.gray(`NO PENDING RUNS`))
  }

  console.log(chalk.magenta(`[lock]`), ...args, ...extraLogs)
}

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

    log(
      `[${this.name}] ${chalk.yellow(`mark as pending`)}` // (reason: "${reason}")`
    )
  }

  markStartRun(): void {
    this.isPending = false
    this.isRunning++

    log(`[${this.name}] ${chalk.green(`mark start run`)}`)
  }

  markEndRun(): void {
    this.isRunning--

    log(`[${this.name}] ${chalk.red(`mark end run`)}`)

    if (this.isRunning === 0 && !this.isPending) {
      // if this service is no longer running - see if any pending dependant runs
      // were unblocked and run those
      pendingRuns.forEach((pendingRun, serviceName) => {
        const runningDeps = getRunningDeps(pendingRun.deps)
        if (runningDeps.size === 0) {
          log(
            `Delayed run "${serviceName}" (not blocked anymore by any of [${pendingRun.deps.join(
              `, `
            )}])`
          )

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
      log(
        `Discarding queued run for "${this.name}" because run is already pending`
      )
      return
    }

    const runningDeps = getRunningDeps(this.deps)
    if (runningDeps.size === 0) {
      log(
        `Run "${this.name}" (not blocked by any of [${this.deps.join(`, `)}])`
      )

      run()
      return
    }

    pendingRuns.set(this.name, {
      deps: this.deps,
      callback: enqueue,
    })

    log(
      `Delay run for "${this.name}" because [${Array.from(runningDeps).join(
        `, `
      )}]`
    )
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
