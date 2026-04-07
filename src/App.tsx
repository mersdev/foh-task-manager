import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CheckCircle2, 
  ClipboardList, 
  Users, 
  History, 
  Settings as SettingsIcon,
  Lock,
  ChevronRight,
  Plus,
  Trash2,
  UserCircle,
  Thermometer,
  RefreshCcw,
  Download,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useMotionValue, useTransform } from 'motion/react';
import * as XLSX from 'xlsx';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Staff, Log, TemperatureLog, Category, TimeSlot, TabType } from './types';
import { apiFetch } from './service/apiClient';

const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID ?? '';
const SHIFT_OPEN_HOUR = 7;
const SHIFT_OPEN_MINUTE = 30;

const SortableTaskItem: React.FC<{ 
  task: Task; 
  onEdit: (task: Task) => void; 
  onDelete: (id: string | number) => void;
}> = ({ 
  task, 
  onEdit, 
  onDelete 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-stone-600">
          <GripVertical className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-stone-800">{task.name}</p>
          <p className="text-xs text-stone-500">{task.category} • {task.timeSlot}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onEdit(task)}
          className="p-2 text-stone-400 hover:text-emerald-500 transition-colors"
        >
          <ClipboardList className="w-5 h-5" />
        </button>
        <button 
          onClick={() => onDelete(task.id)}
          className="p-2 text-stone-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

const SortableStaffItem: React.FC<{
  staff: Staff;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ staff, isAdmin, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: staff.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm"
    >
      <div className="flex items-center gap-3">
        {isAdmin && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-stone-600">
            <GripVertical className="w-5 h-5" />
          </div>
        )}
        <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-xs font-bold text-stone-500">
          {staff.name.charAt(0)}
        </div>
        <p className="font-bold text-stone-800">{staff.name}</p>
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <button 
            onClick={onEdit}
            className="p-2 text-stone-400 hover:text-emerald-500 transition-colors"
          >
            <Users className="w-5 h-5" />
          </button>
          <button 
            onClick={onDelete}
            className="p-2 text-stone-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('checklist');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState("5897");
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tempLogs, setTempLogs] = useState<TemperatureLog[]>([]);
  const [isShiftEnded, setIsShiftEnded] = useState(false);
  const [shiftClosedBy, setShiftClosedBy] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState("Asia/Kuala_Lumpur");
  
  const getBusinessDateInTimezone = (tz: string) => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

    const year = Number(getPart('year'));
    const month = Number(getPart('month'));
    const day = Number(getPart('day'));
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));

    const businessDate = new Date(Date.UTC(year, month - 1, day));
    if (hour < SHIFT_OPEN_HOUR || (hour === SHIFT_OPEN_HOUR && minute < SHIFT_OPEN_MINUTE)) {
      businessDate.setUTCDate(businessDate.getUTCDate() - 1);
    }

    const businessYear = businessDate.getUTCFullYear();
    const businessMonth = String(businessDate.getUTCMonth() + 1).padStart(2, '0');
    const businessDay = String(businessDate.getUTCDate()).padStart(2, '0');
    return `${businessYear}-${businessMonth}-${businessDay}`;
  };

  const getRecentDateOptions = (startDate: string, days: number) => {
    const options: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    for (let i = 0; i < days; i += 1) {
      const year = cursor.getUTCFullYear();
      const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const day = String(cursor.getUTCDate()).padStart(2, '0');
      options.push(`${year}-${month}-${day}`);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return options;
  };

  const [selectedDate, setSelectedDate] = useState(getBusinessDateInTimezone("Asia/Kuala_Lumpur"));
  const [checklistDate, setChecklistDate] = useState(getBusinessDateInTimezone("Asia/Kuala_Lumpur"));
  const [exportRange, setExportRange] = useState({
    start: getBusinessDateInTimezone("Asia/Kuala_Lumpur"),
    end: getBusinessDateInTimezone("Asia/Kuala_Lumpur")
  });
  const todayBusinessDate = getBusinessDateInTimezone(selectedTimezone);
  const checklistDateOptions = useMemo(
    () => getRecentDateOptions(todayBusinessDate, 14),
    [todayBusinessDate]
  );
  const isChecklistHistoricalView = checklistDate !== todayBusinessDate;
  const allTimezones = useMemo(() => {
    const tzSource = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const values = typeof tzSource === 'function' ? tzSource('timeZone') : [];
    return Array.from(new Set(['UTC', selectedTimezone, ...values]));
  }, [selectedTimezone]);
  const [checklist, setChecklist] = useState<(Task & { completed: number })[]>([]);
  const [logVariant, setLogVariant] = useState<'checklist' | 'temperatures'>('checklist');
  const lastObservedBusinessDateRef = useRef(todayBusinessDate);
  const settingsRequestIdRef = useRef(0);
  const taskPlaceholderPattern = /^Task\s*#\d+$/i;
  const staffPlaceholderPattern = /^Staff\s*#\d+$/i;
  const taskNameById = useMemo(
    () => new Map(tasks.map((task) => [String(task.id), task.name])),
    [tasks]
  );
  const staffNameById = useMemo(
    () => new Map(staffList.map((staff) => [String(staff.id), staff.name])),
    [staffList]
  );

  const getDisplayTaskName = (taskName?: string, taskId?: string | number) => {
    const normalized = String(taskName ?? '').trim();
    const fallback = taskId !== undefined ? taskNameById.get(String(taskId)) : undefined;
    if (!normalized || taskPlaceholderPattern.test(normalized)) {
      return fallback || 'Unknown Task';
    }
    return normalized;
  };

  const getDisplayStaffName = (staffName?: string, staffId?: string | number) => {
    const normalized = String(staffName ?? '').trim();
    const fallback = staffId !== undefined ? staffNameById.get(String(staffId)) : undefined;
    if (!normalized || staffPlaceholderPattern.test(normalized)) {
      return fallback || 'Unknown Staff';
    }
    return normalized;
  };

  // UI States
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });
  
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTasks((items: Task[]) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newTasks = arrayMove(items, oldIndex, newIndex);
        
        // Save to backend
        saveReorder(newTasks.map(t => t.id));
        
        return newTasks;
      });
    }
  };

  const saveReorder = async (taskIds: (string | number)[]) => {
    try {
      const res = await apiFetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds })
      });
      if (res.ok) {
        fetchChecklist();
      }
    } catch (error) {
      console.error("Failed to save reorder", error);
    }
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullDistance = useMotionValue(0);
  const pullOpacity = useTransform(pullDistance, [0, 100], [0, 1]);
  const pullRotation = useTransform(pullDistance, [0, 100], [0, 360]);

  // Selection states
  const [selectingStaffForTask, setSelectingStaffForTask] = useState<string | number | null>(null);
  const [selectingStaffForShiftClose, setSelectingStaffForShiftClose] = useState(false);
  const [isShiftActionPending, setIsShiftActionPending] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const refreshAll = async (dateForLogs = selectedDate, dateForChecklist = checklistDate) => {
    setIsRefreshing(true);
    await Promise.all([
      fetchStaff(),
      fetchCategories(),
      fetchTimeSlots(),
      fetchTasks(),
      fetchChecklist(dateForChecklist),
      fetchAdminPin(),
      fetchSettings(),
      fetchShiftStatus(),
      fetchLogs(dateForLogs),
      fetchTempLogs(dateForLogs)
    ]);
    setIsRefreshing(false);
    pullDistance.set(0);
  };

  useEffect(() => {
    fetchStaff();
    fetchCategories();
    fetchTimeSlots();
    fetchTasks();
    fetchChecklist();
    fetchAdminPin();
    fetchSettings();
    fetchShiftStatus();
  }, []);

  useEffect(() => {
    lastObservedBusinessDateRef.current = getBusinessDateInTimezone(selectedTimezone);

    const checkBusinessDateRollover = async () => {
      const currentBusinessDate = getBusinessDateInTimezone(selectedTimezone);
      if (currentBusinessDate === lastObservedBusinessDateRef.current) {
        return;
      }

      lastObservedBusinessDateRef.current = currentBusinessDate;
      setSelectedDate(currentBusinessDate);
      setChecklistDate(currentBusinessDate);
      setExportRange({ start: currentBusinessDate, end: currentBusinessDate });
      await refreshAll(currentBusinessDate, currentBusinessDate);
    };

    const intervalId = setInterval(() => {
      checkBusinessDateRollover();
      fetchShiftStatus();
    }, 30 * 1000);

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        checkBusinessDateRollover();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [selectedTimezone, selectedDate]);

  const readJsonSafe = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const readArrayResponse = async (res: Response, label: string) => {
    const data = await readJsonSafe(res);
    if (!res.ok) {
      console.error(`[APP] ${label}:`, data);
      return [] as any[];
    }
    return Array.isArray(data) ? data : [];
  };

  const fetchSettings = async () => {
    const requestId = settingsRequestIdRef.current + 1;
    settingsRequestIdRef.current = requestId;
    const res = await apiFetch('/api/settings');
    const data = await readJsonSafe(res);
    if (requestId !== settingsRequestIdRef.current) {
      return;
    }
    if (res.ok && data?.timezone) {
      setSelectedTimezone(data.timezone);
      const businessDate = getBusinessDateInTimezone(data.timezone);
      setSelectedDate(businessDate);
      setChecklistDate(businessDate);
      setExportRange({ start: businessDate, end: businessDate });
    } else if (!res.ok) {
      console.error('[APP] fetch settings:', data);
    }
  };

  const fetchShiftStatus = async () => {
    const res = await apiFetch('/api/shift-status');
    const data = await readJsonSafe(res);
    if (res.ok) {
      setIsShiftEnded(Boolean(data?.ended));
      setShiftClosedBy(data?.closedBy ? String(data.closedBy) : null);
    } else {
      console.error('[APP] fetch shift status:', data);
    }
  };

  const fetchAdminPin = async () => {
    const res = await apiFetch('/api/admin-pin');
    const data = await readJsonSafe(res);
    if (res.ok && data?.pin) {
      setAdminPin(data.pin);
    } else if (!res.ok) {
      console.error('[APP] fetch admin pin:', data);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs(selectedDate);
      fetchTempLogs(selectedDate);
    }
    if (activeTab === 'temperatures') {
      fetchTempLogs(todayBusinessDate);
    }
  }, [activeTab, selectedDate, todayBusinessDate]);

  const fetchStaff = async () => {
    const res = await apiFetch('/api/staff');
    setStaffList(await readArrayResponse(res, 'fetch staff'));
  };

  const fetchCategories = async () => {
    const res = await apiFetch('/api/categories');
    setCategories(await readArrayResponse(res, 'fetch categories'));
  };

  const fetchTimeSlots = async () => {
    const res = await apiFetch('/api/time-slots');
    setTimeSlots(await readArrayResponse(res, 'fetch time slots'));
  };

  const fetchTasks = async () => {
    const res = await apiFetch('/api/tasks');
    setTasks(await readArrayResponse(res, 'fetch tasks'));
    fetchChecklist(checklistDate); // Ensure checklist is updated when tasks change
  };

  const fetchChecklist = async (date = checklistDate) => {
    const res = await apiFetch(`/api/checklist?date=${date}`);
    setChecklist(await readArrayResponse(res, 'fetch checklist') as (Task & { completed: number })[]);
  };

  const fetchAllStaffMap = async () => {
    const res = await apiFetch('/api/staff/all');
    const rows = await readArrayResponse(res, 'fetch all staff for logs') as Staff[];
    return new Map(rows.map((staff) => [String(staff.id), staff.name]));
  };

  const fetchLogs = async (date: string) => {
    const [logsRes, allStaffMap] = await Promise.all([
      apiFetch(`/api/logs?date=${date}`),
      fetchAllStaffMap(),
    ]);
    const rows = await readArrayResponse(logsRes, `fetch logs for ${date}`) as Log[];
    const resolved = rows.map((log) => {
      const mappedName = allStaffMap.get(String(log.staffId));
      return {
        ...log,
        staffName: mappedName || log.staffName || 'Unknown Staff',
      };
    });
    setLogs(resolved);
  };

  const fetchTempLogs = async (date: string) => {
    const [logsRes, allStaffMap] = await Promise.all([
      apiFetch(`/api/temperature-logs?date=${date}`),
      fetchAllStaffMap(),
    ]);
    const rows = await readArrayResponse(logsRes, `fetch temperature logs for ${date}`) as TemperatureLog[];
    const resolved = rows.map((log) => {
      const mappedName = allStaffMap.get(String(log.staffId));
      return {
        ...log,
        staffName: mappedName || log.staffName || 'Unknown Staff',
      };
    });
    setTempLogs(resolved);
  };

  const handleCompleteTask = async (taskId: number, staffId: number) => {
    if (isChecklistHistoricalView) {
      showToast("Viewing past date. Switch to today's checklist to edit.", "error");
      return;
    }
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const res = await apiFetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, staffId })
    });
    if (res.ok) {
      setSelectedDate(todayBusinessDate);
      setChecklistDate(todayBusinessDate);
      setSelectingStaffForTask(null);
      fetchChecklist(todayBusinessDate);
      fetchLogs(todayBusinessDate);
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to save checklist log", "error");
    }
  };

  const handleUntickTask = async (taskId: number) => {
    if (isChecklistHistoricalView) {
      showToast("Viewing past date. Switch to today's checklist to edit.", "error");
      return;
    }
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const res = await apiFetch(`/api/logs/task/${taskId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchChecklist(todayBusinessDate);
    }
  };

  const handleLogTemperature = async (type: string, location: string, temperature: number, staffId: number) => {
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const res = await apiFetch('/api/temperature-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, location, temperature, staffId })
    });
    if (res.ok) {
      setSelectedDate(todayBusinessDate);
      fetchTempLogs(todayBusinessDate);
      showToast("Temperature logged successfully");
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to log temperature", "error");
    }
  };

  const handleDeleteLog = async (id: number) => {
    const res = await apiFetch(`/api/logs/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchLogs(selectedDate);
      fetchChecklist();
      showToast("Log deleted");
    }
  };

  const handleDeleteTempLog = async (id: number) => {
    const res = await apiFetch(`/api/temperature-logs/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchTempLogs(selectedDate);
      showToast("Temperature log deleted");
    }
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setShowPinModal(true);
    }
  };

  const handleExportExcel = async () => {
    try {
      showToast("Preparing export...");
      const [logsRes, tempLogsRes] = await Promise.all([
        apiFetch(`/api/logs?startDate=${exportRange.start}&endDate=${exportRange.end}`),
        apiFetch(`/api/temperature-logs?startDate=${exportRange.start}&endDate=${exportRange.end}`)
      ]);

      const logsData = await readArrayResponse(logsRes, 'export checklist logs');
      const tempLogsData = await readArrayResponse(tempLogsRes, 'export temperature logs');

      const wb = XLSX.utils.book_new();

      // Checklist Sheet
      const checklistRows = logsData.map((l: any) => ({
        Date: l.date,
        Time: l.timestamp,
        Task: getDisplayTaskName(l.taskName, l.taskId),
        Staff: getDisplayStaffName(l.staffName, l.staffId)
      }));
      const wsChecklist = XLSX.utils.json_to_sheet(checklistRows);
      XLSX.utils.book_append_sheet(wb, wsChecklist, "Checklist Logs");

      // Temperature Sheet
      const tempRows = tempLogsData.map((l: any) => ({
        Date: l.date,
        Time: l.timestamp,
        Type: l.type,
        Location: l.location,
        Temperature: l.temperature,
        Staff: getDisplayStaffName(l.staffName, l.staffId)
      }));
      const wsTemp = XLSX.utils.json_to_sheet(tempRows);
      XLSX.utils.book_append_sheet(wb, wsTemp, "Temperature Logs");

      XLSX.writeFile(wb, `FOH_Logs_${exportRange.start}_to_${exportRange.end}.xlsx`);
      showToast("Export downloaded");
    } catch (error) {
      console.error(error);
      showToast("Export failed", "error");
    }
  };

  const handleEndShift = async (closedBy?: string) => {
    if (isShiftActionPending) {
      return;
    }
    const newStatus = !isShiftEnded;
    if (newStatus && !closedBy) {
      showToast("Please select who is closing shift.", "error");
      return;
    }
    setIsShiftActionPending(true);
    const res = await apiFetch('/api/end-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ended: newStatus, closedBy })
    });
    if (res.ok) {
      setIsShiftEnded(newStatus);
      setShiftClosedBy(newStatus ? (closedBy || 'Unknown') : null);
      showToast(newStatus ? "Shift ended. Telegram sent." : "Shift reopened");
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to update shift status", "error");
    }
    setIsShiftActionPending(false);
  };

  const updateTimezone = async (tz: string) => {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'timezone', value: tz })
    });
    if (res.ok) {
      setSelectedTimezone(tz);
      const businessDate = getBusinessDateInTimezone(tz);
      setSelectedDate(businessDate);
      setChecklistDate(businessDate);
      setExportRange({ start: businessDate, end: businessDate });
      showToast("Timezone updated");
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ show: true, title, message, onConfirm });
  };

  const verifyPin = () => {
    if (pinInput === adminPin) {
      setIsAdmin(true);
      setShowPinModal(false);
      setPinInput("");
    } else {
      showToast("Incorrect PIN", "error");
      setPinInput("");
    }
  };

  const handleChangePin = async (newPin: string) => {
    const res = await apiFetch('/api/admin-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin })
    });
    if (res.ok) {
      setAdminPin(newPin);
      showToast("PIN updated successfully");
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to update PIN", "error");
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24 flex flex-col overflow-x-hidden">
      {/* Pull to Refresh Indicator */}
      <motion.div 
        style={{ 
          height: pullDistance,
          opacity: pullOpacity,
        }}
        className="flex items-center justify-center bg-stone-100 overflow-hidden"
      >
        <motion.div style={{ rotate: pullRotation }}>
          <RefreshCcw className={`w-6 h-6 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
        </motion.div>
      </motion.div>

      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (isShiftActionPending) {
                return;
              }
              if (isShiftEnded && !isAdmin) {
                showToast("Shift has ended. Only admins can reopen.", "error");
                return;
              }
              if (isShiftEnded) {
                triggerConfirm(
                  'Reopen Shift',
                  'Are you sure you want to reopen the shift?',
                  () => handleEndShift()
                );
                return;
              }
              if (staffList.length === 0) {
                showToast("Add at least one staff member before ending shift.", "error");
                return;
              }
              setSelectingStaffForShiftClose(true);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
              isShiftEnded 
                ? 'bg-stone-800 text-white hover:bg-stone-900' 
                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/20'
            }`}
            disabled={isShiftActionPending}
          >
            {isShiftActionPending ? 'Please wait...' : (isShiftEnded ? 'Reopen Shift' : 'End Shift')}
          </button>
          <div className="h-8 w-[1px] bg-stone-200 mx-1 hidden sm:block"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center hidden sm:flex">
              <CheckCircle2 className="text-emerald-600 w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-stone-900 leading-tight">FOH Tasks</h1>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">{activeTab.replace('-', ' ')}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleAdminToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              isAdmin 
                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                : 'bg-stone-100 text-stone-600 border border-stone-200'
            }`}
          >
            {isAdmin ? <Lock className="w-3 h-3" /> : <Lock className="w-3 h-3 opacity-50" />}
            {isAdmin ? 'ADMIN ON' : 'ADMIN OFF'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main 
        className="flex-1 p-6 max-w-2xl mx-auto w-full touch-pan-y"
        onPointerMove={(e) => {
          if (window.scrollY === 0 && e.buttons === 1) {
            const movementY = e.movementY;
            if (movementY > 0 || pullDistance.get() > 0) {
              const newDist = Math.max(0, Math.min(100, pullDistance.get() + movementY * 0.5));
              pullDistance.set(newDist);
            }
          }
        }}
        onPointerUp={() => {
          if (pullDistance.get() >= 80 && !isRefreshing) {
            refreshAll();
          } else {
            pullDistance.set(0);
          }
        }}
      >
        <AnimatePresence mode="wait">
          {activeTab === 'checklist' && (
            <motion.div 
              key="checklist"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {timeSlots.map(slot => {
                const slotTasks = checklist.filter(t => t.timeSlot === slot.name);
                if (slotTasks.length === 0) return null;
                return (
                  <section key={slot.id} className="space-y-4">
                    <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">{slot.name}</h2>
                    <div className="space-y-3">
                      {slotTasks.map(task => (
                        <div 
                          key={task.id}
                          className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${
                            task.completed 
                              ? 'bg-emerald-50 border-emerald-100' 
                              : 'bg-white border-stone-200 shadow-sm'
                          }`}
                        >
                          <div>
                            <p className={`font-bold text-lg ${task.completed ? 'text-emerald-800' : 'text-stone-800'}`}>
                              {task.name}
                            </p>
                            <p className="text-xs text-stone-500 font-medium">{task.category}</p>
                          </div>
                          
                          <button
                            onClick={() => {
                              if (task.completed) {
                                handleUntickTask(task.id);
                              } else {
                                setSelectingStaffForTask(task.id);
                              }
                            }}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                              task.completed
                                ? 'bg-emerald-500 text-white'
                                : 'bg-stone-100 text-stone-300 active:scale-90'
                            }`}
                          >
                            <CheckCircle2 className="w-7 h-7" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </motion.div>
          )}

          {activeTab === 'edit-tasks' && (
            isAdmin ? (
              <motion.div 
                key="edit-tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <AddTaskForm 
                  categories={categories} 
                  timeSlots={timeSlots} 
                  onAdded={fetchTasks} 
                  editingTask={editingTask}
                  onCancelEdit={() => setEditingTask(null)}
                />
                <div className="space-y-3">
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Active Tasks (Drag to Sort)</h2>
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={tasks.map(t => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {tasks.map(task => (
                          <SortableTaskItem 
                            key={task.id} 
                            task={task} 
                            onEdit={(t) => setEditingTask(t)}
                            onDelete={(id) => triggerConfirm(
                              'Delete Task',
                              `Are you sure you want to delete this task?`,
                              async () => {
                                await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
                                fetchTasks();
                                fetchChecklist();
                              }
                            )}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              </motion.div>
            ) : <AdminLocked />
          )}

          {activeTab === 'staff' && (
            <motion.div 
              key="staff"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {isAdmin && (
                <AddStaffForm 
                  onAdded={fetchStaff} 
                  editingStaff={editingStaff}
                  onCancelEdit={() => setEditingStaff(null)}
                />
              )}
              <div className="space-y-3">
                <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">FOH Team {isAdmin && "(Drag to Sort)"}</h2>
                {isAdmin ? (
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={async (event) => {
                      const { active, over } = event;
                      if (over && active.id !== over.id) {
                        const oldIndex = staffList.findIndex((i) => i.id === active.id);
                        const newIndex = staffList.findIndex((i) => i.id === over.id);
                        const newStaff = arrayMove<Staff>(staffList, oldIndex, newIndex);
                        setStaffList(newStaff);
                        
                        await apiFetch('/api/staff/reorder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ staffIds: newStaff.map(s => s.id) })
                        });
                        fetchStaff();
                      }
                    }}
                  >
                    <SortableContext 
                      items={staffList.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {staffList.map(staff => (
                          <SortableStaffItem 
                            key={staff.id} 
                            staff={staff} 
                            isAdmin={isAdmin}
                            onEdit={() => setEditingStaff(staff)}
                            onDelete={() => triggerConfirm(
                              'Remove Staff',
                              `Are you sure you want to remove "${staff.name}"?`,
                              async () => {
                                await apiFetch(`/api/staff/${staff.id}`, { method: 'DELETE' });
                                fetchStaff();
                              }
                            )}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  staffList.map(staff => (
                    <div key={staff.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-xs font-bold text-stone-500">
                          {staff.name.charAt(0)}
                        </div>
                        <p className="font-bold text-stone-800">{staff.name}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div 
              key="logs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Select Date</label>
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                
                <div className="flex p-1 bg-stone-100 rounded-xl">
                  <button 
                    onClick={() => setLogVariant('checklist')}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      logVariant === 'checklist' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    Checklist
                  </button>
                  <button 
                    onClick={() => setLogVariant('temperatures')}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      logVariant === 'temperatures' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-400'
                    }`}
                  >
                    Temperatures
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-4">
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Export Data (Excel)</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Start Date</label>
                      <input 
                        type="date" 
                        value={exportRange.start}
                        onChange={(e) => setExportRange(prev => ({ ...prev, start: e.target.value }))}
                        className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">End Date</label>
                      <input 
                        type="date" 
                        value={exportRange.end}
                        onChange={(e) => setExportRange(prev => ({ ...prev, end: e.target.value }))}
                        className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleExportExcel}
                    className="w-full bg-stone-800 text-white font-bold p-3 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-stone-900 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Excel Report
                  </button>
                </div>
              )}
              
              <div className="space-y-3">
                <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">
                  {logVariant === 'checklist' ? 'Completed Tasks' : 'Temperature Records'}
                </h2>
                
                {logVariant === 'checklist' ? (
                  logs.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-stone-200">
                      <History className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                      <p className="text-stone-400 font-medium">No checklist logs for this date</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-stone-800">{getDisplayTaskName(log.taskName, log.taskId)}</p>
                          <p className="text-xs text-stone-500">Completed by <span className="font-bold text-emerald-600">{getDisplayStaffName(log.staffName, log.staffId)}</span></p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-black text-stone-400">{log.timestamp}</p>
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => triggerConfirm(
                                'Delete Log',
                                'Are you sure you want to delete this task log?',
                                () => handleDeleteLog(log.id)
                              )}
                              className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  tempLogs.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-stone-200">
                      <Thermometer className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                      <p className="text-stone-400 font-medium">No temperature logs for this date</p>
                    </div>
                  ) : (
                    tempLogs.map(log => (
                      <div key={log.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                              log.type === 'Chiller' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {log.type}
                            </span>
                            <p className="font-bold text-stone-800">{log.location}</p>
                          </div>
                          <p className="text-xs text-stone-500 mt-1">Logged by <span className="font-bold text-emerald-600">{getDisplayStaffName(log.staffName, log.staffId)}</span></p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xl font-black text-stone-800">{log.temperature}°C</p>
                            <p className="text-[10px] font-black text-stone-400 uppercase">{log.timestamp}</p>
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => triggerConfirm(
                                'Delete Temperature Log',
                                'Are you sure you want to delete this temperature reading?',
                                () => handleDeleteTempLog(log.id)
                              )}
                              className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'temperatures' && (
            <motion.div 
              key="temperatures"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <TemperatureForm 
                staffList={staffList}
                onLogged={handleLogTemperature}
              />
              
              <div className="space-y-3">
                <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Today's Readings</h2>
                {tempLogs.filter(l => l.date === todayBusinessDate).length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-stone-200">
                    <Thermometer className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-400 font-medium">No readings logged today</p>
                  </div>
                ) : (
                  tempLogs.filter(l => l.date === todayBusinessDate).map(log => (
                    <div key={log.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            log.type === 'Chiller' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {log.type}
                          </span>
                          <p className="font-bold text-stone-800">{log.location}</p>
                        </div>
                        <p className="text-xs text-stone-500 mt-1">Logged by <span className="font-bold text-emerald-600">{getDisplayStaffName(log.staffName, log.staffId)}</span></p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xl font-black text-stone-800">{log.temperature}°C</p>
                          <p className="text-[10px] font-black text-stone-400 uppercase">{log.timestamp}</p>
                        </div>
                        {isAdmin && (
                          <button 
                            onClick={() => triggerConfirm(
                              'Delete Temperature Log',
                              'Are you sure you want to delete this temperature reading?',
                              () => handleDeleteTempLog(log.id)
                            )}
                            className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            isAdmin ? (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <SettingsList 
                  title="Categories" 
                  items={categories} 
                  allowReorder={true}
                  onReorder={async (categoryIds) => {
                    const res = await apiFetch('/api/categories/reorder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ categoryIds })
                    });
                    if (res.ok) {
                      fetchCategories();
                      fetchChecklist();
                    }
                  }}
                  onAdd={async (name) => {
                    await apiFetch('/api/categories', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchCategories();
                  }}
                  onUpdate={async (id, name) => {
                    await apiFetch(`/api/categories/${id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchCategories();
                  }}
                  onDelete={async (id) => {
                    const cat = categories.find(c => c.id === id);
                    triggerConfirm(
                      'Delete Category',
                      `Delete category "${cat?.name}"? This will not delete tasks but may affect filtering.`,
                      async () => {
                        await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
                        fetchCategories();
                      }
                    );
                  }}
                />
                
                <SettingsList 
                  title="Time Slots" 
                  items={timeSlots} 
                  allowReorder={true}
                  onReorder={async (timeSlotIds) => {
                    const res = await apiFetch('/api/time-slots/reorder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ timeSlotIds })
                    });
                    if (res.ok) {
                      fetchTimeSlots();
                      fetchChecklist();
                    }
                  }}
                  onAdd={async (name) => {
                    await apiFetch('/api/time-slots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchTimeSlots();
                  }}
                  onUpdate={async (id, name) => {
                    await apiFetch(`/api/time-slots/${id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchTimeSlots();
                  }}
                  onDelete={async (id) => {
                    const slot = timeSlots.find(t => t.id === id);
                    triggerConfirm(
                      'Delete Time Slot',
                      `Delete time slot "${slot?.name}"?`,
                      async () => {
                        await apiFetch(`/api/time-slots/${id}`, { method: 'DELETE' });
                        fetchTimeSlots();
                      }
                    );
                  }}
                />

                <div className="space-y-4">
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Regional Settings</h2>
                  <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Timezone</label>
                      <select 
                        value={selectedTimezone}
                        onChange={(e) => updateTimezone(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none"
                      >
                        {allTimezones.map((tz) => (
                          <option key={tz} value={tz}>{tz.replaceAll('_', ' ')}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-stone-400 mt-2 italic">All logs will use this timezone for timestamps.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Telegram Notifications</h2>
                  <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-3">
                    <p className="text-sm text-stone-600">
                      Shift closing sends a Telegram Bot API message.
                    </p>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                      <p className="text-[10px] font-black uppercase text-stone-400">Target Chat ID</p>
                      <p className="text-sm font-bold text-stone-700 break-all">
                        {TELEGRAM_CHAT_ID || 'Not configured'}
                      </p>
                    </div>
                    <p className="text-[10px] text-stone-400 italic">
                      Configure `VITE_TELEGRAM_BOT_TOKEN` and `VITE_TELEGRAM_CHAT_ID` in `.env`.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Security</h2>
                  <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Admin PIN</label>
                      <div className="flex gap-2">
                        <input 
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          placeholder="New 4-digit PIN"
                          className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value;
                              if (val.length === 4 && /^\d+$/.test(val)) {
                                handleChangePin(val);
                                (e.target as HTMLInputElement).value = "";
                              } else {
                                showToast("PIN must be 4 digits", "error");
                              }
                            }
                          }}
                        />
                        <button 
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                            const val = input.value;
                            if (val.length === 4 && /^\d+$/.test(val)) {
                              handleChangePin(val);
                              input.value = "";
                            } else {
                              showToast("PIN must be 4 digits", "error");
                            }
                          }}
                          className="bg-amber-500 text-white px-4 rounded-xl font-bold text-sm"
                        >
                          Update PIN
                        </button>
                      </div>
                      <p className="text-[10px] text-stone-400 mt-2 italic">Enter a new 4-digit numeric PIN to change admin access.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : <AdminLocked />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-10 safe-area-bottom overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-between min-w-max px-4 py-3 gap-2 mx-auto">
          <NavButton active={activeTab === 'checklist'} icon={<CheckCircle2 />} label="Checklist" onClick={() => setActiveTab('checklist')} />
          <NavButton active={activeTab === 'temperatures'} icon={<Thermometer />} label="Temps" onClick={() => setActiveTab('temperatures')} />
          <NavButton active={activeTab === 'edit-tasks'} icon={<ClipboardList />} label="Tasks" onClick={() => setActiveTab('edit-tasks')} />
          <NavButton active={activeTab === 'staff'} icon={<Users />} label="Staff" onClick={() => setActiveTab('staff')} />
          <NavButton active={activeTab === 'logs'} icon={<History />} label="Logs" onClick={() => setActiveTab('logs')} />
          <NavButton active={activeTab === 'settings'} icon={<SettingsIcon />} label="Settings" onClick={() => setActiveTab('settings')} />
        </div>
      </nav>

      {/* Staff Selection Modal for Checklist */}
      {selectingStaffForTask !== null && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <Users className="text-emerald-600 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Who completed this?</h3>
              <p className="text-stone-500 text-sm">Select your name to log the task</p>
            </div>
            
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {staffList.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => handleCompleteTask(selectingStaffForTask, staff.id)}
                  className="w-full text-left p-4 bg-stone-50 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-200 rounded-2xl transition-all font-bold text-stone-700 hover:text-emerald-700"
                >
                  {staff.name}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setSelectingStaffForTask(null)}
              className="mt-6 w-full p-4 bg-stone-100 text-stone-600 font-bold rounded-2xl"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}

      {/* Staff Selection Modal for Shift Close */}
      {selectingStaffForShiftClose && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <Lock className="text-red-600 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Who is closing shift?</h3>
              <p className="text-stone-500 text-sm">This is required before ending shift</p>
            </div>

            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {staffList.map(staff => (
                <button
                  key={staff.id}
                  onClick={async () => {
                    await handleEndShift(staff.name);
                    setSelectingStaffForShiftClose(false);
                  }}
                  disabled={isShiftActionPending}
                  className="w-full text-left p-4 bg-stone-50 hover:bg-red-50 border border-stone-200 hover:border-red-200 rounded-2xl transition-all font-bold text-stone-700 hover:text-red-700"
                >
                  {staff.name}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSelectingStaffForShiftClose(false)}
              className="mt-6 w-full p-4 bg-stone-100 text-stone-600 font-bold rounded-2xl"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-xs rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-3">
                <Lock className="text-amber-600 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Admin Access</h3>
              <p className="text-stone-500 text-sm">Enter 4-digit PIN</p>
            </div>
            
            <input 
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] font-black p-4 bg-stone-100 border-2 border-stone-200 rounded-2xl focus:outline-none focus:border-amber-500 transition-colors"
              autoFocus
              maxLength={4}
            />
            
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button 
                onClick={() => { setShowPinModal(false); setPinInput(""); }}
                className="p-4 bg-stone-100 text-stone-600 font-bold rounded-2xl"
              >
                Cancel
              </button>
              <button 
                onClick={verifyPin}
                className="p-4 bg-amber-500 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/30"
              >
                Enter
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-stone-900 mb-2">{confirmModal.title}</h3>
              <p className="text-stone-500 mb-8">{confirmModal.message}</p>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="p-4 bg-stone-100 text-stone-600 font-bold rounded-2xl"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(prev => ({ ...prev, show: false }));
                  }}
                  className="p-4 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-xl z-[70] font-bold text-sm flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TemperatureForm({ staffList, onLogged }: { staffList: Staff[], onLogged: (type: string, location: string, temperature: number, staffId: number) => void }) {
  const [type, setType] = useState<'Chiller' | 'Freezer'>('Chiller');
  const [location, setLocation] = useState("");
  const [temperature, setTemperature] = useState("");
  const [staffId, setStaffId] = useState(staffList[0]?.id || 0);

  useEffect(() => {
    if (staffList.length > 0 && !staffId) {
      setStaffId(staffList[0].id);
    }
  }, [staffList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location || !temperature || !staffId) return;
    onLogged(type, location, parseFloat(temperature), staffId);
    setLocation("");
    setTemperature("");
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
      <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Log Temperature</h2>
      
      <div className="flex p-1 bg-stone-100 rounded-xl">
        <button 
          type="button"
          onClick={() => setType('Chiller')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            type === 'Chiller' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-400'
          }`}
        >
          Chiller
        </button>
        <button 
          type="button"
          onClick={() => setType('Freezer')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            type === 'Freezer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-stone-400'
          }`}
        >
          Freezer
        </button>
      </div>

      <div className="space-y-3">
        <input 
          type="text"
          placeholder="Location (e.g. Chiller 1, Freezer A)..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input 
              type="text"
              inputMode="text"
              placeholder="Temp..."
              value={temperature}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
                  setTemperature(val);
                }
              }}
              className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-400">°C</span>
          </div>
          
          <select 
            value={staffId} 
            onChange={(e) => setStaffId(parseInt(e.target.value))}
            className="p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none"
          >
            <option value={0} disabled>Select Staff</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <button type="submit" className="w-full bg-emerald-600 text-white font-bold p-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
        <Thermometer className="w-5 h-5" /> Log Reading
      </button>
    </form>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all ${
        active ? 'text-emerald-600' : 'text-stone-400'
      }`}
    >
      <div className={`transition-transform ${active ? 'scale-110' : 'scale-100'}`}>
        {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 2.5 : 2 })}
      </div>
      <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}

function AdminLocked() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-4">
        <Lock className="text-stone-300 w-10 h-10" />
      </div>
      <h2 className="text-xl font-bold text-stone-800">Admin Mode Required</h2>
      <p className="text-stone-500 mt-2 max-w-[200px]">Please toggle Admin Mode and enter the PIN to access this section.</p>
    </div>
  );
}

function AddTaskForm({ categories, timeSlots, onAdded, editingTask, onCancelEdit }: { categories: Category[], timeSlots: TimeSlot[], onAdded: () => void, editingTask: Task | null, onCancelEdit: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]?.name || "");
  const [timeSlot, setTimeSlot] = useState(timeSlots[0]?.name || "");

  useEffect(() => {
    if (editingTask) {
      setName(editingTask.name);
      setCategory(editingTask.category);
      setTimeSlot(editingTask.timeSlot);
    } else {
      setName("");
      setCategory(categories[0]?.name || "");
      setTimeSlot(timeSlots[0]?.name || "");
    }
  }, [editingTask, categories, timeSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    
    const url = editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks';
    const method = editingTask ? 'PUT' : 'POST';

    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, timeSlot })
    });
    
    setName("");
    if (editingTask) onCancelEdit();
    onAdded();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
      <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">
        {editingTask ? 'Edit Task' : 'Add New Task'}
      </h2>
      <input 
        type="text"
        placeholder="Task name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoCorrect="off"
        autoCapitalize="none"
        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      />
      <div className="grid grid-cols-2 gap-3">
        <select 
          value={category} 
          onChange={(e) => setCategory(e.target.value)}
          className="p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none"
        >
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select 
          value={timeSlot} 
          onChange={(e) => setTimeSlot(e.target.value)}
          className="p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none"
        >
          {timeSlots.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        {editingTask && (
          <button 
            type="button" 
            onClick={onCancelEdit}
            className="flex-1 bg-stone-100 text-stone-600 font-bold p-4 rounded-2xl"
          >
            Cancel
          </button>
        )}
        <button type="submit" className="flex-[2] bg-emerald-600 text-white font-bold p-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
          {editingTask ? 'Update Task' : <><Plus className="w-5 h-5" /> Add Task</>}
        </button>
      </div>
    </form>
  );
}

function AddStaffForm({ onAdded, editingStaff, onCancelEdit }: { onAdded: () => void, editingStaff: Staff | null, onCancelEdit: () => void }) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (editingStaff) {
      setName(editingStaff.name);
    } else {
      setName("");
    }
  }, [editingStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const url = editingStaff ? `/api/staff/${editingStaff.id}` : '/api/staff';
    const method = editingStaff ? 'PUT' : 'POST';

    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    setName("");
    if (editingStaff) onCancelEdit();
    onAdded();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
      <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">
        {editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
      </h2>
      <div className="flex gap-3">
        <input 
          type="text"
          placeholder="Name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCorrect="off"
          autoCapitalize="none"
          className="flex-1 p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {editingStaff && (
          <button 
            type="button" 
            onClick={onCancelEdit}
            className="bg-stone-100 text-stone-600 font-bold px-4 rounded-2xl"
          >
            Cancel
          </button>
        )}
        <button type="submit" className="bg-emerald-600 text-white font-bold px-6 rounded-2xl shadow-lg shadow-emerald-600/20">
          {editingStaff ? 'Update' : <Plus className="w-5 h-5" />}
        </button>
      </div>
    </form>
  );
}

const SortableSettingsItem: React.FC<{ 
  item: { id: number; name: string }; 
  editingId: number | null;
  editName: string;
  setEditName: (name: string) => void;
  onUpdate: (id: number, name: string) => void;
  onCancel: () => void;
  onStartEdit: (item: { id: number; name: string }) => void;
  onDelete: (id: number) => void;
  allowReorder?: boolean;
}> = ({ 
  item, 
  editingId, 
  editName, 
  setEditName, 
  onUpdate, 
  onCancel, 
  onStartEdit, 
  onDelete,
  allowReorder
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled: !allowReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100"
    >
      {editingId === item.id ? (
        <div className="flex gap-2 flex-1 mr-2">
          <input 
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 p-1 bg-white border border-stone-200 rounded-lg font-bold text-stone-800 focus:outline-none"
            autoFocus
          />
          <button 
            onClick={() => { onUpdate(item.id, editName); onCancel(); }}
            className="text-emerald-600 font-bold text-xs"
          >
            Save
          </button>
          <button 
            onClick={onCancel}
            className="text-stone-400 font-bold text-xs"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {allowReorder && (
              <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-stone-600">
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <span className="font-bold text-stone-700">{item.name}</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => onStartEdit(item)}
              className="text-stone-400 hover:text-emerald-500"
            >
              <ClipboardList className="w-4 h-4" />
            </button>
            <button onClick={() => onDelete(item.id)} className="text-stone-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsList({ 
  title, 
  items, 
  onAdd, 
  onUpdate, 
  onDelete, 
  onReorder,
  allowReorder 
}: { 
  title: string, 
  items: { id: number, name: string }[], 
  onAdd: (name: string) => void, 
  onUpdate: (id: number, name: string) => void, 
  onDelete: (id: number) => void,
  onReorder?: (ids: number[]) => void,
  allowReorder?: boolean
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (onReorder && over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems.map(i => i.id));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">{title}</h2>
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex gap-2">
          <input 
            type="text"
            placeholder={`New ${title.toLowerCase()}...`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none"
          />
          <button 
            onClick={() => { if (name) { onAdd(name); setName(""); } }}
            className="bg-emerald-600 text-white p-3 rounded-xl"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {items.map(item => (
                  <SortableSettingsItem 
                    key={item.id}
                    item={item}
                    editingId={editingId}
                    editName={editName}
                    setEditName={setEditName}
                    onUpdate={onUpdate}
                    onCancel={() => setEditingId(null)}
                    onStartEdit={(i) => { setEditingId(i.id); setEditName(i.name); }}
                    onDelete={onDelete}
                    allowReorder={allowReorder}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
