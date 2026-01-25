import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PlcLogDump, PlcLogItem } from "./plc.types"
import { getPlcLogDump, getPlcLogTail } from "./plc.api"

const CODE_NAME: Record<number, string> = {
    1: "BOOT",
    2: "UPLOAD_OK",
    3: "UPLOAD_FAIL",
    4: "ACTIVATE_OK",
    5: "ACTIVATE_FAIL",
    6: "PERSIST_SAVE_OK",
    7: "PERSIST_SAVE_FAIL",
    8: "PERSIST_LOAD_OK",
    9: "PERSIST_LOAD_FAIL",
    10: "CRC_ERR",
    11: "CBOR_DECODE_ERR",
    12: "VALIDATE_ERR",
    13: "FORCE",
    14: "RELEASE",
    15: "SCAN_OVERRUN",
    16: "SCAN_LONG",
    17: "WATCHDOG",
    18: "ASSERT",
    19: "PERSIST_LOAD_REQ", // если добавлял
    20: "LOG_VALUE",
}


function fmtTs(ms: number) {
    // пока tsMs=0 — будет 0. Позже, когда починишь tick, станет нормально
    if (!ms) return "0"
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const ss = s % 60
    const mm = m % 60
    return `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

export function LogPage() {
    const [dump, setDump] = useState<PlcLogDump | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [auto, setAuto] = useState(true)
    const [pageSize, setPageSize] = useState(64)

    const inFlight = useRef(false)

    const refreshTail = useCallback(async () => {
        if (inFlight.current) return
        inFlight.current = true
        try {
            const d = await getPlcLogTail(pageSize)
            setDump(d)
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            inFlight.current = false
        }
    }, [pageSize])

    const loadOlder = useCallback(async () => {
        if (!dump) return
        if (inFlight.current) return
        inFlight.current = true
        try {
            const from = Math.max(0, dump.from - pageSize)
            const d = await getPlcLogDump(from, pageSize)
            setDump(d)
            setError(null)
            setAuto(false) // при ручной навигации авто лучше выключать
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            inFlight.current = false
        }
    }, [dump, pageSize])

    const loadNewer = useCallback(async () => {
        if (!dump) return
        if (inFlight.current) return
        inFlight.current = true
        try {
            const from = Math.min(dump.total, dump.from + pageSize)
            const d = await getPlcLogDump(from, pageSize)
            setDump(d)
            setError(null)
            setAuto(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            inFlight.current = false
        }
    }, [dump, pageSize])

    useEffect(() => {
        refreshTail()
    }, [refreshTail])

    useEffect(() => {
        if (!auto) return
        const t = window.setInterval(() => refreshTail(), 1000)
        return () => window.clearInterval(t)
    }, [auto, refreshTail])

    const rows = useMemo(() => dump?.items ?? [], [dump])

    const hdrStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }
    const btn: React.CSSProperties = {
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.08)",
        color: "#e5e7eb",
        cursor: "pointer",
    }

    return (
        <div style={{ padding: 16 }}>
            <div style={hdrStyle}>
                <h2 style={{ margin: 0 }}>PLC Log</h2>

                <button style={btn} onClick={refreshTail}>Refresh</button>
                <button style={btn} onClick={loadOlder} disabled={!dump || dump.from <= 0}>Older</button>
                <button style={btn} onClick={loadNewer} disabled={!dump || dump.from + dump.count >= dump.total}>Newer</button>

                <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.95 }}>
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                    Auto (1s)
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ opacity: 0.75 }}>Page</span>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                        style={{ padding: "6px 8px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.18)" }}
                    >
                        {[32, 64, 128, 256].map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </label>

                <div style={{ opacity: 0.7 }}>
                    {dump ? `total=${dump.total} from=${dump.from} count=${dump.count}` : "—"}
                </div>
            </div>

            {error && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,80,80,0.25)", background: "rgba(255,80,80,0.08)" }}>
                    {error}
                </div>
            )}

            <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ background: "rgba(255,255,255,0.06)" }}>
                    <tr>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 110 }}>ts</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 110 }}>code</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 180 }}>name</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 90 }}>a</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 90 }}>b</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td style={{ padding: 12, opacity: 0.7 }} colSpan={5}>No log entries</td>
                        </tr>
                    ) : (
                        rows.map((it: PlcLogItem, idx) => (
                            <tr key={`${dump?.from ?? 0}-${idx}`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {fmtTs(it.tsMs)}
                                </td>
                                <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {it.code}
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                    {CODE_NAME[it.code] ?? "UNKNOWN"}
                                </td>
                                <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {it.a}
                                </td>
                                <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {it.b}
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
                Примечание: сейчас tsMs=0, потому что tick/timebase на MCU не тикает. Таблица всё равно полезна для порядка событий.
            </div>
        </div>
    )
}
