import { Plus } from "lucide-react";

import { positionColor, tint } from "@/lib/position-colors";
import { cn } from "@/lib/utils";

export type GridDay = { iso: string; weekday: string; dayNumber: string; isToday: boolean };

export type GridShift = {
  key: string;
  dayIndex: number;
  start: string;
  end: string;
  position: string | null;
  personId: string | null;
  /** Open slots: how many people are still missing. */
  missing?: number;
  mine?: boolean;
  onClick?: () => void;
};

export type GridPerson = { id: string; name: string; position: string | null; maxHours?: number };

type Translate = (key: string, params?: Record<string, string | number>) => string;

function hours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

const hhmm = (value: string) => value.slice(0, 5);
const fmtHours = (value: number) => (value % 1 ? value.toFixed(1) : String(value));

/** One shift filling its day cell: time on top, position under it, centered vertically. */
function ShiftChip({ shift, color, showPosition, t }: { shift: GridShift; color: string; showPosition: boolean; t: Translate }) {
  const open = Boolean(shift.missing);
  const body = (
    <>
      <span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums leading-5 tracking-[-0.02em] text-black">
        {hhmm(shift.start)}–{hhmm(shift.end)}
      </span>
      {showPosition || open ? (
        <span className="block truncate text-[12px] leading-4 text-[#3c3c43]">
          {shift.position ?? ""}
          {open && (shift.missing ?? 1) > 1 ? ` × ${shift.missing}` : ""}
        </span>
      ) : null}
    </>
  );
  const style = open
    ? { backgroundColor: "#fff", border: `1.5px dashed ${color}` }
    : { backgroundColor: tint(color, shift.mine ? 0.28 : 0.14), boxShadow: `inset 3px 0 0 ${color}` };
  const className = cn(
    // A person's shift fills the day cell; open shifts keep their size (a row can hold several).
    "flex min-h-[48px] w-full min-w-0 flex-col justify-center rounded-[10px] px-2.5 py-1 text-left",
    !open && "flex-1",
    shift.onClick && "transition hover:brightness-95 active:opacity-70",
  );
  return shift.onClick ? (
    <button type="button" onClick={shift.onClick} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

/**
 * The week at a glance, like a paper roster: one row per person, grouped by position, one column
 * per day, plus a row of open shifts. Sticky day header and name column; totals per day at the bottom.
 */
export function WeekGrid({
  days,
  people,
  shifts,
  positionOrder,
  onAdd,
  t,
}: {
  days: GridDay[];
  people: GridPerson[];
  shifts: GridShift[];
  positionOrder: string[];
  onAdd?: (dayIndex: number, personId?: string) => void;
  t: Translate;
}) {
  const byPerson = new Map<string, GridShift[]>();
  const open: GridShift[] = [];
  for (const shift of shifts) {
    if (shift.missing) open.push(shift);
    if (shift.personId) byPerson.set(shift.personId, [...(byPerson.get(shift.personId) ?? []), shift]);
  }
  const knownIds = new Set(people.map((person) => person.id));
  const everyone = [...people];
  // People on the schedule who are no longer in the member list still need a row.
  for (const [id, list] of byPerson) if (!knownIds.has(id)) everyone.push({ id, name: t("schedule.assigned_label"), position: list[0]?.position ?? null });

  const groups = new Map<string, GridPerson[]>();
  for (const person of everyone) {
    const key = person.position ?? t("schedule.grid_no_position");
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => {
    const ai = positionOrder.findIndex((item) => item.toLowerCase() === a[0].toLowerCase());
    const bi = positionOrder.findIndex((item) => item.toLowerCase() === b[0].toLowerCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0]);
  });

  const dayTotals = days.map((_day, index) => {
    const assigned = shifts.filter((shift) => shift.dayIndex === index && shift.personId);
    return { hours: assigned.reduce((sum, shift) => sum + hours(shift.start, shift.end), 0), people: new Set(assigned.map((shift) => shift.personId)).size };
  });
  const columns = `minmax(148px, 200px) repeat(${days.length}, minmax(112px, 1fr))`;

  const cellShifts = (list: GridShift[] | undefined, dayIndex: number) => (list ?? []).filter((shift) => shift.dayIndex === dayIndex).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="h-full overflow-auto overscroll-contain" role="grid" aria-label={t("schedule.title")}>
      <div className="min-w-max" style={{ minWidth: "100%" }}>
        <div className="sticky top-0 z-20 grid border-b border-[var(--color-separator)] bg-white" style={{ gridTemplateColumns: columns }} role="row">
          <div className="sticky left-0 z-10 border-r border-[var(--color-separator)] bg-white" />
          {days.map((day) => (
            <div key={day.iso} role="columnheader" className="flex items-center justify-center gap-1.5 border-r border-[var(--color-separator)] py-2 last:border-r-0">
              <span className={cn("text-[12px] font-semibold uppercase", day.isToday ? "text-[var(--color-danger)]" : "text-[#3c3c43]")}>{day.weekday}</span>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-[15px] font-semibold",
                  day.isToday ? "bg-[var(--color-danger)] text-white" : "text-black",
                )}
              >
                {day.dayNumber}
              </span>
            </div>
          ))}
        </div>

        {open.length ? (
          <div className="grid border-b border-[var(--color-separator)] bg-[var(--color-danger-fill)]/40" style={{ gridTemplateColumns: columns }} role="row">
            <div className="sticky left-0 z-10 flex items-center border-r border-[var(--color-separator)] bg-[#fff5f6] px-3 py-2">
              <span className="text-[14px] font-semibold text-[var(--color-danger)]">{t("schedule.grid_open")}</span>
            </div>
            {days.map((day, index) => (
              <div key={day.iso} className="flex min-h-[64px] flex-col justify-center gap-1 border-r border-[var(--color-separator)] p-1 last:border-r-0" role="gridcell">
                {cellShifts(open, index).map((shift) => (
                  <ShiftChip key={`open-${shift.key}`} shift={shift} color={positionColor(shift.position, positionOrder)} showPosition t={t} />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {orderedGroups.map(([position, members]) => {
          const color = positionColor(position, positionOrder);
          return (
            <div key={position} role="rowgroup">
              <div className="sticky left-0 flex items-center gap-2 border-b border-[var(--color-separator)] bg-[var(--color-grouped)] px-3 py-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[13px] font-semibold uppercase tracking-wide text-[#3c3c43]">{position}</span>
              </div>
              {members
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((person) => {
                  const list = byPerson.get(person.id);
                  const total = (list ?? []).reduce((sum, shift) => sum + hours(shift.start, shift.end), 0);
                  const over = person.maxHours && total > person.maxHours;
                  return (
                    <div key={person.id} className="grid border-b border-[var(--color-separator)]" style={{ gridTemplateColumns: columns }} role="row">
                      <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center border-r border-[var(--color-separator)] bg-white px-3 py-1.5">
                        <span className="truncate text-[14px] font-semibold text-black">{person.name}</span>
                        <span className={cn("text-[12px] tabular-nums", over ? "font-semibold text-[var(--color-danger)]" : "text-[#3c3c43]")}>
                          {fmtHours(total)} h{person.maxHours ? ` / ${person.maxHours}` : ""}
                        </span>
                      </div>
                      {days.map((day, index) => {
                        const cell = cellShifts(list, index);
                        return (
                          <div
                            key={day.iso}
                            role="gridcell"
                            className={cn(
                              "group relative flex min-h-[64px] flex-col gap-1 border-r border-[var(--color-separator)] p-1 last:border-r-0",
                              day.isToday && "bg-[var(--color-accent)]/40",
                            )}
                          >
                            {cell.map((shift) => (
                              <ShiftChip key={shift.key} shift={shift} color={positionColor(shift.position, positionOrder)} showPosition={(shift.position ?? "").toLowerCase() !== position.toLowerCase()} t={t} />
                            ))}
                            {onAdd && !cell.length ? (
                              <button
                                type="button"
                                aria-label={t("schedule.grid_add_for", { name: person.name, day: `${day.weekday} ${day.dayNumber}` })}
                                onClick={() => onAdd(index, person.id)}
                                className="absolute inset-1 grid place-items-center rounded-[10px] text-[var(--color-primary-strong)] opacity-0 transition hover:bg-[var(--color-accent)] focus-visible:opacity-100 group-hover:opacity-100"
                              >
                                <Plus className="size-5" />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          );
        })}

        <div className="sticky bottom-0 z-20 grid border-t border-[var(--color-separator)] bg-[var(--color-grouped)]" style={{ gridTemplateColumns: columns }} role="row">
          <div className="sticky left-0 z-10 flex items-center border-r border-[var(--color-separator)] bg-[var(--color-grouped)] px-3 py-2 text-[13px] font-semibold text-[#3c3c43]">
            {t("schedule.grid_totals")}
          </div>
          {dayTotals.map((total, index) => (
            <div key={days[index].iso} className="border-r border-[var(--color-separator)] px-2 py-2 text-center last:border-r-0">
              <span className="block text-[14px] font-semibold tabular-nums text-black">{fmtHours(total.hours)} h</span>
              <span className="block text-[12px] text-[#3c3c43]">{t("schedule.grid_people", { count: total.people })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Phone: seven day buttons in one row; a dot marks days with open shifts. */
export function DayStrip({ days, selected, onSelect, openByDay }: { days: GridDay[]; selected: number; onSelect: (index: number) => void; openByDay: number[] }) {
  return (
    <div className="grid grid-cols-7 gap-1 px-2 py-2" role="tablist">
      {days.map((day, index) => {
        const active = index === selected;
        return (
          <button
            key={day.iso}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(index)}
            className="flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[10px] active:opacity-70"
          >
            <span className={cn("text-[11px] font-semibold uppercase", day.isToday ? "text-[var(--color-danger)]" : "text-[#3c3c43]")}>{day.weekday}</span>
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full text-[16px] font-semibold",
                active ? (day.isToday ? "bg-[var(--color-danger)] text-white" : "bg-black text-white") : day.isToday ? "text-[var(--color-danger)]" : "text-black",
              )}
            >
              {day.dayNumber}
            </span>
            <span className={cn("size-1.5 rounded-full", openByDay[index] ? "bg-[var(--color-danger)]" : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}

/** Phone: one day as a list — open shifts first, then everyone working, by start time. */
export function DayList({
  shifts,
  people,
  positionOrder,
  onAdd,
  t,
}: {
  shifts: GridShift[];
  people: GridPerson[];
  positionOrder: string[];
  onAdd?: () => void;
  t: Translate;
}) {
  const names = new Map(people.map((person) => [person.id, person.name]));
  const open = shifts.filter((shift) => shift.missing).sort((a, b) => a.start.localeCompare(b.start));
  const working = shifts.filter((shift) => shift.personId).sort((a, b) => a.start.localeCompare(b.start) || (names.get(a.personId!) ?? "").localeCompare(names.get(b.personId!) ?? ""));
  const row = (shift: GridShift, title: string) => {
    const color = positionColor(shift.position, positionOrder);
    const content = (
      <>
        <span className="w-[92px] shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums text-black">
          {hhmm(shift.start)}–{hhmm(shift.end)}
        </span>
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[16px]", shift.missing ? "font-semibold text-[var(--color-danger)]" : "text-black")}>{title}</span>
          <span className="block truncate text-[14px] text-[#3c3c43]">{shift.position ?? ""}</span>
        </span>
      </>
    );
    return (
      <li key={shift.key}>
        {shift.onClick ? (
          <button type="button" onClick={shift.onClick} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-[var(--color-fill)]">
            {content}
          </button>
        ) : (
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">{content}</div>
        )}
      </li>
    );
  };
  return (
    <div>
      {open.length ? (
        <>
          <h3 className="ios-section-header px-7 pb-1.5 pt-3 text-[var(--color-danger)]">{t("schedule.grid_open")}</h3>
          <ul className="ios-island mx-3 divide-y divide-[#e5e5ea]">
            {open.map((shift) => row(shift, (shift.missing ?? 1) > 1 ? `${t("schedule.grid_open_slot")} × ${shift.missing}` : t("schedule.grid_open_slot")))}
          </ul>
        </>
      ) : null}
      <h3 className="ios-section-header px-7 pb-1.5 pt-4">{t("schedule.grid_working")}</h3>
      <ul className="ios-island mx-3 divide-y divide-[#e5e5ea]">
        {working.map((shift) => row(shift, names.get(shift.personId!) ?? t("schedule.assigned_label")))}
        {!working.length ? <li className="px-4 py-6 text-center text-[15px] text-[var(--color-text-muted)]">{t("schedule.no_shifts_this_day")}</li> : null}
      </ul>
      {onAdd ? (
        <div className="px-4 py-4">
          <button type="button" onClick={onAdd} className="flex min-h-11 items-center gap-2 text-[16px] font-semibold text-[var(--color-primary-strong)]">
            <Plus className="size-5" /> {t("schedule.add_shift")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
