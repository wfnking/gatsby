import { cloneDeep } from "lodash"
import { emitter, store } from "../redux"
import { rebuild } from "../schema"
import { haveEqualFields } from "../schema/infer/inference-metadata"
import { updateStateAndRunQueries } from "../query/query-watcher"
import report from "gatsby-cli/lib/reporter"
import { IGatsbyState } from "../redux/types"
import { schemaRebuildLock } from "../utils/service-locks"

type TypeMap = IGatsbyState["inferenceMetadata"]["typeMap"]
type InferenceMetadata = IGatsbyState["inferenceMetadata"]

const inferredTypesChanged = (
  typeMap: TypeMap,
  prevTypeMap: TypeMap
): boolean =>
  Object.keys(typeMap).some(
    type =>
      typeMap[type].dirty && !haveEqualFields(typeMap[type], prevTypeMap[type])
  )

let lastMetadata: InferenceMetadata

const maybeRebuildSchema = async (): Promise<void> => {
  const { inferenceMetadata } = store.getState()

  if (!inferredTypesChanged(inferenceMetadata.typeMap, lastMetadata.typeMap)) {
    return
  }

  const activity = report.activityTimer(`rebuild schema`)
  activity.start()
  await rebuild({ parentSpan: activity })
  await updateStateAndRunQueries(false, { parentSpan: activity })
  activity.end()
}

function controlledMaybeRebuildSchema(): void {
  schemaRebuildLock.runOrEnqueue(async () => {
    schemaRebuildLock.markStartRun()
    await maybeRebuildSchema()
    schemaRebuildLock.markEndRun()
  })
}

function snapshotInferenceMetadata(): void {
  const { inferenceMetadata } = store.getState()
  lastMetadata = cloneDeep(inferenceMetadata)
}

export function bootstrapSchemaHotReloader(): void {
  // Snapshot inference metadata at the time of the last schema rebuild
  // (even if schema was rebuilt elsewhere)
  // Using the snapshot later to check if inferred types actually changed since the last rebuild
  snapshotInferenceMetadata()
  emitter.on(`SET_SCHEMA`, snapshotInferenceMetadata)

  startSchemaHotReloader()
}

const boundMarkAsPending = schemaRebuildLock.markAsPending.bind(
  schemaRebuildLock
)

export function startSchemaHotReloader(): void {
  // Listen for node changes outside of a regular sourceNodes API call,
  // e.g. markdown file update via watcher
  emitter.on(`API_RUNNING_START`, boundMarkAsPending)
  emitter.on(`API_RUNNING_QUEUE_EMPTY`, controlledMaybeRebuildSchema)
}

export function stopSchemaHotReloader(): void {
  emitter.off(`API_RUNNING_START`, boundMarkAsPending)
  emitter.off(`API_RUNNING_QUEUE_EMPTY`, controlledMaybeRebuildSchema)
}
