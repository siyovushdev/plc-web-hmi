import { useMemo, useState } from "react"
import type { NodeType } from "./nodeCatalog"
import { NODE_LABEL } from "./nodeCatalog"
import { NODE_GROUPS } from "./nodeLibrary"

type Props = {
    onPickNode?: (type: NodeType) => void
}

export function BlockLibrary({ onPickNode }: Props) {
    const [q, setQ] = useState("")
    const qq = q.trim().toLowerCase()

    const filtered = useMemo(() => {
        if (!qq) return NODE_GROUPS
        return NODE_GROUPS
            .map((g) => ({
                ...g,
                items: g.items.filter((t: NodeType) => {
                    const label = (NODE_LABEL[t] ?? t).toLowerCase()
                    return t.toLowerCase().includes(qq) || label.includes(qq)
                }),
            }))
            .filter((g) => g.items.length > 0)
    }, [qq])

    return (
        <div className="plc-lib">
            <div className="plc-lib__search">
                <input
                    className="plc-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search..."
                />
            </div>

            <div className="plc-lib__groups">
                {filtered.map((g) => (
                    <details key={g.id} className="plc-acc" open={g.id === "io"}>
                        <summary className="plc-acc__hdr">
                            <span className="plc-acc__title">{g.title}</span>
                            <span className="plc-acc__count">{g.items.length}</span>
                        </summary>

                        <div className="plc-acc__body">
                            {g.items.map((type) => (
                                <LibraryItem
                                    key={type}
                                    type={type}
                                    onPick={() => onPickNode?.(type)}
                                />
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </div>
    )
}

function LibraryItem({ type, onPick }: { type: NodeType; onPick: () => void }) {
    const title = NODE_LABEL[type] ?? type

    return (
        <button
            type="button"
            className="plc-lib-item"
            draggable
            onClick={onPick}
            onDragStart={(e) => {
                e.dataTransfer.setData("application/plc-node", type)
                e.dataTransfer.effectAllowed = "move"
            }}
        >
            <div className="plc-lib-item__tag">{type}</div>

            <div className="plc-lib-item__main">
                <div className="plc-lib-item__name">{title}</div>
            </div>
        </button>
    )
}

