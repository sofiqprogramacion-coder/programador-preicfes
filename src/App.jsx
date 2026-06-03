import { useEffect, useMemo, useState } from "react";
import Calendar from "./components/Calendar";
import { colombiaHolidays2026 } from "./data/holidays";
import { formatDateKey, formatLongDate } from "./utils/calendarUtils";
import { loadCloudState, saveCloudState } from "./utils/cloudStorage";
import { getCurrentSession, signInAdmin, signOutAdmin } from "./lib/supabase";

const APP_DATA_KEY = "programador-academico-local-v8";
const LEGACY_KEYS = [
  "programador-academico-schedules-v7",
  "programador-academico-schedules-v4",
  "programador-academico-schedules-v3",
  "programador-academico-schedules-v2",
];

const fixedSlots = [
  { label: "8 a 10", startTime: "08:00", endTime: "10:00", hours: 2 },
  { label: "10 a 12", startTime: "10:00", endTime: "12:00", hours: 2 },
  { label: "2 a 4", startTime: "14:00", endTime: "16:00", hours: 2 },
  { label: "4 a 6", startTime: "16:00", endTime: "18:00", hours: 2 },
];
const hourlyStartOptions = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const hourlyEndOptions = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const hourlyCalendarSlots = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"].map((startTime) => {
  const endHour = String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0");
  return { label: `${Number(startTime.slice(0, 2))}-${Number(endHour)}`, startTime, endTime: `${endHour}:00`, hours: 1 };
});
const weekDayOptions = [
  { value: 1, label: "Lunes" }, { value: 2, label: "Martes" }, { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" }, { value: 5, label: "Viernes" }, { value: 6, label: "Sábado" }, { value: 0, label: "Domingo" },
];
const colors = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee", "#fb7185", "#84cc16", "#f97316", "#38bdf8"];
const subjectPalette = {
  "Lectura crítica": "#f4f43a",
  "Sociales": "#55c7ea",
  "Matemáticas": "#00d2d6",
  "Física": "#c28bea",
  "Biología": "#16c92c",
  "Química": "#138ee8",
  "Inglés": "#e5e7eb",
  "Ingles": "#e5e7eb",
  "Simulacro": "#3f3f46",
  "Simulacros": "#3f3f46",
  "Lectura Agil": "#f3c5a5",
  "Lectura Ágil": "#f3c5a5",
  "Lectura ágil": "#f3c5a5",
};
const oldAutoColors = new Set(colors);
function defaultSubjectColor(name, index = 0) { return subjectPalette[name] || colors[index % colors.length]; }
function normalizeSubjects(subjects = []) {
  return subjects.map((subject, index) => {
    const paletteColor = defaultSubjectColor(subject.name, index);
    const shouldUsePalette = !subject.color || oldAutoColors.has(subject.color);
    return { ...subject, color: shouldUsePalette ? paletteColor : subject.color };
  });
}

const defaultGroups = [
  { id: "g-intensivo", name: "Intensivo", type: "fixed", active: true, color: colors[0], subgroups: [], travelBlock: false },
  { id: "g-intensivo-2", name: "Intensivo 2", type: "fixed", active: true, color: colors[1], subgroups: [], travelBlock: false },
  { id: "g-por-horas", name: "por horas 4 a 6", type: "fixed", active: true, color: colors[2], subgroups: [], travelBlock: false },
  { id: "g-virtual", name: "virtual 4 a 6", type: "fixed", active: true, color: colors[3], subgroups: [], travelBlock: false },
  { id: "g-cumbal", name: "Cumbal", type: "free", active: true, color: colors[4], subgroups: ["Grupo 1", "Grupo 2"], travelBlock: true },
  { id: "g-chiles", name: "Chiles", type: "free", active: true, color: colors[5], subgroups: ["Grupo 1", "Grupo 2"], travelBlock: true },
  { id: "g-pedregal", name: "Pedregal", type: "custom", active: true, color: colors[6], subgroups: [], travelBlock: true, customSlots: [{ label: "2:30 p.m. a 5:30 p.m.", startTime: "14:30", endTime: "17:30", hours: 3 }] },
];
const defaultSubjects = ["Matemáticas", "Sociales", "Física", "Química", "Inglés", "Lectura crítica", "Biología", "Simulacro", "Lectura Agil"].map((name, index) => ({ id: `s-${index}`, name, active: true, color: defaultSubjectColor(name, index) }));
const defaultTeachers = ["David Morales", "Danilo Ortega", "Jhon Piguaña", "Anabel Cuaran", "Milena Leon", "Valeria Portilla", "Fernando Bucheli", "John Lasso", "Esteban Rodriguez"].map((name, index) => ({ id: `t-${index}`, name, active: true, hourlyRate: 0, simulationRate: 100000, color: colors[index % colors.length], restrictions: [] }));

function safeRead(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function uid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function money(value) { return Number(value || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
function minutes(time) { const [h, m] = String(time).split(":").map(Number); return h * 60 + (m || 0); }
function hoursBetween(start, end) { return Math.max(0, (minutes(end) - minutes(start)) / 60); }
function overlap(aStart, aEnd, bStart, bEnd) { return minutes(aStart) < minutes(bEnd) && minutes(aEnd) > minutes(bStart); }
function sameMonth(dateKey, currentDate) { const [y, m] = dateKey.split("-").map(Number); return y === currentDate.getFullYear() && m === currentDate.getMonth() + 1; }
function dayLabel(value) { return weekDayOptions.find((d) => Number(d.value) === Number(value))?.label || "Día"; }
function monthInputValue(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function monthFromInput(value) { const [year, month] = String(value).split("-").map(Number); return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1); }
function monthLabel(date) { return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" }); }
function monthSuffix(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function filterSchedulesForReport(schedules, monthDate, filters = {}) {
  return schedules.filter((s) => sameMonth(s.date, monthDate)
    && (!filters.group || s.group === filters.group)
    && (!filters.teacher || s.teacher === filters.teacher)
    && (!filters.subject || s.subject === filters.subject));
}
function filterExtraHoursForReport(extraHours, monthDate, filters = {}) {
  return extraHours.filter((x) => sameMonth(x.date, monthDate)
    && (!filters.teacher || x.teacher === filters.teacher)
    && !filters.group
    && !filters.subject);
}
function valueForSchedule(s, teachers = []) {
  if (isSimulationSubject(s.subject)) return Number(s.simulationRate || teacherByName(teachers, s.teacher)?.simulationRate || 0);
  return Number(s.hours || hoursBetween(s.startTime, s.endTime)) * Number(s.hourlyRate || teacherByName(teachers, s.teacher)?.hourlyRate || 0);
}
function scheduleTimeLabel(s) {
  if (isSimulationSubject(s.subject) || s.fullDay) return "Día completo";
  return `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`;
}
function activeNames(list) { return list.filter((x) => x.active !== false).map((x) => x.name); }
function groupByName(groups, name) { return groups.find((g) => g.name === name) || groups[0]; }
function teacherByName(teachers, name) { return teachers.find((t) => t.name === name) || teachers[0]; }
function subjectByName(subjects, name) { return subjects.find((s) => s.name === name) || subjects[0]; }
function exportFile(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function csv(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function isSimulationSubject(value) { return normalizeText(value).toLowerCase().includes("simulacro"); }
const FULL_DAY_START = "00:00";
const FULL_DAY_END = "23:59";

function parseDateSafe(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isRestDay(dateKey) {
  const date = parseDateSafe(dateKey);
  return !date || date.getDay() === 0;
}
function baseInvalidReason(item, groups = [], teachers = [], subjects = []) {
  if (!item || typeof item !== "object") return "Registro vacío o inválido.";
  const date = parseDateSafe(item.date);
  if (!date) return "Fecha inválida.";
  if (date.getDay() === 0) return "Registro en domingo / día de descanso.";
  if (!normalizeText(item.group)) return "Grupo vacío.";
  if (!normalizeText(item.teacher)) return "Docente vacío.";
  if (!normalizeText(item.subject)) return "Materia vacía.";
  if (groups.length && !existsByName(groups, item.group)) return `Grupo no reconocido: ${item.group}.`;
  if (teachers.length && !existsByName(teachers, item.teacher)) return `Docente no reconocido: ${item.teacher}.`;
  if (subjects.length && !existsByName(subjects, item.subject)) return `Materia no reconocida: ${item.subject}.`;
  const simulation = isSimulationSubject(item.subject) || item.fullDay;
  const start = simulation ? FULL_DAY_START : item.startTime;
  const end = simulation ? FULL_DAY_END : item.endTime;
  if (!start || !end || minutes(end) <= minutes(start)) return "Horario inválido.";
  return "";
}
function splitValidInvalidSchedules(schedules = [], groups = [], teachers = [], subjects = []) {
  const valid = [];
  const invalid = [];
  (Array.isArray(schedules) ? schedules : []).forEach((item) => {
    const reason = baseInvalidReason(item, groups, teachers, subjects);
    if (reason) invalid.push({ item, reason });
    else valid.push(item);
  });
  return { valid, invalid };
}
function sanitizeAppData(rawData) {
  const catalogued = ensureCatalogFromRecords(rawData);
  const { valid, invalid } = splitValidInvalidSchedules(catalogued.schedules || [], catalogued.groups || [], catalogued.teachers || [], catalogued.subjects || []);
  return {
    ...catalogued,
    schedules: valid,
    integrity: {
      ...(catalogued.integrity || {}),
      removedInvalidCount: Number(catalogued.integrity?.removedInvalidCount || 0) + invalid.length,
      lastRemovedInvalid: invalid.map(({ item, reason }) => ({ id: item?.id, date: item?.date, group: item?.group, subject: item?.subject, teacher: item?.teacher, reason })).slice(-100),
      lastSanitizedAt: invalid.length ? new Date().toISOString() : catalogued.integrity?.lastSanitizedAt || "",
    },
  };
}

function parseCustomSlots(value) {
  if (Array.isArray(value)) return value.map((slot) => {
    if (typeof slot === "string") {
      const [startTime, endTime] = slot.split("-").map((x) => x.trim());
      return buildSlot(startTime, endTime);
    }
    return buildSlot(slot.startTime, slot.endTime, slot.label);
  }).filter(Boolean);
  return String(value || "")
    .split(/[\n,;]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [startTime, endTime] = line.split("-").map((x) => x.trim());
      return buildSlot(startTime, endTime);
    })
    .filter(Boolean);
}
function buildSlot(startTime, endTime, label = "") {
  if (!startTime || !endTime || minutes(endTime) <= minutes(startTime)) return null;
  return { label: label || `${formatTime(startTime)} a ${formatTime(endTime)}`, startTime, endTime, hours: hoursBetween(startTime, endTime), isCustom: true };
}
function formatTime(time) {
  const [h, m] = String(time).split(":").map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const suffix = h >= 12 ? "p.m." : "a.m.";
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}
function slotsForGroup(group) {
  if (!group) return fixedSlots;
  if (group.type === "free") return hourlyCalendarSlots;
  if (group.type === "custom") {
    const parsed = parseCustomSlots(group.customSlots);
    return parsed.length ? parsed : fixedSlots;
  }
  return fixedSlots;
}
function customSlotsToText(customSlots) {
  return parseCustomSlots(customSlots).map((slot) => `${slot.startTime}-${slot.endTime}`).join("\n");
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function existsByName(list = [], name) {
  const normalized = normalizeText(name).toLowerCase();
  return list.some((item) => normalizeText(item.name).toLowerCase() === normalized);
}
function ensureCatalogFromRecords(rawData) {
  const schedules = Array.isArray(rawData.schedules) ? rawData.schedules : [];
  const extraHours = Array.isArray(rawData.extraHours) ? rawData.extraHours : [];
  const groups = [...(rawData.groups || defaultGroups)];
  const subjects = normalizeSubjects([...(rawData.subjects || defaultSubjects)]);
  const teachers = [...(rawData.teachers || defaultTeachers)];

  schedules.forEach((item) => {
    const teacherName = normalizeText(item.teacher);
    if (teacherName && !existsByName(teachers, teacherName)) {
      teachers.push({
        id: uid("docente-recuperado"),
        name: teacherName,
        active: true,
        hourlyRate: Number(item.hourlyRate || 0),
        simulationRate: Number(item.simulationRate || 100000),
        color: colors[teachers.length % colors.length],
        restrictions: [],
      });
    }

    const subjectName = normalizeText(item.subject);
    if (subjectName && !existsByName(subjects, subjectName)) {
      subjects.push({
        id: uid("materia-recuperada"),
        name: subjectName,
        active: true,
        color: defaultSubjectColor(subjectName, subjects.length),
      });
    }

    const groupName = normalizeText(item.group);
    if (groupName && !existsByName(groups, groupName)) {
      groups.push({
        id: uid("grupo-recuperado"),
        name: groupName,
        type: item.startTime && item.endTime && !fixedSlots.some((slot) => slot.startTime === item.startTime && slot.endTime === item.endTime) ? "free" : "fixed",
        active: true,
        color: colors[groups.length % colors.length],
        subgroups: item.classroom ? [item.classroom] : [],
        travelBlock: ["cumbal", "chiles", "pedregal"].includes(groupName.toLowerCase()),
      });
    }
  });

  extraHours.forEach((item) => {
    const teacherName = normalizeText(item.teacher);
    if (teacherName && !existsByName(teachers, teacherName)) {
      teachers.push({
        id: uid("docente-extra"),
        name: teacherName,
        active: true,
        hourlyRate: 0,
        simulationRate: 100000,
        color: colors[teachers.length % colors.length],
        restrictions: [],
      });
    }
  });

  const normalizedGroups = groups.map((g) => {
    if (normalizeText(g.name).toLowerCase() === "pedregal" && (!g.customSlots || parseCustomSlots(g.customSlots).length === 0 || g.type === "free")) {
      return { ...g, type: "custom", customSlots: [{ label: "2:30 p.m. a 5:30 p.m.", startTime: "14:30", endTime: "17:30", hours: 3 }], travelBlock: true };
    }
    return g;
  });

  return { ...rawData, groups: normalizedGroups, subjects: normalizeSubjects(subjects), teachers, schedules, extraHours };
}

function loadInitialData() {
  const current = safeRead(APP_DATA_KEY, null);
  if (current?.version >= 8) return sanitizeAppData({ ...current, version: 28, subjects: normalizeSubjects(current.subjects || defaultSubjects), extraHours: current.extraHours || [], settings: { holidayMode: "warn", colorBy: "subject", institutionName: "PreICFES Sarasty", logoDataUrl: "", ...(current.settings || {}) } });
  let legacySchedules = [];
  for (const key of LEGACY_KEYS) {
    const found = safeRead(key, null);
    if (Array.isArray(found) && found.length) { legacySchedules = found; break; }
  }
  const legacyRestrictions = safeRead("programador-academico-unavailability-v2", {});
  const legacyRates = safeRead("programador-academico-hourly-rates-v1", {});
  const legacySimRates = safeRead("programador-academico-simulation-rates-v1", {});
  const teachers = defaultTeachers.map((t) => ({ ...t, hourlyRate: Number(legacyRates[t.name] || t.hourlyRate || 0), simulationRate: Number(legacySimRates[t.name] || t.simulationRate || 0), restrictions: legacyRestrictions[t.name] || [] }));
  return sanitizeAppData({ version: 28, groups: defaultGroups, subjects: normalizeSubjects(defaultSubjects), teachers, schedules: legacySchedules, extraHours: [], settings: { holidayMode: "warn", colorBy: "subject", institutionName: "PreICFES Sarasty", logoDataUrl: "" } });
}

export default function App() {
  const [data, setData] = useState(loadInitialData);
  const [cloudReady, setCloudReady] = useState(false);
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [activeSection, setActiveSection] = useState("calendario");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedGroup, setSelectedGroup] = useState(data.groups.find((g) => g.active)?.name || "Intensivo");
  const [selectedDay, setSelectedDay] = useState(null);
  const [filters, setFilters] = useState({ teacher: "", subject: "" });
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ subject: "Matemáticas", teacher: "David Morales", timeSlot: "08:00-10:00", startTime: "08:00", endTime: "10:00", subgroup: "", notes: "" });
  const [entityDraft, setEntityDraft] = useState({ groupName: "", groupType: "fixed", groupTravel: false, groupSubgroups: "", groupCustomSlots: "", teacherName: "", subjectName: "" });
  const [restrictionDraft, setRestrictionDraft] = useState({ teacher: data.teachers[0]?.name || "", day: 1, startTime: "08:00", endTime: "10:00" });
  const [extraDraft, setExtraDraft] = useState({ teacher: data.teachers[0]?.name || "", date: formatDateKey(new Date()), hours: 1, rate: 0, concept: "Horas extras" });
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [paymentsDate, setPaymentsDate] = useState(new Date());
  const [dashboardDate, setDashboardDate] = useState(new Date());
  const [reportDate, setReportDate] = useState(new Date());
  const [reportFilters, setReportFilters] = useState({ group: "", teacher: "", subject: "" });
  const [autoDraft, setAutoDraft] = useState({ month: monthInputValue(new Date()), groups: [], subjects: [], teacherMap: {}, targetHours: {}, priorityMap: {} });
  const [autoResult, setAutoResult] = useState(null);
  const [matrixFilters, setMatrixFilters] = useState({});
  useEffect(() => {
  async function checkSession() {
    const { data } = await getCurrentSession();
    setSession(data.session || null);
    setAuthReady(true);
  }

  checkSession();
}, []);

  useEffect(() => {
  async function initCloud() {
    try {
      const cloudData = await loadCloudState();

      if (cloudData && cloudData.version && cloudData.groups && cloudData.teachers && cloudData.subjects) {
        setData(
          sanitizeAppData({
            ...cloudData,
            version: 28,
            subjects: normalizeSubjects(cloudData.subjects || defaultSubjects),
            extraHours: cloudData.extraHours || [],
            settings: {
              holidayMode: "warn",
              colorBy: "subject",
              institutionName: "PreICFES Sarasty",
              logoDataUrl: "",
              ...(cloudData.settings || {}),
            },
          })
        );
      }

      setCloudReady(true);
    } catch (error) {
      console.error("Error cargando datos desde Supabase:", error);
      setCloudReady(true);
    }
  }

  initCloud();
}, []);

useEffect(() => {
  if (!cloudReady) return;

  localStorage.setItem(APP_DATA_KEY, JSON.stringify(data));

  saveCloudState(data).catch((error) => {
    console.error("Error guardando datos en Supabase:", error);
  });
}, [data, cloudReady]);

  const groups = data.groups;
  const subjects = data.subjects;
  const teachers = data.teachers;
  const activeGroups = groups.filter((g) => g.active !== false);
  const activeSubjects = subjects.filter((s) => s.active !== false);
  const activeTeachers = teachers.filter((t) => t.active !== false);
  const integrityScan = useMemo(() => splitValidInvalidSchedules(data.schedules || [], groups, teachers, subjects), [data.schedules, groups, teachers, subjects]);
  const validSchedules = integrityScan.valid;
  const invalidSchedules = integrityScan.invalid;
  const group = groupByName(groups, selectedGroup);
  const selectedDateKey = selectedDay ? formatDateKey(selectedDay) : null;
  const currentSlots = slotsForGroup(group);
  function colorForSchedule(schedule) {
    if (data.settings.colorBy === "group") return groupByName(groups, schedule.group)?.color || "#60a5fa";
    if (data.settings.colorBy === "teacher") return teacherByName(teachers, schedule.teacher)?.color || "#60a5fa";
    return subjectByName(subjects, schedule.subject)?.color || defaultSubjectColor(schedule.subject, 0);
  }

  const filteredSchedules = useMemo(() => validSchedules.filter((item) => (!filters.teacher || item.teacher === filters.teacher) && (!filters.subject || item.subject === filters.subject)), [validSchedules, filters]);
  const monthlySchedules = useMemo(() => validSchedules.filter((s) => sameMonth(s.date, currentDate)), [validSchedules, currentDate]);
  const monthlyFilteredSchedules = useMemo(() => filteredSchedules.filter((s) => sameMonth(s.date, currentDate)), [filteredSchedules, currentDate]);
  const schedulesByDateAndGroup = useMemo(() => filteredSchedules.reduce((acc, item) => { acc[item.group] ??= {}; acc[item.group][item.date] ??= []; acc[item.group][item.date].push(item); return acc; }, {}), [filteredSchedules]);
  const selectedSchedules = selectedDateKey ? validSchedules.filter((s) => s.date === selectedDateKey && s.group === selectedGroup).sort((a, b) => a.startTime.localeCompare(b.startTime)) : [];
  const monthlyExtraHours = useMemo(() => (data.extraHours || []).filter((x) => sameMonth(x.date, currentDate)), [data.extraHours, currentDate]);
  const counters = useMemo(() => buildCounters(monthlySchedules, groups, teachers, subjects, monthlyExtraHours), [monthlySchedules, groups, teachers, subjects, monthlyExtraHours]);
  const paymentsSchedules = useMemo(() => validSchedules.filter((s) => sameMonth(s.date, paymentsDate)), [validSchedules, paymentsDate]);
  const paymentsExtraHours = useMemo(() => (data.extraHours || []).filter((x) => sameMonth(x.date, paymentsDate)), [data.extraHours, paymentsDate]);
  const paymentsCounters = useMemo(() => buildCounters(paymentsSchedules, groups, teachers, subjects, paymentsExtraHours), [paymentsSchedules, groups, teachers, subjects, paymentsExtraHours]);
  const dashboardSchedules = useMemo(() => validSchedules.filter((s) => sameMonth(s.date, dashboardDate)), [validSchedules, dashboardDate]);
  const dashboardExtraHours = useMemo(() => (data.extraHours || []).filter((x) => sameMonth(x.date, dashboardDate)), [data.extraHours, dashboardDate]);
  const dashboardCounters = useMemo(() => buildCounters(dashboardSchedules, groups, teachers, subjects, dashboardExtraHours), [dashboardSchedules, groups, teachers, subjects, dashboardExtraHours]);
  const reportSchedules = useMemo(() => filterSchedulesForReport(validSchedules, reportDate, reportFilters), [validSchedules, reportDate, reportFilters]);
  const reportExtraHours = useMemo(() => filterExtraHoursForReport(data.extraHours || [], reportDate, reportFilters), [data.extraHours, reportDate, reportFilters]);
  const reportCounters = useMemo(() => buildCounters(reportSchedules, groups, teachers, subjects, reportExtraHours), [reportSchedules, groups, teachers, subjects, reportExtraHours]);

  function show(text) { setMessage(text); clearTimeout(show.timer); show.timer = setTimeout(() => setMessage(""), 6500); }
  function patchData(patch) { setData((current) => ({ ...current, ...patch })); }
  function updateSettings(field, value) { setData((current) => ({ ...current, settings: { ...current.settings, [field]: value } })); }
  function loadLogoFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSettings("logoDataUrl", reader.result);
    reader.readAsDataURL(file);
  }
  function getMonday(date) { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }

  function openDay(date, targetGroup) {
    const nextGroup = groupByName(groups, targetGroup);
    const firstTeacher = activeTeachers[0]?.name || "";
    const firstSubject = activeSubjects[0]?.name || "";
    setSelectedGroup(nextGroup.name);
    setSelectedDay(date);
    const firstSlot = slotsForGroup(nextGroup)[0] || fixedSlots[0];
    setForm((old) => ({ ...old, teacher: old.teacher || firstTeacher, subject: old.subject || firstSubject, subgroup: nextGroup.subgroups?.[0] || "", timeSlot: `${firstSlot.startTime}-${firstSlot.endTime}`, startTime: firstSlot.startTime, endTime: firstSlot.endTime }));
    setActiveSection("calendario");
  }

  function validateSchedule({ date, targetGroup, teacher, startTime, endTime, subgroup = "", ignoreId = null, subject = "" }) {
    if (isRestDay(date)) return "No se puede programar en domingo o día de descanso.";
    const groupConfig = groupByName(groups, targetGroup);
    const isSimulation = isSimulationSubject(subject);
    const validationStart = isSimulation ? FULL_DAY_START : startTime;
    const validationEnd = isSimulation ? FULL_DAY_END : endTime;
    const sameGroupDay = validSchedules.filter((s) => s.id !== ignoreId && s.date === date && s.group === targetGroup);
    const occupiedRoom = sameGroupDay.some((s) => {
      const sameSubgroup = groupConfig.subgroups?.length ? (s.classroom || groupConfig.subgroups[0]) === (subgroup || groupConfig.subgroups[0]) : true;
      return sameSubgroup && overlap(validationStart, validationEnd, s.startTime, s.endTime);
    });
    if (occupiedRoom) return groupConfig.subgroups?.length ? `${subgroup || groupConfig.subgroups[0]} ya tiene clase o simulacro en ese día/horario.` : "Ese día u horario ya está ocupado en el grupo.";

    const teacherConfig = teacherByName(teachers, teacher);
    const dateObj = new Date(`${date}T12:00:00`);
    const blocked = (teacherConfig.restrictions || []).find((r) => Number(r.day) === dateObj.getDay() && overlap(validationStart, validationEnd, r.startTime, r.endTime));
    if (blocked) return `Docente no disponible: ${dayLabel(blocked.day)} de ${blocked.startTime} a ${blocked.endTime}.`;

    const dailyTeacher = validSchedules.filter((s) => s.id !== ignoreId && s.date === date && s.teacher === teacher);
    const travelElsewhere = dailyTeacher.find((s) => groupByName(groups, s.group)?.travelBlock && s.group !== targetGroup);
    if (travelElsewhere) return `Docente ya programado en ${travelElsewhere.group}. Por desplazamiento queda bloqueado todo el día.`;
    if (groupConfig.travelBlock) {
      const otherGroup = dailyTeacher.find((s) => s.group !== targetGroup);
      if (otherGroup) return `Docente ya programado en ${otherGroup.group}. Para ${targetGroup} debe estar disponible todo el día por desplazamiento.`;
    }
    const timeConflict = dailyTeacher.find((s) => overlap(validationStart, validationEnd, s.startTime, s.endTime));
    if (timeConflict) return `Docente ya programado en ${timeConflict.group} de ${isSimulationSubject(timeConflict.subject) ? "día completo" : `${timeConflict.startTime} a ${timeConflict.endTime}`}.`;
    return "";
  }

  function submitSchedule(event) {
    event.preventDefault();
    if (!selectedDateKey) return;
    const targetGroup = groupByName(groups, selectedGroup);
    const groupSlots = slotsForGroup(targetGroup);
    const subject = subjectByName(subjects, form.subject);
    const isSimulation = isSimulationSubject(subject.name);
    const slot = isSimulation
      ? { startTime: FULL_DAY_START, endTime: FULL_DAY_END, label: "Día completo", hours: 0 }
      : (targetGroup.type === "free" ? { startTime: form.startTime, endTime: form.endTime } : groupSlots.find((s) => `${s.startTime}-${s.endTime}` === form.timeSlot));
    if (!slot || minutes(slot.endTime) <= minutes(slot.startTime)) return show("Selecciona un horario válido. La hora de fin debe ser posterior a la hora de inicio.");
    const warningHoliday = colombiaHolidays2026[selectedDateKey] ? `Festivo: ${colombiaHolidays2026[selectedDateKey]}. ` : "";
    const validation = validateSchedule({ date: selectedDateKey, targetGroup: targetGroup.name, teacher: form.teacher, startTime: slot.startTime, endTime: slot.endTime, subgroup: form.subgroup, subject: subject.name });
    if (validation) return show(validation);
    const teacher = teacherByName(teachers, form.teacher);
    const newItem = {
      id: uid("clase"), date: selectedDateKey, group: targetGroup.name, subject: subject.name, teacher: teacher.name,
      timeSlot: isSimulation ? "dia-completo" : `${slot.startTime}-${slot.endTime}`, startTime: slot.startTime, endTime: slot.endTime, hours: isSimulation ? 0 : hoursBetween(slot.startTime, slot.endTime),
      fullDay: isSimulation,
      classroom: targetGroup.subgroups?.length ? (form.subgroup || targetGroup.subgroups[0]) : "", notes: form.notes.trim(),
      hourlyRate: Number(teacher.hourlyRate || 0), simulationRate: isSimulation ? Number(teacher.simulationRate || 0) : 0,
    };
    patchData({ schedules: [...data.schedules, newItem] });
    setForm((old) => ({ ...old, notes: "" }));
    show(`${warningHoliday}${isSimulation ? "Simulacro guardado como actividad de día completo." : "Clase guardada correctamente."}`);
  }

  function moveSchedule(id, newDate, targetSlot) {
    const s = data.schedules.find((item) => item.id === id);
    if (!s) return;
    if (isRestDay(newDate)) return show("No se puede mover la clase: domingo o día de descanso.");

    const groupConfig = groupByName(groups, s.group);
    const isSimulation = isSimulationSubject(s.subject);
    const duration = Number(s.hours || hoursBetween(s.startTime, s.endTime) || 2);
    const targetSubgroup = targetSlot?.subgroup ?? s.classroom ?? "";
    const newStart = isSimulation ? FULL_DAY_START : targetSlot.startTime;
    let end = isSimulation ? FULL_DAY_END : targetSlot.endTime;

    if (!isSimulation && groupConfig.type === "free") {
      const endMinutes = minutes(targetSlot.startTime) + duration * 60;
      const hh = String(Math.floor(endMinutes / 60)).padStart(2, "0");
      const mm = String(endMinutes % 60).padStart(2, "0");
      end = `${hh}:${mm}`;
    }

    if (!isSimulation && minutes(end) <= minutes(newStart)) return show("No se puede mover la clase: horario destino inválido.");
    if (!isSimulation && minutes(end) > minutes("21:00")) return show("No se puede mover la clase: supera el horario máximo permitido.");

    const validation = validateSchedule({
      date: newDate,
      targetGroup: s.group,
      teacher: s.teacher,
      startTime: newStart,
      endTime: end,
      subgroup: targetSubgroup,
      ignoreId: id,
      subject: s.subject,
    });
    if (validation) return show(`No se puede mover la clase: ${validation}`);

    patchData({
      schedules: data.schedules.map((item) => item.id === id ? {
        ...item,
        date: newDate,
        startTime: newStart,
        endTime: end,
        timeSlot: isSimulation ? "dia-completo" : `${newStart}-${end}`,
        hours: isSimulation ? 0 : hoursBetween(newStart, end),
        fullDay: isSimulation,
        classroom: groupConfig.subgroups?.length ? targetSubgroup : "",
      } : item),
    });
    show(colombiaHolidays2026[newDate] ? `Clase movida correctamente. Advertencia: ${newDate} es festivo.` : "Clase movida correctamente.");
  }

  function auditSchedules() {
    const issues = [];
    const addIssue = (type, message, items = []) => {
      issues.push({ type, message, items });
    };

    const list = data.schedules || [];
    list.forEach((s) => {
      const baseReason = baseInvalidReason(s, groups, teachers, subjects);
      if (baseReason) {
        addIssue("Registro inválido", `${s?.date || "Sin fecha"}: ${baseReason} ${s?.group || ""} ${s?.subject || ""} ${s?.teacher || ""}`.trim(), [s]);
      }
      const g = groupByName(groups, s.group);
      const teacher = teacherByName(teachers, s.teacher);
      const start = isSimulationSubject(s.subject) ? FULL_DAY_START : s.startTime;
      const end = isSimulationSubject(s.subject) ? FULL_DAY_END : s.endTime;
      if (!g || !s.group) addIssue("Grupo no reconocido", `${s.date}: clase con grupo no reconocido (${s.group || "sin grupo"}).`, [s]);
      if (!teacher || !s.teacher) addIssue("Docente no reconocido", `${s.date}: clase con docente no reconocido (${s.teacher || "sin docente"}).`, [s]);
      if (!subjectByName(subjects, s.subject) || !s.subject) addIssue("Materia no reconocida", `${s.date}: clase con materia no reconocida (${s.subject || "sin materia"}).`, [s]);
      if (!start || !end || minutes(end) <= minutes(start)) addIssue("Horario inválido", `${s.date}: ${s.subject} con horario inválido en ${s.group}.`, [s]);

      const dateObj = new Date(`${s.date}T12:00:00`);
      const blocked = (teacher?.restrictions || []).find((r) => Number(r.day) === dateObj.getDay() && overlap(start, end, r.startTime, r.endTime));
      if (blocked) {
        addIssue(
          "Restricción docente",
          `${formatDateKey(dateObj)}: ${s.teacher} no disponible (${dayLabel(blocked.day)} ${blocked.startTime}-${blocked.endTime}) y está programado en ${s.group} de ${scheduleTimeLabel(s)}.`,
          [s]
        );
      }
    });

    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (a.date !== b.date) continue;

        const aStart = isSimulationSubject(a.subject) ? FULL_DAY_START : a.startTime;
        const aEnd = isSimulationSubject(a.subject) ? FULL_DAY_END : a.endTime;
        const bStart = isSimulationSubject(b.subject) ? FULL_DAY_START : b.startTime;
        const bEnd = isSimulationSubject(b.subject) ? FULL_DAY_END : b.endTime;
        const sameTime = overlap(aStart, aEnd, bStart, bEnd);
        const groupA = groupByName(groups, a.group);
        const groupB = groupByName(groups, b.group);

        if (a.teacher === b.teacher) {
          if (sameTime) {
            addIssue(
              "Docente duplicado",
              `${a.date}: docente ${a.teacher} duplicado entre ${a.group}${a.classroom ? ` (${a.classroom})` : ""} ${scheduleTimeLabel(a)} y ${b.group}${b.classroom ? ` (${b.classroom})` : ""} ${scheduleTimeLabel(b)}.`,
              [a, b]
            );
          }
          if ((groupA?.travelBlock || groupB?.travelBlock) && a.group !== b.group) {
            addIssue(
              "Bloqueo por desplazamiento",
              `${a.date}: ${a.teacher} está programado en ${a.group} y ${b.group}; una sede con viaje bloquea al docente todo el día.`,
              [a, b]
            );
          }
        }

        if (a.group === b.group) {
          const g = groupA;
          const aRoom = g?.subgroups?.length ? (a.classroom || g.subgroups[0]) : "grupo";
          const bRoom = g?.subgroups?.length ? (b.classroom || g.subgroups[0]) : "grupo";
          if (aRoom === bRoom && sameTime) {
            addIssue(
              "Espacio ocupado",
              `${a.date}: ${a.group}${g?.subgroups?.length ? ` (${aRoom})` : ""} tiene dos actividades en el mismo horario: ${a.subject} ${scheduleTimeLabel(a)} y ${b.subject} ${scheduleTimeLabel(b)}.`,
              [a, b]
            );
          }
        }
      }
    }

    const rows = issues.map((issue, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(issue.type)}</td><td>${escapeHtml(issue.message)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Auditoría de programación</title><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:24px;background:#0f172a;color:#e5e7eb;}
      h1{margin:0 0 6px;font-size:28px;}p{color:#cbd5e1}.ok{padding:18px 20px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.12);border-radius:18px;color:#bbf7d0;font-weight:700;}
      table{width:100%;border-collapse:collapse;margin-top:18px;background:#111827;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid rgba(148,163,184,.2);padding:11px 12px;text-align:left;font-size:13px;vertical-align:top}th{background:#1e3a8a;color:#dbeafe}td:first-child{width:50px;color:#93c5fd;font-weight:700}.toolbar{margin:16px 0}.toolbar button{border:1px solid rgba(147,197,253,.35);border-radius:999px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;font-weight:800;padding:10px 18px;cursor:pointer}.footer{margin-top:18px;color:#94a3b8;font-size:12px}@media print{body{background:white;color:#111827}.toolbar{display:none}p,.footer{color:#475569}table{background:white}th{background:#1e3a8a;color:white}}
    </style></head><body><h1>Auditoría de programación</h1><p>Revisión de conflictos por docente, restricciones, duplicados, ocupación de espacios y bloqueo por desplazamiento. Fecha de auditoría: ${new Date().toLocaleString("es-CO")}</p><div class="toolbar"><button onclick="window.print()">Guardar auditoría como PDF</button></div>${issues.length ? `<table><thead><tr><th>#</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="ok">No se encontraron conflictos en la programación actual.</div>`}<p class="footer">Desarrollado por SOFTWARE INTELLIGENCE QUALITY - Ing. Juan Camilo Pérez</p></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return show("El navegador bloqueó la ventana de auditoría.");
    win.document.write(html);
    win.document.close();
    show(issues.length ? `Auditoría finalizada: ${issues.length} conflicto(s) encontrado(s).` : "Auditoría finalizada: no se encontraron conflictos.");
  }

  function deleteSchedule(id) { patchData({ schedules: data.schedules.filter((s) => s.id !== id) }); }

  function saveGroup(event) {
    event.preventDefault();
    const name = entityDraft.groupName.trim(); if (!name) return show("Escribe el nombre del grupo.");
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return show("Ya existe un grupo con ese nombre.");
    const parsedCustomSlots = parseCustomSlots(entityDraft.groupCustomSlots);
    if (entityDraft.groupType === "custom" && !parsedCustomSlots.length) return show("Agrega al menos un horario personalizado válido. Ej: 14:30-17:30");
    const newGroup = { id: uid("grupo"), name, type: entityDraft.groupType, active: true, travelBlock: Boolean(entityDraft.groupTravel), color: colors[groups.length % colors.length], subgroups: entityDraft.groupSubgroups.split(",").map((x) => x.trim()).filter(Boolean), customSlots: parsedCustomSlots };
    patchData({ groups: [...groups, newGroup] });
    setEntityDraft((d) => ({ ...d, groupName: "", groupSubgroups: "", groupCustomSlots: "" })); show("Grupo creado correctamente.");
  }
  function saveTeacher(event) { event.preventDefault(); const name = entityDraft.teacherName.trim(); if (!name) return show("Escribe el nombre del docente."); if (teachers.some((t) => t.name.toLowerCase() === name.toLowerCase())) return show("Ya existe un docente con ese nombre."); patchData({ teachers: [...teachers, { id: uid("docente"), name, active: true, hourlyRate: 0, simulationRate: 100000, color: colors[teachers.length % colors.length], restrictions: [] }] }); setEntityDraft((d) => ({ ...d, teacherName: "" })); show("Docente creado correctamente."); }
  function saveSubject(event) { event.preventDefault(); const name = entityDraft.subjectName.trim(); if (!name) return show("Escribe el nombre de la materia o actividad."); if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) return show("Ya existe esa materia o actividad."); patchData({ subjects: [...subjects, { id: uid("materia"), name, active: true, color: defaultSubjectColor(name, subjects.length) }] }); setEntityDraft((d) => ({ ...d, subjectName: "" })); show("Materia/actividad creada correctamente."); }
  function updateEntity(kind, id, patch) { patchData({ [kind]: data[kind].map((x) => x.id === id ? { ...x, ...patch } : x) }); }
  function updateTeacherRate(id, field, value) { updateEntity("teachers", id, { [field]: Math.max(0, Number(value || 0)) }); }
  function addRestriction(event) { event.preventDefault(); if (restrictionDraft.endTime <= restrictionDraft.startTime) return show("La hora de fin debe ser posterior a la hora de inicio."); patchData({ teachers: teachers.map((t) => t.name === restrictionDraft.teacher ? { ...t, restrictions: [...(t.restrictions || []), { id: uid("restriccion"), day: Number(restrictionDraft.day), startTime: restrictionDraft.startTime, endTime: restrictionDraft.endTime }] } : t) }); show("Restricción guardada."); }
  function removeRestriction(teacherId, restrictionId) { patchData({ teachers: teachers.map((t) => t.id === teacherId ? { ...t, restrictions: (t.restrictions || []).filter((r) => r.id !== restrictionId) } : t) }); }

  function addExtraHour(event) {
    event.preventDefault();
    if (!extraDraft.teacher) return show("Selecciona un docente.");
    const hours = Number(extraDraft.hours || 0);
    const rate = Number(extraDraft.rate || 0);
    if (!extraDraft.date) return show("Selecciona la fecha de las horas extras.");
    if (hours <= 0) return show("La cantidad de horas extras debe ser mayor a cero.");
    if (rate < 0) return show("El valor de la hora extra no puede ser negativo.");
    const item = { id: uid("extra"), teacher: extraDraft.teacher, date: extraDraft.date, hours, rate, concept: extraDraft.concept?.trim() || "Horas extras" };
    patchData({ extraHours: [...(data.extraHours || []), item] });
    setExtraDraft((old) => ({ ...old, hours: 1, concept: "Horas extras" }));
    show("Horas extras agregadas correctamente.");
  }

  function deleteExtraHour(id) {
    patchData({ extraHours: (data.extraHours || []).filter((x) => x.id !== id) });
    show("Horas extras eliminadas.");
  }

  function duplicateWeek() {
    const from = formatDateKey(weekStart); const to = formatDateKey(addDays(weekStart, 6));
    const items = validSchedules.filter((s) => s.date >= from && s.date <= to);
    if (!items.length) return show("No hay clases válidas en la semana seleccionada para duplicar.");
    const copies = [];
    const logs = [];
    items.forEach((s) => {
      const newDate = formatDateKey(addDays(new Date(`${s.date}T12:00:00`), 7));
      const reason = validateSchedule({ date: newDate, targetGroup: s.group, teacher: s.teacher, startTime: s.startTime, endTime: s.endTime, subgroup: s.classroom || "", subject: s.subject });
      if (reason) logs.push(`${newDate} · ${s.group} · ${s.subject}: ${reason}`);
      else copies.push({ ...s, id: uid("clase"), date: newDate });
    });
    if (copies.length) patchData({ schedules: [...data.schedules, ...copies] });
    show(`Se duplicaron ${copies.length} clases a la semana siguiente. ${logs.length} excluidas por reglas.`);
  }
  function duplicateMonth() {
    const items = monthlySchedules;
    if (!items.length) return show("No hay clases válidas en el mes visible para duplicar.");
    const copies = [];
    const logs = [];
    items.forEach((s) => {
      const d = new Date(`${s.date}T12:00:00`); d.setMonth(d.getMonth() + 1);
      const newDate = formatDateKey(d);
      const reason = validateSchedule({ date: newDate, targetGroup: s.group, teacher: s.teacher, startTime: s.startTime, endTime: s.endTime, subgroup: s.classroom || "", subject: s.subject });
      if (reason) logs.push(`${newDate} · ${s.group} · ${s.subject}: ${reason}`);
      else copies.push({ ...s, id: uid("clase"), date: newDate });
    });
    if (copies.length) patchData({ schedules: [...data.schedules, ...copies] });
    show(`Se duplicaron ${copies.length} clases al mes siguiente. ${logs.length} excluidas por reglas.`);
  }
  function cleanInvalidSchedules() {
    const scan = splitValidInvalidSchedules(data.schedules || [], groups, teachers, subjects);
    if (!scan.invalid.length) return show("No se encontraron registros inválidos para limpiar.");
    const summary = scan.invalid.slice(0, 8).map(({ item, reason }) => `${item?.date || "Sin fecha"} · ${item?.group || "Sin grupo"} · ${item?.subject || "Sin materia"}: ${reason}`).join("\n");
    const confirmed = window.confirm(`Se eliminarán ${scan.invalid.length} registro(s) inválido(s). No se tocarán clases válidas, grupos, docentes, materias ni pagos.\n\n${summary}${scan.invalid.length > 8 ? "\n..." : ""}\n\n¿Continuar?`);
    if (!confirmed) return;
    setData((current) => {
      const currentScan = splitValidInvalidSchedules(current.schedules || [], current.groups || [], current.teachers || [], current.subjects || []);
      return {
        ...current,
        schedules: currentScan.valid,
        integrity: {
          ...(current.integrity || {}),
          removedInvalidCount: Number(current.integrity?.removedInvalidCount || 0) + currentScan.invalid.length,
          lastRemovedInvalid: currentScan.invalid.map(({ item, reason }) => ({ id: item?.id, date: item?.date, group: item?.group, subject: item?.subject, teacher: item?.teacher, reason })).slice(-100),
          lastSanitizedAt: new Date().toISOString(),
        },
      };
    });
    show(`Se eliminaron ${scan.invalid.length} registro(s) inválido(s).`);
  }

  function clearCurrentMonthForSelectedGroup() {
    const groupName = selectedGroup;
    const monthName = monthLabel(currentDate);
    const items = data.schedules.filter((s) => s.group === groupName && sameMonth(s.date, currentDate));
    if (!items.length) return show(`No hay programación para borrar en ${groupName} durante ${monthName}.`);
    const confirmed = window.confirm(`Se borrarán ${items.length} clases/actividades de ${groupName} en ${monthName}. No se tocarán otros grupos ni otros meses. ¿Continuar?`);
    if (!confirmed) return;
    patchData({ schedules: data.schedules.filter((s) => !(s.group === groupName && sameMonth(s.date, currentDate))) });
    show(`Se limpió la programación de ${groupName} en ${monthName}. Otros grupos y meses no fueron modificados.`);
  }
  function exportBackup() { exportFile(`respaldo-programador-preicfes-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8"); show("Respaldo exportado correctamente."); }
  function importBackup(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); if (!imported.groups || !imported.teachers || !imported.subjects || !Array.isArray(imported.schedules)) throw new Error(); setData(sanitizeAppData({ ...imported, version: 28, subjects: normalizeSubjects(imported.subjects || defaultSubjects), extraHours: imported.extraHours || [], settings: { holidayMode: "warn", colorBy: "subject", institutionName: "PreICFES Sarasty", logoDataUrl: "", ...(imported.settings || {}) } })); show("Respaldo importado correctamente."); } catch { show("No se pudo importar. Verifica que sea un respaldo válido."); } }; reader.readAsText(file); }

  function reportFilterLabel() {
    const parts = [];
    if (reportFilters.group) parts.push(`Grupo: ${reportFilters.group}`);
    if (reportFilters.teacher) parts.push(`Docente: ${reportFilters.teacher}`);
    if (reportFilters.subject) parts.push(`Materia: ${reportFilters.subject}`);
    return parts.length ? parts.join(" · ") : "Informe completo";
  }

  function exportRowsCsv(rows, filename) {
    exportFile(filename, rows.map((r) => r.map(csv).join(";")).join("\n"), "text/csv;charset=utf-8");
  }

  function hoursDetailRows(list = reportSchedules) {
    const rows = [["Fecha", "Grupo", "Subgrupo", "Horario", "Materia", "Docente", "Tipo", "Horas"]];
    list
      .slice()
      .sort((a, b) => `${a.date} ${a.group} ${a.startTime}`.localeCompare(`${b.date} ${b.group} ${b.startTime}`))
      .forEach((s) => rows.push([
        s.date,
        s.group,
        s.classroom || "",
        scheduleTimeLabel(s),
        s.subject,
        s.teacher,
        isSimulationSubject(s.subject) ? "Simulacro" : "Clase",
        isSimulationSubject(s.subject) ? 0 : Number(s.hours || hoursBetween(s.startTime, s.endTime)),
      ]));
    return rows;
  }

  function paymentDetailRows(list = reportSchedules, extras = reportExtraHours) {
    const rows = [["Fecha", "Grupo", "Subgrupo", "Horario", "Materia/Concepto", "Docente", "Tipo", "Horas", "Valor unitario", "Total"]];
    list
      .slice()
      .sort((a, b) => `${a.date} ${a.group} ${a.teacher}`.localeCompare(`${b.date} ${b.group} ${b.teacher}`))
      .forEach((s) => {
        const simulation = isSimulationSubject(s.subject);
        const hours = simulation ? 0 : Number(s.hours || hoursBetween(s.startTime, s.endTime));
        const unitValue = simulation ? Number(s.simulationRate || teacherByName(teachers, s.teacher)?.simulationRate || 0) : Number(s.hourlyRate || teacherByName(teachers, s.teacher)?.hourlyRate || 0);
        rows.push([s.date, s.group, s.classroom || "", scheduleTimeLabel(s), s.subject, s.teacher, simulation ? "Simulacro" : "Clase", hours, unitValue, simulation ? unitValue : hours * unitValue]);
      });
    extras
      .slice()
      .sort((a, b) => `${a.date} ${a.teacher}`.localeCompare(`${b.date} ${b.teacher}`))
      .forEach((x) => rows.push([x.date, "", "", "", x.concept || "Horas extras", x.teacher, "Hora extra", Number(x.hours || 0), Number(x.rate || 0), Number(x.hours || 0) * Number(x.rate || 0)]));
    rows.push([]);
    rows.push(["Resumen por docente", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Docente", "Horas clase", "Simulacros", "Horas extra", "Pago clases", "Pago simulacros", "Pago extras", "Total", "", ""]);
    teachers.forEach((t) => rows.push([t.name, reportCounters.byTeacher[t.name] || 0, reportCounters.simulationsByTeacher[t.name] || 0, reportCounters.extraHoursByTeacher[t.name] || 0, reportCounters.payByTeacher[t.name] || 0, reportCounters.simPayByTeacher[t.name] || 0, reportCounters.extraPayByTeacher[t.name] || 0, reportCounters.totalPayByTeacher[t.name] || 0, "", ""]));
    return rows;
  }

  function generateHoursCSV() {
    if (!reportSchedules.length) return show("No hay información para exportar en el periodo seleccionado.");
    exportRowsCsv(hoursDetailRows(), `horas-detalladas-${monthSuffix(reportDate)}.csv`);
  }

  function generatePaymentsCSV() {
    if (!reportSchedules.length && !reportExtraHours.length) return show("No hay información de pagos para exportar en el periodo seleccionado.");
    exportRowsCsv(paymentDetailRows(), `pagos-detallados-${monthSuffix(reportDate)}.csv`);
  }

  function buildPrintableTable(title, rows) {
    const header = rows[0] || [];
    const body = rows.slice(1).filter((r) => r.length);
    const htmlRows = body.map((r) => `<tr>${header.map((_, i) => `<td>${escapeHtml(r[i] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial;margin:24px;color:#111827}.toolbar{margin-bottom:14px}h1{margin-bottom:4px}.meta{color:#475569;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{background:#1f4f8f;color:white}td,th{border:1px solid #cbd5e1;padding:7px;font-size:11px;text-align:left}tfoot td{font-weight:bold}@media print{.toolbar{display:none}body{margin:12mm}}</style></head><body><div class="toolbar"><button onclick="window.print()">Guardar como PDF</button></div><h1>${escapeHtml(title)}</h1><p class="meta">Periodo: ${escapeHtml(monthLabel(reportDate))} · ${escapeHtml(reportFilterLabel())}</p><table><thead><tr>${header.map((h)=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${htmlRows}</tbody></table><p class="meta">Desarrollado por SOFTWARE INTELLIGENCE QUALITY - Ing. Juan Camilo Pérez</p></body></html>`;
  }

  function printHoursReport() {
    if (!reportSchedules.length) return show("No hay información de horas para generar el informe.");
    const win = window.open("", "_blank"); if (!win) return show("El navegador bloqueó la ventana emergente.");
    win.document.write(buildPrintableTable("Informe detallado de horas", hoursDetailRows())); win.document.close();
  }

  function printPaymentsReport() {
    if (!reportSchedules.length && !reportExtraHours.length) return show("No hay información de pagos para generar el informe.");
    const win = window.open("", "_blank"); if (!win) return show("El navegador bloqueó la ventana emergente.");
    win.document.write(buildPrintableTable("Informe detallado de pagos", paymentDetailRows())); win.document.close();
  }

  function printableCalendarReport() {
    if (!reportSchedules.length) return show("No hay programación para generar el calendario en PDF.");
    const year = reportDate.getFullYear(); const month = reportDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const first = new Date(year, month, 1).getDay();
    const firstMondayIndex = (first + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstMondayIndex; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const weekdayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const byDate = reportSchedules.reduce((acc, item) => { acc[item.date] ??= []; acc[item.date].push(item); return acc; }, {});
    const cellHtml = cells.map((day) => {
      if (!day) return `<div class="day empty"></div>`;
      const dateKey = formatDateKey(new Date(year, month, day));
      const holiday = colombiaHolidays2026[dateKey];
      const items = (byDate[dateKey] || []).slice().sort((a, b) => `${a.group} ${a.startTime}`.localeCompare(`${b.group} ${b.startTime}`));
      return `<div class="day"><div class="daytop"><strong>${day}</strong>${holiday ? `<span>Festivo</span>` : ""}</div>${holiday ? `<small class="holiday">${escapeHtml(holiday)}</small>` : ""}<div class="items">${items.map((s) => `<div class="classitem"><b>${escapeHtml(s.group)}${s.classroom ? ` · ${escapeHtml(s.classroom)}` : ""}</b><br>${escapeHtml(s.subject)}<br><small>${escapeHtml(s.teacher)} · ${escapeHtml(scheduleTimeLabel(s))}</small></div>`).join("")}</div></div>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Calendario académico</title><style>body{font-family:Arial;margin:18px;color:#111827}.toolbar{margin-bottom:12px}h1{margin:0 0 4px}.meta{color:#475569;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.head{background:#1f4f8f;color:white;border-radius:8px;padding:7px;text-align:center;font-weight:bold}.day{min-height:124px;border:1px solid #cbd5e1;border-radius:10px;padding:6px;background:#f8fafc;overflow:hidden}.empty{background:white;border:0}.daytop{display:flex;justify-content:space-between;align-items:center}.daytop span{font-size:9px;background:#fef3c7;border:1px solid #f59e0b;border-radius:999px;padding:2px 5px}.holiday{display:block;color:#92400e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.classitem{margin-top:4px;padding:5px;border-radius:7px;background:#e0ecff;border-left:3px solid #1f4f8f;font-size:10px;line-height:1.2}.classitem small{color:#334155}.footer{margin-top:14px;color:#64748b;font-size:11px}@media print{.toolbar{display:none}body{margin:8mm}.day{min-height:112px}.classitem{font-size:9px}}</style></head><body><div class="toolbar"><button onclick="window.print()">Guardar como PDF</button></div><h1>Calendario académico</h1><p class="meta">Periodo: ${escapeHtml(monthLabel(reportDate))} · ${escapeHtml(reportFilterLabel())}</p><div class="grid">${weekdayNames.map((d)=>`<div class="head">${d}</div>`).join("")}${cellHtml}</div><p class="footer">Desarrollado por SOFTWARE INTELLIGENCE QUALITY - Ing. Juan Camilo Pérez</p></body></html>`;
    const win = window.open("", "_blank"); if (!win) return show("El navegador bloqueó la ventana emergente."); win.document.write(html); win.document.close();
  }


  function matrixHoursBySubject(monthDate) {
    const rows = subjects.filter((s) => s.active !== false).map((subject) => {
      const values = {};
      activeGroups.forEach((groupItem) => { values[groupItem.name] = 0; });
      dashboardSchedules.forEach((item) => {
        if (item.subject === subject.name && !isSimulationSubject(item.subject)) {
          values[item.group] = (values[item.group] || 0) + Number(item.hours || hoursBetween(item.startTime, item.endTime));
        }
      });
      const total = Object.values(values).reduce((a, b) => a + Number(b || 0), 0);
      return { label: subject.name, values, total };
    });
    return rows;
  }

  function matrixHoursByTeacher(monthDate) {
    const rows = teachers.filter((t) => t.active !== false).map((teacher) => {
      const values = {};
      activeGroups.forEach((groupItem) => { values[groupItem.name] = 0; });
      dashboardSchedules.forEach((item) => {
        if (item.teacher === teacher.name && !isSimulationSubject(item.subject)) {
          values[item.group] = (values[item.group] || 0) + Number(item.hours || hoursBetween(item.startTime, item.endTime));
        }
      });
      const total = Object.values(values).reduce((a, b) => a + Number(b || 0), 0);
      return { label: teacher.name, values, total };
    });
    return rows;
  }

  function matrixPaymentsByTeacher(monthDate) {
    const rows = teachers.filter((t) => t.active !== false).map((teacher) => {
      const values = {};
      activeGroups.forEach((groupItem) => { values[groupItem.name] = 0; });
      paymentsSchedules.forEach((item) => {
        if (item.teacher === teacher.name) {
          values[item.group] = (values[item.group] || 0) + valueForSchedule(item, teachers);
        }
      });
      const extras = paymentsExtraHours.filter((x) => x.teacher === teacher.name).reduce((sum, x) => sum + Number(x.hours || 0) * Number(x.rate || 0), 0);
      const totalGroups = Object.values(values).reduce((a, b) => a + Number(b || 0), 0);
      return { label: teacher.name, values, extras, total: totalGroups + extras };
    });
    return rows;
  }

  function setMatrixFilter(tableId, field, value) {
    setMatrixFilters((old) => ({ ...old, [tableId]: { ...(old[tableId] || {}), [field]: value } }));
  }

  function matrixRowVisible(row, tableId, includeExtras = false) {
    const tableFilters = matrixFilters[tableId] || {};
    const rowSearch = normalizeText(tableFilters.row || "").toLowerCase();
    if (rowSearch && !normalizeText(row.label).toLowerCase().includes(rowSearch)) return false;
    for (const groupItem of activeGroups) {
      const filterValue = tableFilters[`group:${groupItem.name}`] || "all";
      const cellValue = Number(row.values[groupItem.name] || 0);
      if (filterValue === "with" && cellValue <= 0) return false;
      if (filterValue === "without" && cellValue > 0) return false;
    }
    if (includeExtras) {
      const extraFilter = tableFilters.extras || "all";
      const extraValue = Number(row.extras || 0);
      if (extraFilter === "with" && extraValue <= 0) return false;
      if (extraFilter === "without" && extraValue > 0) return false;
    }
    const totalFilter = tableFilters.total || "all";
    const totalValue = Number(row.total || 0);
    if (totalFilter === "with" && totalValue <= 0) return false;
    if (totalFilter === "without" && totalValue > 0) return false;
    return true;
  }

  function renderMatrixTable(title, firstColumn, rows, valueFormatter = (v) => `${v || 0} h`, includeExtras = false, tableId = title) {
    const visibleRows = rows.filter((row) => matrixRowVisible(row, tableId, includeExtras));
    const tableFilters = matrixFilters[tableId] || {};
    const statusFilter = (field) => (
      <select
        className="column-filter"
        value={tableFilters[field] || "all"}
        onChange={(e) => setMatrixFilter(tableId, field, e.target.value)}
        aria-label={`Filtro ${field}`}
      >
        <option value="all">Todos</option>
        <option value="with">Con valor</option>
        <option value="without">En cero</option>
      </select>
    );
    return (
      <article className="wide-table-card matrix-card">
        <div className="matrix-card-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">Filtra por nombre o por columnas con/sin valor.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={() => setMatrixFilters((old) => ({ ...old, [tableId]: {} }))}>Limpiar filtros</button>
        </div>
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="sticky-col">{firstColumn}<input className="column-filter" placeholder="Filtrar" value={tableFilters.row || ""} onChange={(e) => setMatrixFilter(tableId, "row", e.target.value)} /></th>
                {activeGroups.map((g)=><th key={g.id}>{g.name}{statusFilter(`group:${g.name}`)}</th>)}
                {includeExtras&&<th>Horas extras{statusFilter("extras")}</th>}
                <th>Total{statusFilter("total")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row)=>(
                <tr key={row.label}>
                  <td className="sticky-col"><strong>{row.label}</strong></td>
                  {activeGroups.map((g)=><td key={g.id} className={Number(row.values[g.name] || 0) > 0 ? "cell-positive" : "cell-zero"}>{valueFormatter(row.values[g.name] || 0)}</td>)}
                  {includeExtras&&<td className={Number(row.extras || 0) > 0 ? "cell-positive" : "cell-zero"}>{money(row.extras || 0)}</td>}
                  <td className={Number(row.total || 0) > 0 ? "cell-total cell-positive" : "cell-total cell-zero"}><strong>{valueFormatter(row.total || 0)}</strong></td>
                </tr>
              )) : <tr><td colSpan={activeGroups.length + (includeExtras ? 3 : 2)}>Sin resultados con los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    );
  }

  function toggleAutoSelection(kind, value) {
    setAutoDraft((old) => {
      const current = old[kind] || [];
      return { ...old, [kind]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value] };
    });
  }

  function setAutoTeacher(subject, teacher) {
    setAutoDraft((old) => ({ ...old, teacherMap: { ...(old.teacherMap || {}), [subject]: teacher } }));
  }

  function setAutoTargetHours(subject, value) {
    setAutoDraft((old) => ({ ...old, targetHours: { ...(old.targetHours || {}), [subject]: Math.max(0, Number(value || 0)) } }));
  }

  function setAutoPriority(subject, value) {
    setAutoDraft((old) => ({ ...old, priorityMap: { ...(old.priorityMap || {}), [subject]: value } }));
  }

  function autoPriorityLabel(value) {
    const slot = fixedSlots[Number(value) - 1];
    return slot ? `${value} · ${slot.label}` : "Sin prioridad";
  }

  function autoAvailableSlots() {
    const monthDate = monthFromInput(autoDraft.month);
    const selectedGroupNames = autoDraft.groups.length ? autoDraft.groups : [];
    const selectedSubjects = autoDraft.subjects.length ? autoDraft.subjects : [];
    const result = [];
    if (!selectedGroupNames.length || !selectedSubjects.length) return result;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    selectedGroupNames.forEach((groupName) => {
      const g = groupByName(groups, groupName);
      const subgroups = g.subgroups?.length ? g.subgroups : [""];
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = formatDateKey(date);
        const weekDay = date.getDay();
        if (weekDay === 0 || weekDay === 6) continue;
        if (colombiaHolidays2026[dateKey]) continue;
        subgroups.forEach((subgroup) => {
          slotsForGroup(g).forEach((slot, slotIndex) => {
            const occupied = validSchedules.some((s) => s.group === g.name && s.date === dateKey && ((g.subgroups?.length ? (s.classroom || g.subgroups[0]) === subgroup : true)) && overlap(slot.startTime, slot.endTime, s.startTime, s.endTime));
            if (!occupied) result.push({ group: g.name, subgroup, date: dateKey, slot, slotIndex });
          });
        });
      }
    });
    return result;
  }

  const autoSlots = autoAvailableSlots();
  const autoTotalHours = autoSlots.reduce((sum, item) => sum + Number(item.slot.hours || hoursBetween(item.slot.startTime, item.slot.endTime)), 0);
  const autoHoursPerSubject = autoDraft.subjects.length ? Math.floor(autoTotalHours / autoDraft.subjects.length) : 0;
  const autoManualTargetTotal = autoDraft.subjects.reduce((sum, subject) => sum + Number(autoDraft.targetHours?.[subject] || 0), 0);
  const autoRemainingHours = autoTotalHours - autoManualTargetTotal;
  const autoUsesManualTargets = autoManualTargetTotal > 0;

  function runAutoSchedule() {
    const selectedGroupNames = autoDraft.groups.length ? autoDraft.groups : [];
    const selectedSubjects = autoDraft.subjects.length ? autoDraft.subjects : [];
    if (!selectedGroupNames.length) return show("Selecciona al menos un grupo para programación automática.");
    if (!selectedSubjects.length) return show("Selecciona al menos una materia para programación automática.");
    const missingTeacher = selectedSubjects.find((subject) => !autoDraft.teacherMap?.[subject]);
    if (missingTeacher) return show(`Asigna un docente para ${missingTeacher}.`);

    const slots = autoAvailableSlots();
    if (!slots.length) return show("No hay espacios disponibles para programar en ese mes.");
    const targetBySubject = Object.fromEntries(selectedSubjects.map((subject) => [subject, autoUsesManualTargets ? Number(autoDraft.targetHours?.[subject] || 0) : autoHoursPerSubject]));
    const subjectsWithTarget = selectedSubjects.filter((subject) => Number(targetBySubject[subject] || 0) > 0);
    if (!subjectsWithTarget.length) return show("Asigna al menos 1 hora objetivo a una materia o deja los objetivos en cero para repartir automáticamente.");
    const programmed = [];
    const logs = [];
    const hoursBySubject = Object.fromEntries(selectedSubjects.map((s) => [s, 0]));
    const subjectIndexByGroupDay = {};
    let cursor = 0;

    slots.forEach((space) => {
      const existingForDay = [...validSchedules, ...programmed].filter((s) => s.group === space.group && s.date === space.date && (!space.subgroup || (s.classroom || groupByName(groups, space.group).subgroups?.[0] || "") === space.subgroup));
      let selectedSubject = null;
      const spaceGroup = groupByName(groups, space.group);
      const isIntensiveGroup = spaceGroup.type === "fixed" && normalizeText(spaceGroup.name).toLowerCase().includes("intensivo");
      let candidatePool = subjectsWithTarget;
      if (isIntensiveGroup) {
        candidatePool = subjectsWithTarget.filter((subject) => {
          const priority = Number(autoDraft.priorityMap?.[subject] || 0);
          return !priority || priority === Number(space.slotIndex) + 1;
        });
      }
      if (!candidatePool.length) {
        logs.push(`Espacio libre en ${space.group}${space.subgroup ? ` ${space.subgroup}` : ""} el ${space.date} de ${space.slot.label}: no hay materia con prioridad asignada para esta franja.`);
        return;
      }
      for (let attempt = 0; attempt < candidatePool.length; attempt += 1) {
        const candidate = candidatePool[(cursor + attempt) % candidatePool.length];
        const alreadyToday = existingForDay.some((s) => s.subject === candidate);
        const candidateHours = Number(space.slot.hours || hoursBetween(space.slot.startTime, space.slot.endTime));
        const targetHours = Number(targetBySubject[candidate] || 0);
        const overTarget = targetHours > 0 && hoursBySubject[candidate] + candidateHours > targetHours;
        if (!alreadyToday && !overTarget) { selectedSubject = candidate; cursor = (cursor + attempt + 1) % candidatePool.length; break; }
      }
      if (!selectedSubject) {
        logs.push(`Espacio libre en ${space.group}${space.subgroup ? ` ${space.subgroup}` : ""} el ${space.date} de ${space.slot.label}: no se programó porque todas las materias candidatas ya alcanzaron su límite, superarían las horas objetivo o se repetirían en el mismo día.`);
        return;
      }
      const teacher = autoDraft.teacherMap[selectedSubject];
      const validationAgainstCurrent = validateSchedule({ date: space.date, targetGroup: space.group, teacher, startTime: space.slot.startTime, endTime: space.slot.endTime, subgroup: space.subgroup, subject: selectedSubject });
      const validationAgainstNew = programmed.find((s) => s.date === space.date && s.teacher === teacher && overlap(space.slot.startTime, space.slot.endTime, s.startTime, s.endTime));
      if (validationAgainstCurrent || validationAgainstNew) {
        logs.push(`Se excluyó ${selectedSubject} en ${space.group}${space.subgroup ? ` ${space.subgroup}` : ""} el ${space.date} con ${teacher} debido a conflicto con restricciones o clases ya programadas.`);
        return;
      }
      const teacherConfig = teacherByName(teachers, teacher);
      const item = {
        id: uid("auto"), date: space.date, group: space.group, subject: selectedSubject, teacher,
        timeSlot: `${space.slot.startTime}-${space.slot.endTime}`, startTime: space.slot.startTime, endTime: space.slot.endTime,
        hours: Number(space.slot.hours || hoursBetween(space.slot.startTime, space.slot.endTime)), fullDay: false,
        classroom: space.subgroup || "", notes: "Programación automática",
        hourlyRate: Number(teacherConfig.hourlyRate || 0), simulationRate: 0,
      };
      programmed.push(item);
      hoursBySubject[selectedSubject] = (hoursBySubject[selectedSubject] || 0) + item.hours;
    });

    if (programmed.length) patchData({ schedules: [...data.schedules, ...programmed] });
    const result = { programmed: programmed.length, logs, hoursBySubject };
    setAutoResult(result);
    show(`Programación automática ejecutada: ${programmed.length} clases creadas. ${logs.length} espacios excluidos.`);
  }

  function renderWeeklyView() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const slots = slotsForGroup(group);
    return <section className="management-card"><div className="section-title"><p className="eyebrow">Vista semanal</p><h2>{group.name} · Semana del {formatDateKey(weekStart)}</h2><p className="muted">Vista operativa complementaria. La vista mensual se conserva como principal.</p></div><div className="week-controls"><button className="ghost-button" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semana anterior</button><button className="primary-button" onClick={() => setWeekStart(getMonday(new Date()))}>Semana actual</button><button className="ghost-button" onClick={() => setWeekStart(addDays(weekStart, 7))}>Semana siguiente →</button></div><div className="weekly-table"><div className="weekly-head">Hora</div>{days.map((d)=><div className="weekly-head" key={formatDateKey(d)}>{d.toLocaleDateString("es-CO", { weekday:"short", day:"2-digit", month:"2-digit" })}</div>)}{slots.map((slot)=><><div className="weekly-hour" key={`h-${slot.startTime}`}>{slot.label}</div>{days.map((d)=>{ const key=formatDateKey(d); const daily=validSchedules.filter((s)=>s.group===group.name&&s.date===key&&overlap(slot.startTime,slot.endTime,s.startTime,s.endTime)); return <div className="weekly-cell" key={`${key}-${slot.startTime}`} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>moveSchedule(e.dataTransfer.getData("text/plain"), key, slot)}>{daily.length?daily.map((s)=><div draggable onDragStart={(e)=>e.dataTransfer.setData("text/plain",s.id)} className="weekly-class" style={{"--item-color": colorForSchedule(s)}} key={s.id}>{s.subject}<small>{s.teacher} · {s.startTime}-{s.endTime}{s.classroom?` · ${s.classroom}`:""}</small></div>):<span>Libre</span>}</div>})}</>)} </div></section>;
  }

 if (!authReady) {
  return <div style={{ padding: 40 }}>Cargando...</div>;
}

if (!session) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0f172a",
      }}
    >
      <form
 onSubmit={async (e) => {
  e.preventDefault();

  setLoginError("");

const { data, error } = await signInAdmin(
  loginEmail,
  loginPassword
);

if (error) {
  setLoginError(error.message);
  return;
}

if (data?.session) {
  setSession(data.session);
  return;
}

const sessionResult = await getCurrentSession();

if (sessionResult.data?.session) {
  setSession(sessionResult.data.session);
  return;
}

setLoginError("Credenciales aceptadas, pero Supabase no devolvió sesión. Verifica que el usuario esté confirmado en Authentication.");
}}
        style={{
          width: 420,
          padding: 30,
          borderRadius: 12,
          background: "#111827",
          color: "white",
        }}
      >
        <h2>Programador PreICFES</h2>

        <input
          type="email"
          placeholder="Correo"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        {loginError && (
          <p style={{ color: "red" }}>
            {loginError}
          </p>
        )}

        <button
          type="submit"
          style={{
            width: "100%",
            padding: 12,
            cursor: "pointer",
          }}
        >
          Ingresar
        </button>
      </form>
    </div>
  );
}
 return <main className="app-shell dark-theme">
    <section className="hero-section"><div><p className="eyebrow">Programador académico local</p><h1>Programador {data.settings.institutionName || "PreICFES"}</h1><p className="subtitle">Versión local configurable con respaldo, grupos dinámicos, docentes, materias, reglas de disponibilidad, pagos, informes, vista mensual y vista semanal.</p></div><article className="institution-logo-card">{data.settings.logoDataUrl ? <img src={data.settings.logoDataUrl} alt="Logo de la institución" /> : <span>Logo institución</span>}</article></section>
    {message && <div className="app-message">{message}</div>}
    <nav className="top-tabs">{[{id:"calendario",label:"Calendario"},{id:"semanal",label:"Semanal"},{id:"configuracion",label:"Configuración"},{id:"disponibilidad",label:"Disponibilidad"},{id:"pagos",label:"Pagos"},{id:"dashboard",label:"Horas"},{id:"informes",label:"Informes"},{id:"respaldo",label:"Respaldo"}].map((tab)=><button key={tab.id} className={activeSection===tab.id?"active":""} onClick={()=>setActiveSection(tab.id)}>{tab.label}</button>)}</nav>

    {(activeSection === "calendario" || activeSection === "semanal") && <><section className="filters-card"><label>Filtro docente<select value={filters.teacher} onChange={(e)=>setFilters({...filters,teacher:e.target.value})}><option value="">Todos</option>{activeTeachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label><label>Filtro materia<select value={filters.subject} onChange={(e)=>setFilters({...filters,subject:e.target.value})}><option value="">Todas</option>{activeSubjects.map((s)=><option key={s.id}>{s.name}</option>)}</select></label><label>Color principal<select value={data.settings.colorBy} onChange={(e)=>updateSettings("colorBy",e.target.value)}><option value="subject">Materia</option><option value="group">Grupo</option><option value="teacher">Docente</option></select></label><button onClick={()=>setFilters({teacher:"",subject:""})}>Limpiar filtros</button></section><section className="group-tabs">{activeGroups.map((g)=><button key={g.id} className={g.name===selectedGroup?"active":""} style={{borderColor:g.color}} onClick={()=>setSelectedGroup(g.name)}>{g.name}<span>{g.type==="free"?"Horas libres":g.type==="custom"?"Personalizado":"Franjas fijas"}{g.travelBlock?" · desplazamiento":""}</span></button>)}<button type="button" className="audit-tab-button" onClick={auditSchedules}>Auditar<span>Validar conflictos</span></button><button type="button" className="audit-tab-button clean-audit" onClick={cleanInvalidSchedules}>Limpiar inválidos<span>{invalidSchedules.length} detectado(s)</span></button></section></>}

    {activeSection === "calendario" && <div className="calendar-layout single"><div className="calendar-action-bar"><div><strong>{selectedGroup}</strong><span> · {monthLabel(currentDate)}</span></div><button type="button" className="danger-button compact" onClick={clearCurrentMonthForSelectedGroup}>Limpiar mes de este grupo</button></div><Calendar title={selectedGroup} currentDate={currentDate} setCurrentDate={setCurrentDate} onSelectDay={(date)=>openDay(date,selectedGroup)} schedulesByDate={schedulesByDateAndGroup[selectedGroup] || {}} timeSlots={currentSlots} holidays={colombiaHolidays2026} onMoveSchedule={moveSchedule} subgroups={group.subgroups || []} colorForSchedule={colorForSchedule}/></div>}
    {activeSection === "semanal" && renderWeeklyView()}

    {selectedDay && activeSection === "calendario" && <div className="modal-backdrop"><section className="day-panel"><div className="panel-header split"><div><p className="eyebrow">{selectedGroup}</p><h2>{formatLongDate(selectedDay)}</h2>{colombiaHolidays2026[selectedDateKey] && <p className="holiday-alert">Festivo: {colombiaHolidays2026[selectedDateKey]}. Puedes programar si lo necesitas.</p>}</div><button className="close-button" onClick={()=>setSelectedDay(null)}>×</button></div>{message && <div className="app-message">{message}</div>}<form className="schedule-form" onSubmit={submitSchedule}>{group.subgroups?.length>0&&<label>Salón / grupo interno<select value={form.subgroup || group.subgroups[0]} onChange={(e)=>setForm({...form,subgroup:e.target.value})}>{group.subgroups.map((s)=><option key={s}>{s}</option>)}</select></label>}<label>Materia o actividad<select value={form.subject} onChange={(e)=>setForm({...form,subject:e.target.value})}>{activeSubjects.map((s)=><option key={s.id}>{s.name}</option>)}</select></label><label>Docente<select value={form.teacher} onChange={(e)=>setForm({...form,teacher:e.target.value})}>{activeTeachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label>{isSimulationSubject(form.subject)?<div className="full-day-notice"><strong>Simulacro de día completo</strong><span>Este registro no modifica el horario normal del grupo. Solo ocupa este día, bloquea al docente y se liquida con valor de simulacro.</span></div>:(group.type==="free"?<div className="time-range-grid"><label>Hora inicio<select value={form.startTime} onChange={(e)=>setForm({...form,startTime:e.target.value})}>{hourlyStartOptions.map((h)=><option key={h}>{h}</option>)}</select></label><label>Hora fin<select value={form.endTime} onChange={(e)=>setForm({...form,endTime:e.target.value})}>{hourlyEndOptions.map((h)=><option key={h}>{h}</option>)}</select></label></div>:<label>Horario<select value={form.timeSlot} onChange={(e)=>{const [startTime,endTime]=e.target.value.split("-");setForm({...form,timeSlot:e.target.value,startTime,endTime});}}>{slotsForGroup(group).map((s)=><option key={`${s.startTime}-${s.endTime}`} value={`${s.startTime}-${s.endTime}`}>{s.label}</option>)}</select></label>)}<label>Notas<textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Observaciones opcionales" /></label><button className="primary-button">Guardar clase</button></form><div className="schedule-list"><h3>Clases del día</h3>{selectedSchedules.map((s)=><article className="schedule-item" key={s.id}><div><strong>{s.subject}</strong><p>{s.teacher} · {isSimulationSubject(s.subject) ? "Día completo" : `${s.startTime}-${s.endTime} · ${s.hours} h`}</p><small>{s.classroom || "Sin subgrupo"} {s.notes?`· ${s.notes}`:""}</small></div><button onClick={()=>deleteSchedule(s.id)}>Eliminar</button></article>)}{selectedSchedules.length===0&&<p className="muted">Sin clases programadas.</p>}</div></section></div>}

    {activeSection === "configuracion" && <section className="management-card"><div className="section-title"><p className="eyebrow">Configuración dinámica</p><h2>Grupos, docentes y materias configurables</h2><p className="muted">Puedes crear, editar o desactivar elementos sin tocar el código. Desactivar no borra programación histórica.</p></div><div className="institution-settings"><label>Nombre de la institución<input value={data.settings.institutionName || ""} onChange={(e)=>updateSettings("institutionName", e.target.value)} placeholder="Ej: PreICFES Sarasty" /></label><label>Logo de la institución<input type="file" accept="image/*" onChange={(e)=>loadLogoFile(e.target.files?.[0])}/></label>{data.settings.logoDataUrl && <button type="button" className="ghost-button" onClick={()=>updateSettings("logoDataUrl", "")}>Quitar logo</button>}</div><div className="config-grid"><article><h3>Crear grupo</h3><form onSubmit={saveGroup} className="schedule-form"><input placeholder="Nombre del grupo" value={entityDraft.groupName} onChange={(e)=>setEntityDraft({...entityDraft,groupName:e.target.value})}/><select value={entityDraft.groupType} onChange={(e)=>setEntityDraft({...entityDraft,groupType:e.target.value})}><option value="fixed">Franjas fijas</option><option value="free">Horas libres</option><option value="custom">Horarios personalizados</option></select>{entityDraft.groupType==="custom"&&<textarea placeholder={"Horarios personalizados, uno por línea. Ej:\n14:30-17:30\n08:00-11:00"} value={entityDraft.groupCustomSlots} onChange={(e)=>setEntityDraft({...entityDraft,groupCustomSlots:e.target.value})}/>}<label className="inline-check"><input type="checkbox" checked={entityDraft.groupTravel} onChange={(e)=>setEntityDraft({...entityDraft,groupTravel:e.target.checked})}/> Bloqueo diario por desplazamiento</label><input placeholder="Subgrupos separados por coma. Ej: Grupo 1, Grupo 2" value={entityDraft.groupSubgroups} onChange={(e)=>setEntityDraft({...entityDraft,groupSubgroups:e.target.value})}/><button className="primary-button">Crear grupo</button></form></article><article><h3>Crear docente</h3><form onSubmit={saveTeacher} className="schedule-form"><input placeholder="Nombre del docente" value={entityDraft.teacherName} onChange={(e)=>setEntityDraft({...entityDraft,teacherName:e.target.value})}/><button className="primary-button">Crear docente</button></form></article><article><h3>Crear materia/actividad</h3><form onSubmit={saveSubject} className="schedule-form"><input placeholder="Nombre" value={entityDraft.subjectName} onChange={(e)=>setEntityDraft({...entityDraft,subjectName:e.target.value})}/><button className="primary-button">Crear materia</button></form></article></div><div className="entity-lists"><article><h3>Grupos</h3>{groups.map((g)=><div className="entity-row group-entity-row" key={g.id}><input value={g.name} onChange={(e)=>updateEntity("groups",g.id,{name:e.target.value})}/><select value={g.type} onChange={(e)=>updateEntity("groups",g.id,{type:e.target.value})}><option value="fixed">Fijo</option><option value="free">Libre</option><option value="custom">Personalizado</option></select><label><input type="checkbox" checked={g.travelBlock} onChange={(e)=>updateEntity("groups",g.id,{travelBlock:e.target.checked})}/> Viaje</label><label><input type="checkbox" checked={g.active!==false} onChange={(e)=>updateEntity("groups",g.id,{active:e.target.checked})}/> Activo</label>{g.type==="custom"&&<textarea className="custom-slots-textarea" value={g.customSlotsText ?? customSlotsToText(g.customSlots)} onChange={(e)=>updateEntity("groups",g.id,{customSlotsText:e.target.value})} onBlur={(e)=>{ const parsed=parseCustomSlots(e.target.value); if(parsed.length){ updateEntity("groups",g.id,{customSlots:parsed, customSlotsText:e.target.value}); } else { show("Horario personalizado inválido. Usa formato 14:30-17:30, uno por línea."); } }} placeholder={"Ej:\n14:30-17:30"}/>}</div>)}</article><article><h3>Docentes</h3>{teachers.map((t)=><div className="entity-row" key={t.id}><input value={t.name} onChange={(e)=>updateEntity("teachers",t.id,{name:e.target.value})}/><label><input type="checkbox" checked={t.active!==false} onChange={(e)=>updateEntity("teachers",t.id,{active:e.target.checked})}/> Activo</label></div>)}</article><article><h3>Materias</h3>{subjects.map((s)=><div className="entity-row subject-row" key={s.id}><input value={s.name} onChange={(e)=>updateEntity("subjects",s.id,{name:e.target.value})}/><label className="color-picker-label">Color<input type="color" value={s.color || defaultSubjectColor(s.name)} onChange={(e)=>updateEntity("subjects",s.id,{color:e.target.value})}/></label><span className="subject-color-preview" style={{"--item-color": s.color || defaultSubjectColor(s.name)}}>{s.name}</span><label><input type="checkbox" checked={s.active!==false} onChange={(e)=>updateEntity("subjects",s.id,{active:e.target.checked})}/> Activa</label></div>)}</article></div><article className="auto-program-card">
  <div className="section-title">
    <p className="eyebrow">Programación automática</p>
    <h2>Asignación automática por grupo y mes</h2>
    <p className="muted">Asigna docentes, selecciona materias y grupos, define horas objetivo por materia y prioridades de franja para intensivos. La app programará de lunes a viernes, sin festivos, respetando restricciones y clases ya existentes.</p>
  </div>

  <div className="auto-flow">
    <article className="auto-panel">
      <div className="auto-panel-head"><span>1</span><div><h3>Docente por materia</h3><p>Define quién dicta cada materia.</p></div></div>
      <div className="auto-teacher-list">
        {activeSubjects.filter((s)=>!isSimulationSubject(s.name)).map((s)=><label key={s.id}>{s.name}<select value={autoDraft.teacherMap?.[s.name] || ""} onChange={(e)=>setAutoTeacher(s.name,e.target.value)}><option value="">Seleccionar docente</option>{activeTeachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label>)}
      </div>
    </article>

    <article className="auto-panel">
      <div className="auto-panel-head"><span>2</span><div><h3>Materias a programar</h3><p>Selecciona solo las materias que entran en el mes.</p></div></div>
      <div className="auto-check-list auto-check-grid">
        {activeSubjects.filter((s)=>!isSimulationSubject(s.name)).map((s)=><label className="inline-check" key={s.id}><input type="checkbox" checked={autoDraft.subjects.includes(s.name)} onChange={()=>toggleAutoSelection("subjects",s.name)}/> {s.name}</label>)}
      </div>
    </article>

    <article className="auto-panel">
      <div className="auto-panel-head"><span>3</span><div><h3>Grupos y mes</h3><p>La programación automática se calcula por periodo.</p></div></div>
      <div className="auto-check-list auto-check-grid">
        {activeGroups.map((g)=><label className="inline-check" key={g.id}><input type="checkbox" checked={autoDraft.groups.includes(g.name)} onChange={()=>toggleAutoSelection("groups",g.name)}/> {g.name}</label>)}
      </div>
      <label>Mes<input type="month" value={autoDraft.month} onChange={(e)=>setAutoDraft({...autoDraft,month:e.target.value})}/></label>
      <div className="auto-summary compact-summary">
        <p><strong>{autoTotalHours}</strong><span> horas disponibles de lunes a viernes, sin festivos</span></p>
        <p><strong>{autoHoursPerSubject}</strong><span> horas estimadas por materia si se reparte igual</span></p>
        <p className={autoRemainingHours < 0 ? "danger-text" : "muted"}><strong>{autoRemainingHours}</strong><span> horas disponibles restantes según asignación manual</span></p>
      </div>
    </article>
  </div>

  <article className="auto-panel auto-target-panel">
    <div className="auto-panel-head"><span>4</span><div><h3>Horas objetivo y prioridad por materia</h3><p>Define cuántas horas quieres programar por materia. En cursos intensivos, la prioridad indica la franja preferente: 1 = 8 a 10, 2 = 10 a 12, 3 = 2 a 4, 4 = 4 a 6.</p></div></div>
    <div className="auto-target-table-wrap">
      <table className="auto-target-table">
        <thead><tr><th>Materia</th><th>Horas a asignar</th><th>Prioridad intensivo</th><th>Docente</th></tr></thead>
        <tbody>
          {autoDraft.subjects.length ? autoDraft.subjects.map((subject)=><tr key={subject}><td><strong>{subject}</strong></td><td><input type="number" min="0" step="1" value={autoDraft.targetHours?.[subject] ?? ""} placeholder={String(autoHoursPerSubject)} onChange={(e)=>setAutoTargetHours(subject,e.target.value)}/></td><td><select value={autoDraft.priorityMap?.[subject] || ""} onChange={(e)=>setAutoPriority(subject,e.target.value)}><option value="">Sin prioridad</option>{[1,2,3,4].map((pos)=><option key={pos} value={pos}>{autoPriorityLabel(pos)}</option>)}</select></td><td>{autoDraft.teacherMap?.[subject] || <span className="muted">Sin docente</span>}</td></tr>) : <tr><td colSpan="4">Selecciona materias para configurar horas y prioridad.</td></tr>}
        </tbody>
      </table>
    </div>
    {autoManualTargetTotal > 0 && <p className={autoRemainingHours < 0 ? "danger-text auto-balance" : "muted auto-balance"}>Has asignado manualmente {autoManualTargetTotal} horas. {autoRemainingHours >= 0 ? `Quedan ${autoRemainingHours} horas sin asignar.` : `Te excediste en ${Math.abs(autoRemainingHours)} horas frente a la disponibilidad calculada.`}</p>}
  </article>

  <div className="auto-actions-row">
    <button type="button" className="primary-button" onClick={runAutoSchedule}>Ejecutar programación automática</button>
    <p className="muted">La app dejará libre cualquier espacio con conflicto y lo reportará para revisión manual.</p>
  </div>

  {autoResult&&<div className="auto-result"><h3>Resultado de programación automática</h3><p>Clases creadas: <strong>{autoResult.programmed}</strong></p>{Object.entries(autoResult.hoursBySubject||{}).length>0&&<p className="muted">Horas programadas: {Object.entries(autoResult.hoursBySubject).map(([k,v])=>`${k}: ${v} h`).join(" · ")}</p>}{autoResult.logs?.length>0&&<details open><summary>Espacios excluidos ({autoResult.logs.length})</summary><ul>{autoResult.logs.map((log,index)=><li key={index}>{log}</li>)}</ul></details>}</div>}
</article></section>}

    {activeSection === "disponibilidad" && <section className="management-card"><div className="section-title"><p className="eyebrow">Disponibilidad docente</p><h2>Restricciones por día y hora</h2><p className="muted">Registra los horarios en los que cada docente NO puede dictar clase. Ejemplo: miércoles 4 a 6 o lunes en la mañana.</p></div><form className="restriction-form extended" onSubmit={addRestriction}><label>Docente<select value={restrictionDraft.teacher} onChange={(e)=>setRestrictionDraft({...restrictionDraft,teacher:e.target.value})}>{activeTeachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label><label>Día<select value={restrictionDraft.day} onChange={(e)=>setRestrictionDraft({...restrictionDraft,day:e.target.value})}>{weekDayOptions.map((d)=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label><label>Inicio<select value={restrictionDraft.startTime} onChange={(e)=>setRestrictionDraft({...restrictionDraft,startTime:e.target.value})}>{hourlyStartOptions.map((h)=><option key={h}>{h}</option>)}</select></label><label>Fin<select value={restrictionDraft.endTime} onChange={(e)=>setRestrictionDraft({...restrictionDraft,endTime:e.target.value})}>{hourlyEndOptions.map((h)=><option key={h}>{h}</option>)}</select></label><button className="primary-button">Agregar</button></form><div className="restriction-list">{teachers.map((t)=><article className="restriction-item" key={t.id}><div><h3>{t.name}</h3><div className="chips">{(t.restrictions||[]).length?(t.restrictions||[]).map((r)=><button key={r.id} onClick={()=>removeRestriction(t.id,r.id)}>{dayLabel(r.day)} {r.startTime}-{r.endTime} ×</button>):<span className="muted">Sin restricciones</span>}</div></div></article>)}</div></section>}

    {activeSection === "pagos" && <section className="management-card"><div className="section-title"><p className="eyebrow">Pagos</p><h2>Liquidación mensual</h2><p className="muted">Selecciona el mes directamente desde esta pestaña. Las horas extras no aparecen en el calendario.</p></div><div className="section-toolbar"><label>Mes de análisis<input type="month" value={monthInputValue(paymentsDate)} onChange={(e)=>setPaymentsDate(monthFromInput(e.target.value))}/></label></div><div className="rates-grid">{teachers.map((t)=><label className="rate-card" key={t.id}>{t.name}<input type="number" value={t.hourlyRate||""} onChange={(e)=>updateTeacherRate(t.id,"hourlyRate",e.target.value)} placeholder="Valor hora"/><span>{money(t.hourlyRate)} / hora</span><input type="number" value={t.simulationRate||""} onChange={(e)=>updateTeacherRate(t.id,"simulationRate",e.target.value)} placeholder="Valor simulacro"/><span>{money(t.simulationRate)} / simulacro</span></label>)}</div><article className="extra-card"><h3>Agregar horas extras</h3><form className="restriction-form extended" onSubmit={addExtraHour}><label>Docente<select value={extraDraft.teacher} onChange={(e)=>setExtraDraft({...extraDraft,teacher:e.target.value})}>{activeTeachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label><label>Fecha<input type="date" value={extraDraft.date} onChange={(e)=>setExtraDraft({...extraDraft,date:e.target.value})}/></label><label>Cantidad de horas<input type="number" min="0" step="0.5" value={extraDraft.hours} onChange={(e)=>setExtraDraft({...extraDraft,hours:e.target.value})}/></label><label>Valor hora extra<input type="number" min="0" value={extraDraft.rate} onChange={(e)=>setExtraDraft({...extraDraft,rate:e.target.value})}/></label><label>Concepto<input value={extraDraft.concept} onChange={(e)=>setExtraDraft({...extraDraft,concept:e.target.value})} placeholder="Ej: Apoyo, reunión, nivelación"/></label><button className="primary-button">Agregar extra</button></form></article><div className="stats-grid"><article className="stat-box"><strong>{money(paymentsCounters.totalPay)}</strong><span>Total estimado del mes</span></article><article className="stat-box"><strong>{paymentsCounters.totalHours} h</strong><span>Horas ordinarias</span></article><article className="stat-box"><strong>{paymentsCounters.totalExtraHours} h</strong><span>Horas extras</span></article><article className="stat-box"><strong>{money(paymentsCounters.totalExtraPay)}</strong><span>Valor horas extras</span></article></div><div className="summary-tables matrix-summary">{renderMatrixTable("Pagos por docente y grupo", "Docente", matrixPaymentsByTeacher(paymentsDate), (v)=>money(v), true, "pagos-docente-grupo")}<article><h3>Horas extras registradas</h3><table><thead><tr><th>Fecha</th><th>Docente</th><th>Concepto</th><th>Horas</th><th>Valor</th><th></th></tr></thead><tbody>{paymentsExtraHours.length?paymentsExtraHours.map((x)=><tr key={x.id}><td>{x.date}</td><td>{x.teacher}</td><td>{x.concept||"Horas extras"}</td><td>{x.hours}</td><td>{money(Number(x.hours||0)*Number(x.rate||0))}</td><td><button className="mini-delete" onClick={()=>deleteExtraHour(x.id)}>Eliminar</button></td></tr>):<tr><td colSpan="6">Sin horas extras en el mes seleccionado.</td></tr>}</tbody></table></article></div></section>}

    {activeSection === "dashboard" && <section className="management-card"><div className="section-title"><p className="eyebrow">Horas</p><h2>Distribución mensual de horas</h2><p className="muted">Controla la distribución de horas por materia y por docente en cada grupo para equilibrar la programación.</p></div><div className="section-toolbar"><label>Mes de análisis<input type="month" value={monthInputValue(dashboardDate)} onChange={(e)=>setDashboardDate(monthFromInput(e.target.value))}/></label></div><div className="stats-grid"><article className="stat-box"><strong>{dashboardSchedules.length}</strong><span>clases y actividades</span></article><article className="stat-box"><strong>{dashboardSchedules.filter((s)=>isSimulationSubject(s.subject)).length}</strong><span>simulacros</span></article><article className="stat-box"><strong>{dashboardCounters.totalHours} h</strong><span>horas ordinarias</span></article><article className="stat-box"><strong>{money(dashboardCounters.totalPay)}</strong><span>costo estimado</span></article></div><div className="summary-tables matrix-summary">{renderMatrixTable("Horas por materia y grupo", "Materia", matrixHoursBySubject(dashboardDate), (v)=>`${v || 0} h`, false, "horas-materia-grupo")}{renderMatrixTable("Horas por docente y grupo", "Docente", matrixHoursByTeacher(dashboardDate), (v)=>`${v || 0} h`, false, "horas-docente-grupo")}</div></section>}

    {activeSection === "informes" && <section className="management-card"><div className="section-title"><p className="eyebrow">Informes</p><h2>Calendarios, horas y pagos</h2><p className="muted">Selecciona mes y filtros. Los informes no dependen del mes visible en el calendario principal.</p></div><div className="report-filters"><label>Mes<input type="month" value={monthInputValue(reportDate)} onChange={(e)=>setReportDate(monthFromInput(e.target.value))}/></label><label>Grupo<select value={reportFilters.group} onChange={(e)=>setReportFilters({...reportFilters,group:e.target.value})}><option value="">Todos</option>{groups.map((g)=><option key={g.id}>{g.name}</option>)}</select></label><label>Docente<select value={reportFilters.teacher} onChange={(e)=>setReportFilters({...reportFilters,teacher:e.target.value})}><option value="">Todos</option>{teachers.map((t)=><option key={t.id}>{t.name}</option>)}</select></label><label>Materia<select value={reportFilters.subject} onChange={(e)=>setReportFilters({...reportFilters,subject:e.target.value})}><option value="">Todas</option>{subjects.map((s)=><option key={s.id}>{s.name}</option>)}</select></label><button className="ghost-button" onClick={()=>setReportFilters({group:"",teacher:"",subject:""})}>Quitar filtros</button></div><div className="report-grid"><article className="report-card"><h3>1. Calendario visual en PDF</h3><p className="muted">Genera el calendario mensual con la programación de todos los cursos en el mismo calendario. Respeta los filtros aplicados.</p><button className="primary-button" onClick={printableCalendarReport}>Generar calendario PDF</button></article><article className="report-card"><h3>2. Informe detallado de horas</h3><p className="muted">Tabla por grupo, docente, materia y horas del periodo seleccionado.</p><div className="button-row"><button className="primary-button" onClick={printHoursReport}>PDF</button><button className="ghost-button" onClick={generateHoursCSV}>Excel/CSV</button></div></article><article className="report-card"><h3>3. Informe detallado de pagos</h3><p className="muted">Detalle por docente, materia, grupo, simulacros y horas extras cuando correspondan.</p><div className="button-row"><button className="primary-button" onClick={printPaymentsReport}>PDF</button><button className="ghost-button" onClick={generatePaymentsCSV}>Excel/CSV</button></div></article><article className="report-card"><h3>Resultado filtrado</h3><p><strong>{reportSchedules.length}</strong> clases/actividades</p><p><strong>{reportCounters.totalHours}</strong> horas ordinarias</p><p><strong>{money(reportCounters.totalPay)}</strong> total pagos</p><p className="muted">{reportFilterLabel()}</p></article><article className="report-card"><h3>Duplicar semana</h3><p className="muted">Duplica la semana visible en la vista semanal a la semana siguiente.</p><button className="primary-button" onClick={duplicateWeek}>Duplicar semana</button></article><article className="report-card"><h3>Duplicar mes</h3><p className="muted">Duplica todo el mes visible del calendario principal al mes siguiente.</p><button className="primary-button" onClick={duplicateMonth}>Duplicar mes</button></article></div></section>}

    {activeSection === "respaldo" && <section className="management-card"><div className="section-title"><p className="eyebrow">Respaldo local</p><h2>Exportar e importar copia de seguridad</h2><p className="muted">Antes de instalar nuevas versiones, exporta un respaldo JSON. Luego puedes restaurarlo en este u otro computador.</p></div><div className="report-grid"><article className="report-card"><h3>Exportar respaldo</h3><p>Incluye clases, grupos, docentes, materias, restricciones, pagos, horas extras y configuración.</p><button className="primary-button" onClick={exportBackup}>Descargar respaldo JSON</button></article><article className="report-card"><h3>Importar respaldo</h3><input type="file" accept="application/json,.json" onChange={(e)=>importBackup(e.target.files?.[0])}/><p className="muted">Esto reemplaza los datos actuales por los del respaldo importado.</p></article><article className="report-card"><h3>Diagnóstico</h3><p>Clases válidas: <strong>{validSchedules.length}</strong></p><p>Registros inválidos detectados: <strong>{invalidSchedules.length}</strong></p><p>Grupos: <strong>{groups.length}</strong></p><p>Docentes: <strong>{teachers.length}</strong></p><p>Materias: <strong>{subjects.length}</strong></p><p>Horas extras: <strong>{(data.extraHours||[]).length}</strong></p></article></div></section>}
    <footer className="app-footer">Desarrollado por <strong>SOFTWARE INTELLIGENCE QUALITY</strong> - Ing. Juan Camilo Pérez</footer>
  </main>;
}

function buildCounters(schedules, groups, teachers, subjects, extraHours = []) {
  const result = { byTeacher: {}, bySubject: {}, byGroup: {}, payByTeacher: {}, simPayByTeacher: {}, extraPayByTeacher: {}, totalPayByTeacher: {}, payByGroup: {}, simulationsByTeacher: {}, extraHoursByTeacher: {}, totalHours: 0, totalExtraHours: 0, totalExtraPay: 0, totalPay: 0 };
  teachers.forEach((t) => { result.byTeacher[t.name] = 0; result.payByTeacher[t.name] = 0; result.simPayByTeacher[t.name] = 0; result.extraPayByTeacher[t.name] = 0; result.extraHoursByTeacher[t.name] = 0; result.totalPayByTeacher[t.name] = 0; result.simulationsByTeacher[t.name] = 0; });
  subjects.forEach((s) => { result.bySubject[s.name] = 0; });
  groups.forEach((g) => { result.byGroup[g.name] = { classes: 0, hours: 0, simulations: 0 }; result.payByGroup[g.name] = 0; });
  schedules.forEach((s) => {
    const group = result.byGroup[s.group] || (result.byGroup[s.group] = { classes: 0, hours: 0, simulations: 0 });
    group.classes += 1;
    if (isSimulationSubject(s.subject)) {
      const pay = Number(s.simulationRate || teacherByName(teachers, s.teacher)?.simulationRate || 0);
      group.simulations += 1; result.simulationsByTeacher[s.teacher] = (result.simulationsByTeacher[s.teacher] || 0) + 1; result.simPayByTeacher[s.teacher] = (result.simPayByTeacher[s.teacher] || 0) + pay; result.payByGroup[s.group] = (result.payByGroup[s.group] || 0) + pay; result.totalPay += pay; result.bySubject[s.subject] = (result.bySubject[s.subject] || 0) + 1; return;
    }
    const h = Number(s.hours || hoursBetween(s.startTime, s.endTime)); const rate = Number(s.hourlyRate || teacherByName(teachers, s.teacher)?.hourlyRate || 0); const pay = h * rate;
    result.byTeacher[s.teacher] = (result.byTeacher[s.teacher] || 0) + h; result.bySubject[s.subject] = (result.bySubject[s.subject] || 0) + h; group.hours += h; result.payByTeacher[s.teacher] = (result.payByTeacher[s.teacher] || 0) + pay; result.payByGroup[s.group] = (result.payByGroup[s.group] || 0) + pay; result.totalHours += h; result.totalPay += pay;
  });
  extraHours.forEach((x) => {
    const h = Number(x.hours || 0); const pay = h * Number(x.rate || 0);
    result.extraHoursByTeacher[x.teacher] = (result.extraHoursByTeacher[x.teacher] || 0) + h;
    result.extraPayByTeacher[x.teacher] = (result.extraPayByTeacher[x.teacher] || 0) + pay;
    result.totalExtraHours += h; result.totalExtraPay += pay; result.totalPay += pay;
  });
  teachers.forEach((t) => { result.totalPayByTeacher[t.name] = (result.payByTeacher[t.name] || 0) + (result.simPayByTeacher[t.name] || 0) + (result.extraPayByTeacher[t.name] || 0); });
  return result;
}
