import {
  formatDateKey,
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
} from "../utils/calendarUtils";

const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const defaultTimeSlots = [
  { label: "8 a 10", startTime: "08:00", endTime: "10:00" },
  { label: "10 a 12", startTime: "10:00", endTime: "12:00" },
  { label: "2 a 4", startTime: "14:00", endTime: "16:00" },
  { label: "4 a 6", startTime: "16:00", endTime: "18:00" },
];

function isSimulationSchedule(item) {
  return String(item?.subject || "").trim().toLowerCase().includes("simulacro") || item?.fullDay;
}

export default function Calendar({
  title,
  currentDate,
  setCurrentDate,
  onSelectDay,
  schedulesByDate = {},
  timeSlots = defaultTimeSlots,
  holidays = {},
  onMoveSchedule,
  subgroups = [],
  colorForSchedule,
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let day = 1; day <= daysInMonth; day++) days.push(day);

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  function getScheduleForSlot(dailySchedules, slot, subgroup = "") {
    return dailySchedules.find((item) => {
      const overlaps = slot.startTime < item.endTime && slot.endTime > item.startTime;
      const subgroupMatch = !subgroup || (item.classroom || "Grupo 1") === subgroup;
      return overlaps && subgroupMatch;
    });
  }

  function getFullDaySimulation(dailySchedules, subgroup = "") {
    return dailySchedules.find((item) => {
      const subgroupMatch = !subgroup || (item.classroom || "Grupo 1") === subgroup;
      return subgroupMatch && isSimulationSchedule(item);
    });
  }

  function handleDrop(event, dateKey, slot) {
    event.preventDefault();
    const scheduleId = event.dataTransfer.getData("text/plain");
    if (!scheduleId) return;
    onMoveSchedule?.(scheduleId, dateKey, slot);
  }

  return (
    <section className="calendar-card">
      <div className="calendar-header">
        <button className="nav-button" onClick={previousMonth} type="button">←</button>
        <div>
          <h2>{title ? `${title} · ` : ""}{getMonthName(month)} {year}</h2>
          <button className="today-button" onClick={goToday} type="button">Ir al mes actual</button>
        </div>
        <button className="nav-button" onClick={nextMonth} type="button">→</button>
      </div>

      <div className="calendar-grid">
        {weekDays.map((day) => <div key={day} className="weekday">{day}</div>)}

        {days.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;

          const date = new Date(year, month, day);
          const dateKey = formatDateKey(date);
          const dailySchedules = schedulesByDate[dateKey] ?? [];
          const isSunday = date.getDay() === 0;
          const isToday = formatDateKey(new Date()) === dateKey;
          const holidayName = holidays[dateKey];
          const blockedDay = isSunday;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => !blockedDay && onSelectDay(date)}
              className={`day-cell ${blockedDay ? "disabled" : ""} ${isToday ? "today" : ""} ${holidayName ? "holiday" : ""}`}
              disabled={blockedDay}
            >
              <div className="day-cell-top">
                <span className="day-number">{day}</span>
                {isSunday && <span className="day-note">Descanso</span>}
                {holidayName && <span className="day-note holiday-note">Festivo</span>}
              </div>
              {holidayName && <span className="holiday-name" title={holidayName}>{holidayName}</span>}

              {!blockedDay && (
                <div className={`slot-preview-list ${subgroups.length ? "dual" : ""}`} aria-label={`Espacios de clase del día ${day}`}>
                  {subgroups.length > 0 && (
                    <div className="subgroup-headings">
                      {subgroups.map((subgroup) => <strong key={subgroup}>{subgroup}</strong>)}
                    </div>
                  )}
                  {subgroups.length > 0 && subgroups.map((subgroup) => {
                    const simulation = getFullDaySimulation(dailySchedules, subgroup);
                    if (!simulation) return null;
                    return (
                      <span
                        key={`${dateKey}-simulacro-${subgroup}`}
                        className="full-day-simulation-card"
                        style={{ "--item-color": colorForSchedule?.(simulation) || "#3f3f46" }}
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.setData("text/plain", simulation.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(event, dateKey, { startTime: "00:00", endTime: "23:59", label: "Día completo", subgroup })}
                        title={`${subgroup}: ${simulation.subject} - ${simulation.teacher} · día completo`}
                      >
                        <strong>{subgroup}</strong>
                        <em>{simulation.subject} · Día completo</em>
                        <small>{simulation.teacher}</small>
                      </span>
                    );
                  })}
                  {subgroups.length === 0 && getFullDaySimulation(dailySchedules) ? (() => {
                    const simulation = getFullDaySimulation(dailySchedules);
                    return (
                      <span
                        key={`${dateKey}-simulacro`}
                        className="full-day-simulation-card single"
                        style={{ "--item-color": colorForSchedule?.(simulation) || "#3f3f46" }}
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.setData("text/plain", simulation.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(event, dateKey, { startTime: "00:00", endTime: "23:59", label: "Día completo" })}
                        title={`${simulation.subject} - ${simulation.teacher} · día completo`}
                      >
                        <em>{simulation.subject} · Día completo</em>
                        <small>{simulation.teacher}</small>
                      </span>
                    );
                  })() : timeSlots.map((slot) => {
                    if (subgroups.length > 0) {
                      return (
                        <div className="dual-slot-row" key={`${dateKey}-${slot.startTime}`}>
                          <strong className="dual-slot-time">{slot.label}</strong>
                          {subgroups.map((subgroup) => {
                            const hasSimulation = getFullDaySimulation(dailySchedules, subgroup);
                            if (hasSimulation) return <span key={`${dateKey}-${slot.startTime}-${subgroup}-blocked`} className="slot-preview simulation-blocked"><em>Ocupado</em></span>;
                            const assignedSchedule = getScheduleForSlot(dailySchedules, slot, subgroup);
                            return (
                              <span
                                key={`${dateKey}-${slot.startTime}-${subgroup}`}
                                className={`slot-preview ${slot.isCustom ? "custom-slot" : ""} ${assignedSchedule ? "assigned" : "available"}`}
                                style={assignedSchedule ? { "--item-color": colorForSchedule?.(assignedSchedule) || "#22c55e" } : undefined}
                                draggable={Boolean(assignedSchedule)}
                                onDragStart={(event) => {
                                  if (!assignedSchedule) return;
                                  event.stopPropagation();
                                  event.dataTransfer.setData("text/plain", assignedSchedule.id);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(event) => handleDrop(event, dateKey, { ...slot, subgroup })}
                                title={assignedSchedule ? `${subgroup} · ${slot.label}: ${assignedSchedule.subject} - ${assignedSchedule.teacher} (${assignedSchedule.startTime} - ${assignedSchedule.endTime})` : `${subgroup} · ${slot.label}: disponible`}
                              >
                                <em>{assignedSchedule ? assignedSchedule.subject : "Disponible"}</em>
                              </span>
                            );
                          })}
                        </div>
                      );
                    }

                    const assignedSchedule = getScheduleForSlot(dailySchedules, slot);
                    return (
                      <span
                        key={`${dateKey}-${slot.startTime}`}
                        className={`slot-preview ${slot.isCustom ? "custom-slot" : ""} ${assignedSchedule ? "assigned" : "available"}`}
                        style={assignedSchedule ? { "--item-color": colorForSchedule?.(assignedSchedule) || "#22c55e" } : undefined}
                        draggable={Boolean(assignedSchedule)}
                        onDragStart={(event) => {
                          if (!assignedSchedule) return;
                          event.stopPropagation();
                          event.dataTransfer.setData("text/plain", assignedSchedule.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => handleDrop(event, dateKey, slot)}
                        title={assignedSchedule ? `${slot.label}: ${assignedSchedule.subject} - ${assignedSchedule.teacher} (${assignedSchedule.startTime} - ${assignedSchedule.endTime})` : `${slot.label}: disponible`}
                      >
                        <strong>{slot.label}</strong>
                        <em>{assignedSchedule ? `${assignedSchedule.subject}${assignedSchedule.startTime !== slot.startTime ? " ↕" : ""}` : "Disponible"}</em>
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
