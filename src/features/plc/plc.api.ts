import type { PlcStatus, ForceReq, ReleaseReq } from "./plc.types"
import { isApiFail } from "./plc.types"

const API_BASE = import.meta.env.VITE_API_BASE ?? ""

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
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

export async function getPlcStatus(): Promise<PlcStatus> {
    return fetchJson<PlcStatus>("/api/plc/status", { method: "GET" })
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

export async function uploadGraph(graphJson: string): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/graph/upload", {
        method: "POST",
        body: JSON.stringify({ graphJson }),
    })
}

export async function activateGraph(): Promise<unknown> {
    return fetchJson<unknown>("/api/plc/graph/activate", {
        method: "POST",
    })
}

// NEW: get active graphJson (последний успешно activate)
export async function getActiveGraphJson(): Promise<string> {
    const resp = await fetchJson<{ ok: boolean; graphJson: string }>("/api/plc/graph/active", { method: "GET" })
    return resp.graphJson
}

