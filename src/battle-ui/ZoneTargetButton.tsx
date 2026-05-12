import { useDroppable } from "@dnd-kit/core";
import type { ZoneId } from "../../packages/data/src";

type ZoneTargetButtonProps = {
  zoneId: ZoneId;
  label: string;
  onTargetZone: (zoneId: ZoneId) => void;
};

export default function ZoneTargetButton({ zoneId, label, onTargetZone }: ZoneTargetButtonProps) {
  const droppable = useDroppable({
    id: `zone:${zoneId}`,
    data: { kind: "zone", zoneId },
  });

  return (
    <button
      ref={droppable.setNodeRef}
      type="button"
      className={droppable.isOver ? "zone-target-button drop-over" : "zone-target-button"}
      onClick={() => onTargetZone(zoneId)}
    >
      {label}
    </button>
  );
}
