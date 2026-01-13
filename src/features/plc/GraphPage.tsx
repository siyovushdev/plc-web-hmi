import { useEffect, useMemo, useState } from "react"
import { usePlcStatus } from "./usePlcStatus"
import { activateGraph, uploadGraph, getActiveGraphJson } from "./plc.api"
import type { EditorNodeUi, ValidationError, WireUi, ProjectUiV2 } from "./graph/editorTypes"
import { validateGraph } from "./graph/editorValidate"
import { buildGraph } from "./graph/editorBuild"
import { NODE_TYPES, type NodeType } from "./graph/nodeCatalog"
import { loadProject, saveProject, exportProjectFile, importProjectFile } from "./graph/projectStore"
import { NODE_SPEC } from "./graph/nodeUiSpec"
import type { ParamSpec } from "./graph/nodeUiSpec"
import { autoLayout } from "./graph/autoLayout"
import { GraphFlow } from "./graph/GraphFlow"
import type { PlcNodeState } from "./plc.types"
import { forceOutput, releaseOutput } from "./plc.api"



function nextLocalId(nodes: EditorNodeUi[]) {
    const maxId = nodes.reduce((m, n) => Math.max(m, n.localId), -1)
    return maxId + 1
}

function defaultNode(localId: number): EditorNodeUi {
    return {
        localId,
        type: "DIGITAL_IN",
        valueType: 0,
        inA: -1,
        inB: -1,
        paramInt: "0",
        paramFloat: "0",
        paramMs: "0",
        flags: "0",
        x: 0,
        y: 0,
    }
}

function errToText(e: ValidationError) {
    const who = e.nodeLocalId != null ? `node#${e.nodeLocalId}` : "graph"
    const fld = e.field ? `.${e.field}` : ""
    return `${who}${fld}: ${e.message}`
}

type TemplateId = "DI_TON_DO" | "DI_DO" | "BLINK"

function makeTemplate(t: TemplateId, startId: number) {
    // все шаблоны делаем BOOL для простоты (как обычно в PLC)
    if (t === "DI_TON_DO") {
        const n0: EditorNodeUi = { localId: startId + 0, type: "DIGITAL_IN", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" }
        const n1: EditorNodeUi = { localId: startId + 1, type: "TON", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "1000", flags: "0" }
        const n2: EditorNodeUi = { localId: startId + 2, type: "DIGITAL_OUT", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" }

        const wires: WireUi[] = [
            { fromNode: n0.localId, toNode: n1.localId, toPort: "A" },
            { fromNode: n1.localId, toNode: n2.localId, toPort: "A" },
        ]
        return { nodes: [n0, n1, n2], wires }
    }

    if (t === "DI_DO") {
        const n0: EditorNodeUi = { localId: startId + 0, type: "DIGITAL_IN", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" }
        const n1: EditorNodeUi = { localId: startId + 1, type: "DIGITAL_OUT", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" }
        const wires: WireUi[] = [{ fromNode: n0.localId, toNode: n1.localId, toPort: "A" }]
        return { nodes: [n0, n1], wires }
    }

    // BLINK: TP (pulse) от HEARTBEAT или CONST_BOOL? В простом виде: HEARTBEAT -> TP -> DIGITAL_OUT
    // Если HEARTBEAT у тебя реально работает как генератор, это будет “мигалка”.
    const n0: EditorNodeUi = { localId: startId + 0, type: "HEARTBEAT" as NodeType, valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "500", flags: "0" }
    const n1: EditorNodeUi = { localId: startId + 1, type: "TP", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "200", flags: "0" }
    const n2: EditorNodeUi = { localId: startId + 2, type: "DIGITAL_OUT", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" }
    const wires: WireUi[] = [
        { fromNode: n0.localId, toNode: n1.localId, toPort: "A" },
        { fromNode: n1.localId, toNode: n2.localId, toPort: "A" },
    ]
    return { nodes: [n0, n1, n2], wires }
}

const DEFAULT_SPEC: ParamSpec = { showInt: true, showFloat: true, showMs: true, showFlags: true }

type BuiltNode = {
    id: number
    type: NodeType
    valueType: number
    inA: number
    inB: number
    paramInt: number
    paramFloat: number
    paramMs: number
    flags: number
}
type BuiltGraph = { cycleMs: number; nodes: BuiltNode[] }

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null
}

function parseBuiltGraphOrThrow(graphJson: string): BuiltGraph {
    const x: unknown = JSON.parse(graphJson)
    if (!isRecord(x)) throw new Error("Active graph: invalid JSON root")

    const cycleMs = x["cycleMs"]
    const nodes = x["nodes"]
    if (typeof cycleMs !== "number") throw new Error("Active graph: cycleMs is not number")
    if (!Array.isArray(nodes)) throw new Error("Active graph: nodes is not array")

    const outNodes: BuiltNode[] = nodes.map((n: unknown, idx: number) => {
        if (!isRecord(n)) throw new Error(`Active graph: node[${idx}] invalid`)

        const id = n["id"]
        const type = n["type"]
        const valueType = n["valueType"]
        const inA = n["inA"]
        const inB = n["inB"]
        const paramInt = n["paramInt"]
        const paramFloat = n["paramFloat"]
        const paramMs = n["paramMs"]
        const flags = n["flags"]

        if (typeof id !== "number") throw new Error(`Active graph: node[${idx}].id invalid`)
        if (typeof type !== "string") throw new Error(`Active graph: node[${idx}].type invalid`)
        if (typeof valueType !== "number") throw new Error(`Active graph: node[${idx}].valueType invalid`)
        if (typeof inA !== "number" || typeof inB !== "number") throw new Error(`Active graph: node[${idx}].inA/inB invalid`)
        if (typeof paramInt !== "number") throw new Error(`Active graph: node[${idx}].paramInt invalid`)
        if (typeof paramFloat !== "number") throw new Error(`Active graph: node[${idx}].paramFloat invalid`)
        if (typeof paramMs !== "number") throw new Error(`Active graph: node[${idx}].paramMs invalid`)
        if (typeof flags !== "number") throw new Error(`Active graph: node[${idx}].flags invalid`)

        return { id, type: type as NodeType, valueType, inA, inB, paramInt, paramFloat, paramMs, flags }
    })

    return { cycleMs, nodes: outNodes }
}

function builtToEditorProject(built: BuiltGraph): { cycleMs: string; nodes: EditorNodeUi[]; wires: WireUi[] } {
    const editorNodes: EditorNodeUi[] = built.nodes.map((n) => ({
        localId: n.id,
        type: n.type,
        valueType: n.valueType as 0 | 1 | 2,
        inA: -1,
        inB: -1,
        paramInt: String(n.paramInt),
        paramFloat: String(n.paramFloat),
        paramMs: String(n.paramMs),
        flags: String(n.flags),
    }))

    // В built.inA/inB — это ИНДЕКСЫ в массиве built.nodes (см. editorBuild.ts)
    const wires: WireUi[] = []
    for (let i = 0; i < built.nodes.length; i++) {
        const to = built.nodes[i]
        if (to.inA >= 0) {
            const from = built.nodes[to.inA]
            if (from) wires.push({ fromNode: from.id, toNode: to.id, toPort: "A" })
        }
        if (to.inB >= 0) {
            const from = built.nodes[to.inB]
            if (from) wires.push({ fromNode: from.id, toNode: to.id, toPort: "B" })
        }
    }

    return { cycleMs: String(built.cycleMs), nodes: editorNodes, wires }
}


export function GraphPage() {
    const { status, error: statusErr, refresh } = usePlcStatus(1000)
    const [hydrated, setHydrated] = useState(false)
    const [cycleMs, setCycleMs] = useState("10")
    const [nodes, setNodes] = useState<EditorNodeUi[]>([
        { localId: 0, type: "DIGITAL_IN", valueType: 0, inA: -1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" },
        { localId: 1, type: "TON", valueType: 0, inA: 0, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "1000", flags: "0" },
        { localId: 2, type: "DIGITAL_OUT", valueType: 0, inA: 1, inB: -1, paramInt: "0", paramFloat: "0", paramMs: "0", flags: "0" },
    ])
    const [wires, setWires] = useState<WireUi[]>([])

    const [busy, setBusy] = useState<null | "upload" | "activate" | "loadActive">(null)

    const [errs, setErrs] = useState<ValidationError[]>([])
    const [lastResp, setLastResp] = useState<unknown>(null)
    const [showBuiltJson, setShowBuiltJson] = useState(false)

    const [showCanvas, setShowCanvas] = useState(true)
    const [showWires, setShowWires] = useState(false)

    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
    const selectedNode = useMemo(() => (selectedNodeId == null ? null : nodes.find((n) => n.localId === selectedNodeId) ?? null), [nodes, selectedNodeId])

    const errorMap = useMemo(() => {
        const m = new Map<number, Set<string>>()
        for (const e of errs) {
            if (e.nodeLocalId == null) continue
            const set = m.get(e.nodeLocalId) ?? new Set<string>()
            if (e.field) set.add(e.field)
            m.set(e.nodeLocalId, set)
        }
        return m
    }, [errs])

    useEffect(() => {
        const p = loadProject()
        if (p) {
            setCycleMs(p.cycleMs)
            setNodes(p.nodes)
            setWires(p.wires ?? [])
        }
        setHydrated(true)
    }, [])


    useEffect(() => {
        if (!hydrated) return
        const p: ProjectUiV2 = { version: 2, cycleMs, nodes, wires }
        saveProject(p)
    }, [hydrated, cycleMs, nodes, wires])

    const built = useMemo(() => {
        try {
            return buildGraph(cycleMs, nodes, wires)
        } catch {
            return null
        }
    }, [cycleMs, nodes, wires])

    const builtJson = useMemo(() => (built ? JSON.stringify(built, null, 2) : "—"), [built])
    const allNodeIds = useMemo(() => nodes.map((n) => n.localId).sort((a, b) => a - b), [nodes])

    const nodeStateById = useMemo(() => {
        const m = new Map<number, PlcNodeState>()
        for (const n of status?.nodes ?? []) {
            m.set(n.id, n)
        }
        return m
    }, [status])

    function updateNode(localId: number, patch: Partial<EditorNodeUi>) {
        setNodes((prev) => prev.map((n) => (n.localId === localId ? { ...n, ...patch } : n)))
    }

    function removeNode(localId: number) {
        setNodes((prev) => prev.filter((n) => n.localId !== localId))
        setWires((prev) => prev.filter((w) => w.fromNode !== localId && w.toNode !== localId))
        setSelectedNodeId((p) => (p === localId ? null : p))
    }

    function upsertWire(fromNode: number, toNode: number, toPort: "A" | "B") {
        setWires((prev) => {
            const filtered = prev.filter((w) => !(w.toNode === toNode && w.toPort === toPort))
            return [...filtered, { fromNode, toNode, toPort }]
        })
    }

    function deleteWire(fromNode: number, toNode: number, toPort: "A" | "B") {
        setWires((prev) => prev.filter((w) => !(w.fromNode === fromNode && w.toNode === toNode && w.toPort === toPort)))
    }

    function removeWireTo(toNode: number, toPort: "A" | "B") {
        setWires((prev) => prev.filter((w) => !(w.toNode === toNode && w.toPort === toPort)))
    }

    async function onLoadActive() {
        setErrs([])
        setLastResp(null)
        setBusy("loadActive")
        try {
            const json = await getActiveGraphJson()
            const builtActive = parseBuiltGraphOrThrow(json)
            const proj = builtToEditorProject(builtActive)

            setCycleMs(proj.cycleMs)
            setWires(proj.wires)

            // авто-раскладка (у тебя autoLayout возвращает nodes[])
            const laid = autoLayout(proj.nodes, proj.wires)
            setNodes(laid)

            setSelectedNodeId(null)
            setLastResp({ ok: true, loaded: "active", nodes: proj.nodes.length, wires: proj.wires.length })
        } catch (e) {
            setLastResp({ ok: false, error: e instanceof Error ? e.message : String(e) })
        } finally {
            setBusy(null)
        }
    }


    async function onUpload() {
        const v = validateGraph(cycleMs, nodes, wires)
        setErrs(v)
        setLastResp(null)
        if (v.length > 0) return
        if (!built) return

        setBusy("upload")
        try {
            const resp = await uploadGraph(JSON.stringify(built))
            setLastResp(resp)
            await refresh()
        } catch (e) {
            setLastResp({ ok: false, error: e instanceof Error ? e.message : String(e) })
        } finally {
            setBusy(null)
        }
    }

    async function onActivate() {
        setErrs([])
        setLastResp(null)
        setBusy("activate")
        try {
            const resp = await activateGraph()
            setLastResp(resp)
            await refresh()
        } catch (e) {
            setLastResp({ ok: false, error: e instanceof Error ? e.message : String(e) })
        } finally {
            setBusy(null)
        }
    }

    // templates
    const [tpl, setTpl] = useState<TemplateId>("DI_TON_DO")
    function insertTemplate() {
        const startId = nextLocalId(nodes)
        const t = makeTemplate(tpl, startId)

        const mergedNodes = [...nodes, ...t.nodes]
        const mergedWires = mergeWiresUnique(wires, t.wires)

        let laidOut = mergedNodes
        try {
            laidOut = autoLayout(mergedNodes, mergedWires)
        } catch {
            // если авто-раскладка упала — оставляем как есть
        }

        setNodes(laidOut)
        setWires(mergedWires)
        setSelectedNodeId(null)
    }


    function mergeWiresUnique(base: WireUi[], add: WireUi[]): WireUi[] {
        // ключ = входной порт (toNode + toPort). В один вход — только один провод.
        const m = new Map<string, WireUi>()
        for (const w of base) m.set(`${w.toNode}:${w.toPort}`, w)
        for (const w of add) m.set(`${w.toNode}:${w.toPort}`, w)
        return Array.from(m.values())
    }

    // property panel helpers
    function applyPresetMs(ms: number) {
        if (!selectedNode) return
        updateNode(selectedNode.localId, { paramMs: String(ms) })
    }

    const forceDo = async (nodeId: number, desired: boolean, holdMs: number) => {
        const ok = await forceOutput(nodeId, desired, holdMs)
        if (!ok) throw new Error("Force failed")
        await refresh()
    }

    const releaseDo = async (nodeId: number) => {
        const ok = await releaseOutput(nodeId)
        if (!ok) throw new Error("Release failed")
        await refresh()
    }


    return (
        <div style={{ padding: 16, margin: "0 auto", fontFamily: "system-ui" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Graph Editor</h2>
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                        {status?.connection.ip}:{status?.connection.port} · {status?.connection.linkStatus} · mode={status?.connection.mode}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={refresh} style={{ padding: "8px 12px" }}>
                        Refresh
                    </button>
                </div>
            </div>

            {statusErr && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
                    {statusErr}
                </div>
            )}

            <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Active graph</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>
                    {status?.activeGraph?.name} · {status?.activeGraph?.runState}
                </div>
                <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6 }}>
                    nodes={status?.activeGraph?.nodes} · conn={status?.activeGraph?.connections} · errors={status?.activeGraph?.compileErrors}
                </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>cycleMs</span>
                    <input value={cycleMs} onChange={(e) => setCycleMs(e.target.value)} style={{ width: 90, padding: 6 }} />
                </label>

                <button onClick={() => setNodes((p) => [...p, defaultNode(nextLocalId(p))])} style={{ padding: "8px 12px" }}>
                    + Add node
                </button>

                <button onClick={onUpload} disabled={busy != null} style={{ padding: "8px 12px" }}>
                    {busy === "upload" ? "Uploading..." : "Upload (stage)"}
                </button>

                <button onClick={onActivate} disabled={busy != null} style={{ padding: "8px 12px" }}>
                    {busy === "activate" ? "Activating..." : "Activate"}
                </button>

                <button onClick={onLoadActive} disabled={busy != null} style={{ padding: "8px 12px" }}>
                    {busy === "loadActive" ? "Loading..." : "Load active"}
                </button>

                <button
                    onClick={() => {
                        try {
                            setNodes((prev) => autoLayout(prev, wires))
                        } catch (e) {
                            setLastResp({ ok: false, error: e instanceof Error ? e.message : String(e) })
                        }
                    }}
                    style={{ padding: "8px 12px" }}
                >
                    Auto layout
                </button>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={showCanvas} onChange={(e) => setShowCanvas(e.target.checked)} />
                    <span style={{ fontSize: 12, opacity: 0.8 }}>canvas</span>
                </label>

                <button onClick={() => exportProjectFile({ version: 2, cycleMs, nodes, wires })}>Export</button>

                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>Import</span>
                    <input
                        type="file"
                        accept="application/json,.json"
                        onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            try {
                                const p = await importProjectFile(f)
                                setCycleMs(p.cycleMs)
                                setNodes(p.nodes)
                                setWires(p.wires ?? [])
                                setSelectedNodeId(null)
                            } finally {
                                e.currentTarget.value = ""
                            }
                        }}
                    />
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>Template</span>
                    <select value={tpl} onChange={(e) => setTpl(e.target.value as TemplateId)} style={{ padding: 6 }}>
                        <option value="DI_TON_DO">DI → TON → DO</option>
                        <option value="DI_DO">DI → DO</option>
                        <option value="BLINK">Blink (HEARTBEAT → TP → DO)</option>
                    </select>
                    <button onClick={insertTemplate} style={{ padding: "8px 12px" }}>
                        Insert
                    </button>
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                    <input type="checkbox" checked={showBuiltJson} onChange={(e) => setShowBuiltJson(e.target.checked)} />
                    <span style={{ fontSize: 12, opacity: 0.8 }}>show built JSON</span>
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={showWires} onChange={(e) => setShowWires(e.target.checked)} />
                    <span style={{ fontSize: 12, opacity: 0.8 }}>debug wires</span>
                </label>
            </div>

            {errs.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Validation errors</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {errs.map((e, idx) => (
                            <li key={idx} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                                {errToText(e)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: showCanvas ? "1fr 320px" : "1fr", gap: 12, alignItems: "start" }}>
                <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Graph</div>

                    {showCanvas && (
                        <GraphFlow
                            nodes={nodes}
                            wires={wires}
                            selectedNodeId={selectedNodeId}
                            onSelectNode={setSelectedNodeId}
                            onNodesChange={(patch) => setNodes((prev) => patch(prev))}
                            upsertWire={upsertWire}
                            deleteWire={deleteWire}
                            nodeStateById={nodeStateById}
                            onForceDo={forceDo}
                            onReleaseDo={releaseDo}
                        />
                    )}
                </div>

                {/* Property panel */}
                {showCanvas && (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ background: "#f9fafb", padding: 10, fontWeight: 700 }}>Properties</div>
                        {selectedNode ? (
                            <div style={{ padding: 10, display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                    <div style={{ fontWeight: 800 }}>#{selectedNode.localId}</div>
                                    <div style={{ opacity: 0.8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{selectedNode.type}</div>
                                </div>

                                <label style={{ display: "grid", gap: 6 }}>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>type</div>
                                    <select
                                        value={selectedNode.type}
                                        onChange={(e) => {
                                            const newType = e.target.value as NodeType
                                            const newSpec = NODE_SPEC[newType]
                                            const hideB2 = newSpec?.ports?.hideB ?? false
                                            const expected = newSpec?.expectedValueType
                                            updateNode(selectedNode.localId, {
                                                type: newType,
                                                ...(hideB2 ? { inB: -1 } : {}),
                                                ...(expected != null ? { valueType: expected } : {}),
                                            })
                                        }}
                                        style={{ padding: 8 }}
                                    >
                                        {NODE_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label style={{ display: "grid", gap: 6 }}>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>valueType</div>
                                    <select value={selectedNode.valueType} onChange={(e) => updateNode(selectedNode.localId, { valueType: Number(e.target.value) as 0 | 1 | 2 })} style={{ padding: 8 }}>
                                        <option value={0}>BOOL</option>
                                        <option value={1}>INT</option>
                                        <option value={2}>REAL</option>
                                    </select>
                                </label>

                                {(() => {
                                    const spec: ParamSpec = NODE_SPEC[selectedNode.type] ?? DEFAULT_SPEC
                                    const showInt = spec.showInt ?? true
                                    const showFloat = spec.showFloat ?? true
                                    const showMs = spec.showMs ?? true
                                    const showFlags = spec.showFlags ?? true

                                    return (
                                        <>
                                            {showInt && (
                                                <label style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{spec.intLabel ?? "paramInt"}</div>
                                                    <input value={selectedNode.paramInt} onChange={(e) => updateNode(selectedNode.localId, { paramInt: e.target.value })} style={{ padding: 8 }} />
                                                </label>
                                            )}

                                            {showFloat && (
                                                <label style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{spec.floatLabel ?? "paramFloat"}</div>
                                                    <input value={selectedNode.paramFloat} onChange={(e) => updateNode(selectedNode.localId, { paramFloat: e.target.value })} style={{ padding: 8 }} />
                                                </label>
                                            )}

                                            {showMs && (
                                                <div style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{spec.msLabel ?? "paramMs"}</div>
                                                    <input value={selectedNode.paramMs} onChange={(e) => updateNode(selectedNode.localId, { paramMs: e.target.value })} style={{ padding: 8 }} />

                                                    {/* presets для таймера */}
                                                    {["TON", "TOFF", "TP"].includes(selectedNode.type) && (
                                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                            <button onClick={() => applyPresetMs(100)} style={{ padding: "6px 10px" }}>100</button>
                                                            <button onClick={() => applyPresetMs(500)} style={{ padding: "6px 10px" }}>500</button>
                                                            <button onClick={() => applyPresetMs(1000)} style={{ padding: "6px 10px" }}>1000</button>
                                                            <button onClick={() => applyPresetMs(3000)} style={{ padding: "6px 10px" }}>3000</button>
                                                            <button onClick={() => applyPresetMs(10000)} style={{ padding: "6px 10px" }}>10000</button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {showFlags && (
                                                <label style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{spec.flagsLabel ?? "flags"}</div>
                                                    <input value={selectedNode.flags} onChange={(e) => updateNode(selectedNode.localId, { flags: e.target.value })} style={{ padding: 8 }} />
                                                </label>
                                            )}
                                        </>
                                    )
                                })()}

                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => removeNode(selectedNode.localId)} style={{ padding: "8px 12px" }}>
                                        Delete node
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 10, opacity: 0.7, fontSize: 12 }}>Выбери ноду на canvas</div>
                        )}
                    </div>
                )}
            </div>

            {/* Debug wires table */}
            {showWires && (
                <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ background: "#f9fafb", padding: 10, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Wires</span>
                        <button
                            onClick={() => {
                                const all = nodes.map((n) => n.localId).sort((a, b) => a - b)
                                const fromNode = all[0] ?? 0
                                const toNode = all[1] ?? all[0] ?? 0
                                upsertWire(fromNode, toNode, "A")
                            }}

                            style={{ padding: "6px 10px" }}
                        >
                            + Add wire
                        </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "120px 120px 90px 90px", gap: 0 }}>
                        <HeaderCell>fromNode</HeaderCell>
                        <HeaderCell>toNode</HeaderCell>
                        <HeaderCell>toPort</HeaderCell>
                        <HeaderCell>actions</HeaderCell>

                        {wires.map((w, idx) => (
                            <>
                                <Cell key={`from-${idx}`}>
                                    <select
                                        value={w.fromNode}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            setWires((p) => p.map((x, i) => (i === idx ? { ...x, fromNode: v } : x)))
                                        }}
                                        style={{ width: "100%", padding: 6, fontSize: 12 }}
                                    >
                                        {allNodeIds.map((id) => (
                                            <option key={id} value={id}>
                                                {id}
                                            </option>
                                        ))}
                                    </select>
                                </Cell>

                                <Cell key={`to-${idx}`}>
                                    <select
                                        value={w.toNode}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            setWires((p) => p.map((x, i) => (i === idx ? { ...x, toNode: v } : x)))
                                        }}
                                        style={{ width: "100%", padding: 6, fontSize: 12 }}
                                    >
                                        {allNodeIds.map((id) => (
                                            <option key={id} value={id}>
                                                {id}
                                            </option>
                                        ))}
                                    </select>
                                </Cell>

                                <Cell key={`port-${idx}`}>
                                    <select
                                        value={w.toPort}
                                        onChange={(e) => {
                                            const v = e.target.value as "A" | "B"
                                            setWires((p) => p.map((x, i) => (i === idx ? { ...x, toPort: v } : x)))
                                        }}
                                        style={{ width: "100%", padding: 6, fontSize: 12 }}
                                    >
                                        <option value="A">A</option>
                                        <option value="B">B</option>
                                    </select>
                                </Cell>

                                <Cell key={`act-${idx}`}>
                                    <button onClick={() => setWires((p) => p.filter((_, i) => i !== idx))} style={{ padding: "6px 10px" }}>
                                        Delete
                                    </button>
                                </Cell>
                            </>
                        ))}
                    </div>
                </div>
            )}

            {showBuiltJson && (
                <pre style={{ marginTop: 12, background: "#111", color: "#ddd", padding: 12, borderRadius: 10, overflow: "auto" }}>
                    {builtJson}
                </pre>
            )}

            <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Last response</div>
                <pre style={{ marginTop: 8, background: "#f3f4f6", padding: 12, borderRadius: 10, overflow: "auto" }}>
                    {lastResp == null ? "—" : JSON.stringify(lastResp, null, 2)}
                </pre>
            </div>

            {/* Nodes table (оставляю как было — полезно для диагностики) */}
            <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ background: "#f9fafb", padding: 10, fontWeight: 700 }}>Nodes</div>

                <div style={{ display: "grid", gridTemplateColumns: "90px 170px 90px 120px 120px 110px 110px 110px 90px 90px", gap: 0 }}>
                    <HeaderCell>localId</HeaderCell>
                    <HeaderCell>type</HeaderCell>
                    <HeaderCell>valueType</HeaderCell>
                    <HeaderCell>inA</HeaderCell>
                    <HeaderCell>inB</HeaderCell>
                    <HeaderCell>paramInt</HeaderCell>
                    <HeaderCell>paramFloat</HeaderCell>
                    <HeaderCell>paramMs</HeaderCell>
                    <HeaderCell>flags</HeaderCell>
                    <HeaderCell>actions</HeaderCell>

                    {nodes
                        .slice()
                        .sort((a, b) => {
                            const ac = a.col ?? 0
                            const bc = b.col ?? 0
                            if (ac !== bc) return ac - bc
                            const ar = a.row ?? 0
                            const br = b.row ?? 0
                            if (ar !== br) return ar - br
                            return a.localId - b.localId
                        })
                        .map((n) => (
                            <Row
                                key={n.localId}
                                node={n}
                                allNodeIds={allNodeIds}
                                onChange={updateNode}
                                onRemove={removeNode}
                                errorFields={errorMap.get(n.localId) ?? new Set()}
                                onWireSet={upsertWire}
                                onWireDel={deleteWire}
                                onDisconnect={(toNode, toPort) => removeWireTo(toNode, toPort)}
                                onSelect={() => setSelectedNodeId(n.localId)}
                                selected={selectedNodeId === n.localId}
                            />
                        ))}
                </div>
            </div>
        </div>
    )
}

function HeaderCell({ children }: { children: React.ReactNode }) {
    return <div style={{ padding: 8, fontSize: 12, fontWeight: 700, borderTop: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb" }}>{children}</div>
}

function Cell({ children }: { children: React.ReactNode }) {
    return <div style={{ padding: 8, fontSize: 12, borderTop: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb" }}>{children}</div>
}

function Row(props: {
    node: EditorNodeUi
    allNodeIds: number[]
    onChange: (localId: number, patch: Partial<EditorNodeUi>) => void
    onRemove: (localId: number) => void
    errorFields: Set<string>
    onWireSet: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    onWireDel: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    onDisconnect: (toNode: number, toPort: "A" | "B") => void
    onSelect: () => void
    selected: boolean
}) {
    const n = props.node

    const errStyle = (field: string): React.CSSProperties => (props.errorFields.has(field) ? { border: "1px solid #ef4444", background: "#fff1f2" } : {})

    const spec: ParamSpec = NODE_SPEC[n.type] ?? DEFAULT_SPEC
    const showInt = spec.showInt ?? true
    const showFloat = spec.showFloat ?? true
    const showMs = spec.showMs ?? true
    const showFlags = spec.showFlags ?? true

    const ports = spec.ports ?? {}
    const aLabel = ports.a ?? "inA"
    const bLabel = ports.b ?? "inB"
    const hideB = ports.hideB ?? false

    return (
        <>
            <Cell>
                <button onClick={props.onSelect} style={{ padding: "6px 10px", fontWeight: 800, background: props.selected ? "#111827" : "#fff", color: props.selected ? "#fff" : "#111", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    {n.localId}
                </button>
            </Cell>

            <Cell>
                <select
                    value={n.type}
                    onChange={(e) => {
                        const newType = e.target.value as NodeType
                        const newSpec = NODE_SPEC[newType]
                        const hideB2 = newSpec?.ports?.hideB ?? false
                        const expected = newSpec?.expectedValueType
                        props.onChange(n.localId, {
                            type: newType,
                            ...(hideB2 ? { inB: -1 } : {}),
                            ...(expected != null ? { valueType: expected } : {}),
                        })
                    }}
                    style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("type") }}
                >
                    {NODE_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </Cell>

            <Cell>
                <select value={n.valueType} onChange={(e) => props.onChange(n.localId, { valueType: Number(e.target.value) as 0 | 1 | 2 })} style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("valueType") }}>
                    <option value={0}>BOOL</option>
                    <option value={1}>INT</option>
                    <option value={2}>REAL</option>
                </select>
            </Cell>

            <Cell>
                <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>{aLabel}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 28, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{n.inA === -1 ? "—" : n.inA}</div>
                    <button onClick={() => props.onDisconnect(n.localId, "A")} disabled={n.inA === -1} style={{ padding: "6px 10px" }} title="Disconnect A">
                        ✕
                    </button>
                </div>
            </Cell>

            <Cell>
                {hideB ? (
                    <span style={{ opacity: 0.6 }}>—</span>
                ) : (
                    <>
                        <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>{bLabel}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ minWidth: 28, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{n.inB === -1 ? "—" : n.inB}</div>
                            <button onClick={() => props.onDisconnect(n.localId, "B")} disabled={n.inB === -1} style={{ padding: "6px 10px" }} title="Disconnect B">
                                ✕
                            </button>
                        </div>
                    </>
                )}
            </Cell>

            <Cell>
                {showInt ? <input value={n.paramInt} onChange={(e) => props.onChange(n.localId, { paramInt: e.target.value })} style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("paramInt") }} placeholder={spec.intLabel ?? ""} /> : <span style={{ opacity: 0.6 }}>—</span>}
            </Cell>

            <Cell>
                {showFloat ? <input value={n.paramFloat} onChange={(e) => props.onChange(n.localId, { paramFloat: e.target.value })} style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("paramFloat") }} placeholder={spec.floatLabel ?? ""} /> : <span style={{ opacity: 0.6 }}>—</span>}
            </Cell>

            <Cell>
                {showMs ? <input value={n.paramMs} onChange={(e) => props.onChange(n.localId, { paramMs: e.target.value })} style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("paramMs") }} placeholder={spec.msLabel ?? ""} /> : <span style={{ opacity: 0.6 }}>—</span>}
            </Cell>

            <Cell>
                {showFlags ? <input value={n.flags} onChange={(e) => props.onChange(n.localId, { flags: e.target.value })} style={{ width: "100%", padding: 6, fontSize: 12, ...errStyle("flags") }} placeholder={spec.flagsLabel ?? ""} /> : <span style={{ opacity: 0.6 }}>—</span>}
            </Cell>

            <Cell>
                <button onClick={() => props.onRemove(n.localId)} style={{ padding: "6px 10px" }}>
                    Delete
                </button>
            </Cell>
        </>
    )
}
