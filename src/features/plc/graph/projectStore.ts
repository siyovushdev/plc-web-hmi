import type { EditorNodeUi, ProjectUiV2, WireUi, PortId } from "./editorTypes"

const LS_KEY = "plc_project_v2"

function downloadJson(filename: string, json: string) {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function safeParseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null
}

function getNumber(x: unknown): number | null {
    return typeof x === "number" ? x : null
}

function getString(x: unknown): string | null {
    return typeof x === "string" ? x : null
}

function getArray(x: unknown): unknown[] | null {
    return Array.isArray(x) ? x : null
}

function isPortId(x: unknown): x is PortId {
    return x === "A" || x === "B"
}

function isEditorNodeUi(x: unknown): x is EditorNodeUi {
    if (!isRecord(x)) return false
    // минимальная проверка ключей, чтобы не плодить тонны кода
    return (
        typeof x.localId === "number" &&
        typeof x.type === "string" &&
        typeof x.valueType === "number" &&
        typeof x.inA === "number" &&
        typeof x.inB === "number" &&
        typeof x.paramInt === "string" &&
        typeof x.paramFloat === "string" &&
        typeof x.paramMs === "string" &&
        typeof x.flags === "string"
    )
}

function isWireUi(x: unknown): x is WireUi {
    if (!isRecord(x)) return false
    return (
        typeof x.fromNode === "number" &&
        typeof x.toNode === "number" &&
        isPortId(x.toPort)
    )
}

function migrateWiresFromNodes(nodes: EditorNodeUi[]): WireUi[] {
    const wires: WireUi[] = []
    for (const n of nodes) {
        if (n.inA !== -1) wires.push({ fromNode: n.inA, toNode: n.localId, toPort: "A" })
        if (n.inB !== -1) wires.push({ fromNode: n.inB, toNode: n.localId, toPort: "B" })
    }
    return wires
}

function parseProjectV2(obj: unknown): ProjectUiV2 | null {
    if (!isRecord(obj)) return null

    const ver = getNumber(obj.version)
    const cycleMs = getString(obj.cycleMs)
    const nodesArr = getArray(obj.nodes)
    const wiresArr = getArray(obj.wires)

    if (ver !== 2 || cycleMs == null || nodesArr == null || wiresArr == null) return null

    const nodes: EditorNodeUi[] = []
    for (const it of nodesArr) {
        if (!isEditorNodeUi(it)) return null
        nodes.push(it)
    }

    const wires: WireUi[] = []
    for (const it of wiresArr) {
        if (!isWireUi(it)) return null
        wires.push(it)
    }

    return { version: 2, cycleMs, nodes, wires }
}

function parseProjectV1AndMigrate(obj: unknown): ProjectUiV2 | null {
    if (!isRecord(obj)) return null

    const ver = getNumber(obj.version) // может быть null если поля нет
    const cycleMs = getString(obj.cycleMs)
    const nodesArr = getArray(obj.nodes)

    if (!((ver === 1) || ver == null) || cycleMs == null || nodesArr == null) return null

    const nodes: EditorNodeUi[] = []
    for (const it of nodesArr) {
        if (!isEditorNodeUi(it)) return null
        nodes.push(it)
    }

    const wires = migrateWiresFromNodes(nodes)
    return { version: 2, cycleMs, nodes, wires }
}

export function saveProject(p: ProjectUiV2) {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
}

export function loadProject(): ProjectUiV2 | null {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null

    const obj = safeParseJson(raw)
    if (obj == null) return null

    return parseProjectV2(obj) ?? parseProjectV1AndMigrate(obj)
}

export function exportProjectFile(p: ProjectUiV2) {
    const name = `plc_project_${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`
    downloadJson(name, JSON.stringify(p, null, 2))
}

export async function importProjectFile(file: File): Promise<ProjectUiV2> {
    const text = await file.text()
    const obj = safeParseJson(text)
    if (obj == null) throw new Error("Invalid JSON")

    const v2 = parseProjectV2(obj)
    if (v2) return v2

    const v1 = parseProjectV1AndMigrate(obj)
    if (v1) return v1

    throw new Error("Unsupported project format")
}
