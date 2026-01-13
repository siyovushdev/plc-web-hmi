import {useMemo, useState} from "react"
import {usePlcStatus} from "./usePlcStatus"
import {activateGraph, uploadGraph} from "./plc.api"
import type {EditorNodeUi, ValidationError} from "./graph/editorTypes"
import {validateGraph} from "./graph/editorValidate"
import {buildGraph} from "./graph/editorBuild"
import {NODE_TYPES, type NodeType} from "./graph/nodeCatalog.ts";
import {loadProject, saveProject, exportProjectFile, importProjectFile} from "./graph/projectStore"
import {useEffect} from "react"
import {NODE_SPEC} from "./graph/nodeUiSpec"
import type {ParamSpec} from "./graph/nodeUiSpec"
import type {WireUi, ProjectUiV2} from "./graph/editorTypes"
import { autoLayout } from "./graph/autoLayout"
import { GraphFlow } from "./graph/GraphFlow"


function nextLocalId(nodes: EditorNodeUi[]) {
    const maxId = nodes.reduce((m, n) => Math.max(m, n.localId), 0)
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
    }
}

function errToText(e: ValidationError) {
    const who = e.nodeLocalId != null ? `node#${e.nodeLocalId}` : "graph"
    const fld = e.field ? `.${e.field}` : ""
    return `${who}${fld}: ${e.message}`
}

export function GraphPage() {
    const {status, error: statusErr, refresh} = usePlcStatus(1000)

    const [cycleMs, setCycleMs] = useState("10")
    const [nodes, setNodes] = useState<EditorNodeUi[]>([
        {
            localId: 0,
            type: "DIGITAL_IN",
            valueType: 0,
            inA: -1,
            inB: -1,
            paramInt: "0",
            paramFloat: "0",
            paramMs: "0",
            flags: "0"
        },
        {
            localId: 1,
            type: "TON",
            valueType: 0,
            inA: 0,
            inB: -1,
            paramInt: "0",
            paramFloat: "0",
            paramMs: "1000",
            flags: "0"
        },
        {
            localId: 2,
            type: "DIGITAL_OUT",
            valueType: 0,
            inA: 1,
            inB: -1,
            paramInt: "0",
            paramFloat: "0",
            paramMs: "0",
            flags: "0"
        },
    ])

    const [busy, setBusy] = useState<null | "upload" | "activate">(null)
    const [errs, setErrs] = useState<ValidationError[]>([])
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
    const [lastResp, setLastResp] = useState<unknown>(null)
    const [showBuiltJson, setShowBuiltJson] = useState(false)
    const [wires, setWires] = useState<WireUi[]>([])

    const built = useMemo(() => {
        try {
            return buildGraph(cycleMs, nodes, wires)
        } catch {
            return null
        }
    }, [cycleMs, nodes, wires])

    type ConnectPick = { toNode: number; toPort: "A" | "B" } | null
    const [connectPick, setConnectPick] = useState<ConnectPick>(null)

    const [showWires, setShowWires] = useState(false)

    useEffect(() => {
        const p = loadProject()
        if (p) {
            setCycleMs(p.cycleMs)
            setNodes(p.nodes)
            setWires(p.wires ?? [])
        }
    }, [])

    useEffect(() => {
        const p: ProjectUiV2 = {version: 2, cycleMs, nodes, wires}
        saveProject(p)
    }, [cycleMs, nodes, wires])

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setConnectPick(null)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    const builtJson = useMemo(() => (built ? JSON.stringify(built, null, 2) : "—"), [built])

    const allNodeIds = useMemo(() => nodes.map((n) => n.localId).sort((a, b) => a - b), [nodes])

    const computedInputs = useMemo(() => {
        const a = new Map<number, number>()
        const b = new Map<number, number>()
        for (const w of wires) {
            if (w.toPort === "A") a.set(w.toNode, w.fromNode)
            else b.set(w.toNode, w.fromNode)
        }
        return {a, b}
    }, [wires])

    const [showCanvas, setShowCanvas] = useState(true)

    function updateNode(localId: number, patch: Partial<EditorNodeUi>) {
        setNodes((prev) => prev.map((n) => (n.localId === localId ? {...n, ...patch} : n)))
    }

    function removeNode(localId: number) {
        setNodes((prev) => prev.filter((n) => n.localId !== localId))
        setWires((prev) => prev.filter((w) => w.fromNode !== localId && w.toNode !== localId))
    }

    function isPortFree(toNode: number, toPort: "A" | "B") {
        return !wires.some((w) => w.toNode === toNode && w.toPort === toPort)
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
            setLastResp({ok: false, error: e instanceof Error ? e.message : String(e)})
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
            setLastResp({ok: false, error: e instanceof Error ? e.message : String(e)})
        } finally {
            setBusy(null)
        }
    }

    function removeWireTo(toNode: number, toPort: "A" | "B") {
        setWires((prev) => prev.filter((w) => !(w.toNode === toNode && w.toPort === toPort)))
    }

    return (
        <div style={{padding: 16,  margin: "0 auto", fontFamily: "system-ui"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12}}>
                <div>
                    <h2 style={{margin: 0}}>Graph Editor</h2>
                    <div style={{marginTop: 6, opacity: 0.8}}>
                        {status?.connection.ip}:{status?.connection.port} · {status?.connection.linkStatus} ·
                        mode={status?.connection.mode}
                    </div>
                </div>

                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                    <button onClick={refresh} style={{padding: "8px 12px"}}>Refresh</button>
                </div>
            </div>

            {(statusErr) && (
                <div style={{marginTop: 12, padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b"}}>
                    {statusErr}
                </div>
            )}

            {/* Active graph info */}
            <div style={{marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10}}>
                <div style={{opacity: 0.7, fontSize: 12}}>Active graph</div>
                <div style={{fontWeight: 700, marginTop: 6}}>
                    {status?.activeGraph?.name} · {status?.activeGraph?.runState}
                </div>
                <div style={{opacity: 0.85, fontSize: 12, marginTop: 6}}>
                    nodes={status?.activeGraph?.nodes} · conn={status?.activeGraph?.connections} ·
                    errors={status?.activeGraph?.compileErrors}
                </div>
            </div>

            {/* Controls */}
            <div style={{marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center"}}>
                <label style={{display: "flex", gap: 8, alignItems: "center"}}>
                    <span style={{fontWeight: 700}}>cycleMs</span>
                    <input value={cycleMs} onChange={(e) => setCycleMs(e.target.value)}
                           style={{width: 90, padding: 6}}/>
                </label>

                <button
                    onClick={() => setNodes((p) => [...p, defaultNode(nextLocalId(p))])}
                    style={{padding: "8px 12px"}}
                >
                    + Add node
                </button>

                <button onClick={onUpload} disabled={busy != null} style={{padding: "8px 12px"}}>
                    {busy === "upload" ? "Uploading..." : "Upload (stage)"}
                </button>

                <button onClick={onActivate} disabled={busy != null} style={{padding: "8px 12px"}}>
                    {busy === "activate" ? "Activating..." : "Activate"}
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

                <button onClick={() => exportProjectFile({version: 2, cycleMs, nodes, wires})}>Export</button>


                <label style={{display: "inline-flex", gap: 8, alignItems: "center"}}>
                    <span style={{fontSize: 12, opacity: 0.8}}>Import</span>
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

                            } finally {
                                e.currentTarget.value = ""
                            }
                        }}
                    />
                </label>

                <label style={{display: "flex", gap: 8, alignItems: "center", marginLeft: "auto"}}>
                    <input type="checkbox" checked={showBuiltJson}
                           onChange={(e) => setShowBuiltJson(e.target.checked)}/>
                    <span style={{fontSize: 12, opacity: 0.8}}>show built JSON</span>
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={showWires} onChange={(e) => setShowWires(e.target.checked)} />
                    <span style={{ fontSize: 12, opacity: 0.8 }}>debug wires</span>
                </label>
            </div>

            {connectPick && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #93c5fd", background: "#eff6ff" }}>
                    <div style={{ fontWeight: 700 }}>
                        Connect mode: выбери источник для {connectPick.toNode}.{connectPick.toPort}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                        Нажми <b>Use</b> на нужном узле-источнике. Esc или Cancel — отмена.
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <button onClick={() => setConnectPick(null)} style={{ padding: "8px 12px" }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {showWires && (
            <div style={{marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden"}}>
                <div style={{
                    background: "#f9fafb",
                    padding: 10,
                    fontWeight: 700,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}>
                    <span>Wires</span>
                    <button
                        onClick={() => {
                            const all = nodes.map((n) => n.localId).sort((a, b) => a - b)
                            const fromNode = all[0] ?? 0
                            const toNode = all[1] ?? all[0] ?? 0
                            setWires((p) => [...p, {fromNode, toNode, toPort: "A"}])
                        }}
                        style={{padding: "6px 10px"}}
                    >
                        + Add wire
                    </button>
                </div>

                <div style={{display: "grid", gridTemplateColumns: "120px 120px 90px 90px", gap: 0}}>
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
                                        setWires((p) => p.map((x, i) => (i === idx ? {...x, fromNode: v} : x)))
                                    }}
                                    style={{width: "100%", padding: 6, fontSize: 12}}
                                >
                                    {nodes.map((n) => n.localId).sort((a, b) => a - b).map((id) => (
                                        <option key={id} value={id}>{id}</option>
                                    ))}
                                </select>
                            </Cell>

                            <Cell key={`to-${idx}`}>
                                <select
                                    value={w.toNode}
                                    onChange={(e) => {
                                        const v = Number(e.target.value)
                                        setWires((p) => p.map((x, i) => (i === idx ? {...x, toNode: v} : x)))
                                    }}
                                    style={{width: "100%", padding: 6, fontSize: 12}}
                                >
                                    {nodes.map((n) => n.localId).sort((a, b) => a - b).map((id) => (
                                        <option key={id} value={id}>{id}</option>
                                    ))}
                                </select>
                            </Cell>

                            <Cell key={`port-${idx}`}>
                                <select
                                    value={w.toPort}
                                    onChange={(e) => {
                                        const v = e.target.value as "A" | "B"
                                        setWires((p) => p.map((x, i) => (i === idx ? {...x, toPort: v} : x)))
                                    }}
                                    style={{width: "100%", padding: 6, fontSize: 12}}
                                >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                </select>
                            </Cell>

                            <Cell key={`act-${idx}`}>
                                <button onClick={() => setWires((p) => p.filter((_, i) => i !== idx))}
                                        style={{padding: "6px 10px"}}>
                                    Delete
                                </button>
                            </Cell>
                        </>
                    ))}
                </div>
            </div>
            )}

            {/* Validation errors */}
            {errs.length > 0 && (
                <div style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: "#fff7ed",
                    border: "1px solid #fed7aa"
                }}>
                    <div style={{fontWeight: 700, marginBottom: 6}}>Validation errors</div>
                    <ul style={{margin: 0, paddingLeft: 18}}>
                        {errs.map((e, idx) => (
                            <li key={idx} style={{fontFamily: "ui-monospace, monospace", fontSize: 12}}>
                                {errToText(e)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Graph</div>

                <GraphFlow
                    nodes={nodes}
                    wires={wires}
                    onNodesChange={(patch) => setNodes((prev) => patch(prev))}
                    upsertWire={upsertWire}
                    deleteWire={deleteWire}
                />
            </div>

            {/* Nodes table */}
            <div style={{marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden"}}>
                <div style={{background: "#f9fafb", padding: 10, fontWeight: 700}}>Nodes</div>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: "90px 170px 90px 120px 120px 110px 110px 110px 90px 90px",
                    gap: 0
                }}>
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

                                computedA={computedInputs.a.get(n.localId) ?? -1}
                                computedB={computedInputs.b.get(n.localId) ?? -1}
                                onWireSet={upsertWire}
                                onWireDel={deleteWire}
                                portFree={isPortFree}
                                connectPick={connectPick}
                                onStartConnect={(toNode, toPort) => setConnectPick({ toNode, toPort })}
                                onPickSource={(fromNode) => {
                                    if (!connectPick) return
                                    // защита от self-wire
                                    if (fromNode === connectPick.toNode) return
                                    upsertWire(fromNode, connectPick.toNode, connectPick.toPort)
                                    setConnectPick(null)
                                }}
                                onDisconnect={(toNode, toPort) => removeWireTo(toNode, toPort)}
                            />
                        ))}
                </div>
            </div>

            {/* Built JSON */}
            {showBuiltJson && (
                <pre style={{
                    marginTop: 12,
                    background: "#111",
                    color: "#ddd",
                    padding: 12,
                    borderRadius: 10,
                    overflow: "auto"
                }}>
          {builtJson}
        </pre>
            )}

            {/* Last response */}
            <div style={{marginTop: 12}}>
                <div style={{fontWeight: 700}}>Last response</div>
                <pre style={{marginTop: 8, background: "#f3f4f6", padding: 12, borderRadius: 10, overflow: "auto"}}>
          {lastResp == null ? "—" : JSON.stringify(lastResp, null, 2)}
        </pre>
            </div>
        </div>
    )
}

function HeaderCell({children}: { children: React.ReactNode }) {
    return <div style={{
        padding: 8,
        fontSize: 12,
        fontWeight: 700,
        borderTop: "1px solid #e5e7eb",
        borderRight: "1px solid #e5e7eb"
    }}>{children}</div>
}

function Cell({children}: { children: React.ReactNode }) {
    return <div style={{
        padding: 8,
        fontSize: 12,
        borderTop: "1px solid #e5e7eb",
        borderRight: "1px solid #e5e7eb"
    }}>{children}</div>
}

const DEFAULT_SPEC: ParamSpec = {
    showInt: true,
    showFloat: true,
    showMs: true,
    showFlags: true,
}

function Row(props: {
    node: EditorNodeUi
    allNodeIds: number[]
    onChange: (localId: number, patch: Partial<EditorNodeUi>) => void
    onRemove: (localId: number) => void
    errorFields: Set<string>
    computedA: number
    computedB: number
    onWireSet: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    onWireDel: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    portFree: (toNode: number, toPort: "A" | "B") => boolean
    connectPick: { toNode: number; toPort: "A" | "B" } | null
    onStartConnect: (toNode: number, toPort: "A" | "B") => void
    onPickSource: (fromNode: number) => void
    onDisconnect: (toNode: number, toPort: "A" | "B") => void
}) {
    const n = props.node

    const errStyle = (field: string): React.CSSProperties =>
        props.errorFields.has(field) ? {border: "1px solid #ef4444", background: "#fff1f2"} : {}

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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div>{n.localId}</div>
                    <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "ui-monospace, monospace" }}>
                        L{n.col ?? 0}
                    </div>
                </div>
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
                            ...(hideB2 ? {inB: -1} : {}),
                            ...(expected != null ? {valueType: expected} : {}),
                        })
                    }}
                    style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("type")}}
                >
                    {NODE_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </Cell>

            <Cell>
                <select
                    value={n.valueType}
                    onChange={(e) => props.onChange(n.localId, {valueType: Number(e.target.value) as 0 | 1 | 2})}
                    style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("valueType")}}
                >
                    <option value={0}>BOOL</option>
                    <option value={1}>INT</option>
                    <option value={2}>REAL</option>
                </select>
            </Cell>

            <Cell>
                <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>{aLabel}</div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 28, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                        {n.inA === -1 ? "—" : n.inA}
                    </div>

                    <button
                        onClick={() => props.onStartConnect(n.localId, "A")}
                        style={{ padding: "6px 10px" }}
                    >
                        Connect
                    </button>

                    <button
                        onClick={() => props.onDisconnect(n.localId, "A")}
                        disabled={n.inA === -1}
                        style={{ padding: "6px 10px" }}
                        title="Disconnect A"
                    >
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
                            <div style={{ minWidth: 28, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                                {n.inB === -1 ? "—" : n.inB}
                            </div>

                            <button
                                onClick={() => props.onStartConnect(n.localId, "B")}
                                style={{ padding: "6px 10px" }}
                            >
                                Connect
                            </button>

                            <button
                                onClick={() => props.onDisconnect(n.localId, "B")}
                                disabled={n.inB === -1}
                                style={{ padding: "6px 10px" }}
                                title="Disconnect B"
                            >
                                ✕
                            </button>
                        </div>
                    </>
                )}
            </Cell>



            <Cell>
                {showInt ? (
                    <input
                        value={n.paramInt}
                        onChange={(e) => props.onChange(n.localId, {paramInt: e.target.value})}
                        style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("paramInt")}}
                        placeholder={spec.intLabel ?? ""}
                    />
                ) : (
                    <span style={{opacity: 0.6}}>—</span>
                )}
            </Cell>

            <Cell>
                {showFloat ? (
                    <input
                        value={n.paramFloat}
                        onChange={(e) => props.onChange(n.localId, {paramFloat: e.target.value})}
                        style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("paramFloat")}}
                        placeholder={spec.floatLabel ?? ""}
                    />
                ) : (
                    <span style={{opacity: 0.6}}>—</span>
                )}
            </Cell>

            <Cell>
                {showMs ? (
                    <input
                        value={n.paramMs}
                        onChange={(e) => props.onChange(n.localId, {paramMs: e.target.value})}
                        style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("paramMs")}}
                        placeholder={spec.msLabel ?? ""}
                    />
                ) : (
                    <span style={{opacity: 0.6}}>—</span>
                )}
            </Cell>

            <Cell>
                {showFlags ? (
                    <input
                        value={n.flags}
                        onChange={(e) => props.onChange(n.localId, {flags: e.target.value})}
                        style={{width: "100%", padding: 6, fontSize: 12, ...errStyle("flags")}}
                        placeholder={spec.flagsLabel ?? ""}
                    />
                ) : (
                    <span style={{opacity: 0.6}}>—</span>
                )}
            </Cell>

            <Cell>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {props.connectPick && (
                        <button
                            onClick={() => props.onPickSource(n.localId)}
                            disabled={props.connectPick.toNode === n.localId}
                            style={{ padding: "6px 10px" }}
                            title={props.connectPick.toNode === n.localId ? "Нельзя выбрать самого себя" : "Использовать как источник"}
                        >
                            Use
                        </button>
                    )}

                    <button onClick={() => props.onRemove(n.localId)} style={{ padding: "6px 10px" }}>
                        Delete
                    </button>
                </div>
            </Cell>

        </>
    )
}
