import type { NodeType } from "./nodeCatalog"

export type EditorNodeUi = {
    localId: number
    type: NodeType
    valueType: 0 | 1 | 2
    inA: number
    inB: number
    paramInt: string
    paramFloat: string
    paramMs: string
    flags: string
    col?: number
    row?: number
    x?: number
    y?: number
}


export type PlcNodeDefJson = {
    id: number // индекс после remap
    type: string
    valueType: number
    inA: number
    inB: number
    paramInt: number
    paramFloat: number
    paramMs: number
    flags: number
}

export type PlcGraphDefJson = {
    cycleMs: number
    nodes: PlcNodeDefJson[]
}

export type ValidationError = {
    nodeLocalId?: number
    field?: string
    message: string
}

export const VALUE_TYPES = [0, 1, 2] as const
export type ValueType = (typeof VALUE_TYPES)[number]

export type PortId = "A" | "B"   // пока 2 входа

export type WireUi = {
    fromNode: number   // localId источника
    toNode: number     // localId назначения
    toPort: PortId     // "A" | "B"
}

export type ProjectUiV2 = {
    version: 2
    cycleMs: string
    nodes: EditorNodeUi[]
    wires: WireUi[]
}

