export interface Task {
  id: string | number;
  name: string;
  category: string;
  timeSlot: string;
  isActive: number | boolean;
}

export interface Staff {
  id: string | number;
  name: string;
  isActive: number | boolean;
}

export interface Log {
  id: string | number;
  date: string;
  taskId: string | number;
  staffId: string | number;
  timestamp: string;
  taskName?: string;
  staffName?: string;
}

export interface TemperatureLog {
  id: string | number;
  date: string;
  type: string;
  location: string;
  temperature: number;
  staffId: string | number;
  timestamp: string;
  staffName?: string;
}

export interface Category {
  id: string | number;
  name: string;
}

export interface TimeSlot {
  id: string | number;
  name: string;
}

export type TabType = 'checklist' | 'edit-tasks' | 'staff' | 'logs' | 'settings' | 'temperatures';
