import type { EditorNodeUi, WireUi } from "./editorTypes"

// apply wires: inA/inB берём только из wires (истина)
function applyWires(nodes: EditorNodeUi[], wires: WireUi[]): EditorNodeUi[] {
    const inA = new Map<number, number>()
    const inB = new Map<number, number>()

    for (const w of wires) {
        if (w.toPort === "A") inA.set(w.toNode, w.fromNode)
        else inB.set(w.toNode, w.fromNode)
    }

    return nodes.map((n) => ({
        ...n,
        inA: inA.get(n.localId) ?? -1,
        inB: inB.get(n.localId) ?? -1,
    }))
}

function toIntSafe(s: string): number {
    const n = Number(s)
    return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toNumSafe(s: string): number {
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
}

// детерминированный topo-sort по computed inA/inB (+ зависимость MUX2 от selector paramInt)
function topoSortLocalIds(nodes: EditorNodeUi[]): number[] {
    const ids = nodes.map((n) => n.localId)
    const idSet = new Set(ids)

    const deps = new Map<number, number[]>()
    for (const n of nodes) {
        const d: number[] = []

        if (n.inA !== -1 && idSet.has(n.inA)) d.push(n.inA)
        if (n.inB !== -1 && idSet.has(n.inB)) d.push(n.inB)

        // MUX2: paramInt = localId селектора (BOOL)
        if (n.type === "MUX2") {
            const selLocalId = toIntSafe(n.paramInt)
            if (selLocalId !== -1 && idSet.has(selLocalId)) d.push(selLocalId)
        }

        deps.set(n.localId, d)
    }

    const inDeg = new Map<number, number>()
    for (const id of ids) inDeg.set(id, 0)
    for (const [to, d] of deps) for (const _ of d) inDeg.set(to, (inDeg.get(to) ?? 0) + 1)

    const q: number[] = []
    for (const [id, deg] of inDeg) if (deg === 0) q.push(id)
    q.sort((a, b) => a - b)

    const out: number[] = []
    while (q.length > 0) {
        const id = q.shift()!
        out.push(id)

        for (const [to, d] of deps) {
            if (!d.includes(id)) continue
            const nd = (inDeg.get(to) ?? 0) - 1
            inDeg.set(to, nd)
            if (nd === 0) {
                q.push(to)
                q.sort((a, b) => a - b)
            }
        }
    }

    if (out.length !== ids.length) {
        const stuck = ids.filter((id) => !out.includes(id)).sort((a, b) => a - b)
        throw new Error(`Cycle detected (feedback loop). Nodes: ${stuck.join(", ")}`)
    }
    return out
}

export function buildGraph(cycleMsStr: string, nodes: EditorNodeUi[], wires: WireUi[]) {
    const cycleMs = toIntSafe(cycleMsStr)
    const wiredNodes = applyWires(nodes, wires)

    // Можно оставить порядок topo для “красивого” сохранения,
    // НО ссылки inA/inB НЕ трогаем — они должны остаться localId.
    const order = topoSortLocalIds(wiredNodes)
    const byId = new Map<number, EditorNodeUi>()
    for (const n of wiredNodes) byId.set(n.localId, n)

    const outNodes = order.map((localId) => {
        const n = byId.get(localId)!

        return {
            id: localId, // стабильный id = localId (ссылки тоже по localId)
            type: n.type,
            valueType: n.valueType,
            inA: n.inA, // <-- ВАЖНО: localId источника
            inB: n.inB, // <-- ВАЖНО: localId источника
            paramInt: toIntSafe(n.paramInt),
            paramFloat: toNumSafe(n.paramFloat),
            paramMs: toIntSafe(n.paramMs),
            flags: toIntSafe(n.flags),
        }
    })

    return { cycleMs, nodes: outNodes }
}
