import { isApiFail } from "./plc.types"
import type { PlcStatus, ForceReq, ReleaseReq, PlcLogDump } from "./plc.types"


const TIMEOUT_STATUS = 8000
const TIMEOUT_GRAPH_READ = 15000
const TIMEOUT_GRAPH_UPLOAD = 60000
const TIMEOUT_GRAPH_ACTIVATE = 30000
const TIMEOUT_PERSIST = 30000
const TIMEOUT_LOG = 15000

const API_BASE = import.meta.env.VITE_API_BASE ?? ""

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    try {
        const r = await fetch(`${API_BASE}${path}`, {
            ...init,
            signal: ac.signal,
            headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        })

        const ct = r.headers.get("content-type") ?? ""
        const body: unknown = ct.includes("application/json")
            ? await r.json().catch(() => null)
            : await r.text().catch(() => null)

        if (!r.ok) {
            if (typeof body === "string") throw new Error(body)
            if (isApiFail(body)) throw new Error(body.error ?? `HTTP ${r.status}`)
            throw new Error(`HTTP ${r.status}`)
        }
        if (isApiFail(body)) throw new Error(body.error ?? "API error")
        return body as T
    } finally {
        clearTimeout(t)
    }
}



export async function forceOutput(nodeIndex: number, desired: boolean, holdMs = 0): Promise<boolean> {
    const req: ForceReq = { nodeIndex, valueInt: desired ? 1 : 0, holdMs }
    const resp = await fetchJson<{ ok: boolean }>("/api/plc/output/force", {
        method: "POST",
        body: JSON.stringify(req),
    })
    return resp.ok
}

export async function releaseOutput(nodeIndex: number): Promise<boolean> {
    const req: ReleaseReq = { nodeIndex }
    const resp = await fetchJson<{ ok: boolean }>("/api/plc/output/release", {
        method: "POST",
        body: JSON.stringify(req),
    })
    return resp.ok
}


export type ActiveGraphMeta = { graphJson: string; sha256: string }


export async function getPlcStatus(): Promise<PlcStatus> {
    return fetchJson<PlcStatus>("/api/plc/status", { method: "GET" }, TIMEOUT_STATUS)
}

export async function uploadGraph(graphJson: string): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/graph/upload", {
        method: "POST",
        body: JSON.stringify({ graphJson }),
    }, TIMEOUT_GRAPH_UPLOAD)
}

export async function activateGraph(): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/graph/activate", {
        method: "POST",
    }, TIMEOUT_GRAPH_ACTIVATE)
}

export async function getActiveGraphJson(): Promise<string> {
    const resp = await fetchJson<{ ok: boolean; graphJson: unknown }>(
        "/api/plc/graph/active",
        { method: "GET" },
        TIMEOUT_GRAPH_READ
    )

    return typeof resp.graphJson === "string"
        ? resp.graphJson
        : JSON.stringify(resp.graphJson)
}

export async function getActiveGraphMeta(): Promise<ActiveGraphMeta | null> {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), TIMEOUT_GRAPH_READ)

    try {
        const r = await fetch("/api/plc/graph/active", {
            method: "GET",
            signal: ac.signal,
        })

        if (r.status === 404) return null
        if (!r.ok) throw new Error(`HTTP ${r.status}`)

        const j = (await r.json()) as { ok: boolean; graphJson: unknown; sha256: string }

        return {
            graphJson: typeof j.graphJson === "string"
                ? j.graphJson
                : JSON.stringify(j.graphJson),
            sha256: j.sha256,
        }
    } finally {
        clearTimeout(t)
    }
}

export async function persistSave(): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/persist/save", { method: "POST" }, TIMEOUT_PERSIST)
}

export async function persistLoad(): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/persist/load", { method: "POST" }, TIMEOUT_PERSIST)
}

export async function getPlcLogDump(from = 0, count = 64): Promise<PlcLogDump> {
    return fetchJson<PlcLogDump>(
        `/api/plc/log/dump?from=${from}&count=${count}`,
        { method: "GET" },
        TIMEOUT_LOG
    )
}

// Удобно для UI: получить последние N записей (tail), а не "с начала"
export async function getPlcLogTail(count = 64): Promise<PlcLogDump> {
    // 1) спросим total
    const head = await getPlcLogDump(0, 1)
    const total = head.total ?? 0
    const from = Math.max(0, total - count)

    // 2) теперь tail
    return getPlcLogDump(from, count)
}

