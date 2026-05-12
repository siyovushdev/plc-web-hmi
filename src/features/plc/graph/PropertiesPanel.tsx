import { useMemo, useState } from "react"
import type { EditorNodeUi, WireUi } from "./editorTypes"
import type { PlcNodeState } from "../plc.types"
import { NODE_SPEC } from "./nodeUiSpec"

type Props = {
    selectedNode: EditorNodeUi | null
    nodeState: PlcNodeState | null
    nodeStateById: Map<number, PlcNodeState>

    // нужно для INPUTS (показывать подключения)
    nodes: EditorNodeUi[]
    wires: WireUi[]

    onApply: (id: number, patch: Partial<EditorNodeUi>) => void
    onDelete: (id: number) => void
}

type VT = 0 | 1 | 2

function vtLabel(vt: number): "BOOL" | "INT" | "REAL" {
    if (vt === 0) return "BOOL"
    if (vt === 1) return "INT"
    return "REAL"
}

function nodeCaption(n: EditorNodeUi) {
    return `${n.type} (Node${n.localId})`
}

function fmtMs(ms: number | null | undefined) {
    if (ms == null) return "—"
    return `${ms} ms`
}

function fmtReal(v: number | null | undefined) {
    if (v == null) return "—"
    return Number(v).toFixed(3)
}

function fmtBool(v: boolean | null | undefined) {
    if (v == null) return "—"
    return v ? "TRUE" : "FALSE"
}

function formatOut(vt: number, r: PlcNodeState | null): string {
    if (!r) return "—"
    if (vt === 0) return r.outBool ? "TRUE" : "FALSE"
    if (vt === 1) return String(r.outInt ?? 0)
    if (vt === 2) return r.outFloat == null ? "—" : Number(r.outFloat).toFixed(3)
    return "—"
}

function isDigitalOut(type: string) {
    return type === "DIGITAL_OUT"
}

export function PropertiesPanel(props: Props) {
    const n = props.selectedNode
    const spec = n ? NODE_SPEC[n.type] : undefined
    const ports = spec?.ports ?? {}
    const hideB = ports.hideB ?? false

    // id -> node
    const byId = useMemo(() => {
        const m = new Map<number, EditorNodeUi>()
        for (const x of props.nodes) m.set(x.localId, x)
        return m
    }, [props.nodes])

    // входные подключения A/B
    const inA = useMemo(() => {
        if (!n) return null
        return props.wires.find((w) => w.toNode === n.localId && w.toPort === "A") ?? null
    }, [props.wires, n])

    const inB = useMemo(() => {
        if (!n) return null
        return props.wires.find((w) => w.toNode === n.localId && w.toPort === "B") ?? null
    }, [props.wires, n])

    const inALabel = useMemo(() => {
        if (!n || !inA) return "—"
        const src = byId.get(inA.fromNode)
        if (!src) return "—"
        return `Node${src.localId}.OUT`
    }, [n, inA, byId])

    const inBLabel = useMemo(() => {
        if (!n || !inB) return "—"
        const src = byId.get(inB.fromNode)
        if (!src) return "—"
        return `Node${src.localId}.OUT`
    }, [n, inB, byId])

    // draft state (важно: параметры в EditorNodeUi — СТРОКИ)
    const [valueType, setValueType] = useState<VT>(((n?.valueType ?? 0) as VT))
    const [paramInt, setParamInt] = useState<string>(n?.paramInt ?? "0")
    const [paramFloat, setParamFloat] = useState<string>(n?.paramFloat ?? "0")
    const [paramMs, setParamMs] = useState<string>(n?.paramMs ?? "0")
    const [flags, setFlags] = useState<string>(n?.flags ?? "0")




    const dirty = useMemo(() => {
        if (!n) return false
        return (
            valueType !== ((n.valueType ?? 0) as VT) ||
            paramInt !== (n.paramInt ?? "0") ||
            paramFloat !== (n.paramFloat ?? "0") ||
            paramMs !== (n.paramMs ?? "0") ||
            flags !== (n.flags ?? "0")
        )
    }, [n, valueType, paramInt, paramFloat, paramMs, flags])

    const apply = () => {
        if (!n || n.localId == null) return
        props.onApply(n.localId, { valueType, paramInt, paramFloat, paramMs, flags })
    }

    const revert = () => {
        if (!n) return
        setValueType((n.valueType ?? 0) as VT)
        setParamInt(n.paramInt ?? "0")
        setParamFloat(n.paramFloat ?? "0")
        setParamMs(n.paramMs ?? "0")
        setFlags(n.flags ?? "0")
    }


    if (!n) {
        return (
            <div className="plc-props" style={{ opacity: 0.8 }}>
                <div className="plc-props__cap">PROPERTIES</div>
                <div style={{ padding: 12, color: "rgba(255,255,255,.6)" }}>Выбери ноду на канвасе</div>
            </div>
        )
    }

    const runtime = props.nodeState

    // runtime строго по типу
    const showRuntimeTON = n.type === "TON"
    const showRuntimeTOFF = n.type === "TOFF"
    const showRuntimeTP = n.type === "TP"
    const showRuntimePID = n.type === "PID"

    const showAnyRuntime = showRuntimeTON || showRuntimeTOFF || showRuntimeTP || showRuntimePID


    return (
        <div className="plc-props">
            {/* HEADER */}
            <div className="plc-props__title">
                <div>
                    <div className="plc-props__cap">NODE:</div>
                    <div className="plc-props__name">{nodeCaption(n)}</div>
                </div>
                <div className="plc-props__id">
                    <div className="plc-props__cap">ID</div>
                    <div className="plc-props__val">{n.localId}</div>
                </div>
            </div>

            {/* VALUE TYPE (селект под заголовком) */}
            <div className="plc-props-sec">
                <div className="plc-props-sec__hdr">VALUE TYPE</div>
                <div className="plc-props-sec__body">
                    <select className="plc-select" value={valueType} onChange={(e) => setValueType(Number(e.target.value) as VT)}>
                        <option value={0}>BOOL</option>
                        <option value={1}>INT</option>
                        <option value={2}>REAL</option>
                    </select>
                </div>
            </div>

            {/* INPUTS (A/B + показываем подключение NodeX.OUT) */}
            <div className="plc-props-sec">
                <div className="plc-props-sec__hdr">INPUTS</div>
                <div className="plc-props-sec__body">
                    <div className="plc-kv">
                        <div className="plc-kv__k">{ports.a ?? "A"}</div>
                        <div className="plc-kv__v">{inALabel}</div>
                    </div>

                    {!hideB && (
                        <div className="plc-kv">
                            <div className="plc-kv__k">{ports.b ?? "B"}</div>
                            <div className="plc-kv__v">{inBLabel}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* OUTPUTS */}
            <div className="plc-props-sec">
                <div className="plc-props-sec__hdr">OUTPUTS</div>
                <div className="plc-props-sec__body">
                    <div className="plc-kv">
                        <div className="plc-kv__k">OUT</div>
                        <div className="plc-kv__v">
                            {vtLabel(valueType)} {formatOut(valueType, runtime)}
                        </div>
                    </div>

                    {/* FORCE только для DIGITAL_OUT */}
                    {isDigitalOut(n.type) && (
                        <>
                            <div className="plc-kv">
                                <div className="plc-kv__k">FORCE</div>
                                <div className="plc-kv__v">{runtime?.forceActive ? "ON" : "OFF"}</div>
                            </div>

                            <div className="plc-kv">
                                <div className="plc-kv__k">F_VAL</div>
                                <div className="plc-kv__v">{fmtBool((runtime as any)?.forceValue ?? null)}</div>
                            </div>

                            <div className="plc-kv">
                                <div className="plc-kv__k">F_LEFT</div>
                                <div className="plc-kv__v">{fmtMs((runtime as any)?.forceLeftMs ?? null)}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* RUNTIME строго по типу */}
            {showAnyRuntime && (
                <div className="plc-props-sec">
                    <div className="plc-props-sec__hdr">RUNTIME</div>
                    <div className="plc-props-sec__body">
                        {showRuntimeTON && (
                            <>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">IN</div>
                                    <div className="plc-kv__v">{fmtBool((runtime as any)?.inBool ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">PT</div>
                                    <div className="plc-kv__v">{fmtMs(Number(n.paramMs || "0"))}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">Q</div>
                                    <div className="plc-kv__v">{fmtBool(runtime?.outBool ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">ET</div>
                                    <div className="plc-kv__v">{fmtMs((runtime as any)?.tonMs ?? null)}</div>
                                </div>
                            </>
                        )}

                        {showRuntimeTOFF && (
                            <>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">Q</div>
                                    <div className="plc-kv__v">{fmtBool(runtime?.outBool ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">LEFT</div>
                                    <div className="plc-kv__v">{fmtMs((runtime as any)?.toffLeftMs ?? null)}</div>
                                </div>
                            </>
                        )}

                        {showRuntimeTP && (
                            <>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">Q</div>
                                    <div className="plc-kv__v">{fmtBool(runtime?.outBool ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">LEFT</div>
                                    <div className="plc-kv__v">{fmtMs((runtime as any)?.tpLeftMs ?? null)}</div>
                                </div>
                            </>
                        )}

                        {showRuntimePID && (
                            <>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">SP</div>
                                    <div className="plc-kv__v">{fmtReal((runtime as any)?.pidSp ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">PV</div>
                                    <div className="plc-kv__v">{fmtReal((runtime as any)?.pidPv ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">I</div>
                                    <div className="plc-kv__v">{fmtReal((runtime as any)?.pidI ?? null)}</div>
                                </div>
                                <div className="plc-kv">
                                    <div className="plc-kv__k">U</div>
                                    <div className="plc-kv__v">{fmtReal((runtime as any)?.pidU ?? null)}</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* PARAMETERS (всегда 4 поля; NODE_SPEC — только подсказки) */}
            <div className="plc-props-sec">
                <div className="plc-props-sec__hdr">PARAMETERS</div>
                <div className="plc-props-sec__body">

                    <div className="plc-props-field">
                        <div className="plc-props-field__lbl">
                            paramInt{spec?.intLabel ? <span className="plc-props-field__hint"> — {spec.intLabel}</span> : null}
                        </div>
                        <input
                            className="plc-input"
                            type="text"
                            value={paramInt}
                            onChange={(e) => setParamInt(e.target.value)}
                        />
                    </div>

                    <div className="plc-props-field">
                        <div className="plc-props-field__lbl">
                            paramFloat{spec?.floatLabel ? <span className="plc-props-field__hint"> — {spec.floatLabel}</span> : null}
                        </div>
                        <input
                            className="plc-input"
                            type="text"
                            value={paramFloat}
                            onChange={(e) => setParamFloat(e.target.value)}
                        />
                    </div>

                    <div className="plc-props-field">
                        <div className="plc-props-field__lbl">
                            delayMs{spec?.msLabel ? <span className="plc-props-field__hint"> — {spec.msLabel}</span> : null}
                        </div>
                        <input
                            className="plc-input"
                            type="text"
                            value={paramMs}
                            onChange={(e) => setParamMs(e.target.value)}
                        />
                    </div>

                    <div className="plc-props-field">
                        <div className="plc-props-field__lbl">
                            flags{spec?.flagsLabel ? <span className="plc-props-field__hint"> — {spec.flagsLabel}</span> : null}
                        </div>
                        <input
                            className="plc-input"
                            type="text"
                            value={flags}
                            onChange={(e) => setFlags(e.target.value)}
                        />
                    </div>

                </div>
            </div>


            {/* ACTIONS */}
            <div className="plc-props__btns">
                <button className="plc-btn plc-btn--ghost" disabled={!dirty} onClick={revert}>
                    Revert
                </button>
                <button className="plc-btn plc-btn--blue" disabled={!dirty} onClick={apply}>
                    Apply
                </button>
            </div>

            <button
                className="plc-btn"
                style={{ borderColor: "rgba(239,68,68,.35)", background: "rgba(239,68,68,.10)" }}
                onClick={() => props.onDelete(n.localId)}
            >
                Delete node
            </button>
        </div>
    )
}
