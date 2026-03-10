import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  getDocs,
  setDoc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Task, Staff, Log, TemperatureLog, Category, TimeSlot, NotificationEmail } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Categories
export const subscribeCategories = (callback: (categories: Category[]) => void) => {
  const q = query(collection(db, 'categories'), orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    callback(categories);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));
};

export const addCategory = async (name: string) => {
  try {
    await addDoc(collection(db, 'categories'), { name });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'categories');
  }
};

// Staff
export const subscribeStaff = (callback: (staff: Staff[]) => void) => {
  const q = query(collection(db, 'staff'), where('isActive', '==', true), orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const staff = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
    callback(staff);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'staff'));
};

export const addStaff = async (name: string) => {
  try {
    await addDoc(collection(db, 'staff'), { name, isActive: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'staff');
  }
};

// Tasks
export const subscribeTasks = (callback: (tasks: Task[]) => void) => {
  const q = query(collection(db, 'tasks'), where('isActive', '==', true));
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    callback(tasks);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));
};

export const addTask = async (task: Omit<Task, 'id'>) => {
  try {
    await addDoc(collection(db, 'tasks'), task);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'tasks');
  }
};

// Logs
export const subscribeLogs = (date: string, callback: (logs: Log[]) => void) => {
  const q = query(collection(db, 'logs'), where('date', '==', date), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
    callback(logs);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'logs'));
};

export const addLog = async (log: Omit<Log, 'id'>) => {
  try {
    await addDoc(collection(db, 'logs'), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'logs');
  }
};

// Temperature Logs
export const subscribeTempLogs = (date: string, callback: (logs: TemperatureLog[]) => void) => {
  const q = query(collection(db, 'temperature_logs'), where('date', '==', date), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TemperatureLog));
    callback(logs);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'temperature_logs'));
};

export const addTempLog = async (log: Omit<TemperatureLog, 'id'>) => {
  try {
    await addDoc(collection(db, 'temperature_logs'), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'temperature_logs');
  }
};

// Settings
export const subscribeSettings = (callback: (settings: Record<string, string>) => void) => {
  return onSnapshot(collection(db, 'app_settings'), (snapshot) => {
    const settings: Record<string, string> = {};
    snapshot.docs.forEach(doc => {
      settings[doc.id] = doc.data().value;
    });
    callback(settings);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'app_settings'));
};

export const updateSetting = async (key: string, value: string) => {
  try {
    await setDoc(doc(db, 'app_settings', key), { value });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `app_settings/${key}`);
  }
};

// Emails
export const subscribeEmails = (callback: (emails: NotificationEmail[]) => void) => {
  return onSnapshot(collection(db, 'notification_emails'), (snapshot) => {
    const emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationEmail));
    callback(emails);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'notification_emails'));
};
