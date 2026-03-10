import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
console.log(`[FIREBASE] Initializing Admin SDK...`);
try {
  if (!admin.apps.length) {
    // Try initializing with default credentials first
    admin.initializeApp();
  }
  console.log(`[FIREBASE] Admin SDK initialized. Project: ${admin.app().options.projectId || 'default'}`);
} catch (error) {
  console.error("[FIREBASE] Initialization error:", error);
  // Fallback to explicit project ID if default fails
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
}

// Use the specific database ID if provided in the config
console.log(`[FIREBASE] Using Database ID: ${firebaseConfig.firestoreDatabaseId || '(default)'}`);
let db: admin.firestore.Firestore;
try {
  db = firebaseConfig.firestoreDatabaseId 
    ? getFirestore(firebaseConfig.firestoreDatabaseId)
    : getFirestore();
} catch (error) {
  console.error("[FIREBASE] Error getting Firestore instance:", error);
  db = getFirestore();
}

// Cache for settings to avoid frequent DB hits
let cachedTimezone: string | null = null;

const getTimezone = async () => {
  if (cachedTimezone) return cachedTimezone;
  try {
    const timezoneDoc = await db.collection("app_settings").doc("timezone").get();
    cachedTimezone = timezoneDoc.exists ? (timezoneDoc.data()?.value || 'Asia/Singapore') : 'Asia/Singapore';
  } catch (error) {
    console.error("[FIREBASE] Error fetching timezone:", error);
    cachedTimezone = 'Asia/Singapore';
  }
  return cachedTimezone;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Database Seeding
const seedData = async () => {
  try {
    console.log("[SEED] Checking if database needs seeding...");
    const categoriesSnap = await db.collection("categories").limit(1).get();
    if (categoriesSnap.empty) {
      console.log("[SEED] Seeding initial data...");
      const categories = ["Opening", "Closing", "Mid-Shift", "Cleaning"];
      for (const name of categories) {
        await db.collection("categories").add({ name });
      }

      const timeSlots = ["Morning", "Afternoon", "Evening", "Night"];
      for (const name of timeSlots) {
        await db.collection("time_slots").add({ name });
      }

      const staff = ["Justin", "Sarah", "Mike", "Emma"];
      for (const name of staff) {
        await db.collection("staff").add({ name, isActive: true });
      }

      const tasks = [
        { name: "Check Coffee Machine", category: "Opening", timeSlot: "Morning", isActive: true },
        { name: "Refill Sugar/Milk", category: "Mid-Shift", timeSlot: "Afternoon", isActive: true },
        { name: "Mop Floor", category: "Closing", timeSlot: "Evening", isActive: true },
        { name: "Wipe Tables", category: "Cleaning", timeSlot: "Morning", isActive: true }
      ];
      for (const task of tasks) {
        await db.collection("tasks").add(task);
      }
      console.log("[SEED] Data seeded successfully.");
    }

    const pinDoc = await db.collection("app_settings").doc("admin_pin").get();
    if (!pinDoc.exists) {
      await db.collection("app_settings").doc("admin_pin").set({ value: "5897" });
    }

    const timezoneDoc = await db.collection("app_settings").doc("timezone").get();
    if (!timezoneDoc.exists) {
      await db.collection("app_settings").doc("timezone").set({ value: "Asia/Singapore" });
    }

    const shiftEndedDoc = await db.collection("app_settings").doc("shift_ended").get();
    if (!shiftEndedDoc.exists) {
      await db.collection("app_settings").doc("shift_ended").set({ value: "false" });
    }
  } catch (error) {
    console.error("[SEED] Error seeding data:", error);
  }
};
seedData();

const getLocalTime = async () => {
  const timezone = await getTimezone();
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  
  const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const time = `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  
  return { date, time };
};

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = 3000;

  // API Routes
  app.get("/api/admin-pin", async (req, res) => {
    const doc = await db.collection("app_settings").doc("admin_pin").get();
    res.json({ pin: doc.data()?.value });
  });

  app.post("/api/admin-pin", async (req, res) => {
    const { pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be 4 digits" });
    }
    await db.collection("app_settings").doc("admin_pin").update({ value: pin });
    res.json({ success: true });
  });

  app.get("/api/settings", async (req, res) => {
    const snapshot = await db.collection("app_settings").get();
    const result: Record<string, string> = {};
    snapshot.forEach(doc => result[doc.id] = doc.data().value);
    res.json(result);
  });

  app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body;
    await db.collection("app_settings").doc(key).set({ value });
    if (key === 'timezone') cachedTimezone = value;
    res.json({ success: true });
  });

  app.get("/api/notification-emails", async (req, res) => {
    const snapshot = await db.collection("notification_emails").get();
    const emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(emails);
  });

  app.post("/api/notification-emails", async (req, res) => {
    const { email } = req.body;
    try {
      const docRef = await db.collection("notification_emails").add({ email, isActive: true });
      res.json({ id: docRef.id, email, isActive: 1 });
    } catch (e) {
      res.status(400).json({ error: "Failed to add email" });
    }
  });

  app.put("/api/notification-emails/:id", async (req, res) => {
    const { email, isActive } = req.body;
    await db.collection("notification_emails").doc(req.params.id).update({ 
      email, 
      isActive: isActive ? true : false 
    });
    res.json({ success: true });
  });

  app.delete("/api/notification-emails/:id", async (req, res) => {
    await db.collection("notification_emails").doc(req.params.id).delete();
    res.json({ success: true });
  });

  app.get("/api/shift-status", async (req, res) => {
    const doc = await db.collection("app_settings").doc("shift_ended").get();
    res.json({ ended: doc.data()?.value === 'true' });
  });

  app.post("/api/end-shift", async (req, res) => {
    const { ended, userEmail } = req.body;
    await db.collection("app_settings").doc("shift_ended").set({ value: ended ? 'true' : 'false' });
    
    if (ended) {
      const snapshot = await db.collection("notification_emails").where("isActive", "==", true).get();
      const emailList = snapshot.docs.map(doc => doc.data().email);
      const { date, time } = await getLocalTime();
      console.log(`[EMAIL] Sending shift end report to: ${emailList.join(', ')}`);
      
      if (resend && emailList.length > 0) {
        try {
          await resend.emails.send({
            from: 'FOH Checklist <onboarding@resend.dev>',
            to: emailList,
            subject: `Shift Ended - ${date}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #059669;">Shift Ended</h2>
                <p>The shift has been ended at <strong>${time}</strong> on <strong>${date}</strong>.</p>
                <p>The checklist is now locked.</p>
                <p style="font-size: 12px; color: #666; margin-top: 20px;">Triggered by: ${userEmail || 'Unknown User'}</p>
              </div>
            `
          });
          console.log("Emails sent successfully via Resend");
        } catch (error) {
          console.error("Failed to send emails via Resend:", error);
        }
      } else {
        console.log("Resend not configured or no active emails. Simulation only.");
        console.log(`Subject: Shift Ended - ${date}`);
        console.log(`Body: The shift has been ended at ${time}. Checklist is now locked.`);
      }
    }
    
    res.json({ success: true });
  });

  app.get("/api/categories", async (req, res) => {
    const snapshot = await db.collection("categories").orderBy("name").get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.post("/api/categories", async (req, res) => {
    const { name } = req.body;
    const docRef = await db.collection("categories").add({ name });
    res.json({ id: docRef.id, name });
  });

  app.put("/api/categories/:id", async (req, res) => {
    const { name } = req.body;
    await db.collection("categories").doc(req.params.id).update({ name });
    res.json({ success: true });
  });

  app.delete("/api/categories/:id", async (req, res) => {
    await db.collection("categories").doc(req.params.id).delete();
    res.json({ success: true });
  });

  app.get("/api/time-slots", async (req, res) => {
    const snapshot = await db.collection("time_slots").orderBy("name").get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.post("/api/time-slots", async (req, res) => {
    const { name } = req.body;
    const docRef = await db.collection("time_slots").add({ name });
    res.json({ id: docRef.id, name });
  });

  app.put("/api/time-slots/:id", async (req, res) => {
    const { name } = req.body;
    await db.collection("time_slots").doc(req.params.id).update({ name });
    res.json({ success: true });
  });

  app.delete("/api/time-slots/:id", async (req, res) => {
    await db.collection("time_slots").doc(req.params.id).delete();
    res.json({ success: true });
  });

  app.get("/api/staff", async (req, res) => {
    const snapshot = await db.collection("staff").where("isActive", "==", true).orderBy("name").get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.post("/api/staff", async (req, res) => {
    const { name } = req.body;
    const docRef = await db.collection("staff").add({ name, isActive: true });
    res.json({ id: docRef.id, name, isActive: 1 });
  });

  app.put("/api/staff/:id", async (req, res) => {
    const { name } = req.body;
    await db.collection("staff").doc(req.params.id).update({ name });
    res.json({ success: true });
  });

  app.delete("/api/staff/:id", async (req, res) => {
    await db.collection("staff").doc(req.params.id).update({ isActive: false });
    res.json({ success: true });
  });

  app.get("/api/tasks", async (req, res) => {
    const snapshot = await db.collection("tasks").where("isActive", "==", true).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.post("/api/tasks", async (req, res) => {
    const { name, category, timeSlot } = req.body;
    const docRef = await db.collection("tasks").add({ name, category, timeSlot, isActive: true });
    res.json({ id: docRef.id, name, category, timeSlot, isActive: 1 });
  });

  app.put("/api/tasks/:id", async (req, res) => {
    const { name, category, timeSlot } = req.body;
    await db.collection("tasks").doc(req.params.id).update({ name, category, timeSlot });
    res.json({ success: true });
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    await db.collection("tasks").doc(req.params.id).update({ isActive: false });
    res.json({ success: true });
  });

  app.get("/api/logs", async (req, res) => {
    const { date } = req.query;
    const snapshot = await db.collection("logs")
      .where("date", "==", date)
      .orderBy("timestamp", "desc")
      .get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.get("/api/temperature-logs", async (req, res) => {
    const { date } = req.query;
    const snapshot = await db.collection("temperature_logs")
      .where("date", "==", date)
      .orderBy("timestamp", "desc")
      .get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });

  app.post("/api/temperature-logs", async (req, res) => {
    const { type, location, temperature, staffId, staffName } = req.body;
    const { date, time: timestamp } = await getLocalTime();

    const docRef = await db.collection("temperature_logs").add({ 
      date, type, location, temperature, staffId, staffName, timestamp 
    });
    
    res.json({ id: docRef.id, date, type, location, temperature, staffId, staffName, timestamp });
  });

  app.delete("/api/logs/task/:taskId", async (req, res) => {
    const { date } = await getLocalTime();
    const snapshot = await db.collection("logs")
      .where("taskId", "==", req.params.taskId)
      .where("date", "==", date)
      .get();
    
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ success: true });
  });

  app.post("/api/logs", async (req, res) => {
    const { taskId, staffId, taskName, staffName } = req.body;
    const { date, time: timestamp } = await getLocalTime();
    
    const existing = await db.collection("logs")
      .where("taskId", "==", taskId)
      .where("date", "==", date)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: "Task already completed today" });
    }

    const docRef = await db.collection("logs").add({ 
      date, taskId, staffId, taskName, staffName, timestamp 
    });
    res.json({ id: docRef.id, date, taskId, staffId, taskName, staffName, timestamp });
  });

  app.delete("/api/logs/:id", async (req, res) => {
    await db.collection("logs").doc(req.params.id).delete();
    res.json({ success: true });
  });

  app.delete("/api/temperature-logs/:id", async (req, res) => {
    await db.collection("temperature_logs").doc(req.params.id).delete();
    res.json({ success: true });
  });

  app.get("/api/checklist", async (req, res) => {
    const { date } = await getLocalTime();
    const [tasksSnap, logsSnap] = await Promise.all([
      db.collection("tasks").where("isActive", "==", true).get(),
      db.collection("logs").where("date", "==", date).get()
    ]);
    
    const completedTaskIds = new Set(logsSnap.docs.map(doc => doc.data().taskId));
    
    const checklist = tasksSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        completed: completedTaskIds.has(doc.id) ? 1 : 0
      };
    });
    
    res.json(checklist);
  });

  app.get("/api/bootstrap", async (req, res) => {
    try {
      const { date } = await getLocalTime();
      
      const [
        staffSnap,
        categoriesSnap,
        timeSlotsSnap,
        tasksSnap,
        logsSnap,
        settingsSnap,
        emailsSnap,
      ] = await Promise.all([
        db.collection("staff").where("isActive", "==", true).orderBy("name").get(),
        db.collection("categories").orderBy("name").get(),
        db.collection("time_slots").orderBy("name").get(),
        db.collection("tasks").where("isActive", "==", true).get(),
        db.collection("logs").where("date", "==", date).get(),
        db.collection("app_settings").get(),
        db.collection("notification_emails").get(),
      ]);

      const completedTaskIds = new Set(logsSnap.docs.map(doc => doc.data().taskId));
      const settings: Record<string, any> = {};
      settingsSnap.forEach(doc => settings[doc.id] = doc.data().value);

      res.json({
        staff: staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        categories: categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        timeSlots: timeSlotsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        tasks: tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        checklist: tasksSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          completed: completedTaskIds.has(doc.id) ? 1 : 0
        })),
        settings,
        notificationEmails: emailsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        shiftStatus: { ended: settings.shift_ended === 'true' },
        adminPin: { pin: settings.admin_pin }
      });
    } catch (error: any) {
      console.error("[BOOTSTRAP] Error:", error);
      res.status(500).json({ 
        error: "Internal server error during bootstrap",
        details: error.message,
        code: error.code
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
