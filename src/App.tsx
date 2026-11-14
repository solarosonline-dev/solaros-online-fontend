import React, { Suspense } from "react";
import { useDeviceType } from "./hooks/useDeviceType";

const DesktopApp = React.lazy(() => import("./AppDesktop"));
const MobileApp = React.lazy(() => import("./mobile/MobileApp"));

export default function App() {
  const device = useDeviceType();

  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: 40,
            textAlign: "center",
            fontSize: 18,
            fontFamily: "var(--app-font, sans-serif)",
            color: "var(--app-text-muted, #667085)",
            background: "var(--app-bg, #f4f6f8)",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Loading SolarOS...
        </div>
      }
    >
      {device === "mobile" ? <MobileApp /> : <DesktopApp />}
    </Suspense>
  );
}
