import { useState } from "react";
import BattleClient from "../battle/BattleClient";
import DebugClient from "../debug/DebugClient";

type AppMode = "battle" | "debug";

export default function AppShell() {
  const [mode, setMode] = useState<AppMode>("battle");

  return (
    <div className="app-shell">
      <div className="app-mode-switch" aria-label="Client mode">
        <button type="button" className={mode === "battle" ? "active" : ""} onClick={() => setMode("battle")}>
          Battle
        </button>
        <button type="button" className={mode === "debug" ? "active" : ""} onClick={() => setMode("debug")}>
          Debug
        </button>
      </div>
      {mode === "battle" ? <BattleClient /> : <DebugClient />}
    </div>
  );
}
