import type { NodeType } from "./nodeCatalog"

export type PortSpec = { a?: string; b?: string; hideB?: boolean }

export type ParamSpec = {
    showInt?: boolean
    showFloat?: boolean
    showMs?: boolean
    showFlags?: boolean
    intLabel?: string
    floatLabel?: string
    msLabel?: string
    flagsLabel?: string
    ports?: PortSpec
    expectedValueType?: 0 | 1 | 2
}

export const NODE_SPEC: Partial<Record<NodeType, ParamSpec>> = {
    // BOOL
    DIGITAL_IN: { expectedValueType: 0, ports: { a: "IN", hideB: true } },
    DIGITAL_OUT:{ expectedValueType: 0, ports: { a: "IN", hideB: true } },
    AND2:       { expectedValueType: 0, ports: { a: "IN1", b: "IN2" } },
    OR2:        { expectedValueType: 0, ports: { a: "IN1", b: "IN2" } },
    NOT:        { expectedValueType: 0, ports: { a: "IN", hideB: true } },
    SR:         { expectedValueType: 0, ports: { a: "S", b: "R" } },
    TON:        { expectedValueType: 0, showMs: true, msLabel: "tonMs", ports: { a: "IN", hideB: true } },
    TOFF:       { expectedValueType: 0, showMs: true, msLabel: "toffMs", ports: { a: "IN", hideB: true } },
    TP:         { expectedValueType: 0, showMs: true, msLabel: "pulseMs", ports: { a: "TRIG", hideB: true } },
    R_TRIG:     { expectedValueType: 0, ports: { a: "IN", hideB: true } },
    F_TRIG:     { expectedValueType: 0, ports: { a: "IN", hideB: true } },
    ALARM_GEN:  { expectedValueType: 0, ports: { a: "IN", hideB: true } },
    ALARM_LATCH:{ expectedValueType: 0, ports: { a: "SET", b: "ACK" } },
    HEARTBEAT:  { expectedValueType: 0 },

    CONST_BOOL: { expectedValueType: 0, showInt: true, intLabel: "value(0/1)" },

// INT
    CONST_INT:  { expectedValueType: 1, showInt: true, intLabel: "value" },
    CTU:        { expectedValueType: 1, showInt: true, intLabel: "PV", ports: { a: "CLK", b: "RST" } },
    CTD:        { expectedValueType: 1, showInt: true, intLabel: "PV", ports: { a: "CLK", b: "RST" } },
    CTUD:       { expectedValueType: 1, ports: { a: "CU", b: "CD" } },
    MEM_INT:    { expectedValueType: 1, showInt: true, intLabel: "index", ports: { a: "IN", hideB: true } },

// REAL
    CONST_FLOAT:{ expectedValueType: 2, showFloat: true, floatLabel: "value" },
    AI_IN:      { expectedValueType: 2, ports: { a: "IN", hideB: true } },
    PWM_OUT:    { expectedValueType: 2, ports: { a: "IN", hideB: true } },
    AO:         { expectedValueType: 2, ports: { a: "IN", hideB: true } },
    SCALE:      { expectedValueType: 2, showFloat: true, floatLabel: "a", showInt: true, intLabel: "b(x1000)", ports: { a: "IN", hideB: true } },
    ADD:        { expectedValueType: 2, ports: { a: "A", b: "B" } },
    LIMIT:      { expectedValueType: 2, showInt: true, intLabel: "min(x1000)", showMs: true, msLabel: "max(x1000)", ports: { a: "IN", hideB: true } },
    PID:        { expectedValueType: 2, ports: { a: "SP", b: "PV" } },
    MEM_REAL:   { expectedValueType: 2, showInt: true, intLabel: "index", ports: { a: "IN", hideB: true } },
    FILTER_AVG: { expectedValueType: 2, showInt: true, intLabel: "alpha(x1000)", ports: { a: "IN", hideB: true } },




    COMPARE_GT: { ports: { a: "A", b: "B" } },
    COMPARE_LT: { ports: { a: "A", b: "B" } },
    MUX2: { showInt: true, intLabel: "sel(0/1)", ports: { a: "A", b: "B" } },
    ANALOG_AVG: { showInt: true, intLabel: "alpha(x1000)", ports: { a: "IN", hideB: true } },
    RAMP: { showInt: true, intLabel: "rate(x1000)/s", ports: { a: "IN", hideB: true } },
    WINDOW_CHECK: { showFloat: true, floatLabel: "center", showInt: true, intLabel: "width(x1000)", ports: { a: "IN", hideB: true } },
    MEM_BOOL: { showInt: true, intLabel: "index", ports: { a: "IN", hideB: true } },
    LOG: { showInt: true, intLabel: "periodMs", ports: { a: "IN", hideB: true } },
    MATH_OP: { showInt: true, intLabel: "op(0:+ 1:- 2:* 3:/)", ports: { a: "A", b: "B" } },
}
