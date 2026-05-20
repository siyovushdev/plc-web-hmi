export type PlcConnection = {
    fromNode: number
    fromPort: string
    toNode: number
    toPort: string
}

export type PlcStatus = {
    connection: {
        ip: string
        port: number
        mode: string
        uptime: string
        lastExchangeAgo: string
        linkStatus: string
        running?: boolean
        activeGraphValid?: boolean
        safeOrFault?: boolean
    }
    performance: {
        // scan (только plc_tick / scan графа)
        scanAvgMs: number
        scanMaxMs: number
        scanAvgUs: number
        scanMaxUs: number

        // full cycle work (всё внутри TaskPlcScan без сна osDelayUntil)
        workAvgMs: number
        workMaxMs: number
        workAvgUs: number
        workMaxUs: number

        // real period between cycle starts (факт, с учетом планировщика)
        cycleRealAvgMs: number
        cycleRealMaxMs: number

        // configured target cycle
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
        size?: number
        crc32?: string
        nodes: number
        connections: number
        inputs: number
        outputs: number
        compileErrors: number
        activatedAt: string
        runState: string
        runtimeFault?: number
        runtimeFaultCounter?: number
    }
    alarms: unknown[]
    nodes: PlcNodeState[]
    connections?: PlcConnection[]
    isLoading: boolean
    errorMessage: string | null
}

export type PlcNodeInputs = Record<string, boolean | number | null>

export type PlcNodeState = {
    index?: number
    id: number
    type: string
    valueType: number
    inA?: number
    inB?: number
    inputs?: PlcNodeInputs
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

export type PlcRuntimeStreamState = "disabled" | "connecting" | "online" | "fallback" | "error"

export type PlcRuntimeHelloMessage = {
    type: "hello"
    proto?: number
    device?: string
    mode?: string
    connected?: boolean
}

export type PlcRuntimeTopologyMessage = {
    type: "topology"
    graph?: Partial<PlcStatus["activeGraph"]>
    nodes?: Array<Partial<PlcNodeState> & { index: number; id?: number; type?: string }>
    connections?: PlcConnection[]
}

export type PlcRuntimeMessage = {
    type: "runtime"
    cycleCounter?: number
    scanAvgUs?: number
    scanMaxUs?: number
    cpuLoadPercent?: number
    nodes?: Array<Partial<PlcNodeState> & { index: number }>
}

export type PlcRuntimeIoMessage = {
    type: "io"
    diUsed?: number
    diTotal?: number
    doUsed?: number
    doTotal?: number
    aiUsed?: number
    aiTotal?: number
    pwmUsed?: number
    pwmTotal?: number
}

export type PlcRuntimeAlarmMessage = {
    type: "alarm"
    safeOrFault?: boolean
    runtimeFault?: number
    runtimeFaultCounter?: number
    items?: unknown[]
}

export type PlcRuntimeWsMessage =
    | PlcRuntimeHelloMessage
    | PlcRuntimeTopologyMessage
    | PlcRuntimeMessage
    | PlcRuntimeIoMessage
    | PlcRuntimeAlarmMessage

export type ApiFail = { ok: false; error?: string }
export function isApiFail(x: unknown): x is ApiFail {
    return typeof x === "object" && x !== null && "ok" in x && (x as { ok?: unknown }).ok === false
}

export type ForceReq = { nodeIndex: number; valueInt: number; holdMs?: number }
export type ReleaseReq = { nodeIndex: number }

export type PlcLogItem = {
    tsMs: number
    code: number
    a: number
    b: number
}

export type PlcLogDump = {
    total: number
    from: number
    count: number
    items: PlcLogItem[]
}
