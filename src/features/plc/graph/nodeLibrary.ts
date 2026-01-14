import type { NodeType } from "./nodeCatalog"

export type NodeGroup = {
    id: string
    title: string
    items: NodeType[]
}

export const NODE_GROUPS: NodeGroup[] = [
    {
        id: "io",
        title: "I/O",
        items: ["DIGITAL_IN", "DIGITAL_OUT", "AI_IN", "AO", "PWM_OUT", "SAFE_OUTPUT"],
    },
    {
        id: "logic",
        title: "Logic",
        items: ["AND2", "OR2", "NOT", "SR", "R_TRIG", "F_TRIG", "MUX2"],
    },
    {
        id: "timers",
        title: "Timers",
        items: ["TON", "TOFF", "TP", "HEARTBEAT"],
    },
    {
        id: "compare",
        title: "Compare",
        items: ["COMPARE_GT", "COMPARE_LT", "HYST", "WINDOW_CHECK", "LIMIT"],
    },
    {
        id: "math",
        title: "Math",
        items: ["ADD", "MATH_OP", "SCALE", "RAMP", "FILTER_AVG", "ANALOG_AVG"],
    },
    {
        id: "pid",
        title: "PID",
        items: ["PID"],
    },
    {
        id: "counters",
        title: "Counters",
        items: ["CTU", "CTD", "CTUD"],
    },
    {
        id: "memory",
        title: "Memory",
        items: ["MEM_BOOL", "MEM_INT", "MEM_REAL"],
    },
    {
        id: "misc",
        title: "Misc",
        items: ["LOG", "ALARM_GEN", "ALARM_LATCH", "CONST_BOOL", "CONST_INT", "CONST_FLOAT"],
    },
]
