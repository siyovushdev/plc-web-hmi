import { useMemo, useState } from "react"
import { usePlcStatus } from "./usePlcStatus"

const ui = {
    cardBg: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.14)",
    text: "#e5e7eb",
    subText: "rgba(229,231,235,0.75)",
    badBg: "rgba(239,68,68,0.12)",
    badText: "#fecaca",
    goodBg: "rgba(34,197,94,0.16)",
    goodText: "#bbf7d0",
    btnBg: "rgba(255,255,255,0.08)",
    btnBorder: "rgba(255,255,255,0.18)",
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                padding: 12,
                border: `1px solid ${ui.cardBorder}`,
                borderRadius: 12,
                background: ui.cardBg,
            }}
        >
            <div style={{ color: ui.subText, fontSize: 12, letterSpacing: 0.2 }}>{title}</div>
            <div style={{ marginTop: 6, color: ui.text }}>{children}</div>
        </div>
    )
}

function Badge({ text, ok }: { text: string; ok: boolean }) {
    return (
        <span
            style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: `1px solid ${ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
                background: ok ? ui.goodBg : ui.badBg,
                color: ok ? ui.goodText : ui.badText,
                marginLeft: 8,
                whiteSpace: "nowrap",
            }}
        >
      {text}
    </span>
    )
}

function ValueOrDash({ v, suffix = "" }: { v: number; suffix?: string }) {
    // 0 у нас часто означает "unknown" (CPU/MEM/CRC) — показываем "—"
    if (v === 0) return <span style={{ color: ui.subText }}>—</span>
    return (
        <span>
      {v}
            {suffix}
    </span>
    )
}

export function StatusPage() {
    const { status, error, refresh } = usePlcStatus(1000)
    const [showRaw, setShowRaw] = useState(false)

    const linkOk = useMemo(() => {
        const s = status?.connection.linkStatus?.toUpperCase() ?? ""
        return s === "OK"
    }, [status])

    if (!status) {
        return (
            <div style={{ padding: 24, color: ui.text }}>
                <h2 style={{ marginTop: 0, color: ui.text }}>Status</h2>
                {error && <div style={{ color: ui.badText }}>{error}</div>}
                <div style={{ marginTop: 12, color: ui.subText }}>Loading...</div>
            </div>
        )
    }

    return (
        <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", color: ui.text }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0, color: ui.text }}>Status</h2>
                    <div style={{ marginTop: 6, color: ui.subText }}>
                        {status.connection.ip}:{status.connection.port}
                        <Badge text={`${status.connection.linkStatus} · mode-${status.connection.mode}`} ok={linkOk} />
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, color: ui.subText }}>
                        <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                        raw JSON
                    </label>

                    <button
                        onClick={refresh}
                        style={{
                            padding: "8px 12px",
                            background: ui.btnBg,
                            border: `1px solid ${ui.btnBorder}`,
                            borderRadius: 10,
                            color: ui.text,
                            cursor: "pointer",
                        }}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div
                    style={{
                        marginTop: 16,
                        padding: 12,
                        borderRadius: 12,
                        background: ui.badBg,
                        border: "1px solid rgba(239,68,68,0.35)",
                        color: ui.badText,
                    }}
                >
                    {error}
                </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <Card title="Mode / Uptime">
                    <div style={{ fontWeight: 700 }}>{status.connection.mode}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>{status.connection.uptime}</div>
                </Card>

                <Card title="Last exchange">
                    <div style={{ fontWeight: 700 }}>{status.connection.lastExchangeAgo}</div>
                </Card>

                <Card title="Cycle / Scan avg / max">
                    <div style={{ fontWeight: 700 }}>
                        {status.performance.scanAvgMs} / {status.performance.scanMaxMs} ms
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>
                        cycle {status.performance.scanLimitMs} ms
                    </div>
                </Card>

                <Card title="Cycle / Scan avg / max">
                    <div style={{ fontWeight: 700 }}>
                        {formatScan(
                            status.performance.scanAvgMs,
                            status.performance.scanMaxMs,
                            status.performance.scanAvgUs,
                            status.performance.scanMaxUs
                        )}
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>
                        cycle {status.performance.scanLimitMs} ms
                    </div>
                </Card>


                <Card title="CPU / MEM">
                    <div style={{ fontWeight: 700 }}>
                        <ValueOrDash v={status.performance.cpuLoadPercent} suffix="%" />{" "}
                        <span style={{ color: ui.subText }}>/</span>{" "}
                        <ValueOrDash v={status.performance.memoryUsagePercent} suffix="%" />
                    </div>
                </Card>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Card title="Timeouts (client)">
                    <div style={{ fontWeight: 700 }}>{status.performance.timeouts}</div>
                </Card>

                <Card title="CRC errors">
                    <div style={{ fontWeight: 700 }}>
                        <ValueOrDash v={status.performance.crcErrors} />
                    </div>
                </Card>

                <Card title="Scan long steps">
                    <div style={{ fontWeight: 700 }}>{status.performance.scanLongSteps}</div>
                </Card>
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, border: `1px solid ${ui.cardBorder}`, borderRadius: 12, background: ui.cardBg }}>
                    <div style={{ color: ui.subText, fontSize: 12 }}>Active graph</div>
                    <div style={{ fontWeight: 700, marginTop: 6 }}>
                        {status.activeGraph.name} · {status.activeGraph.runState}
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12, marginTop: 6 }}>
                        nodes={status.activeGraph.nodes} · conn={status.activeGraph.connections} · errors={status.activeGraph.compileErrors}
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>
                        inputs={status.activeGraph.inputs} · outputs={status.activeGraph.outputs} · activatedAt={status.activeGraph.activatedAt}
                    </div>
                </div>

                <div style={{ padding: 12, border: `1px solid ${ui.cardBorder}`, borderRadius: 12, background: ui.cardBg }}>
                    <div style={{ color: ui.subText, fontSize: 12 }}>IO summary</div>
                    <div style={{ fontWeight: 700, marginTop: 6 }}>
                        DI {status.ioSummary.diUsed}/{status.ioSummary.diTotal} · DO {status.ioSummary.doUsed}/{status.ioSummary.doTotal}
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12, marginTop: 6 }}>
                        AI {status.ioSummary.aiUsed}/{status.ioSummary.aiTotal} · PWM {status.ioSummary.pwmUsed}/{status.ioSummary.pwmTotal}
                    </div>
                </div>
            </div>

            {showRaw && (
                <pre
                    style={{
                        marginTop: 16,
                        background: "rgba(0,0,0,0.35)",
                        border: `1px solid ${ui.cardBorder}`,
                        color: ui.text,
                        padding: 12,
                        borderRadius: 12,
                        overflow: "auto",
                    }}
                >
          {JSON.stringify(status, null, 2)}
        </pre>
            )}
        </div>
    )
}

function formatScan(avgMs: number, maxMs: number, avgUs?: number, maxUs?: number) {
    // если есть microseconds — показываем красиво
    if ((avgUs ?? 0) > 0 || (maxUs ?? 0) > 0) {
        const a = (avgUs ?? Math.round(avgMs * 1000)).toString()
        const m = (maxUs ?? Math.round(maxMs * 1000)).toString()
        return `${a} / ${m} us`
    }

    // иначе fallback на ms
    const a = avgMs < 1 ? avgMs.toFixed(3) : avgMs.toFixed(2)
    const m = maxMs < 1 ? maxMs.toFixed(3) : maxMs.toFixed(2)
    return `${a} / ${m} ms`
}
