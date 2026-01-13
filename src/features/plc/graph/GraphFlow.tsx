import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    type Node,
    type Edge,
    type Connection,
    type NodeTypes,
} from "@xyflow/react"
import type {EditorNodeUi, WireUi} from "./editorTypes"
import {NODE_SPEC} from "./nodeUiSpec"
import {useCallback, useMemo} from "react";

type PlcNodeData = { n: EditorNodeUi }

type Kind = "IN" | "OUT" | "TIMER" | "LOGIC" | "MATH" | "MEM" | "ALARM" | "PID" | "OTHER"


type Props = {
    nodes: EditorNodeUi[]
    wires: WireUi[]
    onNodesChange: (patch: (prev: EditorNodeUi[]) => EditorNodeUi[]) => void
    upsertWire: (fromNode: number, toNode: number, toPort: "A" | "B") => void
    deleteWire: (fromNode: number, toNode: number, toPort: "A" | "B") => void
}


function classify(t: string): Kind {
    const s = t.toUpperCase()
    if (s.includes("DIGITAL_IN") || s.includes("AI_IN") || s === "CONST_BOOL" || s === "CONST_INT" || s === "CONST_FLOAT") return "IN"
    if (s.includes("OUT") || s === "AO") return "OUT"
    if (s === "TON" || s === "TOFF" || s === "TP") return "TIMER"
    if (s.includes("AND") || s.includes("OR") || s === "NOT" || s === "XOR" || s === "SR" || s.includes("TRIG")) return "LOGIC"
    if (s.includes("ADD") || s.includes("MATH") || s.includes("SCALE") || s.includes("LIMIT") || s.includes("RAMP") || s.includes("FILTER") || s.includes("AVG")) return "MATH"
    if (s.startsWith("MEM_")) return "MEM"
    if (s.includes("ALARM")) return "ALARM"
    if (s === "PID") return "PID"
    return "OTHER"
}

function palette(k: Kind) {
    switch (k) {
        case "IN":
            return {bar: "#2563eb", bg: "#eff6ff", badge: "#dbeafe", text: "#1d4ed8"}
        case "OUT":
            return {bar: "#16a34a", bg: "#f0fdf4", badge: "#dcfce7", text: "#166534"}
        case "TIMER":
            return {bar: "#f59e0b", bg: "#fffbeb", badge: "#fef3c7", text: "#92400e"}
        case "LOGIC":
            return {bar: "#7c3aed", bg: "#f5f3ff", badge: "#ede9fe", text: "#5b21b6"}
        case "MATH":
            return {bar: "#0ea5e9", bg: "#ecfeff", badge: "#cffafe", text: "#075985"}
        case "MEM":
            return {bar: "#64748b", bg: "#f8fafc", badge: "#e2e8f0", text: "#334155"}
        case "ALARM":
            return {bar: "#ef4444", bg: "#fff1f2", badge: "#ffe4e6", text: "#991b1b"}
        case "PID":
            return {bar: "#111827", bg: "#f3f4f6", badge: "#e5e7eb", text: "#111827"}
        default:
            return {bar: "#9ca3af", bg: "#f9fafb", badge: "#f3f4f6", text: "#374151"}
    }
}

function vtLabel(vt: number) {
    switch (vt) {
        case 0:
            return "BOOL"
        case 1:
            return "INT"
        case 2:
            return "REAL"
        default:
            return `VT:${vt}`
    }
}

export function PlcNode({data}: { data: PlcNodeData }) {
    const n = data.n
    const spec = NODE_SPEC[n.type]
    const ports = spec?.ports ?? {}
    const aLabel = ports.a ?? "A"
    const bLabel = ports.b ?? "B"
    const hideB = ports.hideB ?? false

    const kind = classify(n.type)
    const c = palette(kind)

    const hBase: React.CSSProperties = {
        width: 8,
        height: 8,
        borderRadius: 99,
        border: "1px solid #9ca3af",
        background: "#ffffff",
    }

    const mono: React.CSSProperties = {fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"}

    return (
        <div
            style={{
                width: 170,
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                overflow: "hidden",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                fontFamily: "system-ui",
            }}
        >
            {/* color bar */}
            <div style={{height: 4, background: c.bar}}/>

            {/* body */}
            <div style={{padding: "6px 8px", background: c.bg}}>
                {/* handles */}
                <Handle id="A" type="target" position={Position.Left} style={{...hBase, top: 26}}/>
                {!hideB && <Handle id="B" type="target" position={Position.Left} style={{...hBase, top: 50}}/>}
                <Handle id="OUT" type="source" position={Position.Right} style={{...hBase, top: 38}}/>
                <div style={{ position: "absolute", right: -2, top: 32, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, color: "#6b7280", pointerEvents: "none" }}>OUT</div>
                {/* header */}
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8}}>
                    <div style={{fontWeight: 800, fontSize: 11, color: "#111827"}}>
                        #{n.localId} <span style={{fontWeight: 800}}>{n.type}</span>
                    </div>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: c.badge, color: c.text, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {kind === "TIMER" ? "⏱" : null}{kind}
                                   </span>
                    <div style={{fontSize: 10, opacity: 0.7, ...mono}}>L{n.col ?? 0}</div>
                </div>

                {/* port badges */}
                <div style={{display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap"}}>
          <span style={{fontSize: 10, padding: "2px 6px", borderRadius: 999, background: c.badge, color: c.text}}>
            {aLabel}:{n.inA === -1 ? "—" : n.inA}
          </span>
                    {!hideB && (
                        <span style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: c.badge,
                            color: c.text
                        }}>
              {bLabel}:{n.inB === -1 ? "—" : n.inB}
            </span>
                    )}
                    <span style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        color: "#374151"
                    }}>
 {vtLabel(n.valueType)}
          </span>
                </div>

                {/* params line */}
                <div style={{marginTop: 6, fontSize: 10, opacity: 0.85, ...mono}}>
                    int={n.paramInt} · f={n.paramFloat} · ms={n.paramMs} · fl={n.flags}
                </div>
            </div>
        </div>
    )
}

const nodeTypes: NodeTypes = {
    plcNode: PlcNode,
}

function toRfNodes(nodes: EditorNodeUi[]): Node<PlcNodeData>[] {
    return nodes.map((n) => ({
        id: String(n.localId),
        type: "plcNode",
        position: {x: n.x ?? 0, y: n.y ?? 0},
        data: {n},
    }))
}

function toRfEdges(wires: WireUi[]): Edge[] {
    return wires.map((w) => ({
        id: `${w.fromNode}->${w.toNode}.${w.toPort}`,
        source: String(w.fromNode),
        sourceHandle: "OUT",
        target: String(w.toNode),
        targetHandle: w.toPort, // "A" | "B"
        animated: false,
    }))
}

export function GraphFlow(props: Props) {
    const rfNodes = useMemo(() => toRfNodes(props.nodes), [props.nodes])
    const rfEdges = useMemo(() => toRfEdges(props.wires), [props.wires])

    // Разрешаем только OUT -> (A/B). Остальное режем.
    const onConnect = useCallback(
        (c: Connection) => {
            if (!c.source || !c.target) return
            if (c.sourceHandle !== "OUT") return
            const port = c.targetHandle === "A" || c.targetHandle === "B" ? c.targetHandle : null
            if (!port) return

            const from = Number(c.source)
            const to = Number(c.target)
            if (!Number.isFinite(from) || !Number.isFinite(to)) return
            if (from === to) return

            props.upsertWire(from, to, port)
        },
        [props]
    )

    // Сохраняем drag позицию прямо в твою модель nodes[x/y]
    const onNodeDragStop = useCallback(
        (_: unknown, node: { id: string; position: { x: number; y: number } }) => {
            const id = Number(node.id)
            if (!Number.isFinite(id)) return
            props.onNodesChange((prev) =>
                prev.map((n) => (n.localId === id ? {...n, x: node.position.x, y: node.position.y} : n))
            )
        },
        [props]
    )

    const onEdgeDoubleClick = useCallback(
        (_: unknown, edge: Edge) => {
            // dblclick удаляет wire
            const m = edge.id.match(/^(\d+)->(\d+)\.(A|B)$/)
            if (!m) return
            props.deleteWire(Number(m[1]), Number(m[2]), m[3] as "A" | "B")
        },
        [props]
    )

    return (
        <div style={{height: 620, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden"}}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onEdgeDoubleClick={onEdgeDoubleClick}
                fitView
                snapToGrid
                snapGrid={[20, 20]}
            >
                <Background/>
                <Controls/>
                <MiniMap/>
            </ReactFlow>
        </div>
    )
}
