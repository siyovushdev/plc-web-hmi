import { useCallback, useEffect, useRef, useState } from "react"
import type { PlcRuntimeStreamState, PlcRuntimeWsMessage, PlcStatus } from "./plc.types"
import { getPlcStatus } from "./plc.api"

const WS_PATH = "/api/plc/ws/runtime"
const WS_RECONNECT_MS = 1500
const REST_FALLBACK_MS = 1000

function makeWsUrl(): string | null {
    if (typeof window === "undefined") return null

    const envBase = import.meta.env.VITE_API_BASE as string | undefined
    const base = envBase && envBase.length > 0 ? envBase : window.location.origin

    try {
        const url = new URL(WS_PATH, base)
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
        return url.toString()
    } catch {
        return null
    }
}

function mergeWs(prev: PlcStatus, msg: PlcRuntimeWsMessage): PlcStatus {
    if (msg.type === "hello") {
        return {
            ...prev,
            connection: {
                ...prev.connection,
                mode: msg.mode ?? prev.connection.mode,
                linkStatus: msg.connected === false ? "OFFLINE" : "ONLINE",
            },
        }
    }

    if (msg.type === "topology") {
        return {
            ...prev,
            activeGraph: {
                ...prev.activeGraph,
                ...msg.graph,
                nodes: msg.graph?.nodes ?? msg.nodes?.length ?? prev.activeGraph.nodes,
                connections: msg.graph?.connections ?? msg.connections?.length ?? prev.activeGraph.connections,
            },
            nodes: msg.nodes?.length
                ? msg.nodes.map((n) => {
                    const old = prev.nodes.find((p) => p.index === n.index || p.id === n.id || p.id === n.index)
                    return {
                        ...(old ?? {
                            id: n.id ?? n.index,
                            valueType: 0,
                            outBool: false,
                            outInt: 0,
                            outFloat: 0,
                            tonMs: 0,
                            toffLeftMs: 0,
                            pidSp: null,
                            pidPv: null,
                            pidI: null,
                            pidU: null,
                            forceActive: false,
                            forceValue: false,
                            forceLeftMs: 0,
                        }),
                        ...n,
                        id: n.id ?? old?.id ?? n.index,
                        index: n.index,
                        type: n.type ?? old?.type ?? "NODE",
                    }
                })
                : prev.nodes,
            connections: msg.connections ?? prev.connections,
        }
    }

    if (msg.type === "runtime") {
        return {
            ...prev,
            connection: { ...prev.connection, linkStatus: "ONLINE" },
            performance: {
                ...prev.performance,
                scanAvgUs: msg.scanAvgUs ?? prev.performance.scanAvgUs,
                scanMaxUs: msg.scanMaxUs ?? prev.performance.scanMaxUs,
                scanAvgMs: msg.scanAvgUs != null ? msg.scanAvgUs / 1000 : prev.performance.scanAvgMs,
                scanMaxMs: msg.scanMaxUs != null ? msg.scanMaxUs / 1000 : prev.performance.scanMaxMs,
                cpuLoadPercent: msg.cpuLoadPercent ?? prev.performance.cpuLoadPercent,
            },
            nodes: msg.nodes?.length
                ? prev.nodes.map((node) => {
                    const patch = msg.nodes?.find((n) => n.index === node.index || n.index === node.id)
                    return patch ? { ...node, ...patch } : node
                })
                : prev.nodes,
        }
    }

    if (msg.type === "io") {
        return {
            ...prev,
            ioSummary: {
                ...prev.ioSummary,
                diUsed: msg.diUsed ?? prev.ioSummary.diUsed,
                diTotal: msg.diTotal ?? prev.ioSummary.diTotal,
                doUsed: msg.doUsed ?? prev.ioSummary.doUsed,
                doTotal: msg.doTotal ?? prev.ioSummary.doTotal,
                aiUsed: msg.aiUsed ?? prev.ioSummary.aiUsed,
                aiTotal: msg.aiTotal ?? prev.ioSummary.aiTotal,
                pwmUsed: msg.pwmUsed ?? prev.ioSummary.pwmUsed,
                pwmTotal: msg.pwmTotal ?? prev.ioSummary.pwmTotal,
            },
        }
    }

    if (msg.type === "alarm") {
        return {
            ...prev,
            connection: {
                ...prev.connection,
                safeOrFault: msg.safeOrFault ?? prev.connection.safeOrFault,
            },
            activeGraph: {
                ...prev.activeGraph,
                runtimeFault: msg.runtimeFault ?? prev.activeGraph.runtimeFault,
                runtimeFaultCounter: msg.runtimeFaultCounter ?? prev.activeGraph.runtimeFaultCounter,
            },
            alarms: msg.items ?? prev.alarms,
        }
    }

    return prev
}

export function usePlcRuntimeStream() {
    const [status, setStatus] = useState<PlcStatus | null>(null)
    const [streamState, setStreamState] = useState<PlcRuntimeStreamState>("connecting")
    const [receivedAtMs, setReceivedAtMs] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const wsRef = useRef<WebSocket | null>(null)
    const restTimerRef = useRef<number | null>(null)
    const reconnectTimerRef = useRef<number | null>(null)
    const mountedRef = useRef(false)
    const wsOnlineRef = useRef(false)

    const refresh = useCallback(async () => {
        try {
            const s = await getPlcStatus()
            setStatus(s)
            setReceivedAtMs(Date.now())
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Status request failed")
        }
    }, [])

    const startRestFallback = useCallback(() => {
        if (restTimerRef.current != null) return
        restTimerRef.current = window.setInterval(refresh, REST_FALLBACK_MS)
    }, [refresh])

    const stopRestFallback = useCallback(() => {
        if (restTimerRef.current != null) window.clearInterval(restTimerRef.current)
        restTimerRef.current = null
    }, [])

    useEffect(() => {
        mountedRef.current = true
        refresh()

        const wsUrl = makeWsUrl()
        if (!wsUrl) {
            setStreamState("disabled")
            startRestFallback()
            return () => {
                mountedRef.current = false
                stopRestFallback()
            }
        }

        const connect = () => {
            if (!mountedRef.current) return
            setStreamState(wsOnlineRef.current ? "online" : "connecting")

            const ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onopen = () => {
                if (!mountedRef.current) return
                wsOnlineRef.current = true
                setStreamState("online")
                setError(null)
                stopRestFallback()
            }

            ws.onmessage = (event) => {
                if (!mountedRef.current) return
                try {
                    const msg = JSON.parse(String(event.data)) as PlcRuntimeWsMessage
                    setStatus((prev) => (prev ? mergeWs(prev, msg) : prev))
                    setReceivedAtMs(Date.now())
                    setError(null)
                } catch (e) {
                    setError(e instanceof Error ? e.message : "Bad WebSocket message")
                }
            }

            ws.onerror = () => {
                if (!mountedRef.current) return
                setStreamState("error")
            }

            ws.onclose = () => {
                if (!mountedRef.current) return
                if (wsRef.current === ws) wsRef.current = null
                wsOnlineRef.current = false
                setStreamState("fallback")
                startRestFallback()

                if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = window.setTimeout(connect, WS_RECONNECT_MS)
            }
        }

        connect()

        return () => {
            mountedRef.current = false
            stopRestFallback()

            if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null

            if (wsRef.current != null) {
                wsRef.current.close()
                wsRef.current = null
            }
        }
    }, [refresh, startRestFallback, stopRestFallback])

    return { status, streamState, receivedAtMs, error, refresh }
}
