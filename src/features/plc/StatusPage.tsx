import { useMemo, useState } from "react"
import { usePlcStatus } from "./usePlcStatus"

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{title}</div>
            <div style={{ marginTop: 6 }}>{children}</div>
        </div>
    )
}

function Badge({ text, ok }: { text: string; ok: boolean }) {
    return (
        <span
            style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 12,
                border: "1px solid #e5e7eb",
                background: ok ? "#dcfce7" : "#fee2e2",
                color: ok ? "#166534" : "#991b1b",
                marginLeft: 8,
            }}
        >
      {text}
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
            <div style={{ padding: 24 }}>
                <h2 style={{ marginTop: 0 }}>Status</h2>
                {error && <div style={{ color: "#991b1b" }}>{error}</div>}
                <div style={{ marginTop: 12 }}>Loading...</div>
            </div>
        )
    }

    return (
        <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Status</h2>
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                        {status.connection.ip}:{status.connection.port}
                        <Badge text={status.connection.linkStatus} ok={linkOk} />
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, opacity: 0.9 }}>
                        <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                        raw JSON
                    </label>
                    <button onClick={refresh} style={{ padding: "8px 12px" }}>
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
                    {error}
                </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <Card title="Mode / Uptime">
                    <div style={{ fontWeight: 700 }}>{status.connection.mode}</div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>{status.connection.uptime}</div>
                </Card>

                <Card title="Last exchange">
                    <div style={{ fontWeight: 700 }}>{status.connection.lastExchangeAgo}</div>
                </Card>

                <Card title="Scan avg / max">
                    <div style={{ fontWeight: 700 }}>
                        {status.performance.scanAvgMs} / {status.performance.scanMaxMs} ms
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>limit {status.performance.scanLimitMs} ms</div>
                </Card>

                <Card title="CPU / MEM">
                    <div style={{ fontWeight: 700 }}>
                        {status.performance.cpuLoadPercent}% / {status.performance.memoryUsagePercent}%
                    </div>
                </Card>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Card title="Timeouts">
                    <div style={{ fontWeight: 700 }}>{status.performance.timeouts}</div>
                </Card>

                <Card title="CRC errors">
                    <div style={{ fontWeight: 700 }}>{status.performance.crcErrors}</div>
                </Card>

                <Card title="Scan long steps">
                    <div style={{ fontWeight: 700 }}>{status.performance.scanLongSteps}</div>
                </Card>
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Active graph</div>
                    <div style={{ fontWeight: 700, marginTop: 6 }}>
                        {status.activeGraph.name} · {status.activeGraph.runState}
                    </div>
                    <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6 }}>
                        nodes={status.activeGraph.nodes} · conn={status.activeGraph.connections} · errors={status.activeGraph.compileErrors}
                    </div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>
                        inputs={status.activeGraph.inputs} · outputs={status.activeGraph.outputs} · activatedAt={status.activeGraph.activatedAt}
                    </div>
                </div>

                <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>IO summary</div>
                    <div style={{ fontWeight: 700, marginTop: 6 }}>
                        DI {status.ioSummary.diUsed}/{status.ioSummary.diTotal} · DO {status.ioSummary.doUsed}/{status.ioSummary.doTotal}
                    </div>
                    <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6 }}>
                        AI {status.ioSummary.aiUsed}/{status.ioSummary.aiTotal} · PWM {status.ioSummary.pwmUsed}/{status.ioSummary.pwmTotal}
                    </div>
                </div>
            </div>

            {showRaw && (
                <pre style={{ marginTop: 16, background: "#f3f4f6", padding: 12, borderRadius: 10, overflow: "auto" }}>
          {JSON.stringify(status, null, 2)}
        </pre>
            )}
        </div>
    )
}
