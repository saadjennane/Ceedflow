/**
 * Une liste qu'on réordonne : poignée, glisser, et deux flèches.
 *
 * The drag reorders on hover rather than on drop, so the list moves under the
 * cursor and you see the result before letting go — the same behaviour the
 * application form already has, because learning it once should be enough.
 *
 * The arrows are not a decoration. Native drag works with neither a finger nor
 * a keyboard, so without them a list can be built on a laptop and never
 * rearranged again from anywhere else. For a one-step move they are also
 * simply quicker than aiming.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Moves `from` to where `to` sits, and gives back the new order. */
export function moved<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  if (fromId === toId) return list;
  const next = [...list];
  const from = next.findIndex((x) => x.id === fromId);
  const to = next.findIndex((x) => x.id === toId);
  if (from === -1 || to === -1) return list;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** One step up or down, which is what most reordering actually is. */
export function nudged<T extends { id: string }>(list: T[], id: string, by: -1 | 1): T[] {
  const at = list.findIndex((x) => x.id === id);
  const to = at + by;
  if (at === -1 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

export interface Dragging {
  id: string | null;
  start: (id: string) => void;
  over: (id: string) => void;
  stop: () => void;
}

/**
 * The drag state of one list.
 *
 * Kept per list rather than globally: a group's fields and the list that holds
 * the group are two lists, and one shared "what is being dragged" would make
 * hovering a field inside a group move the group.
 */
export function useDragging(onMove: (fromId: string, toId: string) => void): Dragging {
  const [id, setId] = useState<string | null>(null);
  return {
    id,
    start: setId,
    over: (toId) => {
      if (id) onMove(id, toId);
    },
    stop: () => setId(null),
  };
}

/**
 * The handle, and the two arrows beside it.
 *
 * `onNudge` is given null at either end so the button can be disabled rather
 * than silently doing nothing — a control that looks pressable and is not is
 * how somebody decides the feature is broken.
 */
export function Grip({
  id,
  drag,
  onUp,
  onDown,
  label,
}: {
  id: string;
  drag: Dragging;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  label: string;
}) {
  return (
    <span className="row" style={{ gap: 2, flexShrink: 0 }}>
      <span
        className="grip"
        draggable
        onDragStart={() => drag.start(id)}
        onDragEnd={drag.stop}
        title={`Drag to reorder ${label}`}
      >
        <Icon name="drag" size={15} />
      </span>
      <span className="nudge">
        <button className="btn ghost icon sm" aria-label={`Move ${label} up`} disabled={!onUp} onClick={() => onUp?.()}>
          <Icon name="chevronUp" size={12} />
        </button>
        <button
          className="btn ghost icon sm"
          aria-label={`Move ${label} down`}
          disabled={!onDown}
          onClick={() => onDown?.()}
        >
          <Icon name="chevronDown" size={12} />
        </button>
      </span>
    </span>
  );
}

/**
 * A row that accepts a drop.
 *
 * `stopPropagation` on the hover is what makes nesting work: without it, a
 * field hovered inside a group would reach the outer list too, and reordering
 * two fields of a group would move the group.
 */
export function DropRow({
  id,
  drag,
  className,
  children,
}: {
  id: string;
  drag: Dragging;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        drag.over(id);
      }}
      onDrop={(e) => {
        // The order is already set by the hover; stop the page from catching
        // this and pushing the row to the end.
        e.stopPropagation();
        drag.stop();
      }}
    >
      {children}
    </div>
  );
}
