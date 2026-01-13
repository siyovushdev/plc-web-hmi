export type PlcStatus = {
    connection: {
        ip: string
        port: number
        mode: string
        uptime: string
        lastExchangeAgo: string
        linkStatus: string
    }
    performance: {
        scanAvgMs: number
        scanMaxMs: number
        scanLimitMs: number
        cpuLoadPercent: number
        memoryUsagePercent: number
        crcErrors: number
        timeouts: number
        scanLongSteps: number
    }
    ioSummary: {
        diUsed: number
        diTotal: number
        doUsed: number
        doTotal: number
        aiUsed: number
        aiTotal: number
        pwmUsed: number
        pwmTotal: number
    }
    activeGraph: {
        name: string
        version: string
        nodes: number
        connections: number
        inputs: number
        outputs: number
        compileErrors: number
        activatedAt: string
        runState: string
    }
    alarms: unknown[]
    nodes: PlcNodeState[]
    isLoading: boolean
    errorMessage: string | null
}

export type PlcNodeState = {
    id: number
    type: string
    valueType: number
    outBool: boolean
    outInt: number | null
    outFloat: number | null
    tonMs: number | null
    toffLeftMs: number | null
    pidSp: number | null
    pidPv: number | null
    pidI: number | null
    pidU: number | null
    forceActive: boolean
    forceValue: boolean | null
    forceLeftMs: number | null
}

export type ApiFail = { ok: false; error?: string }
export function isApiFail(x: unknown): x is ApiFail {
    return typeof x === "object" && x !== null && "ok" in x && (x as { ok?: unknown }).ok === false
}

export type ForceReq = { nodeIndex: number; valueInt: number; holdMs?: number }
export type ReleaseReq = { nodeIndex: number }
