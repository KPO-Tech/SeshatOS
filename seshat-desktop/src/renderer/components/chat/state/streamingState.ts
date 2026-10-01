import type { StoreApi } from 'zustand'
import type { SessionState } from './sessionStoreTypes'
import type { StreamingBlock } from './sessionTypes'

type StreamingActions = Pick<
  SessionState,
  | 'appendStreamBlock'
  | 'getStreaming'
  | 'setStreaming'
  | 'updateStreamBlock'
  | 'clearStreaming'
  | 'isSessionStreaming'
  | 'setIsStreaming'
>
type SessionSet = StoreApi<SessionState>['setState']
type SessionGet = StoreApi<SessionState>['getState']

export function createStreamingActions(
  set: SessionSet,
  get: SessionGet,
  emptyStreaming: StreamingBlock[],
): StreamingActions {
  return {
    appendStreamBlock: (sessionId, block) =>
      set((state) => ({
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: [...(state.streamingBySession[sessionId] ?? []), block],
        },
      })),

    getStreaming: (sessionId) => get().streamingBySession[sessionId] ?? emptyStreaming,

    setStreaming: (sessionId, blocks) =>
      set((state) => ({
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: blocks,
        },
      })),

    updateStreamBlock: (sessionId, index, delta) =>
      set((state) => ({
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: (state.streamingBySession[sessionId] ?? []).map((block) =>
            block.index === index ? ({ ...block, ...delta } as StreamingBlock) : block
          ),
        },
      })),

    clearStreaming: (sessionId) =>
      set((state) => ({
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: [],
        },
      })),

    isSessionStreaming: (sessionId) => Boolean(get().isStreamingBySession[sessionId]),

    setIsStreaming: (sessionId, value) =>
      set((state) => ({
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [sessionId]: value,
        },
      })),
  }
}
