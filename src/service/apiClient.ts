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

async function getNextSortOrder(table: 'categories' | 'time_slots' | 'staff' | 'tasks') {
  const row = await queryOne<{ sortOrder?: number | null }>(
    supabase.from(table).select('sortOrder').order('sortOrder', { ascending: false }).limit(1).maybeSingle(),
    `get next ${table} sort order`,
  );

  return Number(row?.sortOrder ?? 0) + 1;
}

async function applySortOrder(
  table: 'categories' | 'time_slots' | 'staff' | 'tasks',
  ids: Array<string | number>,
) {
  for (let index = 0; index < ids.length; index += 1) {
    await execute(
      supabase.from(table).update({ sortOrder: index + 1 }).eq('id', ids[index]),
      `reorder ${table}`,
    );
  }
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

  const year = Number(getPart('year'));
  const month = Number(getPart('month'));
  const day = Number(getPart('day'));
  const hour = Number(getPart('hour'));
  const minute = Number(getPart('minute'));
  const second = getPart('second');

  const resetHour = 7;
  const resetMinute = 30;

  const businessDate = new Date(Date.UTC(year, month - 1, day));
  if (hour < resetHour || (hour === resetHour && minute < resetMinute)) {
    businessDate.setUTCDate(businessDate.getUTCDate() - 1);
  }

  const businessYear = businessDate.getUTCFullYear();
  const businessMonth = String(businessDate.getUTCMonth() + 1).padStart(2, '0');
  const businessDay = String(businessDate.getUTCDate()).padStart(2, '0');

  return {
    date: `${businessYear}-${businessMonth}-${businessDay}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second}`,
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

async function resolveTaskAndStaffNames(taskId: string | number, staffId: string | number) {
  const [task, staff] = await Promise.all([
    queryOne<{ name?: string | null }>(
      supabase.from('tasks').select('name').eq('id', taskId).limit(1).maybeSingle(),
      'resolve task name',
    ),
    queryOne<{ name?: string | null }>(
      supabase.from('staff').select('name').eq('id', staffId).limit(1).maybeSingle(),
      'resolve staff name',
    ),
  ]);

  return {
    taskName: task?.name || `Task #${taskId}`,
    staffName: staff?.name || `Staff #${staffId}`,
  };
}

async function resolveStaffName(staffId: string | number) {
  const staff = await queryOne<{ name?: string | null }>(
    supabase.from('staff').select('name').eq('id', staffId).limit(1).maybeSingle(),
    'resolve staff name',
  );
  return staff?.name || `Staff #${staffId}`;
}

function formatChecklistSummary(logs: EntityRow[]) {
  if (logs.length === 0) {
    return 'No checklist items were completed.';
  }

  const lines = logs.slice(0, 20).map((log) => {
    const taskName = String(log.taskName || `Task #${String(log.taskId || '')}`);
    const staffName = String(log.staffName || `Staff #${String(log.staffId || '')}`);
    return `- ${taskName} (${staffName})`;
  });

  if (logs.length > 20) {
    lines.push(`- ...and ${logs.length - 20} more`);
  }

  return lines.join('\n');
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
        const dailyLogs = await queryMany<EntityRow>(
          supabase.from('logs').select('*').eq('date', date).order('timestamp', { ascending: true }),
          'telegram shift summary logs',
        );
        const summary = formatChecklistSummary(dailyLogs);

        await sendTelegramShiftEndMessage(
          closedBy || 'Unknown',
          date,
          time,
        );
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          const detailsResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: `Completed checklist summary for ${date}:\n${summary}`,
            }),
          });
          if (!detailsResponse.ok) {
            const detailsBody = await detailsResponse.text();
            throw new Error(`Telegram API error (${detailsResponse.status}): ${detailsBody}`);
          }
        }
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
        supabase.from('categories').select('*').order('sortOrder', { ascending: true }).order('id', { ascending: true }),
        'list categories',
      );
      return jsonResponse(categories);
    }

    if (path === '/api/categories' && method === 'POST') {
      const nextSortOrder = await getNextSortOrder('categories');
      const category = await queryOne<EntityRow>(
        supabase.from('categories').insert({ name: body.name, sortOrder: nextSortOrder }).select('*').single(),
        'create category',
      );
      return jsonResponse(category);
    }

    if (path === '/api/categories/reorder' && method === 'POST') {
      const categoryIds = Array.isArray(body.categoryIds) ? (body.categoryIds as Array<string | number>) : null;
      if (!categoryIds) {
        return jsonResponse({ error: 'Invalid input' }, 400);
      }
      await applySortOrder('categories', categoryIds);
      return jsonResponse({ success: true });
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
        supabase.from('time_slots').select('*').order('sortOrder', { ascending: true }).order('id', { ascending: true }),
        'list time slots',
      );
      return jsonResponse(timeSlots);
    }

    if (path === '/api/time-slots' && method === 'POST') {
      const nextSortOrder = await getNextSortOrder('time_slots');
      const slot = await queryOne<EntityRow>(
        supabase.from('time_slots').insert({ name: body.name, sortOrder: nextSortOrder }).select('*').single(),
        'create time slot',
      );
      return jsonResponse(slot);
    }

    if (path === '/api/time-slots/reorder' && method === 'POST') {
      const timeSlotIds = Array.isArray(body.timeSlotIds) ? (body.timeSlotIds as Array<string | number>) : null;
      if (!timeSlotIds) {
        return jsonResponse({ error: 'Invalid input' }, 400);
      }
      await applySortOrder('time_slots', timeSlotIds);
      return jsonResponse({ success: true });
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
        supabase.from('staff').select('*').eq('isActive', true).order('sortOrder', { ascending: true }).order('id', { ascending: true }),
        'list staff',
      );
      return jsonResponse(staff);
    }

    if (path === '/api/staff' && method === 'POST') {
      const nextSortOrder = await getNextSortOrder('staff');
      const staff = await queryOne<EntityRow>(
        supabase.from('staff').insert({ name: body.name, isActive: true, sortOrder: nextSortOrder }).select('*').single(),
        'create staff',
      );
      return jsonResponse(staff);
    }

    if (path === '/api/staff/reorder' && method === 'POST') {
      const staffIds = Array.isArray(body.staffIds) ? (body.staffIds as Array<string | number>) : null;
      if (!staffIds) {
        return jsonResponse({ error: 'Invalid input' }, 400);
      }
      await applySortOrder('staff', staffIds);
      return jsonResponse({ success: true });
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
        supabase.from('tasks').select('*').eq('isActive', true).order('sortOrder', { ascending: true }).order('id', { ascending: true }),
        'list tasks',
      );
      return jsonResponse(tasks);
    }

    if (path === '/api/tasks' && method === 'POST') {
      const { name, category, timeSlot } = body;
      const nextSortOrder = await getNextSortOrder('tasks');
      const task = await queryOne<EntityRow>(
        supabase.from('tasks').insert({ name, category, timeSlot, isActive: true, sortOrder: nextSortOrder }).select('*').single(),
        'create task',
      );
      return jsonResponse(task);
    }

    if (path === '/api/tasks/reorder' && method === 'POST') {
      const taskIds = Array.isArray(body.taskIds) ? (body.taskIds as Array<string | number>) : null;
      if (!taskIds) {
        return jsonResponse({ error: 'Invalid input' }, 400);
      }
      await applySortOrder('tasks', taskIds);
      return jsonResponse({ success: true });
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
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      let query = supabase.from('logs').select('*');
      if (startDate && endDate) {
        query = query.gte('date', startDate).lte('date', endDate);
      } else {
        query = query.eq('date', date);
      }
      const logs = await queryMany<EntityRow>(
        query.order('date', { ascending: false }).order('timestamp', { ascending: false }),
        'list logs',
      );
      return jsonResponse(logs);
    }

    if (path === '/api/temperature-logs' && method === 'GET') {
      const date = String(url.searchParams.get('date') ?? '');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      let query = supabase.from('temperature_logs').select('*');
      if (startDate && endDate) {
        query = query.gte('date', startDate).lte('date', endDate);
      } else {
        query = query.eq('date', date);
      }
      const logs = await queryMany<EntityRow>(
        query.order('date', { ascending: false }).order('timestamp', { ascending: false }),
        'list temperature logs',
      );
      return jsonResponse(logs);
    }

    if (path === '/api/temperature-logs' && method === 'POST') {
      const { date, time: timestamp } = await getLocalTime();
      const { type, location, temperature, staffId } = body;
      const staffName = await resolveStaffName(String(staffId));
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
      const { taskId, staffId } = body;
      const existing = await queryOne<{ id: string | number }>(
        supabase.from('logs').select('id').eq('taskId', taskId).eq('date', date).limit(1).maybeSingle(),
        'check existing log',
      );

      if (existing) {
        return jsonResponse({ error: 'Task already completed today' }, 400);
      }

      const { taskName, staffName } = await resolveTaskAndStaffNames(String(taskId), String(staffId));

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
        queryMany<EntityRow>(
          supabase.from('tasks').select('*').eq('isActive', true).order('sortOrder', { ascending: true }).order('id', { ascending: true }),
          'list checklist tasks',
        ),
        queryMany<EntityRow>(supabase.from('logs').select('*').eq('date', date), 'list checklist logs'),
      ]);
      return jsonResponse(attachCompleted(tasks, logs));
    }

    if (path === '/api/bootstrap' && method === 'GET') {
      const { date } = await getLocalTime();
      const [staff, categories, timeSlots, tasks, logs, settings] = await Promise.all([
        queryMany<EntityRow>(
          supabase.from('staff').select('*').eq('isActive', true).order('sortOrder', { ascending: true }).order('id', { ascending: true }),
          'bootstrap staff',
        ),
        queryMany<EntityRow>(
          supabase.from('categories').select('*').order('sortOrder', { ascending: true }).order('id', { ascending: true }),
          'bootstrap categories',
        ),
        queryMany<EntityRow>(
          supabase.from('time_slots').select('*').order('sortOrder', { ascending: true }).order('id', { ascending: true }),
          'bootstrap time slots',
        ),
        queryMany<EntityRow>(
          supabase.from('tasks').select('*').eq('isActive', true).order('sortOrder', { ascending: true }).order('id', { ascending: true }),
          'bootstrap tasks',
        ),
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
