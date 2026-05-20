import { useMemo, useState } from "react"
import { usePlcRuntimeStream } from "./usePlcRuntimeStream"

const ui = {
    cardBg: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.14)",
    text: "#e5e7eb",
    subText: "rgba(229,231,235,0.75)",
    badBg: "rgba(239,68,68,0.12)",
    badText: "#fecaca",
    goodBg: "rgba(34,197,94,0.16)",
    goodText: "#bbf7d0",
    warnBg: "rgba(245,158,11,0.14)",
    warnText: "#fde68a",
    btnBg: "rgba(255,255,255,0.08)",
    btnBorder: "rgba(255,255,255,0.18)",
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ padding: 12, border: `1px solid ${ui.cardBorder}`, borderRadius: 12, background: ui.cardBg }}>
            <div style={{ color: ui.subText, fontSize: 12, letterSpacing: 0.2 }}>{title}</div>
            <div style={{ marginTop: 6, color: ui.text }}>{children}</div>
        </div>
    )
}

function StreamBadge({ state }: { state: string }) {
    const ok = state === "online"
    const warn = state === "fallback" || state === "connecting"
    return (
        <span
            style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: `1px solid ${ok ? "rgba(34,197,94,0.35)" : warn ? "rgba(245,158,11,0.35)" : "rgba(239,68,68,0.35)"}`,
                background: ok ? ui.goodBg : warn ? ui.warnBg : ui.badBg,
                color: ok ? ui.goodText : warn ? ui.warnText : ui.badText,
                marginLeft: 8,
                whiteSpace: "nowrap",
            }}
        >
            {state.toUpperCase()}
        </span>
    )
}

export function LiveRuntimePage() {
    const { status, streamState, receivedAtMs, error, refresh } = usePlcRuntimeStream()
    const [showRaw, setShowRaw] = useState(false)

    const receivedAgo = useMemo(() => {
        if (!receivedAtMs) return "—"
        return `${Math.max(0, Date.now() - receivedAtMs)} ms ago`
    }, [receivedAtMs, status])

    if (!status) {
        return (
            <div style={{ padding: 24, color: ui.text }}>
                <h2 style={{ marginTop: 0 }}>Live Runtime</h2>
                <div style={{ color: ui.subText }}>Loading initial PLC snapshot...</div>
                {error && <div style={{ marginTop: 12, color: ui.badText }}>{error}</div>}
            </div>
        )
    }

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", color: ui.text }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Live Runtime</h2>
                    <div style={{ marginTop: 6, color: ui.subText }}>
                        {status.connection.ip}:{status.connection.port}
                        <StreamBadge state={streamState} />
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, color: ui.subText }}>
                        <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                        raw JSON
                    </label>

                    <button
                        onClick={refresh}
                        style={{ padding: "8px 12px", background: ui.btnBg, border: `1px solid ${ui.btnBorder}`, borderRadius: 10, color: ui.text, cursor: "pointer" }}
                    >
                        Refresh snapshot
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: ui.badBg, border: "1px solid rgba(239,68,68,0.35)", color: ui.badText }}>
                    {error}
                </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <Card title="Stream">
                    <div style={{ fontWeight: 800 }}>{streamState}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>last update {receivedAgo}</div>
                </Card>

                <Card title="PLC mode">
                    <div style={{ fontWeight: 800 }}>{status.connection.mode}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>{status.connection.linkStatus}</div>
                </Card>

                <Card title="Scan avg / max">
                    <div style={{ fontWeight: 800 }}>
                        {status.performance.scanAvgUs} / {status.performance.scanMaxUs} us
                    </div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>limit {status.performance.scanLimitMs} ms</div>
                </Card>

                <Card title="CPU / Memory">
                    <div style={{ fontWeight: 800 }}>
                        {status.performance.cpuLoadPercent}% / {status.performance.memoryUsagePercent}%
                    </div>
                </Card>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Card title="Active graph">
                    <div style={{ fontWeight: 800 }}>{status.activeGraph.runState}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>
                        nodes={status.activeGraph.nodes} · connections={status.activeGraph.connections}
                    </div>
                </Card>

                <Card title="IO summary">
                    <div style={{ fontWeight: 800 }}>DI {status.ioSummary.diUsed}/{status.ioSummary.diTotal} · DO {status.ioSummary.doUsed}/{status.ioSummary.doTotal}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>AI {status.ioSummary.aiUsed}/{status.ioSummary.aiTotal}</div>
                </Card>

                <Card title="Errors">
                    <div style={{ fontWeight: 800 }}>CRC {status.performance.crcErrors} · timeouts {status.performance.timeouts}</div>
                    <div style={{ color: ui.subText, fontSize: 12 }}>long steps {status.performance.scanLongSteps}</div>
                </Card>
            </div>

            <div style={{ marginTop: 16, padding: 12, border: `1px solid ${ui.cardBorder}`, borderRadius: 12, background: ui.cardBg }}>
                <div style={{ color: ui.subText, fontSize: 12, marginBottom: 8 }}>Runtime nodes</div>
                <div style={{ display: "grid", gridTemplateColumns: "70px 150px 120px 120px 120px 120px", gap: 0 }}>
                    <Header>index</Header>
                    <Header>type</Header>
                    <Header>outBool</Header>
                    <Header>outInt</Header>
                    <Header>outFloat</Header>
                    <Header>force</Header>

                    {status.nodes.map((n) => (
                        <Row key={`${n.index ?? n.id}-${n.id}`}>
                            <Cell>{n.index ?? n.id}</Cell>
                            <Cell>{n.type}</Cell>
                            <Cell>{String(n.outBool)}</Cell>
                            <Cell>{n.outInt ?? "—"}</Cell>
                            <Cell>{n.outFloat ?? "—"}</Cell>
                            <Cell>{n.forceActive ? String(n.forceValue) : "—"}</Cell>
                        </Row>
                    ))}
                </div>
            </div>

            {(status.connections?.length ?? 0) > 0 && (
                <div style={{ marginTop: 16, padding: 12, border: `1px solid ${ui.cardBorder}`, borderRadius: 12, background: ui.cardBg }}>
                    <div style={{ color: ui.subText, fontSize: 12, marginBottom: 8 }}>Topology connections</div>
                    <pre style={{ margin: 0, overflow: "auto", color: ui.text }}>{JSON.stringify(status.connections, null, 2)}</pre>
                </div>
            )}

            {showRaw && (
                <pre style={{ marginTop: 16, background: "rgba(0,0,0,0.35)", border: `1px solid ${ui.cardBorder}`, color: ui.text, padding: 12, borderRadius: 12, overflow: "auto" }}>
                    {JSON.stringify(status, null, 2)}
                </pre>
            )}
        </div>
    )
}

function Header({ children }: { children: React.ReactNode }) {
    return <div style={{ padding: 8, fontSize: 12, fontWeight: 800, color: "#cbd5e1", borderTop: "1px solid rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.12)" }}>{children}</div>
}

function Cell({ children }: { children: React.ReactNode }) {
    return <div style={{ padding: 8, fontSize: 12, color: ui.text, borderTop: "1px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.08)" }}>{children}</div>
}

function Row({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
