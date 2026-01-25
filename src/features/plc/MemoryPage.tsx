// src/features/plc/MemoryPage.tsx

import { useEffect, useMemo, useRef, useState } from "react"
import type { MemInfo, MemType } from "./plc.mem.api"
import { memInfo, memRead, memReset, memWriteBool, memWriteInt, memWriteReal } from "./plc.mem.api"

type Row = {
    addr: number
    value: boolean | number
    edited: boolean
}

function clamp(v: number, min: number, max: number) {
    if (!Number.isFinite(v)) return min
    return Math.max(min, Math.min(max, v))
}

function formatValue(type: MemType, v: boolean | number) {
    if (type === "bool") return (v ? "1" : "0")
    if (type === "int") return String((v as number) | 0)
    // real
    const n = Number(v)
    if (!Number.isFinite(n)) return "0"
    // без лишнего шума
    const s = n.toFixed(6)
    return s.replace(/\.?0+$/g, "")
}

function parseInput(type: MemType, s: string): boolean | number {
    const t = s.trim().toLowerCase()
    if (type === "bool") {
        return t === "1" || t === "true" || t === "on" || t === "yes"
    }
    if (type === "int") {
        const n = parseInt(t, 10)
        return Number.isFinite(n) ? n : 0
    }
    // real
    const n = Number(t.replace(",", "."))
    return Number.isFinite(n) ? n : 0
}

export function MemoryPage() {
    const [info, setInfo] = useState<MemInfo | null>(null)

    const [type, setType] = useState<MemType>("bool")
    const [from, setFrom] = useState(0)
    const [count, setCount] = useState(32)

    const [rows, setRows] = useState<Row[]>([])
    const [status, setStatus] = useState<string>("")
    const [busy, setBusy] = useState(false)

    const editedCount = useMemo(() => rows.reduce((acc, r) => acc + (r.edited ? 1 : 0), 0), [rows])

    const maxCount = useMemo(() => {
        if (!info) return null
        if (type === "bool") return info.boolCount
        if (type === "int") return info.intCount
        return info.realCount
    }, [info, type])

    const canRead = useMemo(() => {
        if (!maxCount) return true
        return from >= 0 && from < maxCount && count > 0
    }, [from, count, maxCount])

    const lastLoadedKeyRef = useRef<string>("")

    async function onInfo() {
        setBusy(true)
        setStatus("")
        try {
            const x = await memInfo()
            setInfo(x)
            setStatus("MEM INFO: OK")
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "MEM INFO: error")
        } finally {
            setBusy(false)
        }
    }

    async function onReset() {
        setBusy(true)
        setStatus("")
        try {
            const ok = await memReset()
            setStatus(`MEM RESET: ${ok ? "OK" : "FAIL"}`)
            // после reset — перечитать текущий диапазон
            await onRead()
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "MEM RESET: error")
        } finally {
            setBusy(false)
        }
    }

    async function onRead() {
        if (!canRead) return
        setBusy(true)
        setStatus("")
        try {
            const f = clamp(from, 0, 65535)
            const c = clamp(count, 1, 512) // ограничим для UI, чтобы не вешать
            const arr = await memRead(type, f, c)

            const newRows: Row[] = (arr as any[]).map((v, i) => ({
                addr: f + i,
                value: v,
                edited: false,
            }))

            setRows(newRows)
            lastLoadedKeyRef.current = `${type}:${f}:${c}`
            setStatus(`READ: OK (${newRows.length})`)
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "READ: error")
        } finally {
            setBusy(false)
        }
    }

    function onEdit(addr: number, nextText: string) {
        setRows((prev) =>
            prev.map((r) => {
                if (r.addr !== addr) return r
                const nextVal = parseInput(type, nextText)
                // edited = отличается от “как было при read”
                // берём “как было” через lastLoadedKey, но проще:
                // считаем edited всегда true после правки (и можно вернуть вручную)
                return { ...r, value: nextVal, edited: true }
            })
        )
    }

    function onRevertAll() {
        // просто перечитать текущий диапазон
        void onRead()
    }

    async function onWriteChanged() {
        const changed = rows.filter((r) => r.edited)
        if (changed.length === 0) return

        // Требование: write API пишет подряд от from.
        // Поэтому делаем простой вариант: если изменения НЕ подряд — пишем блоками.
        // Сгруппируем по непрерывным адресам.
        const blocks: { from: number; values: (boolean | number)[] }[] = []
        const sorted = [...changed].sort((a, b) => a.addr - b.addr)

        let curFrom = sorted[0].addr
        let cur: (boolean | number)[] = [sorted[0].value]

        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1]
            const now = sorted[i]
            if (now.addr === prev.addr + 1) {
                cur.push(now.value)
            } else {
                blocks.push({ from: curFrom, values: cur })
                curFrom = now.addr
                cur = [now.value]
            }
        }
        blocks.push({ from: curFrom, values: cur })

        setBusy(true)
        setStatus("")
        try {
            let totalWritten = 0

            for (const b of blocks) {
                if (type === "bool") {
                    totalWritten += await memWriteBool(b.from, b.values as boolean[])
                } else if (type === "int") {
                    totalWritten += await memWriteInt(b.from, b.values as number[])
                } else {
                    totalWritten += await memWriteReal(b.from, b.values as number[])
                }
            }

            setStatus(`WRITE: OK (written=${totalWritten}, blocks=${blocks.length})`)

            // после write — перечитать, чтобы сбросить edited и получить фактические значения
            await onRead()
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "WRITE: error")
        } finally {
            setBusy(false)
        }
    }

    // Авто подгрузка info один раз
    useEffect(() => {
        void onInfo()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Если поменяли type — очищаем и подсказку статуса
    useEffect(() => {
        setRows([])
        setStatus("")
    }, [type])

    const cardStyle: React.CSSProperties = {
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        background: "rgba(10, 16, 30, 0.35)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    }

    const btnStyle: React.CSSProperties = {
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        cursor: "pointer",
    }

    const btnPrimary: React.CSSProperties = {
        ...btnStyle,
        border: "1px solid rgba(255,255,255,0.28)",
        background: "rgba(255,255,255,0.10)",
        fontWeight: 600,
    }

    const inputStyle: React.CSSProperties = {
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.20)",
        color: "rgba(255,255,255,0.92)",
        padding: "0 10px",
        outline: "none",
    }

    return (
        <div style={{ padding: 24, maxWidth: 1100 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.2 }}>Memory</div>
                    <div style={{ opacity: 0.7, marginTop: 4 }}>
                        Read / edit / write PLC memory (BOOL / INT / REAL)
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button style={btnStyle} disabled={busy} onClick={onInfo}>
                        MEM INFO
                    </button>
                    <button style={btnStyle} disabled={busy} onClick={onReset}>
                        MEM RESET
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
                {/* LEFT: Controls + Table */}
                <div style={{ ...cardStyle, padding: 14 }}>
                    {/* Controls row */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ opacity: 0.75, width: 46 }}>Type</div>
                            <select
                                style={{ ...inputStyle, width: 140 }}
                                value={type}
                                disabled={busy}
                                onChange={(e) => setType(e.target.value as MemType)}
                            >
                                <option value="bool">bool</option>
                                <option value="int">int</option>
                                <option value="real">real</option>
                            </select>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ opacity: 0.75, width: 46 }}>From</div>
                            <input
                                style={{ ...inputStyle, width: 120 }}
                                type="number"
                                value={from}
                                disabled={busy}
                                onChange={(e) => setFrom(parseInt(e.target.value || "0", 10))}
                            />
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ opacity: 0.75, width: 46 }}>Count</div>
                            <input
                                style={{ ...inputStyle, width: 120 }}
                                type="number"
                                value={count}
                                disabled={busy}
                                onChange={(e) => setCount(parseInt(e.target.value || "0", 10))}
                            />
                        </div>

                        <div style={{ opacity: 0.6 }}>
                            {maxCount != null ? `max=${maxCount}` : ""}
                        </div>

                        <div style={{ flex: 1 }} />

                        <button style={btnPrimary} disabled={busy || !canRead} onClick={onRead}>
                            READ
                        </button>

                        <button style={btnStyle} disabled={busy || rows.length === 0} onClick={onRevertAll}>
                            REVERT
                        </button>

                        <button style={btnPrimary} disabled={busy || editedCount === 0} onClick={onWriteChanged}>
                            WRITE CHANGED {editedCount > 0 ? `(${editedCount})` : ""}
                        </button>
                    </div>

                    {/* Status */}
                    <div style={{ marginTop: 10, opacity: 0.75, minHeight: 20 }}>
                        {busy ? "…" : status}
                    </div>

                    {/* Table */}
                    <div style={{ marginTop: 12, overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                            <tr style={{ background: "rgba(255,255,255,0.06)" }}>
                                <th style={{ textAlign: "left", padding: "10px 12px", width: 140, opacity: 0.85 }}>Address</th>
                                <th style={{ textAlign: "left", padding: "10px 12px", opacity: 0.85 }}>Value</th>
                                <th style={{ textAlign: "left", padding: "10px 12px", width: 120, opacity: 0.85 }}>State</th>
                            </tr>
                            </thead>
                            <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: 14, opacity: 0.65 }}>
                                        No data. Press READ.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.addr} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                        <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", opacity: 0.9 }}>
                                            {type.toUpperCase()}[{r.addr}]
                                        </td>
                                        <td style={{ padding: "8px 12px" }}>
                                            {type === "bool" ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!r.value}
                                                            disabled={busy}
                                                            onChange={(e) => onEdit(r.addr, e.target.checked ? "1" : "0")}
                                                        />
                                                        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                                {formatValue(type, r.value)}
                              </span>
                                                    </label>
                                                </div>
                                            ) : (
                                                <input
                                                    style={{
                                                        ...inputStyle,
                                                        width: 220,
                                                        borderColor: r.edited ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.14)",
                                                        background: r.edited ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.20)",
                                                    }}
                                                    disabled={busy}
                                                    value={formatValue(type, r.value)}
                                                    onChange={(e) => onEdit(r.addr, e.target.value)}
                                                />
                                            )}
                                        </td>
                                        <td style={{ padding: "8px 12px", opacity: 0.85 }}>
                                            {r.edited ? "DIRTY" : "OK"}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.6, fontSize: 13 }}>
                        Tip: можно менять только пару адресов — они уйдут блоками (contiguous ranges).
                    </div>
                </div>

                {/* RIGHT: Info card */}
                <div style={{ ...cardStyle, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Memory Info</div>

                    {!info ? (
                        <div style={{ opacity: 0.65 }}>No info yet. Press MEM INFO.</div>
                    ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <div style={{ opacity: 0.75 }}>BOOL</div>
                                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{info.boolCount}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <div style={{ opacity: 0.75 }}>INT</div>
                                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{info.intCount}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <div style={{ opacity: 0.75 }}>REAL</div>
                                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{info.realCount}</div>
                            </div>

                            <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" }} />

                            <div style={{ opacity: 0.65, fontSize: 13, lineHeight: 1.45 }}>
                                • READ загружает диапазон в таблицу<br />
                                • Редактирование помечает DIRTY<br />
                                • WRITE CHANGED пишет только изменённые адреса
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
