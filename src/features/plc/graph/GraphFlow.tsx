import {
    ReactFlow,
    Background,
    Controls,
    Handle,
    Position,
    type Node,
    type Edge,
    type Connection,
    type NodeTypes, useReactFlow,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { EditorNodeUi, WireUi } from "./editorTypes"
import { NODE_SPEC } from "./nodeUiSpec"
import type { PlcNodeState } from "../plc.types"
import type {NodeType} from "./nodeCatalog.ts";
import { ReactFlowProvider } from "@xyflow/react"

/* ================= TYPES ================= */

type Props = {
    nodes: EditorNodeUi[]
    wires: WireUi[]
    selectedNodeId: number | null
    onSelectNode: (id: number | null) => void
    onNodesChange: (patch: (prev: EditorNodeUi[]) => EditorNodeUi[]) => void
    upsertWire: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    deleteWire: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    nodeStateById?: Map<number, PlcNodeState>

    // ПКМ меню
    onForceDo: (nodeId: number, desired: boolean, holdMs: number) => Promise<void>
    onReleaseDo: (nodeId: number) => Promise<void>

    onCreateNode?: (type: NodeType, pos: { x: number; y: number }) => void

}

type PlcNodeData = {
    node: EditorNodeUi
    selected: boolean
    runtime: PlcNodeState | null
}

type Kind = "IN" | "OUT" | "TIMER" | "LOGIC" | "OTHER"

type CtxMenuState = {
    open: boolean
    x: number
    y: number
    nodeId: number
} | null

/* ================= HELPERS ================= */

function classify(type: string): Kind {
    const t = type.toUpperCase()
    if (t.includes("IN") || t.startsWith("CONST")) return "IN"
    if (t.includes("OUT") || t === "AO") return "OUT"
    if (t === "TON" || t === "TOFF" || t === "TP") return "TIMER"
    if (t.includes("AND") || t.includes("OR") || t === "NOT") return "LOGIC"
    return "OTHER"
}

function vtLabel(vt: number): "BOOL" | "INT" | "REAL" {
    if (vt === 0) return "BOOL"
    if (vt === 1) return "INT"
    return "REAL"
}

function formatRuntime(vt: number, r: PlcNodeState | null): string {
    if (!r) return "—"
    if (vt === 0) return r.outBool ? "TRUE" : "FALSE"
    if (vt === 1) return String(r.outInt ?? 0)
    if (r.outFloat == null) return "—"
    return Number(r.outFloat).toFixed(3)
}

function isDigitalOutNodeType(type: string): boolean {
    return type === "DIGITAL_OUT"
}

/* ================= NODE ================= */

function PlcNodeView({ data }: { data: PlcNodeData }) {
    const { node, selected, runtime } = data
    const spec = NODE_SPEC[node.type]
    const ports = spec?.ports ?? {}
    const hideB = ports.hideB ?? false


    return (
        <div className={`plc-node ${selected ? "plc-node--selected" : ""}`}>
            <div className="plc-node__hdr">
                <div className="plc-node__name">{node.type}</div>
                <div className="plc-node__sub">
                    <span className="plc-node__badge">{vtLabel(node.valueType)}</span>
                </div>
            </div>

            <Handle
                className="plc-handle plc-handle--in plc-handle--a"
                id="A"
                type="target"
                position={Position.Left}
            />

            {!hideB && (
                <Handle
                    className="plc-handle plc-handle--in plc-handle--b"
                    id="B"
                    type="target"
                    position={Position.Left}
                />
            )}

            <Handle
                className="plc-handle plc-handle--out"
                id="OUT"
                type="source"
                position={Position.Right}
            />


            <div className="plc-node__rows">
                <div className="plc-row">
                    <div className="plc-row__left">
                        <span className="plc-row__tag">IN</span>
                        <span>{formatRuntime(node.valueType, runtime) === "TRUE" ? "TRUE" : "FALSE"}</span>
                    </div>
                    <div className="plc-row__val">{vtLabel(node.valueType)}</div>
                </div>

                {classify(node.type) === "TIMER" && (
                    <>
                        <div className="plc-row">
                            <div className="plc-row__left"><span className="plc-row__tag">PT</span><span>INT</span></div>
                            <div className="plc-row__val">{node.paramMs} ms</div>
                        </div>
                        <div className="plc-row">
                            <div className="plc-row__left"><span className="plc-row__tag">Q</span><span>BOOL</span></div>
                            <div className="plc-row__val">{runtime?.outBool ? "TRUE" : "FALSE"}</div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )

}

/* ================= FLOW ================= */

const nodeTypes: NodeTypes = { plc: PlcNodeView }

export function GraphFlow(props: Props) {
    const [ctx, setCtx] = useState<CtxMenuState>(null)
    const [ctxBusy, setCtxBusy] = useState(false)
    const [ctxErr, setCtxErr] = useState<string | null>(null)

    const rfNodes = useMemo<Node<PlcNodeData>[]>(() => {
        return props.nodes.map((n) => ({
            id: String(n.localId),
            type: "plc",
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            data: {
                node: n,
                selected: props.selectedNodeId === n.localId,
                runtime: props.nodeStateById?.get(n.localId) ?? null,
            },
        }))
    }, [props.nodes, props.selectedNodeId, props.nodeStateById])

    const rfEdges = useMemo<Edge[]>(() => {
        return props.wires.map((w) => ({
            id: `${w.fromNode}->${w.toNode}.${w.toPort}`,
            source: String(w.fromNode),
            sourceHandle: "OUT",
            target: String(w.toNode),
            targetHandle: w.toPort,
            style: { stroke: "rgba(47,125,246,.95)" },
        }))
    }, [props.wires])

    const byId = useMemo(() => {
        const m = new Map<number, EditorNodeUi>()
        for (const n of props.nodes) m.set(n.localId, n)
        return m
    }, [props.nodes])

    const closeCtx = useCallback(() => {
        setCtx(null)
        setCtxErr(null)
        setCtxBusy(false)
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeCtx()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [closeCtx])

    const onConnect = useCallback(
        (c: Connection) => {
            if (!c.source || !c.target) return
            if (c.sourceHandle !== "OUT") return
            if (c.targetHandle !== "A" && c.targetHandle !== "B") return

            const from = Number(c.source)
            const to = Number(c.target)
            if (from === to) return

            const fromN = byId.get(from)
            const toN = byId.get(to)
            if (!fromN || !toN) return

            const hideB = NODE_SPEC[toN.type]?.ports?.hideB ?? false
            if (c.targetHandle === "B" && hideB) return

            if (fromN.valueType !== toN.valueType) return

            props.upsertWire(from, to, c.targetHandle)
        },
        [props, byId]
    )

    const onNodeDragStop = useCallback(
        (_: unknown, node: { id: string; position: { x: number; y: number } }) => {
            const id = Number(node.id)
            if (!Number.isFinite(id)) return
            props.onNodesChange((prev) => prev.map((n) => (n.localId === id ? { ...n, x: node.position.x, y: node.position.y } : n)))
        },
        [props]
    )

    const onNodeClick = useCallback(
        (_: unknown, node: { id: string }) => {
            const id = Number(node.id)
            if (Number.isFinite(id)) props.onSelectNode(id)
        },
        [props]
    )

    const onPaneClick = useCallback(() => {
        closeCtx()
        props.onSelectNode(null)
    }, [props, closeCtx])

    const onEdgeDoubleClick = useCallback(
        (_: unknown, edge: Edge) => {
            const m = edge.id.match(/^(\d+)->(\d+)\.(A|B)$/)
            if (!m) return
            props.deleteWire(Number(m[1]), Number(m[2]), m[3] as "A" | "B")
        },
        [props]
    )

    // ПКМ по ноде
    const onNodeContextMenu = useCallback(
        (e: React.MouseEvent, node: { id: string }) => {
            e.preventDefault()
            e.stopPropagation()
            const id = Number(node.id)
            if (!Number.isFinite(id)) return
            props.onSelectNode(id)
            setCtx({ open: true, x: e.clientX, y: e.clientY, nodeId: id })
            setCtxErr(null)
        },
        [props]
    )

    const ctxNode = useMemo(() => {
        if (!ctx) return null
        return props.nodes.find((n) => n.localId === ctx.nodeId) ?? null
    }, [ctx, props.nodes])

    const ctxRuntime = useMemo(() => {
        if (!ctx) return null
        return props.nodeStateById?.get(ctx.nodeId) ?? null
    }, [ctx, props.nodeStateById])

    const canForce = useMemo(() => {
        return ctxNode != null && isDigitalOutNodeType(ctxNode.type)
    }, [ctxNode])

    const actForce = useCallback(
        async (desired: boolean, holdMs: number) => {
            if (!ctx) return
            if (!canForce) return
            setCtxBusy(true)
            setCtxErr(null)
            try {
                const runtimeId = ctxRuntime?.id ?? ctx.nodeId
                await props.onForceDo(runtimeId, desired, holdMs)
                closeCtx()
            } catch (err) {
                setCtxErr(err instanceof Error ? err.message : String(err))
            } finally {
                setCtxBusy(false)
            }
        },
        [ctx, canForce, ctxRuntime?.id, props, closeCtx]
    )

    const actRelease = useCallback(async () => {
        if (!ctx) return
        if (!canForce) return
        setCtxBusy(true)
        setCtxErr(null)
        try {
            const runtimeId = ctxRuntime?.id ?? ctx.nodeId
            await props.onReleaseDo(runtimeId)
            closeCtx()
        } catch (err) {
            setCtxErr(err instanceof Error ? err.message : String(err))
        } finally {
            setCtxBusy(false)
        }
    }, [ctx, canForce, ctxRuntime?.id, props, closeCtx])

    const rf = useReactFlow()

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const type = e.dataTransfer.getData("application/plc-node") as NodeType
        if (!type) return

        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        props.onCreateNode?.(type, pos)
    }

    return (
        <div style={{ height: 620, border: "1px solid #e5e7eb", borderRadius: 10, position: "relative" }}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                onEdgeDoubleClick={onEdgeDoubleClick}
                fitView
                snapToGrid
                snapGrid={[20, 20]}
                defaultEdgeOptions={{
                    type: "smoothstep",
                    style: { strokeWidth: 2 },
                }}
                onDragOver={onDragOver}
                onDrop={onDrop}
            >

                <Background />
                <Controls />
            </ReactFlow>

            {/* Context menu */}
            {ctx && (
                <div
                    style={{
                        position: "fixed",
                        left: ctx.x,
                        top: ctx.y,
                        zIndex: 9999,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                        minWidth: 220,
                        overflow: "hidden",
                        fontFamily: "system-ui",
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation()
                    }}
                >
                    <div style={{ padding: 10, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        <div style={{ fontWeight: 800, fontSize: 12 }}>
                            Node #{ctx.nodeId} {ctxNode ? ctxNode.type : ""}
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                            out:{" "}
                            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                                {ctxNode ? formatRuntime(ctxNode.valueType, ctxRuntime) : "—"}
                            </span>
                            {ctxRuntime?.forceActive ? (
                                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: "#991b1b" }}>FORCE</span>
                            ) : null}
                        </div>
                        {!canForce && <div style={{ marginTop: 6, fontSize: 12, color: "#991b1b" }}>Force доступен только для DIGITAL_OUT</div>}
                    </div>

                    <div style={{ display: "grid", padding: 8, gap: 6 }}>
                        <MenuBtn disabled={!canForce || ctxBusy} onClick={() => actForce(true, 0)}>
                            Force ON
                        </MenuBtn>
                        <MenuBtn disabled={!canForce || ctxBusy} onClick={() => actForce(false, 0)}>
                            Force OFF
                        </MenuBtn>
                        <MenuBtn disabled={!canForce || ctxBusy} onClick={() => actForce(true, 1000)}>
                            Force ON (1s)
                        </MenuBtn>
                        <MenuBtn disabled={!canForce || ctxBusy} onClick={() => actForce(true, 5000)}>
                            Force ON (5s)
                        </MenuBtn>
                        <div style={{ height: 1, background: "#e5e7eb", margin: "4px 0" }} />
                        <MenuBtn disabled={!canForce || ctxBusy} onClick={actRelease}>
                            Release
                        </MenuBtn>
                        <MenuBtn disabled={ctxBusy} onClick={closeCtx}>
                            Close
                        </MenuBtn>

                        {ctxErr && (
                            <div style={{ padding: 8, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 12 }}>
                                {ctxErr}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function MenuBtn(props: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            disabled={props.disabled}
            onClick={props.onClick}
            style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: props.disabled ? "#f3f4f6" : "#fff",
                color: props.disabled ? "#9ca3af" : "#111827",
                fontWeight: 700,
                cursor: props.disabled ? "not-allowed" : "pointer",
                textAlign: "left",
            }}
        >
            {props.children}
        </button>
    )
}
