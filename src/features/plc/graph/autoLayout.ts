import type { EditorNodeUi, WireUi } from "./editorTypes"

// вычисляем inA/inB по wires (как в build/validate)
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

export function autoLayout(nodes: EditorNodeUi[], wires: WireUi[]): EditorNodeUi[] {
    const computed = applyWires(nodes, wires)
    const idSet = new Set(computed.map((n) => n.localId))
    const byId = new Map<number, EditorNodeUi>()
    for (const n of computed) byId.set(n.localId, n)

    // DFS memo: col (level)
    const visiting = new Set<number>()
    const memo = new Map<number, number>()

    function colOf(id: number): number {
        const m = memo.get(id)
        if (m != null) return m
        if (visiting.has(id)) {
            // цикл — layout всё равно не построим корректно
            throw new Error(`Cycle detected while layout. Node=${id}`)
        }
        visiting.add(id)

        const n = byId.get(id)!
        const deps: number[] = []
        if (n.inA !== -1 && idSet.has(n.inA)) deps.push(n.inA)
        if (n.inB !== -1 && idSet.has(n.inB)) deps.push(n.inB)

        const c = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(colOf))

        visiting.delete(id)
        memo.set(id, c)
        return c
    }

    // 1) col
    const withCol = computed.map((n) => ({ ...n, col: colOf(n.localId) }))

    // 2) row внутри каждой колонки (стабильно)
    const groups = new Map<number, EditorNodeUi[]>()
    for (const n of withCol) {
        const c = n.col ?? 0
        const arr = groups.get(c) ?? []
        arr.push(n)
        groups.set(c, arr)
    }

    for (const [c, arr] of groups) {
        arr.sort((a, b) => a.localId - b.localId)
        arr.forEach((n, idx) => (n.row = idx))
    }

    // вернуть в исходном порядке по localId (чтобы не ломать UX),
    // но с заполненными col/row
    const byLocal = new Map<number, EditorNodeUi>()
    for (const n of withCol) byLocal.set(n.localId, n)

    const COL_W = 260
    const ROW_H = 140
    const PAD_X = 40
    const PAD_Y = 40

    for (const n of withCol) {
        const c = n.col ?? 0
        const r = n.row ?? 0
        n.x = PAD_X + c * COL_W
        n.y = PAD_Y + r * ROW_H
    }

    return nodes
        .slice()
        .sort((a, b) => a.localId - b.localId)
        .map((n) => byLocal.get(n.localId) ?? n)
}
