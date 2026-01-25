// src/features/plc/plc.mem.api.ts

export type MemType = "bool" | "int" | "real"

export type MemInfo = {
    boolCount: number
    intCount: number
    realCount: number
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body == null ? undefined : JSON.stringify(body),
    })

    const text = await r.text()
    let json: any = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        // если сервер вернул не-JSON
    }

    if (!r.ok) {
        const msg = json?.error || `HTTP ${r.status}`
        throw new Error(msg)
    }

    return json as T
}

export async function memInfo(): Promise<MemInfo> {
    // Ktor: { ok:true, values:{boolCount,intCount,realCount} }
    const resp = await postJson<{ ok: boolean; values: MemInfo; error?: string }>("/api/plc/mem/info")
    if (!resp.ok) throw new Error(resp.error || "memInfo: ok=false")
    return resp.values
}

export async function memReset(): Promise<boolean> {
    // Ktor: { ok:true, values:true/false }
    const resp = await postJson<{ ok: boolean; values: boolean; error?: string }>("/api/plc/mem/reset")
    if (!resp.ok) throw new Error(resp.error || "memReset: ok=false")
    return !!resp.values
}

export async function memRead(type: MemType, from: number, count: number): Promise<boolean[] | number[]> {
    // Ktor: { ok:true, values:[...] }
    const resp = await postJson<{ ok: boolean; values: any[]; error?: string }>("/api/plc/mem/read", {
        type,
        from,
        count,
    })
    if (!resp.ok) throw new Error(resp.error || "memRead: ok=false")
    return resp.values ?? []
}

export async function memWriteBool(from: number, values: boolean[]): Promise<number> {
    // Ktor: { ok:true, written:n }
    const resp = await postJson<{ ok: boolean; written: number; error?: string }>("/api/plc/mem/write/bool", {
        from,
        values,
    })
    if (!resp.ok) throw new Error(resp.error || "memWriteBool: ok=false")
    return resp.written ?? 0
}

export async function memWriteInt(from: number, values: number[]): Promise<number> {
    const resp = await postJson<{ ok: boolean; written: number; error?: string }>("/api/plc/mem/write/int", {
        from,
        values,
    })
    if (!resp.ok) throw new Error(resp.error || "memWriteInt: ok=false")
    return resp.written ?? 0
}

export async function memWriteReal(from: number, values: number[]): Promise<number> {
    const resp = await postJson<{ ok: boolean; written: number; error?: string }>("/api/plc/mem/write/real", {
        from,
        values,
    })
    if (!resp.ok) throw new Error(resp.error || "memWriteReal: ok=false")
    return resp.written ?? 0
}
