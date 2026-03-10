import React, { useState, useEffect } from 'react';
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
  LogOut,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, Staff, Log, TemperatureLog, Category, TimeSlot, TabType, NotificationEmail } from './types';
import { auth, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
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
  const [notificationEmails, setNotificationEmails] = useState<NotificationEmail[]>([]);
  const [isShiftEnded, setIsShiftEnded] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState("Asia/Singapore");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [checklist, setChecklist] = useState<(Task & { completed: number })[]>([]);
  const [logVariant, setLogVariant] = useState<'checklist' | 'temperatures'>('checklist');

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

  // Selection states
  const [selectingStaffForTask, setSelectingStaffForTask] = useState<string | number | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      bootstrapApp();
    }
  }, [user]);

  const bootstrapApp = async () => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      
      setStaffList(data.staff);
      setCategories(data.categories);
      setTimeSlots(data.timeSlots);
      setTasks(data.tasks);
      setChecklist(data.checklist);
      setAdminPin(data.adminPin.pin);
      setNotificationEmails(data.notificationEmails);
      setIsShiftEnded(data.shiftStatus.ended);
      if (data.settings.timezone) setSelectedTimezone(data.settings.timezone);
    } catch (error) {
      console.error("Failed to bootstrap app:", error);
      showToast("Failed to load initial data", "error");
    } finally {
      setDataLoading(false);
    }
  };

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.timezone) setSelectedTimezone(data.timezone);
  };

  const fetchNotificationEmails = async () => {
    const res = await fetch('/api/notification-emails');
    const data = await res.json();
    setNotificationEmails(data);
  };

  const fetchShiftStatus = async () => {
    const res = await fetch('/api/shift-status');
    const data = await res.json();
    setIsShiftEnded(data.ended);
  };

  const fetchAdminPin = async () => {
    const res = await fetch('/api/admin-pin');
    const data = await res.json();
    setAdminPin(data.pin);
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      Promise.all([
        fetchLogs(selectedDate),
        fetchTempLogs(selectedDate)
      ]);
    }
    if (activeTab === 'temperatures') {
      fetchTempLogs(selectedDate);
    }
  }, [activeTab, selectedDate]);

  const fetchStaff = async () => {
    const res = await fetch('/api/staff');
    const data = await res.json();
    setStaffList(data);
  };

  const fetchCategories = async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    setCategories(data);
  };

  const fetchTimeSlots = async () => {
    const res = await fetch('/api/time-slots');
    const data = await res.json();
    setTimeSlots(data);
  };

  const fetchTasks = async () => {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    setTasks(data);
  };

  const fetchChecklist = async () => {
    const res = await fetch('/api/checklist');
    const data = await res.json();
    setChecklist(data);
  };

  const fetchLogs = async (date: string) => {
    const res = await fetch(`/api/logs?date=${date}`);
    const data = await res.json();
    setLogs(data);
  };

  const fetchTempLogs = async (date: string) => {
    const res = await fetch(`/api/temperature-logs?date=${date}`);
    const data = await res.json();
    setTempLogs(data);
  };

  const handleCompleteTask = async (taskId: string | number, staffId: string | number) => {
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const task = tasks.find(t => t.id === taskId);
    const staff = staffList.find(s => s.id === staffId);

    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        taskId, 
        staffId,
        taskName: task?.name,
        staffName: staff?.name
      })
    });
    if (res.ok) {
      setSelectingStaffForTask(null);
      fetchChecklist();
    }
  };

  const handleUntickTask = async (taskId: string | number) => {
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const res = await fetch(`/api/logs/task/${taskId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchChecklist();
    }
  };

  const handleLogTemperature = async (type: string, location: string, temperature: number, staffId: string | number) => {
    if (isShiftEnded && !isAdmin) {
      showToast("Shift has ended. Only admins can edit.", "error");
      return;
    }
    const staff = staffList.find(s => s.id === staffId);

    const res = await fetch('/api/temperature-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type, 
        location, 
        temperature, 
        staffId,
        staffName: staff?.name
      })
    });
    if (res.ok) {
      fetchTempLogs(selectedDate);
      showToast("Temperature logged successfully");
    }
  };

  const handleDeleteLog = async (id: string | number) => {
    const res = await fetch(`/api/logs/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchLogs(selectedDate);
      fetchChecklist();
      showToast("Log deleted");
    }
  };

  const handleDeleteTempLog = async (id: string | number) => {
    const res = await fetch(`/api/temperature-logs/${id}`, {
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

  const handleEndShift = async () => {
    const newStatus = !isShiftEnded;
    const res = await fetch('/api/end-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ended: newStatus,
        userEmail: user?.email 
      })
    });
    if (res.ok) {
      setIsShiftEnded(newStatus);
      showToast(newStatus ? "Shift ended and notifications sent" : "Shift reopened");
    }
  };

  const updateTimezone = async (tz: string) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'timezone', value: tz })
    });
    if (res.ok) {
      setSelectedTimezone(tz);
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
    const res = await fetch('/api/admin-pin', {
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

  if (authLoading || (user && dataLoading)) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-stone-400 font-bold text-sm animate-pulse">
            {authLoading ? 'Authenticating...' : 'Loading your checklist...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-xl max-w-md w-full text-center space-y-8"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="text-emerald-600 w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-stone-900">FOH Tasks</h1>
            <p className="text-stone-500 font-medium">Please sign in to access the checklist</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all active:scale-95 shadow-lg shadow-stone-900/20"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black">Authorized Personnel Only</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (isShiftEnded && !isAdmin) {
                showToast("Shift has ended. Only admins can reopen.", "error");
                return;
              }
              triggerConfirm(
                isShiftEnded ? 'Reopen Shift' : 'End Shift',
                isShiftEnded ? 'Are you sure you want to reopen the shift?' : 'End shift and lock checklist? This will notify the team.',
                handleEndShift
              );
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
              isShiftEnded 
                ? 'bg-stone-800 text-white hover:bg-stone-900' 
                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/20'
            }`}
          >
            {isShiftEnded ? 'Reopen Shift' : 'End Shift'}
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
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-full">
            <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-[10px] font-bold text-emerald-700">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <span className="text-[10px] font-bold text-stone-500 truncate max-w-[100px]">{user.email}</span>
          </div>
          <button 
            onClick={logout}
            className="p-2 text-stone-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="h-6 w-[1px] bg-stone-200 mx-1"></div>
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
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'checklist' && (
            <motion.div 
              key="checklist"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {categories.map(cat => {
                const catTasks = checklist.filter(t => t.category === cat.name);
                if (catTasks.length === 0) return null;
                return (
                  <section key={cat.id} className="space-y-4">
                    <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">{cat.name}</h2>
                    <div className="space-y-3">
                      {catTasks.map(task => (
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
                            <p className="text-xs text-stone-500 font-medium">{task.timeSlot}</p>
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
                  <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Active Tasks</h2>
                  {tasks.map(task => (
                    <div key={task.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-stone-800">{task.name}</p>
                        <p className="text-xs text-stone-500">{task.category} • {task.timeSlot}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingTask(task)}
                          className="p-2 text-stone-400 hover:text-emerald-500 transition-colors"
                        >
                          <ClipboardList className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => triggerConfirm(
                            'Delete Task',
                            `Are you sure you want to delete "${task.name}"?`,
                            async () => {
                              await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
                              fetchTasks();
                              fetchChecklist();
                            }
                          )}
                          className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
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
                <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">FOH Team</h2>
                {staffList.map(staff => (
                  <div key={staff.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-xs font-bold text-stone-500">
                        {staff.name.charAt(0)}
                      </div>
                      <p className="font-bold text-stone-800">{staff.name}</p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingStaff(staff)}
                          className="p-2 text-stone-400 hover:text-emerald-500 transition-colors"
                        >
                          <Users className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => triggerConfirm(
                            'Remove Staff',
                            `Are you sure you want to remove "${staff.name}"?`,
                            async () => {
                              await fetch(`/api/staff/${staff.id}`, { method: 'DELETE' });
                              fetchStaff();
                            }
                          )}
                          className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
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
                          <p className="font-bold text-stone-800">{log.taskName}</p>
                          <p className="text-xs text-stone-500">Completed by <span className="font-bold text-emerald-600">{log.staffName}</span></p>
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
                          <p className="text-xs text-stone-500 mt-1">Logged by <span className="font-bold text-emerald-600">{log.staffName}</span></p>
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
                {tempLogs.filter(l => l.date === new Date().toISOString().split('T')[0]).length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-stone-200">
                    <Thermometer className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                    <p className="text-stone-400 font-medium">No readings logged today</p>
                  </div>
                ) : (
                  tempLogs.filter(l => l.date === new Date().toISOString().split('T')[0]).map(log => (
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
                        <p className="text-xs text-stone-500 mt-1">Logged by <span className="font-bold text-emerald-600">{log.staffName}</span></p>
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
                  onAdd={async (name) => {
                    await fetch('/api/categories', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchCategories();
                  }}
                  onUpdate={async (id, name) => {
                    await fetch(`/api/categories/${id}`, {
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
                        await fetch(`/api/categories/${id}`, { method: 'DELETE' });
                        fetchCategories();
                      }
                    );
                  }}
                />
                
                <SettingsList 
                  title="Time Slots" 
                  items={timeSlots} 
                  onAdd={async (name) => {
                    await fetch('/api/time-slots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    fetchTimeSlots();
                  }}
                  onUpdate={async (id, name) => {
                    await fetch(`/api/time-slots/${id}`, {
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
                        await fetch(`/api/time-slots/${id}`, { method: 'DELETE' });
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
                        <option value="Asia/Singapore">Singapore (GMT+8)</option>
                        <option value="Asia/Kuala_Lumpur">Kuala Lumpur (GMT+8)</option>
                        <option value="Asia/Hong_Kong">Hong Kong (GMT+8)</option>
                        <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
                        <option value="Europe/London">London (GMT+0)</option>
                        <option value="UTC">UTC</option>
                      </select>
                      <p className="text-[10px] text-stone-400 mt-2 italic">All logs will use this timezone for timestamps.</p>
                    </div>
                  </div>
                </div>

                <EmailSettings 
                  emails={notificationEmails}
                  onRefresh={fetchNotificationEmails}
                  triggerConfirm={triggerConfirm}
                  showToast={showToast}
                />

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
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-2 py-3 flex items-center justify-around z-10 safe-area-bottom">
        <NavButton active={activeTab === 'checklist'} icon={<CheckCircle2 />} label="Checklist" onClick={() => setActiveTab('checklist')} />
        <NavButton active={activeTab === 'temperatures'} icon={<Thermometer />} label="Temps" onClick={() => setActiveTab('temperatures')} />
        <NavButton active={activeTab === 'edit-tasks'} icon={<ClipboardList />} label="Tasks" onClick={() => setActiveTab('edit-tasks')} />
        <NavButton active={activeTab === 'staff'} icon={<Users />} label="Staff" onClick={() => setActiveTab('staff')} />
        <NavButton active={activeTab === 'logs'} icon={<History />} label="Logs" onClick={() => setActiveTab('logs')} />
        <NavButton active={activeTab === 'settings'} icon={<SettingsIcon />} label="Settings" onClick={() => setActiveTab('settings')} />
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

function TemperatureForm({ staffList, onLogged }: { staffList: Staff[], onLogged: (type: string, location: string, temperature: number, staffId: string | number) => void }) {
  const [type, setType] = useState<'Chiller' | 'Freezer'>('Chiller');
  const [location, setLocation] = useState("");
  const [temperature, setTemperature] = useState("");
  const [staffId, setStaffId] = useState<string | number>(staffList[0]?.id || 0);

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
              type="number"
              step="0.1"
              placeholder="Temp..."
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-400">°C</span>
          </div>
          
          <select 
            value={staffId} 
            onChange={(e) => setStaffId(e.target.value)}
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

    await fetch(url, {
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

    await fetch(url, {
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

function EmailSettings({ emails, onRefresh, triggerConfirm, showToast }: { emails: NotificationEmail[], onRefresh: () => void, triggerConfirm: (t: string, m: string, c: () => void) => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [newEmail, setNewEmail] = useState("");

  const handleAdd = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      showToast("Invalid email", "error");
      return;
    }
    const res = await fetch('/api/notification-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail })
    });
    if (res.ok) {
      setNewEmail("");
      onRefresh();
      showToast("Email added");
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to add email", "error");
    }
  };

  const handleToggle = async (email: NotificationEmail) => {
    const res = await fetch(`/api/notification-emails/${email.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.email, isActive: !email.isActive })
    });
    if (res.ok) {
      onRefresh();
    }
  };

  const handleDelete = (email: NotificationEmail) => {
    triggerConfirm(
      'Remove Email',
      `Stop sending notifications to ${email.email}?`,
      async () => {
        const res = await fetch(`/api/notification-emails/${email.id}`, { method: 'DELETE' });
        if (res.ok) {
          onRefresh();
          showToast("Email removed");
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-black text-stone-400 uppercase tracking-[0.2em] px-1">Notification Emails</h2>
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex gap-2">
          <input 
            type="email"
            placeholder="manager@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-none"
          />
          <button 
            onClick={handleAdd}
            className="bg-emerald-600 text-white px-4 rounded-xl font-bold"
          >
            Add
          </button>
        </div>
        
        <div className="space-y-3">
          {emails.map(email => (
            <div key={email.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
              <div className="flex flex-col">
                <span className={`font-bold text-sm ${email.isActive ? 'text-stone-800' : 'text-stone-400 line-through'}`}>
                  {email.email}
                </span>
                <span className="text-[10px] font-black uppercase text-stone-400">
                  {email.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleToggle(email)}
                  className={`w-10 h-6 rounded-full transition-all relative ${email.isActive ? 'bg-emerald-500' : 'bg-stone-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${email.isActive ? 'left-5' : 'left-1'}`} />
                </button>
                <button 
                  onClick={() => handleDelete(email)}
                  className="text-stone-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
          {emails.length === 0 && (
            <p className="text-center py-4 text-xs text-stone-400 italic">No notification emails configured.</p>
          )}
        </div>
        <p className="text-[10px] text-stone-400 italic">These emails will receive a report when "End Shift" is pressed.</p>
      </div>
    </div>
  );
}

function SettingsList({ title, items, onAdd, onUpdate, onDelete }: { title: string, items: { id: string | number, name: string }[], onAdd: (name: string) => void, onUpdate: (id: string | number, name: string) => void, onDelete: (id: string | number) => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editName, setEditName] = useState("");

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
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
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
                    onClick={() => { onUpdate(item.id, editName); setEditingId(null); }}
                    className="text-emerald-600 font-bold text-xs"
                  >
                    Save
                  </button>
                  <button 
                    onClick={() => setEditingId(null)}
                    className="text-stone-400 font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="font-bold text-stone-700">{item.name}</span>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => { setEditingId(item.id); setEditName(item.name); }}
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
          ))}
        </div>
      </div>
    </div>
  );
}
