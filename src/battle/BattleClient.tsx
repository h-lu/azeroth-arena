import { useEffect, useMemo, useState } from "react";
import type { AIEncounterDebugState, ConnectionStatus, PlayerView } from "../onlineProtocol";
import { readStoredOnlineSession } from "../onlineSession";
import { createRoomClient } from "../online/roomClient";
import BattleStage from "./BattleStage";
import { buildBattleViewModel } from "./battleState";

const ENCOUNTER_TEMPLATE_ID = "rival-burst-check";

function defaultServerUrl() {
  return readStoredOnlineSession().serverUrl;
}

export default function BattleClient() {
  const [serverUrl] = useState(defaultServerUrl);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [view, setView] = useState<PlayerView | null>(null);
  const [aiDebug, setAiDebug] = useState<AIEncounterDebugState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => createRoomClient({ serverUrl }), [serverUrl]);

  useEffect(() => {
    return client.subscribe((event) => {
      if (event.type === "status") setStatus(event.status);
      if (event.type === "playerView") {
        setView(event.view);
        setError(null);
      }
      if (event.type === "aiEncounter") setAiDebug(event.debug);
      if (event.type === "error") setError(event.message);
    });
  }, [client]);

  useEffect(() => {
    void client.createAIEncounter({ preferredSide: "blue", encounterTemplateId: ENCOUNTER_TEMPLATE_ID }).catch((nextError) => {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
    return () => client.disconnect();
  }, [client]);

  const model = view ? buildBattleViewModel(view, aiDebug) : null;

  return (
    <main className="battle-client">
      {model ? (
        <BattleStage
          model={model}
          connectionStatus={status}
          error={error}
          onSubmitCommand={(command) => void client.submitCommand(command).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))}
          onExportReplay={() => void client.exportReplay().catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))}
        />
      ) : (
        <section className="battle-loading" aria-live="polite">
          <strong>Azeroth Arena</strong>
          <span>{status === "error" ? "Connection failed" : "Opening AI Encounter"}</span>
          {error ? <p>{error}</p> : null}
        </section>
      )}
    </main>
  );
}
