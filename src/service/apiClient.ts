import { supabase } from './client';

type EntityRow = Record<string, unknown> & { id: string | number };
type AppSettingRow = { key: string; value: string | null };

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseRequestBody(body?: BodyInit | null): Record<string, unknown> {
  if (!body || typeof body !== 'string') {
    return {};
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function queryMany<T>(
  promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
) {
  const { data, error } = await promise;

  if (error) {
    console.error(`[SUPABASE] ${label}:`, error);
    throw new Error(error.message);
  }

  return (data ?? []) as T[];
}

async function queryOne<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string,
) {
  const { data, error } = await promise;

  if (error) {
    console.error(`[SUPABASE] ${label}:`, error);
    throw new Error(error.message);
  }

  return data;
}

async function execute(
  promise: PromiseLike<{ error: { message: string } | null }>,
  label: string,
) {
  const { error } = await promise;

  if (error) {
    console.error(`[SUPABASE] ${label}:`, error);
    throw new Error(error.message);
  }
}

async function fetchSettingsMap() {
  const settings = await queryMany<AppSettingRow>(
    supabase.from('app_settings').select('key, value'),
    'fetch settings',
  );

  return Object.fromEntries(settings.map(({ key, value }) => [key, value ?? '']));
}

async function setSetting(key: string, value: string) {
  await execute(
    supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' }),
    `set setting ${key}`,
  );
}

async function getTimezone() {
  try {
    const settings = await fetchSettingsMap();
    return settings.timezone || 'Asia/Singapore';
  } catch (error) {
    console.error('[SUPABASE] Error fetching timezone:', error);
    return 'Asia/Singapore';
  }
}

async function getLocalTime() {
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
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value;

  return {
    date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    time: `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`,
  };
}

function attachCompleted(tasks: EntityRow[], logs: EntityRow[]) {
  const completedTaskIds = new Set(logs.map((log) => String(log.taskId)));

  return tasks.map((task) => ({
    ...task,
    completed: completedTaskIds.has(String(task.id)) ? 1 : 0,
  }));
}

async function sendTelegramShiftEndMessage(closedBy: string, date: string, time: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Missing VITE_TELEGRAM_BOT_TOKEN or VITE_TELEGRAM_CHAT_ID in .env');
  }

  const message = [
    'FOH Checklist',
    `Shift ended on ${date} at ${time}.`,
    `Closed by: ${closedBy || 'Unknown'}`,
    'The checklist is now locked.',
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const target = typeof input === 'string' ? input : input.toString();

  if (!target.startsWith('/api/')) {
    return fetch(input, init);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(target, window.location.origin);
  const path = url.pathname;
  const body = parseRequestBody(init.body);

  try {
    if (path === '/api/admin-pin' && method === 'GET') {
      const settings = await fetchSettingsMap();
      return jsonResponse({ pin: settings.admin_pin ?? '5897' });
    }

    if (path === '/api/admin-pin' && method === 'POST') {
      const pin = String(body.pin ?? '');
      if (pin.length !== 4 || !/^\d+$/.test(pin)) {
        return jsonResponse({ error: 'PIN must be 4 digits' }, 400);
      }

      await setSetting('admin_pin', pin);
      return jsonResponse({ success: true });
    }

    if (path === '/api/settings' && method === 'GET') {
      return jsonResponse(await fetchSettingsMap());
    }

    if (path === '/api/settings' && method === 'POST') {
      const key = String(body.key ?? '');
      const value = String(body.value ?? '');
      await setSetting(key, value);
      return jsonResponse({ success: true });
    }

    if (path === '/api/shift-status' && method === 'GET') {
      const settings = await fetchSettingsMap();
      return jsonResponse({
        ended: settings.shift_ended === 'true',
        closedBy: settings.shift_closed_by || null,
      });
    }

    if (path === '/api/end-shift' && method === 'POST') {
      const ended = Boolean(body.ended);
      const closedBy = ended ? String(body.closedBy ?? '') : '';

      if (ended) {
        const { date, time } = await getLocalTime();
        await sendTelegramShiftEndMessage(closedBy || 'Unknown', date, time);
        await setSetting('shift_ended', 'true');
        await setSetting('shift_closed_by', closedBy || 'Unknown');
        await setSetting('shift_closed_at', `${date} ${time}`);
      } else {
        await setSetting('shift_ended', 'false');
        await setSetting('shift_closed_by', '');
        await setSetting('shift_closed_at', '');
      }

      return jsonResponse({ success: true, channel: ended ? 'telegram' : 'none' });
    }

    if (path === '/api/categories' && method === 'GET') {
      const categories = await queryMany<EntityRow>(
        supabase.from('categories').select('*').order('name', { ascending: true }),
        'list categories',
      );
      return jsonResponse(categories);
    }

    if (path === '/api/categories' && method === 'POST') {
      const category = await queryOne<EntityRow>(
        supabase.from('categories').insert({ name: body.name }).select('*').single(),
        'create category',
      );
      return jsonResponse(category);
    }

    const categoryMatch = path.match(/^\/api\/categories\/(.+)$/);
    if (categoryMatch && method === 'PUT') {
      await execute(
        supabase.from('categories').update({ name: body.name }).eq('id', categoryMatch[1]),
        'update category',
      );
      return jsonResponse({ success: true });
    }

    if (categoryMatch && method === 'DELETE') {
      await execute(supabase.from('categories').delete().eq('id', categoryMatch[1]), 'delete category');
      return jsonResponse({ success: true });
    }

    if (path === '/api/time-slots' && method === 'GET') {
      const timeSlots = await queryMany<EntityRow>(
        supabase.from('time_slots').select('*').order('name', { ascending: true }),
        'list time slots',
      );
      return jsonResponse(timeSlots);
    }

    if (path === '/api/time-slots' && method === 'POST') {
      const slot = await queryOne<EntityRow>(
        supabase.from('time_slots').insert({ name: body.name }).select('*').single(),
        'create time slot',
      );
      return jsonResponse(slot);
    }

    const slotMatch = path.match(/^\/api\/time-slots\/(.+)$/);
    if (slotMatch && method === 'PUT') {
      await execute(
        supabase.from('time_slots').update({ name: body.name }).eq('id', slotMatch[1]),
        'update time slot',
      );
      return jsonResponse({ success: true });
    }

    if (slotMatch && method === 'DELETE') {
      await execute(supabase.from('time_slots').delete().eq('id', slotMatch[1]), 'delete time slot');
      return jsonResponse({ success: true });
    }

    if (path === '/api/staff' && method === 'GET') {
      const staff = await queryMany<EntityRow>(
        supabase.from('staff').select('*').eq('isActive', true).order('name', { ascending: true }),
        'list staff',
      );
      return jsonResponse(staff);
    }

    if (path === '/api/staff' && method === 'POST') {
      const staff = await queryOne<EntityRow>(
        supabase.from('staff').insert({ name: body.name, isActive: true }).select('*').single(),
        'create staff',
      );
      return jsonResponse(staff);
    }

    const staffMatch = path.match(/^\/api\/staff\/(.+)$/);
    if (staffMatch && method === 'PUT') {
      await execute(
        supabase.from('staff').update({ name: body.name }).eq('id', staffMatch[1]),
        'update staff',
      );
      return jsonResponse({ success: true });
    }

    if (staffMatch && method === 'DELETE') {
      await execute(
        supabase.from('staff').update({ isActive: false }).eq('id', staffMatch[1]),
        'deactivate staff',
      );
      return jsonResponse({ success: true });
    }

    if (path === '/api/tasks' && method === 'GET') {
      const tasks = await queryMany<EntityRow>(
        supabase.from('tasks').select('*').eq('isActive', true),
        'list tasks',
      );
      return jsonResponse(tasks);
    }

    if (path === '/api/tasks' && method === 'POST') {
      const { name, category, timeSlot } = body;
      const task = await queryOne<EntityRow>(
        supabase.from('tasks').insert({ name, category, timeSlot, isActive: true }).select('*').single(),
        'create task',
      );
      return jsonResponse(task);
    }

    const taskMatch = path.match(/^\/api\/tasks\/(.+)$/);
    if (taskMatch && method === 'PUT') {
      await execute(
        supabase
          .from('tasks')
          .update({ name: body.name, category: body.category, timeSlot: body.timeSlot })
          .eq('id', taskMatch[1]),
        'update task',
      );
      return jsonResponse({ success: true });
    }

    if (taskMatch && method === 'DELETE') {
      await execute(
        supabase.from('tasks').update({ isActive: false }).eq('id', taskMatch[1]),
        'deactivate task',
      );
      return jsonResponse({ success: true });
    }

    if (path === '/api/logs' && method === 'GET') {
      const date = String(url.searchParams.get('date') ?? '');
      const logs = await queryMany<EntityRow>(
        supabase.from('logs').select('*').eq('date', date).order('timestamp', { ascending: false }),
        'list logs',
      );
      return jsonResponse(logs);
    }

    if (path === '/api/temperature-logs' && method === 'GET') {
      const date = String(url.searchParams.get('date') ?? '');
      const logs = await queryMany<EntityRow>(
        supabase.from('temperature_logs').select('*').eq('date', date).order('timestamp', { ascending: false }),
        'list temperature logs',
      );
      return jsonResponse(logs);
    }

    if (path === '/api/temperature-logs' && method === 'POST') {
      const { date, time: timestamp } = await getLocalTime();
      const { type, location, temperature, staffId, staffName } = body;
      const log = await queryOne<EntityRow>(
        supabase
          .from('temperature_logs')
          .insert({ date, type, location, temperature, staffId, staffName, timestamp })
          .select('*')
          .single(),
        'create temperature log',
      );
      return jsonResponse(log);
    }

    const taskLogMatch = path.match(/^\/api\/logs\/task\/(.+)$/);
    if (taskLogMatch && method === 'DELETE') {
      const { date } = await getLocalTime();
      await execute(
        supabase.from('logs').delete().eq('taskId', taskLogMatch[1]).eq('date', date),
        'delete log by task',
      );
      return jsonResponse({ success: true });
    }

    if (path === '/api/logs' && method === 'POST') {
      const { date, time: timestamp } = await getLocalTime();
      const { taskId, staffId, taskName, staffName } = body;
      const existing = await queryOne<{ id: string | number }>(
        supabase.from('logs').select('id').eq('taskId', taskId).eq('date', date).limit(1).maybeSingle(),
        'check existing log',
      );

      if (existing) {
        return jsonResponse({ error: 'Task already completed today' }, 400);
      }

      const log = await queryOne<EntityRow>(
        supabase.from('logs').insert({ date, taskId, staffId, taskName, staffName, timestamp }).select('*').single(),
        'create log',
      );
      return jsonResponse(log);
    }

    const logMatch = path.match(/^\/api\/logs\/(.+)$/);
    if (logMatch && method === 'DELETE') {
      await execute(supabase.from('logs').delete().eq('id', logMatch[1]), 'delete log');
      return jsonResponse({ success: true });
    }

    const tempLogMatch = path.match(/^\/api\/temperature-logs\/(.+)$/);
    if (tempLogMatch && method === 'DELETE') {
      await execute(supabase.from('temperature_logs').delete().eq('id', tempLogMatch[1]), 'delete temperature log');
      return jsonResponse({ success: true });
    }

    if (path === '/api/checklist' && method === 'GET') {
      const { date } = await getLocalTime();
      const [tasks, logs] = await Promise.all([
        queryMany<EntityRow>(supabase.from('tasks').select('*').eq('isActive', true), 'list checklist tasks'),
        queryMany<EntityRow>(supabase.from('logs').select('*').eq('date', date), 'list checklist logs'),
      ]);
      return jsonResponse(attachCompleted(tasks, logs));
    }

    if (path === '/api/bootstrap' && method === 'GET') {
      const { date } = await getLocalTime();
      const [staff, categories, timeSlots, tasks, logs, settings] = await Promise.all([
        queryMany<EntityRow>(
          supabase.from('staff').select('*').eq('isActive', true).order('name', { ascending: true }),
          'bootstrap staff',
        ),
        queryMany<EntityRow>(
          supabase.from('categories').select('*').order('name', { ascending: true }),
          'bootstrap categories',
        ),
        queryMany<EntityRow>(
          supabase.from('time_slots').select('*').order('name', { ascending: true }),
          'bootstrap time slots',
        ),
        queryMany<EntityRow>(supabase.from('tasks').select('*').eq('isActive', true), 'bootstrap tasks'),
        queryMany<EntityRow>(supabase.from('logs').select('*').eq('date', date), 'bootstrap logs'),
        fetchSettingsMap(),
      ]);

      return jsonResponse({
        staff,
        categories,
        timeSlots,
        tasks,
        checklist: attachCompleted(tasks, logs),
        settings,
        shiftStatus: {
          ended: settings.shift_ended === 'true',
          closedBy: settings.shift_closed_by || null,
        },
        adminPin: { pin: settings.admin_pin },
      });
    }

    return jsonResponse({ error: `Route not found: ${method} ${path}` }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message || 'Internal error' }, 500);
  }
}
