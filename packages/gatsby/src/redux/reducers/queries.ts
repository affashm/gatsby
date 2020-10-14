import {
  ActionsUnion,
  IComponentQueryState,
  IGatsbyState,
  IQueryState,
} from "../types"

type QueryId = string // page query path or static query id
type ComponentPath = string
type NodeId = string
type ConnectionName = string

const FLAG_DIRTY_PAGE = 1
const FLAG_DIRTY_TEXT = 2
const FLAG_DIRTY_DATA = 4

const initialState = (): IGatsbyState["queries"] => {
  return {
    byNode: new Map<NodeId, Set<QueryId>>(),
    byConnection: new Map<ConnectionName, Set<QueryId>>(),
    trackedQueries: new Map<QueryId, IQueryState>(),
    trackedComponents: new Map<ComponentPath, IComponentQueryState>(),
  }
}

const initialQueryState = (): IQueryState => {
  return {
    dirty: -1, // unknown, must be set right after init
  }
}

const initialComponentState = (): IComponentQueryState => {
  return {
    queryText: ``,
    queries: new Set<QueryId>(),
  }
}

export function queriesReducer(
  state: IGatsbyState["queries"] = initialState(),
  action: ActionsUnion
): IGatsbyState["queries"] {
  switch (action.type) {
    case `DELETE_CACHE`:
      return initialState()

    case `CREATE_PAGE`: {
      const { path, componentPath } = action.payload
      if (!state.trackedQueries.has(path) || action.contextModified) {
        const query = registerQuery(state, path)
        setDirtyFlag(query, FLAG_DIRTY_PAGE)
      }
      registerComponent(state, componentPath).queries.add(path)
      return state
    }
    case `DELETE_PAGE`: {
      const { path, componentPath } = action.payload
      const component = state.trackedComponents.get(componentPath)
      if (component) {
        component.queries.delete(path)
      }
      state.trackedQueries.delete(path)
      return state
    }
    case `QUERY_EXTRACTED`: {
      // TODO: use hash instead of a query text
      const { componentPath, query } = action.payload
      const component = registerComponent(state, componentPath)
      if (component.queryText !== query) {
        // Invalidate all pages associated with a component when query text changes
        component.queries.forEach(queryId => {
          const query = state.trackedQueries.get(queryId)
          if (query) {
            setDirtyFlag(query, FLAG_DIRTY_TEXT)
          }
        })
        component.queryText = query
      }
      return state
    }
    case `REPLACE_STATIC_QUERY`: {
      // Only called when static query text has changed, so no need to compare
      const { id } = action.payload
      setDirtyFlag(registerQuery(state, id), FLAG_DIRTY_TEXT)
      return state
    }
    case `REMOVE_STATIC_QUERY`: {
      state.trackedQueries.delete(action.payload)
      return state
    }
    case `CREATE_COMPONENT_DEPENDENCY`: {
      const { path: queryId, nodeId, connection } = action.payload
      if (nodeId) {
        getQueryIds(state.byNode, nodeId).add(queryId)
      }
      if (connection) {
        getQueryIds(state.byConnection, connection).add(queryId)
      }
      return state
    }
    case `DELETE_COMPONENTS_DEPENDENCIES`: {
      state.byNode.forEach(queryIds => {
        for (const path of action.payload.paths) {
          queryIds.delete(path)
        }
      })
      state.byConnection.forEach(queryIds => {
        for (const path of action.payload.paths) {
          queryIds.delete(path)
        }
      })
      return state
    }
    case `CREATE_NODE`:
    case `DELETE_NODE`: {
      const node = action.payload
      const queriesByNode = state.byNode.get(node.id) ?? []
      const queriesByConnection =
        state.byConnection.get(node.internal.type) ?? []

      queriesByNode.forEach(queryId => {
        const query = state.trackedQueries.get(queryId)
        if (query) {
          setDirtyFlag(query, FLAG_DIRTY_DATA)
        }
      })
      queriesByConnection.forEach(queryId => {
        const query = state.trackedQueries.get(queryId)
        if (query) {
          setDirtyFlag(query, FLAG_DIRTY_DATA)
        }
      })
      return state
    }
    case `PAGE_QUERY_RUN`: {
      const { path } = action.payload
      const query = registerQuery(state, path)
      query.dirty = 0
      return state
    }
    default:
      return state
  }
}

function setDirtyFlag(query: IQueryState, dirtyFlag: number): void {
  if (query.dirty === -1) {
    query.dirty = dirtyFlag
  } else {
    query.dirty = query.dirty | dirtyFlag
  }
}

function registerQuery(
  state: IGatsbyState["queries"],
  queryId: QueryId
): IQueryState {
  let query = state.trackedQueries.get(queryId)
  if (!query) {
    query = initialQueryState()
    state.trackedQueries.set(queryId, query)
  }
  return query
}

function registerComponent(
  state: IGatsbyState["queries"],
  componentPath: string
): IComponentQueryState {
  let component = state.trackedComponents.get(componentPath)
  if (!component) {
    component = initialComponentState()
    state.trackedComponents.set(componentPath, component)
  }
  return component
}

function getQueryIds(map: Map<string, Set<string>>, key: string): Set<string> {
  let set = map.get(key)
  if (!set) {
    set = new Set<string>()
    map.set(key, set)
  }
  return set
}
