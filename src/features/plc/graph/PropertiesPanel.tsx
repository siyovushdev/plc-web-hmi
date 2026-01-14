import { useEffect, useMemo, useState } from "react"
import type { EditorNodeUi } from "./editorTypes"
import { NODE_TYPES, type NodeType } from "./nodeCatalog"
import { NODE_SPEC, type ParamSpec } from "./nodeUiSpec"
import type { PlcNodeState } from "../plc.types" // <-- лучше без .ts

const DEFAULT_SPEC: ParamSpec = { showInt: true, showFloat: true, showMs: true, showFlags: true }

type Props = {
    selectedNode: EditorNodeUi | null
    nodeState: PlcNodeState | null
    nodeStateById: Map<number, PlcNodeState>
    onApply: (localId: number, patch: Partial<EditorNodeUi>) => void
    onDelete: (localId: number) => void
}

export function PropertiesPanel({ selectedNode, nodeState, nodeStateById, onApply, onDelete }: Props) {
    const [draft, setDraft] = useState<EditorNodeUi | null>(null)

    useEffect(() => {
        setDraft(selectedNode ? { ...selectedNode } : null)
    }, [selectedNode?.localId]) // намеренно по id

    const spec = useMemo(() => {
        if (!draft) return DEFAULT_SPEC
        return (NODE_SPEC[draft.type] ?? DEFAULT_SPEC) as ParamSpec
    }, [draft?.type])

    if (!draft) {
        return <div style={{ color: "var(--muted)", fontWeight: 900 }}>Выбери ноду на canvas</div>
    }

    const changed =
        !!selectedNode &&
        (draft.type !== selectedNode.type ||
            draft.valueType !== selectedNode.valueType ||
            draft.paramInt !== selectedNode.paramInt ||
            draft.paramFloat !== selectedNode.paramFloat ||
            draft.paramMs !== selectedNode.paramMs ||
            draft.flags !== selectedNode.flags)

    const showInt = spec.showInt ?? true
    const showFloat = spec.showFloat ?? true
    const showMs = spec.showMs ?? true
    const showFlags = spec.showFlags ?? true

    const apply = () => {
        onApply(draft.localId, {
            type: draft.type,
            valueType: draft.valueType,
            paramInt: draft.paramInt,
            paramFloat: draft.paramFloat,
            paramMs: draft.paramMs,
            flags: draft.flags,
        })
    }

    const revert = () => setDraft(selectedNode ? { ...selectedNode } : null)

    // --- INPUTS как в PLC: берем значения из узлов, подключенных в inA/inB ---
    const inAState = draft.inA >= 0 ? nodeStateById.get(draft.inA) ?? null : null
    const inBState = draft.inB >= 0 ? nodeStateById.get(draft.inB) ?? null : null

    return (
        <div className="plc-props">
            <div className="plc-props__title">
                <div>
                    <div className="plc-props__cap">NODE:</div>
                    <div className="plc-props__name">
                        {draft.type} <span style={{ opacity: 0.65, fontWeight: 900 }}> (Node{draft.localId})</span>
                    </div>
                </div>
                <div className="plc-props__id">
                    <div className="plc-props__cap">ID</div>
                    <div className="plc-props__val">{draft.localId}</div>
                </div>
            </div>

            <Section title="GENERAL">
                <Field label="Type">
                    <select
                        className="plc-select"
                        value={draft.type}
                        onChange={(e) => {
                            const newType = e.target.value as NodeType
                            const expected = NODE_SPEC[newType]?.expectedValueType
                            setDraft((p) =>
                                !p
                                    ? p
                                    : {
                                        ...p,
                                        type: newType,
                                        ...(expected != null ? { valueType: expected as 0 | 1 | 2 } : {}),
                                        ...(NODE_SPEC[newType]?.ports?.hideB ? { inB: -1 } : {}),
                                    }
                            )
                        }}
                    >
                        {NODE_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field label="Value Type">
                    <select
                        className="plc-select"
                        value={draft.valueType}
                        onChange={(e) => setDraft((p) => (p ? { ...p, valueType: Number(e.target.value) as 0 | 1 | 2 } : p))}
                    >
                        <option value={0}>BOOL</option>
                        <option value={1}>INT</option>
                        <option value={2}>REAL</option>
                    </select>
                </Field>
            </Section>

            <Section title="INPUTS">
                <KvRow k="A" v={fmtTypedValue(inAState)} />
                <KvRow k="B" v={fmtTypedValue(inBState)} />
            </Section>

            <Section title="OUTPUTS">
                <KvRow k="OUT" v={fmtTypedValue(nodeState)} />
                <KvRow k="FORCE" v={nodeState?.forceActive ? "ON" : "OFF"} />
                <KvRow k="F_VAL" v={fmtBoolMaybe(nodeState?.forceValue)} />
                <KvRow k="F_LEFT" v={fmtMsMaybe(nodeState?.forceLeftMs)} />
            </Section>

            <Section title="RUNTIME">
                <KvRow k="TON" v={fmtMsMaybe(nodeState?.tonMs)} />
                <KvRow k="TOFF_LEFT" v={fmtMsMaybe(nodeState?.toffLeftMs)} />
                <KvRow k="PID_SP" v={fmtNumberMaybe(nodeState?.pidSp)} />
                <KvRow k="PID_PV" v={fmtNumberMaybe(nodeState?.pidPv)} />
                <KvRow k="PID_I" v={fmtNumberMaybe(nodeState?.pidI)} />
                <KvRow k="PID_U" v={fmtNumberMaybe(nodeState?.pidU)} />
            </Section>

            <Section title="PARAMETERS">
                {showInt && (
                    <Field label={spec.intLabel ?? "paramInt"}>
                        <input className="plc-input" value={draft.paramInt} onChange={(e) => setDraft((p) => (p ? { ...p, paramInt: e.target.value } : p))} />
                    </Field>
                )}
                {showFloat && (
                    <Field label={spec.floatLabel ?? "paramFloat"}>
                        <input className="plc-input" value={draft.paramFloat} onChange={(e) => setDraft((p) => (p ? { ...p, paramFloat: e.target.value } : p))} />
                    </Field>
                )}
                {showMs && (
                    <Field label={spec.msLabel ?? "paramMs"}>
                        <input className="plc-input" value={draft.paramMs} onChange={(e) => setDraft((p) => (p ? { ...p, paramMs: e.target.value } : p))} />
                    </Field>
                )}
                {showFlags && (
                    <Field label={spec.flagsLabel ?? "flags"}>
                        <input className="plc-input" value={draft.flags} onChange={(e) => setDraft((p) => (p ? { ...p, flags: e.target.value } : p))} />
                    </Field>
                )}
            </Section>

            <div className="plc-props__btns">
                <button className="plc-btn plc-btn--ghost" onClick={revert} disabled={!changed}>
                    Revert
                </button>
                <button className="plc-btn plc-btn--blue" onClick={apply} disabled={!changed}>
                    Apply
                </button>
            </div>

            <div style={{ marginTop: 10 }}>
                <button className="plc-btn" onClick={() => onDelete(draft.localId)}>
                    Delete node
                </button>
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="plc-props-sec">
            <div className="plc-props-sec__hdr">{title}</div>
            <div className="plc-props-sec__body">{children}</div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="plc-props-field">
            <div className="plc-props-field__lbl">{label}</div>
            {children}
        </label>
    )
}

function KvRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="plc-kv">
            <div className="plc-kv__k">{k}</div>
            <div className="plc-kv__v">{v}</div>
        </div>
    )
}

// Форматирование "как PLC"
function fmtTypedValue(s: PlcNodeState | null | undefined): string {
    if (!s) return "—"

    // valueType: 0=BOOL, 1=INT, 2=REAL (у тебя так же в editor)
    if (s.valueType === 0) return s.outBool ? "TRUE" : "FALSE"
    if (s.valueType === 1) return s.outInt == null ? "—" : String(s.outInt)
    if (s.valueType === 2) return s.outFloat == null ? "—" : String(s.outFloat)

    // если вдруг придет что-то новое
    return "—"
}

function fmtBoolMaybe(v: unknown): string {
    if (v === true) return "TRUE"
    if (v === false) return "FALSE"
    if (v === 1) return "TRUE"
    if (v === 0) return "FALSE"
    return "—"
}

function fmtMsMaybe(v: unknown): string {
    if (typeof v === "number" && !Number.isNaN(v)) return `${v} ms`
    return "—"
}

function fmtNumberMaybe(v: unknown): string {
    if (typeof v === "number" && !Number.isNaN(v)) return String(v)
    return "—"
}
