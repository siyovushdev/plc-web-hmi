import { useEffect, useMemo, useState } from "react"
import { usePlcStatus } from "./usePlcStatus"
import { activateGraph, uploadGraph, getActiveGraphMeta, forceOutput, releaseOutput } from "./plc.api"
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
import { BlockLibrary } from "./graph/BlockLibrary"
import { PropertiesPanel } from "./graph/PropertiesPanel"
import { ReactFlowProvider } from "@xyflow/react"

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

async function sha256Hex(text: string): Promise<string> {
    const enc = new TextEncoder().encode(text)
    const buf = await crypto.subtle.digest("SHA-256", enc)
    const bytes = new Uint8Array(buf)
    let out = ""
    for (const b of bytes) out += b.toString(16).padStart(2, "0")
    return out
}


export function GraphPage() {
    const [activeSha, setActiveSha] = useState<string | null>(null)
    const [editorSha, setEditorSha] = useState<string | null>(null)
    const [shaErr, setShaErr] = useState<string | null>(null)
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

    async function refreshActiveMeta() {
        try {
            const meta = await getActiveGraphMeta()

            if (!meta) {
                setActiveSha(null)
                setShaErr(null)
                return
            }
            // meta.graphJson -> parse -> canonical -> sha
            const builtActive = parseBuiltGraphOrThrow(meta.graphJson)
            const canonical = canonicalBuiltGraph(builtActive)
            const sha = await sha256Hex(canonical)

            setActiveSha(sha)
            setShaErr(null)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
                setActiveSha(null)
                setShaErr(null)
                return
            }
            setShaErr(msg)
        }
    }

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Delete" || e.key === "Backspace") {
                // чтобы не удалять когда курсор в input/select
                const t = e.target as HTMLElement | null
                const tag = t?.tagName?.toLowerCase()
                if (tag === "input" || tag === "textarea" || tag === "select") return

                if (selectedNodeId != null) {
                    e.preventDefault()
                    removeNode(selectedNodeId)
                }
            }
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [selectedNodeId, nodes, wires])



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

    useEffect(() => {
        refreshActiveMeta()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])


    const built = useMemo(() => {
        try {
            return buildGraph(cycleMs, nodes, wires)
        } catch {
            return null
        }
    }, [cycleMs, nodes, wires])

    function canonicalBuiltGraph(g: BuiltGraph): string {
        const nodes = g.nodes
            .map((n) => ({
                id: Number(n.id),
                type: String(n.type),
                valueType: Number(n.valueType),
                inA: Number(n.inA),
                inB: Number(n.inB),
                paramInt: Number(n.paramInt),
                paramFloat: Number(n.paramFloat),
                paramMs: Number(n.paramMs),
                flags: Number(n.flags),
            }))
            .sort((a, b) => a.id - b.id)

        const cycleMs = Number(g.cycleMs)
        return JSON.stringify({ cycleMs, nodes })
    }

    function canonicalBuilt(b: unknown): string {
        if (typeof b !== "object" || b == null) return JSON.stringify(b)

        const g = b as { cycleMs: unknown; nodes?: Array<Record<string, unknown>> }

        const cycleMs = typeof g.cycleMs === "number" ? g.cycleMs : Number(g.cycleMs)

        const nodes = (g.nodes ?? []).map((n) => ({
            id: n.id,
            type: n.type,
            valueType: n.valueType,
            inA: n.inA,
            inB: n.inB,
            paramInt: n.paramInt,
            paramFloat: n.paramFloat,
            paramMs: n.paramMs,
            flags: n.flags,
        }))

        nodes.sort((a, b2) => Number(a.id) - Number(b2.id))

        return JSON.stringify({ cycleMs, nodes })
    }



    useEffect(() => {
        let cancelled = false

        async function run() {
            try {
                if (!built) {
                    setEditorSha(null)
                    return
                }
                const json = canonicalBuilt(built)
                const sha = await sha256Hex(json)
                if (!cancelled) setEditorSha(sha)
            } catch (e) {
                if (!cancelled) setEditorSha(null)
            }
        }

        run()
        return () => {
            cancelled = true
        }
    }, [built])


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
            const meta = await getActiveGraphMeta()
            if (!meta) {
                setActiveSha(null)
                setShaErr(null)
                throw new Error("No active graph")
            }
            setActiveSha(meta.sha256)

            const builtActive = parseBuiltGraphOrThrow(meta.graphJson)
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
            await refreshActiveMeta()
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

    const isMatch = !!built && !!activeSha && !!editorSha && editorSha === activeSha
    const syncLabel = !built ? "INVALID" : !activeSha ? "NO ACTIVE" : isMatch ? "MATCH" : "DIRTY"

    function createNode(type: NodeType, pos: { x: number; y: number }) {
        let createdId = -1

        setNodes((prev) => {
            createdId = nextLocalId(prev)

            const expected = NODE_SPEC[type]?.expectedValueType
            const n: EditorNodeUi = {
                ...defaultNode(createdId),
                type,
                valueType: (expected ?? 0) as 0 | 1 | 2,
                x: pos.x,
                y: pos.y,
            }

            return [...prev, n]
        })

        if (createdId >= 0) setSelectedNodeId(createdId)
    }



    return (
        <div className="plc-page">
            {/* ===== TOPBAR (как на скрине) ===== */}
            <div className="plc-topbar">
                <div className="plc-brand">
                    <h2 className="plc-brand__title">Graph Editor</h2>
                    <div className="plc-brand__sub">
                        {status?.connection.ip}:{status?.connection.port} · {status?.connection.linkStatus} · mode={status?.connection.mode}
                    </div>
                </div>

                <div className="plc-actions">
        <span className={`plc-pill ${isMatch ? "plc-pill--match" : "plc-pill--dirty"}`}>
          {syncLabel}
        </span>

                    <button className="plc-btn plc-btn--ghost" onClick={onUpload} disabled={busy != null}>
                        {busy === "upload" ? "Uploading..." : "Upload"}
                    </button>

                    <button className="plc-btn plc-btn--ghost" onClick={onActivate} disabled={busy != null}>
                        {busy === "activate" ? "Activating..." : "Activate"}
                    </button>

                    <button className="plc-btn plc-btn--ghost" onClick={onLoadActive} disabled={busy != null}>
                        {busy === "loadActive" ? "Loading..." : "Load Active"}
                    </button>

                    <button
                        className="plc-btn plc-btn--ghost"
                        onClick={() => {
                            try {
                                setNodes((prev) => autoLayout(prev, wires))
                            } catch (e) {
                                setLastResp({ ok: false, error: e instanceof Error ? e.message : String(e) })
                            }
                        }}
                        disabled={busy != null}
                    >
                        Auto Layout
                    </button>

                    <button className="plc-btn plc-btn--ghost" onClick={refresh}>Refresh</button>

                    {/* визуальная кнопка RUN как на макете */}
                    <button className="plc-btn plc-btn--run" type="button">
                        RUN
                    </button>
                </div>
            </div>

            {/* ===== ERROR STRIP ===== */}
            {statusErr && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.10)", color: "#ffb4b4", fontWeight: 800 }}>
                    {statusErr}
                </div>
            )}

            {/* ===== MAIN EDITOR 3-COLUMN ===== */}
            <div className="plc-editor">
                {/* LEFT: Block Library + Templates (минимально) */}
                <aside className="plc-panel">
                    <div className="plc-panel__hdr">
                        <h3>Block Library</h3>
                    </div>

                    <div className="plc-panel__body" style={{ display: "grid", gap: 12 }}>
                        <BlockLibrary
                            onPickNode={(type) => createNode(type, { x: 120, y: 120 })}
                        />

                        {/* Оставляем debug-переключатели внизу слева */}
                        <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <input type="checkbox" checked={showBuiltJson} onChange={(e) => setShowBuiltJson(e.target.checked)} />
                                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>show built JSON</span>
                            </label>

                            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                                <input type="checkbox" checked={showWires} onChange={(e) => setShowWires(e.target.checked)} />
                                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>debug wires</span>
                            </label>
                        </div>
                    </div>

                </aside>

                {/* CENTER: Canvas */}
                <main className="plc-canvas">
                    <ReactFlowProvider>
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
                        onCreateNode={createNode}
                    />
                    </ReactFlowProvider>
                </main>

                {/* RIGHT: Properties */}
                <aside className="plc-panel">
                    <div className="plc-panel__hdr">
                        <h3>Properties</h3>
                    </div>

                    <div className="plc-panel__body">

                        <PropertiesPanel
                            key={selectedNode?.localId ?? "none"}   // ✅ важно
                            selectedNode={selectedNode}
                            nodeState={selectedNode ? nodeStateById.get(selectedNode.localId) ?? null : null}
                            nodeStateById={nodeStateById}
                            nodes={nodes}
                            wires={wires}
                            onApply={(id, patch) => updateNode(id, patch)}
                            onDelete={(id) => removeNode(id)}
                        />


                    </div>
                </aside>
            </div>

            {/* ===== OPTIONAL: Validation Errors ===== */}
            {errs.length > 0 && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid rgba(245,158,11,.35)", background: "rgba(245,158,11,.10)" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Validation errors</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {errs.map((e, idx) => (
                            <li key={idx} style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                                {errToText(e)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ===== DEV PANELS (оставляем как было) ===== */}
            {showWires && (
                <div style={{ marginTop: 14 }}>
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
                </div>
            )}

            {showBuiltJson && (
                <pre style={{ marginTop: 14, background: "rgba(0,0,0,.35)", color: "#dbe7ff", padding: 14, borderRadius: 14, overflow: "auto", border: "1px solid rgba(50,64,92,.65)" }}>
        {builtJson}
      </pre>
            )}

            <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900 }}>Last response</div>
                <pre style={{ marginTop: 10, background: "rgba(0,0,0,.25)", padding: 14, borderRadius: 14, overflow: "auto", border: "1px solid rgba(50,64,92,.65)" }}>
        {lastResp == null ? "—" : JSON.stringify(lastResp, null, 2)}
      </pre>
            </div>

            {/* Nodes table — можно оставить 1:1 как у тебя (ниже) */}
            <div style={{ marginTop: 14 }}>
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
