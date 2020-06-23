import { createPagesLock, webpackLock } from "../service-locks"

beforeEach(() => {
  jest.resetModules()
})

test(`Run immediately if not blocked`, () => {
  const webpackRun = jest.fn()

  webpackLock.runOrEnqueue(webpackRun)

  // callback was run immediately, because nothing is blocking it
  expect(webpackRun).toBeCalled()
})

test(`Blocks running webpack when createPages is pending`, () => {
  const webpackRun = jest.fn()

  createPagesLock.markAsPending()

  webpackLock.runOrEnqueue(webpackRun)

  // callback did NOT run immediately, because dependency run is pending
  expect(webpackRun).not.toBeCalled()

  // "run" createPages service
  createPagesLock.markStartRun()
  createPagesLock.markEndRun()

  // callback run after blocking services finished
  expect(webpackRun).toBeCalled()
})

test(`Blocks running webpack when createPages is running`, () => {
  const webpackRun = jest.fn()

  // "run" createPages service
  createPagesLock.markStartRun()

  webpackLock.runOrEnqueue(webpackRun)

  // callback did NOT run immediately, because dependency run is running
  expect(webpackRun).not.toBeCalled()

  createPagesLock.markEndRun()

  // callback run after blocking services finished
  expect(webpackRun).toBeCalled()
})

describe(`run or enqueue callbacks`, () => {
  it(`will use "run" if not blocked`, () => {
    const webpackRun = jest.fn()
    const enqueuedWebpackRun = jest.fn()

    webpackLock.runOrEnqueue({
      run: webpackRun,
      enqueue: enqueuedWebpackRun,
    })

    // callback was run immediately, and we expect "run" to be called
    expect(webpackRun).toBeCalled()
    expect(enqueuedWebpackRun).not.toBeCalled()
  })

  it(`will use "enqueue" if blocked`, () => {
    const webpackRun = jest.fn()
    const enqueuedWebpackRun = jest.fn()

    // "run" createPages service
    createPagesLock.markStartRun()

    webpackLock.runOrEnqueue({
      run: webpackRun,
      enqueue: enqueuedWebpackRun,
    })

    // we are still blocked - we expect neither to be run yet
    expect(webpackRun).not.toBeCalled()
    expect(enqueuedWebpackRun).not.toBeCalled()

    createPagesLock.markEndRun()

    // not blocked anymore - expect to run "enqueue"
    expect(webpackRun).not.toBeCalled()
    expect(enqueuedWebpackRun).toBeCalled()
  })
})
