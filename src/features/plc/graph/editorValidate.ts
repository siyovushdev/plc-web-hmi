import type { EditorNodeUi, ValidationError, WireUi } from "./editorTypes"
import { NODE_SPEC } from "./nodeUiSpec"

function isInt(s: string): boolean {
    if (s.trim() === "") return false
    const n = Number(s)
    return Number.isInteger(n)
}

function isNum(s: string): boolean {
    if (s.trim() === "") return false
    const n = Number(s)
    return Number.isFinite(n)
}

function toInt(s: string, def = 0): number {
    const n = Number(s)
    return Number.isFinite(n) ? Math.trunc(n) : def
}

// topo по computed inA/inB
function topoSortOrThrow(nodes: EditorNodeUi[]): { ok: true } | { ok: false; stuck: number[] } {
    const ids = nodes.map((n) => n.localId)
    const idSet = new Set(ids)

    const deps = new Map<number, number[]>()
    for (const n of nodes) {
        const d: number[] = []
        if (n.inA !== -1 && idSet.has(n.inA)) d.push(n.inA)
        if (n.inB !== -1 && idSet.has(n.inB)) d.push(n.inB)
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
        return { ok: false, stuck }
    }
    return { ok: true }
}

function isOutputLike(type: string) {
    const t = type.toUpperCase()
    return t.endsWith("_OUT") || t === "DIGITAL_OUT" || t === "PWM_OUT" || t === "AO" || t === "SAFE_OUTPUT"
}

function isTimer(type: string) {
    const t = type.toUpperCase()
    return t === "TON" || t === "TOFF" || t === "TP"
}

export function validateGraph(cycleMsStr: string, nodes: EditorNodeUi[], wires: WireUi[]): ValidationError[] {
    const errs: ValidationError[] = []

    // cycleMs
    if (!isInt(cycleMsStr) || toInt(cycleMsStr) <= 0) {
        errs.push({ field: "cycleMs", message: "cycleMs должен быть целым > 0" })
    }

    // localId unique
    const ids = nodes.map((n) => n.localId)
    const idSet = new Set(ids)
    if (idSet.size !== ids.length) {
        errs.push({ message: "localId должен быть уникальным у каждого узла" })
    }

    // params types + spec constraints
    for (const n of nodes) {
        if (!isInt(n.paramInt)) errs.push({ nodeLocalId: n.localId, field: "paramInt", message: "paramInt должен быть int" })
        if (!isNum(n.paramFloat)) errs.push({ nodeLocalId: n.localId, field: "paramFloat", message: "paramFloat должен быть number" })
        if (!isInt(n.paramMs)) errs.push({ nodeLocalId: n.localId, field: "paramMs", message: "paramMs должен быть int" })
        if (!isInt(n.flags)) errs.push({ nodeLocalId: n.localId, field: "flags", message: "flags должен быть int" })

        const expected = NODE_SPEC[n.type]?.expectedValueType
        if (expected != null && n.valueType !== expected) {
            errs.push({
                nodeLocalId: n.localId,
                field: "valueType",
                message: `Для ${n.type} valueType должен быть ${expected === 0 ? "BOOL" : expected === 1 ? "INT" : "REAL"}`,
            })
        }
    }

    // ---- wire validity ----
    // endpoint exist + no self
    for (const w of wires) {
        if (!idSet.has(w.fromNode)) errs.push({ message: `Wire: fromNode=${w.fromNode} не существует` })
        if (!idSet.has(w.toNode)) errs.push({ message: `Wire: toNode=${w.toNode} не существует` })
        if (w.fromNode === w.toNode) errs.push({ nodeLocalId: w.toNode, message: `Wire: self-wire запрещён (node ${w.toNode})` })
    }

    // no double wire per port + respect hideB
    const portKey = (toNode: number, toPort: "A" | "B") => `${toNode}:${toPort}`
    const seen = new Set<string>()
    for (const w of wires) {
        const k = portKey(w.toNode, w.toPort)
        if (seen.has(k)) {
            errs.push({ nodeLocalId: w.toNode, message: `Wire: в порт ${w.toPort} можно подключить только один провод` })
        } else {
            seen.add(k)
        }

        const toNode = nodes.find((x) => x.localId === w.toNode)
        const hideB = toNode ? (NODE_SPEC[toNode.type]?.ports?.hideB ?? false) : false
        if (w.toPort === "B" && hideB) {
            errs.push({ nodeLocalId: w.toNode, field: "inB", message: `Узел ${toNode?.type ?? "?"} не имеет порта B` })
        }
    }

    function typeName(v: number): string {
        return v === 0 ? "BOOL" : v === 1 ? "INT" : "REAL"
    }

    function isNumeric(v: number): boolean {
        return v === 1 || v === 2
    }

    function isWireTypeCompatible(from: EditorNodeUi, to: EditorNodeUi, toPort: "A" | "B"): boolean {
        const fromType = from.valueType
        const toType = to.valueType
        const t = to.type.toUpperCase()

        switch (t) {
            case "HYST":
                return toPort === "A" && fromType === 2

            case "COMPARE_GT":
            case "COMPARE_LT":
            case "COMPARE_GE":
                return isNumeric(fromType)

            case "SCALE":
            case "LIMIT":
            case "ADD":
            case "PID":
            case "ANALOG_AVG":
            case "RAMP":
            case "FILTER_AVG":
            case "AO":
                return toPort === "A" && isNumeric(fromType) || (t === "ADD" && isNumeric(fromType))

            case "MATH_OP":
                return isNumeric(fromType)

            case "PWM_OUT":
                return toPort === "A" && isNumeric(fromType)

            case "TON":
            case "TOFF":
            case "TP":
            case "R_TRIG":
            case "F_TRIG":
            case "NOT":
            case "DIGITAL_OUT":
            case "AND2":
            case "OR2":
            case "SR":
            case "ALARM_GEN":
            case "ALARM_LATCH":
                return fromType === 0

            case "MUX2":
                // оба входа должны соответствовать типу выхода самого MUX2
                return fromType === toType

            case "SAFE_OUTPUT":
                // вход A — того же типа, что и выход узла
                // вход B — обычно BOOL allow
                if (toPort === "A") return fromType === toType
                if (toPort === "B") return fromType === 0
                return false

            case "MEM_BOOL":
                if (toPort === "A") return fromType === 0
                if (toPort === "B") return fromType === 0
                return true

            case "MEM_INT":
                if (toPort === "A") return fromType === 1
                if (toPort === "B") return fromType === 0
                return true

            case "MEM_REAL":
                if (toPort === "A") return fromType === 2
                if (toPort === "B") return fromType === 0
                return true

            default:
                // fallback: старое поведение
                return fromType === toType
        }
    }

// type-aware wires
    for (const w of wires) {
        const from = nodes.find((n) => n.localId === w.fromNode)
        const to = nodes.find((n) => n.localId === w.toNode)
        if (!from || !to) continue

        if (!isWireTypeCompatible(from, to, w.toPort)) {
            errs.push({
                nodeLocalId: w.toNode,
                field: w.toPort === "A" ? "inA" : "inB",
                message: `Несовместимые типы: ${typeName(from.valueType)} -> ${to.type}.${w.toPort}`,
            })
        }
    }

    // compute inA/inB from wires
    const inA = new Map<number, number>()
    const inB = new Map<number, number>()
    for (const w of wires) {
        if (w.toPort === "A") inA.set(w.toNode, w.fromNode)
        else inB.set(w.toNode, w.fromNode)
    }
    const computed: EditorNodeUi[] = nodes.map((n) => ({
        ...n,
        inA: inA.get(n.localId) ?? -1,
        inB: inB.get(n.localId) ?? -1,
    }))

    // PLC semantic constraints
    for (const n of computed) {
        const t = n.type.toUpperCase()

        // timers
        if (isTimer(t)) {
            if (toInt(n.paramMs) <= 0) errs.push({ nodeLocalId: n.localId, field: "paramMs", message: `${t}: paramMs должен быть > 0` })
            if (n.inA === -1) errs.push({ nodeLocalId: n.localId, field: "inA", message: `${t}: нужен вход A` })
        }

        // outputs require A
        if (isOutputLike(t)) {
            if (n.inA === -1) errs.push({ nodeLocalId: n.localId, field: "inA", message: `${t}: нужен вход A` })
        }
    }

    // at least one output node
    const hasOut = nodes.some((n) => isOutputLike(n.type))
    if (!hasOut) errs.push({ message: "В графе должен быть хотя бы один выходной узел (*_OUT / DIGITAL_OUT / PWM_OUT / AO / SAFE_OUTPUT)" })

    // cycles
    const topo = topoSortOrThrow(computed)
    if (!topo.ok) errs.push({ message: `Цикл в графе (feedback loop) запрещён. Узлы: ${topo.stuck.join(", ")}` })

    return errs
}



