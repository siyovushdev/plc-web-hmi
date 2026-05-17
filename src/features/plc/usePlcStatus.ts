import { useCallback, useEffect, useRef, useState } from "react"
import type { PlcNodeState, PlcStatus } from "./plc.types"
import { forceOutput, getPlcStatus, releaseOutput } from "./plc.api"

export function usePlcStatus(pollMs = 250) {
    const [status, setStatus] = useState<PlcStatus | null>(null)
    const [receivedAtMs, setReceivedAtMs] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const [busyNodeId, setBusyNodeId] = useState<number | null>(null)

    const timerRef = useRef<number | null>(null)
    const inFlightRef = useRef(false)

    const refresh = useCallback(async () => {
        if (inFlightRef.current) return
        inFlightRef.current = true
        try {
            const s = await getPlcStatus()
            setStatus(s)
            setReceivedAtMs(Date.now())
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error")
        } finally {
            inFlightRef.current = false
        }
    }, [])

    useEffect(() => {
        refresh()
        timerRef.current = window.setInterval(refresh, pollMs)
        return () => {
            if (timerRef.current != null) window.clearInterval(timerRef.current)
            timerRef.current = null
        }
    }, [pollMs, refresh])

    // id (node.id) -> index in status.nodes[] (nodeIndex for STM32)
    const getNodeIndex = useCallback(
        (nodeId: number) => {
            if (!status) throw new Error("No status yet")
            const idx = status.nodes.findIndex((n) => n.id === nodeId)
            if (idx < 0) throw new Error(`Node not found in status: id=${nodeId}`)
            return idx
        },
        [status]
    )

    const toggleDigitalOutNode = useCallback(
        async (node: PlcNodeState) => {
            if (node.type !== "DIGITAL_OUT") return
            setBusyNodeId(node.id)
            try {
                const desired = !node.outBool
                const nodeIndex = getNodeIndex(node.id) // <-- FIX
                const ok = await forceOutput(nodeIndex, desired, 0) // <-- FIX
                if (!ok) throw new Error("Force failed")
                await refresh()
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error")
            } finally {
                setBusyNodeId(null)
            }
        },
        [getNodeIndex, refresh]
    )

    const releaseNode = useCallback(
        async (node: PlcNodeState) => {
            setBusyNodeId(node.id)
            try {
                const nodeIndex = getNodeIndex(node.id) // <-- FIX
                const ok = await releaseOutput(nodeIndex) // <-- FIX
                if (!ok) throw new Error("Release failed")
                await refresh()
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error")
            } finally {
                setBusyNodeId(null)
            }
        },
        [getNodeIndex, refresh]
    )

    return { status, receivedAtMs, error, busyNodeId, refresh, toggleDigitalOutNode, releaseNode }
}
