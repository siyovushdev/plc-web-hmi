import { useMemo } from "react"
import { usePlcStatus } from "./usePlcStatus"
import type { PlcNodeState } from "./plc.types"

function Dot({ on }: { on: boolean }) {
    return (
        <span
            style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 999,
                marginRight: 8,
                background: on ? "#22c55e" : "#ef4444",
            }}
        />
    )
}

function NodeValue({ n }: { n: PlcNodeState }) {
    if (n.outInt != null) return <span>{n.outInt}</span>
    if (n.outFloat != null) return <span>{n.outFloat}</span>
    return <span>{String(n.outBool)}</span>
}

export function IoPage() {
    const { status, error, busyNodeId, refresh, toggleDigitalOutNode, releaseNode } = usePlcStatus(1000)


    const nodes = status?.nodes ?? []

    const diNodes = useMemo(() => nodes.filter((n) => n.type === "DIGITAL_IN"), [nodes])
    const doNodes = useMemo(() => nodes.filter((n) => n.type === "DIGITAL_OUT"), [nodes])

    return (
        <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h1 style={{ margin: 0 }}>PLC Web HMI</h1>
                <button onClick={refresh} style={{ padding: "8px 12px" }}>
                    Refresh
                </button>
            </div>

            {error && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
                    {error}
                </div>
            )}

            {!status ? (
                <div style={{ marginTop: 24 }}>Loading...</div>
            ) : (
                <>
                    {/* Connection / Performance */}
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>PLC</div>
                            <div style={{ fontWeight: 700 }}>
                                {status.connection.ip}:{status.connection.port}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>{status.connection.linkStatus}</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>Mode / Uptime</div>
                            <div style={{ fontWeight: 700 }}>{status.connection.mode}</div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>{status.connection.uptime}</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>Scan avg / max</div>
                            <div style={{ fontWeight: 700 }}>
                                {status.performance.scanAvgMs} / {status.performance.scanMaxMs} ms
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>limit {status.performance.scanLimitMs} ms</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>Timeouts / CRC</div>
                            <div style={{ fontWeight: 700 }}>
                                {status.performance.timeouts} / {status.performance.crcErrors}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>
                                CPU {status.performance.cpuLoadPercent}% · MEM {status.performance.memoryUsagePercent}%
                            </div>
                        </div>
                    </div>

                    {/* Graph */}
                    <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                                <div style={{ opacity: 0.7, fontSize: 12 }}>Active graph</div>
                                <div style={{ fontWeight: 700 }}>
                                    {status.activeGraph.name} · {status.activeGraph.runState}
                                </div>
                                <div style={{ opacity: 0.8, fontSize: 12 }}>
                                    nodes={status.activeGraph.nodes} conn={status.activeGraph.connections} errors={status.activeGraph.compileErrors}
                                </div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <div style={{ opacity: 0.7, fontSize: 12 }}>Last exchange</div>
                                <div style={{ fontWeight: 700 }}>{status.connection.lastExchangeAgo}</div>
                            </div>
                        </div>
                    </div>

                    {/* IO summary */}
                    <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>IO summary</div>
                        <div style={{ fontWeight: 700 }}>
                            DI {status.ioSummary.diUsed}/{status.ioSummary.diTotal} · DO {status.ioSummary.doUsed}/{status.ioSummary.doTotal} · AI{" "}
                            {status.ioSummary.aiUsed}/{status.ioSummary.aiTotal} · PWM {status.ioSummary.pwmUsed}/{status.ioSummary.pwmTotal}
                        </div>
                    </div>

                    {/* Nodes */}
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <h3 style={{ marginTop: 0 }}>DIGITAL_IN</h3>
                            {diNodes.length === 0 ? (
                                <div style={{ opacity: 0.7 }}>No DI nodes</div>
                            ) : (
                                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                                    {diNodes.map((n) => (
                                        <li key={n.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div style={{ display: "flex", alignItems: "center" }}>
                                                <Dot on={!!n.outBool} />
                                                <span>#{n.id} · {n.type}</span>
                                            </div>
                                            <NodeValue n={n} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                            <h3 style={{ marginTop: 0 }}>DIGITAL_OUT</h3>
                            {doNodes.length === 0 ? (
                                <div style={{ opacity: 0.7 }}>No DO nodes</div>
                            ) : (
                                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                                    {doNodes.map((n) => (
                                        <li
                                            key={n.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 12,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center" }}>
                                                <Dot on={!!n.outBool} />
                                                <span>
        #{n.id} · {n.type}
                                                    {n.forceActive ? ` · FORCE(${String(n.forceValue)})` : ""}
      </span>
                                            </div>

                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button
                                                    onClick={() => toggleDigitalOutNode(n)}
                                                    disabled={busyNodeId === n.id}
                                                    style={{ padding: "6px 10px" }}
                                                >
                                                    {busyNodeId === n.id ? "..." : "Toggle"}
                                                </button>

                                                <button
                                                    onClick={() => releaseNode(n)}
                                                    disabled={busyNodeId === n.id}
                                                    style={{ padding: "6px 10px" }}
                                                >
                                                    Release
                                                </button>
                                            </div>
                                        </li>
                                    ))}

                                </ul>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
