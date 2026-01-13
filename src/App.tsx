import { NavLink, Navigate, Route, Routes } from "react-router-dom"
import { IoPage } from "./features/plc/IoPage.tsx"
import {StatusPage} from "./features/plc/StatusPage.tsx";
import { GraphPage } from "./features/plc/GraphPage"
import "@xyflow/react/dist/style.css"

function Nav() {
    const linkStyle = ({ isActive }: { isActive: boolean }) => ({
        padding: "8px 12px",
        borderRadius: 10,
        textDecoration: "none",
        color: "#111827",
        background: isActive ? "#e5e7eb" : "transparent",
        border: "1px solid #e5e7eb",
    })

    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <NavLink to="/status" style={linkStyle}>
                Status
            </NavLink>
            <NavLink to="/io" style={linkStyle}>
                IO
            </NavLink>
            <NavLink to="/memory" style={linkStyle}>
                Memory
            </NavLink>
            <NavLink to="/graph" style={linkStyle}>
                Graph
            </NavLink>
        </div>
    )
}

function Placeholder({ title }: { title: string }) {
    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <div style={{ opacity: 0.7 }}>TODO</div>
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

                    {/* пока заглушки — потом вынесем отдельные страницы */}

                    <Route path="/status" element={<StatusPage />} />
                    <Route path="/io" element={<IoPage />} />
                    <Route path="/memory" element={<Placeholder title="Memory" />} />
                    <Route path="/graph" element={<GraphPage />} />

                    <Route path="*" element={<Navigate to="/status" replace />} />
                </Routes>
            </div>
        </div>
    )
}
