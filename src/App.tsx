import { NavLink, Navigate, Route, Routes } from "react-router-dom"
import { IoPage } from "./features/plc/IoPage.tsx"
import { StatusPage } from "./features/plc/StatusPage.tsx"
import { GraphPage } from "./features/plc/GraphPage"
import "@xyflow/react/dist/style.css"
import { LogPage } from "./features/plc/LogPage.tsx"
import { MemoryPage } from "./features/plc/MemoryPage.tsx"
import { LiveRuntimePage } from "./features/plc/LiveRuntimePage.tsx"

function Nav() {
    const linkStyle = ({ isActive }: { isActive: boolean }) => ({
        padding: "8px 12px",
        borderRadius: 10,
        textDecoration: "none",
        border: "1px solid",
        color: isActive ? "#0b1220" : "#e5e7eb",
        background: isActive ? "#f8fafc" : "rgba(255,255,255,0.08)",
        borderColor: isActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)",
        boxShadow: isActive ? "0 6px 18px rgba(0,0,0,0.25)" : "none",
    })

    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <NavLink to="/status" style={linkStyle}>Status</NavLink>
            <NavLink to="/live" style={linkStyle}>Live Runtime</NavLink>
            <NavLink to="/io" style={linkStyle}>IO</NavLink>
            <NavLink to="/memory" style={linkStyle}>Memory</NavLink>
            <NavLink to="/graph" style={linkStyle}>Graph</NavLink>
            <NavLink to="/log" style={linkStyle}>Log</NavLink>
        </div>
    )
}

export default function App() {
    return (
        <div style={{ padding: 16, fontFamily: "system-ui" }}>
            <Nav />
            <div style={{ marginTop: 12 }}>
                <Routes>
                    <Route path="/" element={<Navigate to="/status" replace />} />
                    <Route path="/status" element={<StatusPage />} />
                    <Route path="/live" element={<LiveRuntimePage />} />
                    <Route path="/io" element={<IoPage />} />
                    <Route path="/memory" element={<MemoryPage />} />
                    <Route path="/graph" element={<GraphPage />} />
                    <Route path="/log" element={<LogPage />} />
                    <Route path="*" element={<Navigate to="/status" replace />} />
                </Routes>
            </div>
        </div>
    )
}
