import type { EditorNodeUi, WireUi } from "./editorTypes"


// как на Android: сортируем по localId, remap localId -> index, inA/inB переводим в индекс
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

function topoSortLocalIds(nodes: EditorNodeUi[]): number[] {
    const ids = nodes.map((n) => n.localId)
    const idSet = new Set(ids)

    // зависимости: node -> [deps...]
    const deps = new Map<number, number[]>()
    for (const n of nodes) {
        const d: number[] = []
        if (n.inA !== -1 && idSet.has(n.inA)) d.push(n.inA)
        if (n.inB !== -1 && idSet.has(n.inB)) d.push(n.inB)
        deps.set(n.localId, d)
    }

    // Kahn
    const inDeg = new Map<number, number>()
    for (const id of ids) inDeg.set(id, 0)

    for (const [to, d] of deps) {
        for (const from of d) {
            inDeg.set(to, (inDeg.get(to) ?? 0) + 1)
        }
    }

    const q: number[] = []
    for (const [id, deg] of inDeg) {
        if (deg === 0) q.push(id)
    }

    // детерминизм
    q.sort((a, b) => a - b)

    const out: number[] = []
    while (q.length > 0) {
        const id = q.shift()!
        out.push(id)

        // уменьшаем inDeg у тех, кто зависит от id
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
        // есть цикл
        const stuck = ids.filter((id) => !out.includes(id)).sort((a, b) => a - b)
        throw new Error(`Cycle detected (feedback loop). Nodes: ${stuck.join(", ")}`)
    }

    return out
}


export function buildGraph(cycleMsStr: string, nodes: EditorNodeUi[], wires: WireUi[]) {
    const cycleMs = Number(cycleMsStr)
    const compiledNodes = applyWires(nodes, wires)

    // 1) порядок исполнения = topo
    const order = topoSortLocalIds(compiledNodes)

    // 2) remap localId -> index (как настоящий runtime)
    const localIdToIndex = new Map<number, number>()
    order.forEach((localId, idx) => localIdToIndex.set(localId, idx))

    // 3) собрать nodes в порядке исполнения, и перевести inA/inB в индексы
    const byId = new Map<number, EditorNodeUi>()
    for (const n of compiledNodes) byId.set(n.localId, n)

    const outNodes = order.map((localId) => {
        const n = byId.get(localId)!
        const inA = n.inA === -1 ? -1 : (localIdToIndex.get(n.inA) ?? -1)
        const inB = n.inB === -1 ? -1 : (localIdToIndex.get(n.inB) ?? -1)

        return {
            id: localId, // localId оставляем как "stable id" для UI/диагностики
            type: n.type,
            valueType: n.valueType,
            inA,
            inB,
            paramInt: Number(n.paramInt),
            paramFloat: Number(n.paramFloat),
            paramMs: Number(n.paramMs),
            flags: Number(n.flags),
        }
    })

    return { cycleMs, nodes: outNodes }
}


