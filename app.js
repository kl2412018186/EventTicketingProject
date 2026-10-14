(() => {
  'use strict';

  const API = '../api/index.php';

  const $ = (s) => document.querySelector(s);

  const state = {
    token: '',
    user: null,
    page: 'overview',
    events: [],
    venues: [],
    bookings: [],
    users: [],
    holidays: [],
    search: '',
    pageNo: 1,
    limit: 5,
    modal: null
  };

  const role = () => String(state.user?.role || '').toLowerCase();

  const isAdmin = () => role() === 'administrator';
  const isOrganiser = () => role() === 'organiser';
  const isStaff = () => role() === 'staff';
  const isCustomer = () => role() === 'customer';

  const canManageEvents = () => isAdmin() || isOrganiser();
  const canManageVenues = () => isAdmin();

  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const money = (v) =>
    'RM ' + Number(v || 0).toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const dateTime = (v) => {
    if (!v) return '—';

    const d = new Date(String(v).replace(' ', 'T'));

    return isNaN(d)
      ? esc(v)
      : d.toLocaleString('en-MY', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
  };

  const dateParts = (v) => {
    if (!v) return ['—', ''];

    const d = new Date(String(v).replace(' ', 'T'));

    return isNaN(d)
      ? [esc(v), '']
      : [
          d.toLocaleDateString('en', { day: '2-digit' }),
          d.toLocaleDateString('en', { month: 'short' })
        ];
  };

  function toast(message, error = false) {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast show' + (error ? ' error' : '');

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => el.className = 'toast', 3200);
  }

  async function request(path = '', options = {}) {
    const headers = {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.token ? { 'Authorization': 'Bearer ' + state.token } : {}),
      ...(options.headers || {})
    };

    let res;

    try {
      res = await fetch(API + path, { ...options, headers });
    } catch (e) {
      throw new Error(
        'Cannot connect to the API. Make sure Apache and MySQL are running in XAMPP.'
      );
    }

    const raw = await res.text();
    let data;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        'The API returned an unreadable response. Check api/index.php and PHP errors.'
      );
    }

    if (!res.ok || data.success === false) {
      if (res.status === 401 && state.token) {
        logout(false);
      }

      throw new Error(data.message || ('Request failed (' + res.status + ').'));
    }

    return data;
  }

  function showLogin() {
    $('#loginScreen').classList.remove('hidden');
    $('#appShell').classList.add('hidden');
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#appShell').classList.remove('hidden');

    $('#userName').textContent =
      state.user?.name || state.user?.email || 'User';

    const roleLabels = {
      customer: 'Student',
      administrator: 'Administrator',
      organiser: 'Organiser',
      staff: 'Staff'
    };

    $('#userRole').textContent =
      roleLabels[String(state.user?.role || '').toLowerCase()] || 'User';

    $('#avatar').textContent =
      (state.user?.name || state.user?.email || 'U')
        .trim()
        .charAt(0)
        .toUpperCase();

    configureNav();
    renderPage();
  }

  function configureNav() {
    document.querySelectorAll('#nav [data-page]').forEach(btn => {
      const p = btn.dataset.page;
      btn.classList.toggle('hidden', p === 'users' && !isAdmin());
    });
  }

  function logout(showMessage = true) {
    state.token = '';
    state.user = null;

    sessionStorage.removeItem('evently_token');
    sessionStorage.removeItem('evently_user');

    showLogin();

    if (showMessage) toast('You have signed out.');
  }

  async function loadData(resource, query = '') {
    const d = await request('/' + resource + query);
    return Array.isArray(d.data) ? d.data : [];
  }

  function setPage(page) {
    state.page = page;
    state.search = '';
    state.pageNo = 1;

    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.page === page);
    });

    renderPage();
  }

  function titleFor(p) {
    return ({
      overview: 'Overview',
      events: 'Events',
      venues: 'Venues',
      bookings: 'Bookings',
      users: 'Users',
      holidays: 'Malaysia Holidays'
    })[p] || 'Overview';
  }

  function shell(content) {
    $('#crumb').textContent = titleFor(state.page);
    $('#pageTitle').textContent = titleFor(state.page);
    $('#pageContent').innerHTML = content;
  }

  function loading() {
    shell('<div class="panel loading"><div class="spinner"></div>Loading your workspace…</div>');
  }

  async function renderPage() {
    if (!state.user) return;

    loading();

    try {
      if (state.page === 'overview') await renderOverview();
      else if (state.page === 'events') await renderEvents();
      else if (state.page === 'venues') await renderVenues();
      else if (state.page === 'bookings') await renderBookings();
      else if (state.page === 'users') await renderUsers();
      else if (state.page === 'holidays') await renderHolidays();
    } catch (e) {
      shell(`
        <div class="panel empty-state">
          <div class="empty-icon">⚠</div>
          <strong>Could not load ${esc(titleFor(state.page).toLowerCase())}</strong>
          <p>${esc(e.message)}</p>
          <button class="btn btn-primary btn-small" onclick="window.eventlyRetry()">Try again →</button>
        </div>
      `);
    }
  }

  window.eventlyRetry = () => renderPage();

  function welcome() {
    return `
      <div class="welcome-row">
        <div>
          <h2>Welcome back, ${esc((state.user?.name || 'there').split(' ')[0])} 👋</h2>
          <p>Here’s what’s happening with your events today.</p>
        </div>
        <span class="welcome-tag">${esc(role())} workspace</span>
      </div>
    `;
  }

  function stat(label, num, icon, foot) {
    return `
      <div class="stat-card">
        <div class="stat-top">${label}<span class="stat-icon">${icon}</span></div>
        <div class="stat-number">${num}</div>
        <div class="stat-foot">${foot}</div>
      </div>
    `;
  }

  async function renderOverview() {
    const [events, bookings, venues, users] = await Promise.all([
      loadData('events', '?page=1&limit=50'),
      loadData('bookings'),
      loadData('venues'),
      isAdmin() ? loadData('users') : Promise.resolve([])
    ]);

    state.events = events;
    state.bookings = bookings;
    state.venues = venues;
    state.users = users;

    const pending = bookings.filter(
      b => String(b.booking_status).toLowerCase() === 'pending'
    ).length;

    const statUsers = isAdmin() ? users.length : '—';

    const stats = `
      <div class="stats-grid">
        ${stat('Total events', events.length, '◈', 'Events in the system')}
        ${stat('Total bookings', bookings.length, '▤', 'Bookings you can access')}
        ${stat('Venues', venues.length, '⌂', 'Available event venues')}
        ${stat(
          isAdmin() ? 'Registered users' : 'Pending bookings',
          isAdmin() ? statUsers : pending,
          isAdmin() ? '♙' : '◷',
          isAdmin() ? 'Across all roles' : 'Awaiting confirmation'
        )}
      </div>
    `;

    const recent = events.slice(0, 5).map(e => {
      const d = dateParts(e.event_date);

      return `
        <div class="event-mini">
          <div class="date-block">
            <b>${d[0]}</b>
            <small>${d[1]}</small>
          </div>
          <div class="event-mini-info">
            <strong>${esc(e.event_name)}</strong>
            <small>${esc(e.venue_name || 'Venue details')} · ${dateTime(e.event_date)}</small>
          </div>
          <span class="price">${money(e.ticket_price)}</span>
        </div>
      `;
    }).join('') || '<div class="empty-state">No events found yet.</div>';

    shell(`
      ${welcome()}
      ${stats}
      <div class="dashboard-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h3>Latest events</h3>
              <p>Explore what’s coming up next</p>
            </div>
            <button class="text-button" data-go="events">View all →</button>
          </div>
          <div class="event-mini-list">${recent}</div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h3>Quick actions</h3>
              <p>Jump straight into your workspace</p>
            </div>
          </div>
          <div class="quick-grid">
            <button class="quick-action" data-go="events">
              <div class="quick-icon">◈</div>
              <strong>Browse events</strong>
              <small>Search and explore events</small>
            </button>
            <button class="quick-action" data-go="bookings">
              <div class="quick-icon">▤</div>
              <strong>${isCustomer() ? 'My bookings' : 'Bookings'}</strong>
              <small>Review booking records</small>
            </button>
            ${canManageEvents() ? `
              <button class="quick-action" data-create="event">
                <div class="quick-icon">＋</div>
                <strong>Create event</strong>
                <small>Add a new event</small>
              </button>
            ` : ''}
            ${canManageVenues() ? `
              <button class="quick-action" data-go="venues">
                <div class="quick-icon">⌂</div>
                <strong>Manage venues</strong>
                <small>Update venue information</small>
              </button>
            ` : ''}
            <button class="quick-action" data-go="holidays">
              <div class="quick-icon">☼</div>
              <strong>Public holidays</strong>
              <small>Check Malaysia holidays</small>
            </button>
          </div>
        </section>
      </div>
    `);
  }

  function toolbar(searchPlaceholder, addText, addType) {
    return `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <span class="search-symbol">⌕</span>
            <input id="tableSearch" type="search" placeholder="${searchPlaceholder}" value="${esc(state.search)}">
          </div>
        </div>
        ${addText ? `
          <button class="btn btn-primary btn-small" data-create="${addType}">
            ＋ ${addText}
          </button>
        ` : ''}
      </div>
    `;
  }

  function statusPill(status) {
    const s = String(status || 'unknown').toLowerCase();
    return `<span class="pill ${esc(s)}">${esc(s)}</span>`;
  }

  function tablePage(subtitle, toolbarHtml, headers, rows, emptyText) {
    return `
      <div class="welcome-row">
        <div>
          <h2>${esc(titleFor(state.page))}</h2>
          <p>${esc(subtitle)}</p>
        </div>
      </div>
      ${toolbarHtml}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows || `
              <tr>
                <td colspan="${headers.length}">
                  <div class="empty-state">
                    <div class="empty-icon">⌕</div>
                    <strong>${esc(emptyText || 'No records found')}</strong>
                    <p>Try changing your search or add a record if your role allows it.</p>
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
        <div class="table-footer">
          <span>Showing ${rows ? (state.limit === -1 ? 'all records' : 'matching records') : '0 records'}</span>
          <div class="pager">
            <button id="prevPage" ${state.pageNo <= 1 ? 'disabled' : ''}>← Previous</button>
            <button class="active">${state.pageNo}</button>
            <button id="nextPage">Next →</button>
          </div>
        </div>
      </div>
    `;
  }

  async function renderEvents() {
    const data = await request(
      '/events?page=' + state.pageNo +
      '&limit=50&search=' + encodeURIComponent(state.search)
    );

    state.events = data.data || [];

    const rows = state.events.map(e => `
      <tr>
        <td>
          <span class="table-primary">${esc(e.event_name)}</span>
          <span class="table-secondary">#EV-${e.event_id}</span>
        </td>
        <td>${esc(e.venue_name || ('Venue #' + e.venue_id))}</td>
        <td>${dateTime(e.event_date)}</td>
        <td><strong>${money(e.ticket_price)}</strong></td>
        <td>${esc(e.available_tickets)}</td>
        <td>
          ${canManageEvents() ? `
            <div class="row-actions">
              <button class="action-btn" data-edit="event" data-id="${e.event_id}">Edit</button>
              <button class="action-btn delete" data-delete="event" data-id="${e.event_id}">Delete</button>
            </div>
          ` : isCustomer() ? `
            <button class="btn btn-primary btn-small" data-book-event="${e.event_id}">Book</button>
          ` : '<span class="pill">View only</span>'}
        </td>
      </tr>
    `).join('');

    shell(tablePage(
      'Browse, search and manage event listings.',
      toolbar('Search event name…', canManageEvents() ? 'Add event' : '', 'event'),
      ['Event', 'Venue', 'Date & time', 'Ticket price', 'Available', 'Actions'],
      rows,
      'No events found'
    ));

    bindSearch();
    bindPager(data.total_pages || 1);
  }

  async function renderVenues() {
    state.venues = await loadData('venues');

    const filtered = state.venues.filter(v =>
      JSON.stringify(v).toLowerCase().includes(state.search.toLowerCase())
    );

    const rows = filtered.map(v => `
      <tr>
        <td>
          <span class="table-primary">${esc(v.venue_name)}</span>
          <span class="table-secondary">#VN-${v.venue_id}</span>
        </td>
        <td>${esc(v.location)}</td>
        <td>${esc(v.capacity)}</td>
        <td>${esc(v.description || '—')}</td>
        <td>
          ${canManageVenues() ? `
            <div class="row-actions">
              <button class="action-btn" data-edit="venue" data-id="${v.venue_id}">Edit</button>
              <button class="action-btn delete" data-delete="venue" data-id="${v.venue_id}">Delete</button>
            </div>
          ` : '<span class="pill">View only</span>'}
        </td>
      </tr>
    `).join('');

    shell(tablePage(
      'Venue details and capacity for your events.',
      toolbar('Search venue or location…', canManageVenues() ? 'Add venue' : '', 'venue'),
      ['Venue', 'Location', 'Capacity', 'Description', 'Actions'],
      rows,
      'No venues found'
    ));

    bindSearch(false);
    bindPager(1);
  }

  async function renderBookings() {
    state.bookings = await loadData('bookings');

    const filtered = state.bookings.filter(b =>
      JSON.stringify(b).toLowerCase().includes(state.search.toLowerCase())
    );

    const rows = filtered.map(b => `
      <tr>
        <td>
          <span class="table-primary">#BK-${esc(b.booking_id)}</span>
          <span class="table-secondary">${dateTime(b.created_at)}</span>
        </td>
        <td>
          <span class="table-primary">${esc(b.customer_name || ('User #' + b.user_id))}</span>
          <span class="table-secondary">User ID: ${esc(b.user_id)}</span>
        </td>
        <td>${esc(b.event_name || ('Event #' + b.event_id))}</td>
        <td>${esc(b.quantity)}</td>
        <td><strong>${money(b.total_price)}</strong></td>
        <td>${statusPill(b.booking_status)}</td>
        <td>
          <div class="row-actions">
            ${(!isCustomer() && (isAdmin() || isOrganiser() || isStaff())) ? `
              <button class="action-btn" data-edit="booking" data-id="${b.booking_id}">Update</button>
            ` : ''}
            ${(isAdmin() || isCustomer()) ? `
              <button class="action-btn delete" data-delete="booking" data-id="${b.booking_id}">Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    shell(tablePage(
      isCustomer()
        ? 'Review your own ticket bookings.'
        : 'Review and manage bookings according to your role.',
      toolbar('Search booking, customer or event…', '', ''),
      ['Booking', 'Customer', 'Event', 'Qty', 'Total', 'Status', 'Actions'],
      rows,
      'No bookings found'
    ));

    bindSearch(false);
    bindPager(1);
  }

  async function renderUsers() {
    if (!isAdmin()) {
      throw new Error('Only administrators can access user records.');
    }

    state.users = await loadData('users');

    const filtered = state.users.filter(u =>
      JSON.stringify(u).toLowerCase().includes(state.search.toLowerCase())
    );

    const rows = filtered.map(u => `
      <tr>
        <td>
          <span class="table-primary">${esc(u.name)}</span>
          <span class="table-secondary">#US-${u.user_id}</span>
        </td>
        <td>${esc(u.email)}</td>
        <td>
          <span class="pill ${u.role === 'administrator' ? 'admin' : ''}">
            ${esc(u.role)}
          </span>
        </td>
        <td>
          <div class="row-actions">
            <button class="action-btn" data-edit="user" data-id="${u.user_id}">Edit</button>
            ${Number(u.user_id) !== Number(state.user.user_id) ? `
              <button class="action-btn delete" data-delete="user" data-id="${u.user_id}">Delete</button>
            ` : '<span class="table-secondary">Your account</span>'}
          </div>
        </td>
      </tr>
    `).join('');

    shell(tablePage(
      'Manage registered accounts and their access roles.',
      toolbar('Search name, email or role…', 'Add user', 'user'),
      ['User', 'Email', 'Role', 'Actions'],
      rows,
      'No users found'
    ));

    bindSearch(false);
    bindPager(1);
  }

  async function renderHolidays() {
    const d = await request('/holidays?year=' + new Date().getFullYear());

    state.holidays = d.data || [];

    const cards = state.holidays.map(h => {
      const date = h.date || h.holiday_date || h.start_date || '';
      const dp = date ? date.split('-') : [];

      return `
        <div class="holiday-card">
          <div class="holiday-date">
            <strong>${esc(dp[2] || '—')}</strong>
            ${esc(dp[1] || '')}
          </div>
          <div>
            <h4>${esc(h.name || h.holiday || h.localName || 'Public holiday')}</h4>
            <p>${esc(date || h.date || 'Malaysia')} ${h.type ? '· ' + esc(h.type) : ''}</p>
          </div>
        </div>
      `;
    }).join('');

    shell(`
      <div class="welcome-row">
        <div>
          <h2>Malaysia public holidays</h2>
          <p>Holiday information provided by the external API service.</p>
        </div>
        <span class="welcome-tag">${new Date().getFullYear()} · ${state.holidays.length} records</span>
      </div>
      <div class="notice">
        <strong>External API connected.</strong>
        This page requests current-year holiday data from the Malaysia Holiday API through your PHP backend.
      </div>
      <div class="holiday-grid">
        ${cards || '<div class="panel">No holiday records returned.</div>'}
      </div>
    `);
  }

  function bindSearch(reload = true) {
    const input = $('#tableSearch');
    if (!input) return;

    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        state.search = input.value;
        state.pageNo = 1;
        renderPage();
      }, 250);
    });
  }

  function bindPager(total) {
    const prev = $('#prevPage');
    const next = $('#nextPage');

    if (prev) {
      prev.onclick = () => {
        if (state.pageNo > 1) {
          state.pageNo--;
          renderPage();
        }
      };
    }

    if (next) {
      next.onclick = () => {
        if (state.pageNo < total) {
          state.pageNo++;
          renderPage();
        } else {
          toast('You are on the last page.');
        }
      };
    }
  }

  const fields = {
    event: [
      ['venue_id', 'Venue', 'select', 'required'],
      ['event_name', 'Event name', 'text', 'required'],
      ['description', 'Description', 'textarea', 'required'],
      ['event_date', 'Event date and time', 'datetime-local', 'required'],
      ['ticket_price', 'Ticket price (RM)', 'number', 'required'],
      ['available_tickets', 'Available tickets', 'number', 'required']
    ],
    venue: [
      ['venue_name', 'Venue name', 'text', 'required'],
      ['location', 'Location', 'text', 'required'],
      ['capacity', 'Capacity', 'number', 'required'],
      ['description', 'Description', 'textarea', '']
    ],
    user: [
      ['name', 'Full name', 'text', 'required'],
      ['email', 'Email address', 'email', 'required'],
      ['password', 'Password', 'password', ''],
      ['role', 'Role', 'select', 'required']
    ],
    booking: [
      ['user_id', 'Customer user ID', 'number', 'required'],
      ['event_id', 'Event ID', 'number', 'required'],
      ['quantity', 'Ticket quantity', 'number', 'required'],
      ['total_price', 'Total price (RM)', 'number', 'required'],
      ['booking_status', 'Booking status', 'select', 'required']
    ]
  };

  async function openModal(type, id = null, extra = {}) {
    if (
      (type === 'event' && !canManageEvents() && !extra.bookEvent) ||
      (type === 'venue' && !canManageVenues()) ||
      (type === 'user' && !isAdmin()) ||
      (type === 'booking' && !(isAdmin() || isOrganiser() || isStaff()))
    ) {
      toast('Your role cannot perform this action.', true);
      return;
    }

    let record = (type === 'event' && extra.bookEvent)
      ? (state.events.find(x => Number(x.event_id) === Number(extra.bookEvent)) || {})
      : {};

    const list = type === 'event'
      ? state.events
      : type === 'venue'
        ? state.venues
        : type === 'user'
          ? state.users
          : state.bookings;

    if (id) {
      record = list.find(x =>
        Number(x[({
          event: 'event_id',
          venue: 'venue_id',
          user: 'user_id',
          booking: 'booking_id'
        })[type]]) === Number(id)
      ) || {};

      if (!Object.keys(record).length) {
        try {
          const d = await request(
            '/' + ({
              event: 'events',
              venue: 'venues',
              user: 'users',
              booking: 'bookings'
            })[type] + '/' + id
          );

          record = d.data || {};
        } catch (e) {
          toast(e.message, true);
          return;
        }
      }
    }

    if (type === 'event' && extra.bookEvent) {
      record.event_id = extra.bookEvent;
      record.quantity = 1;
    }

    state.modal = { type, id, record, extra };

    $('#modalTitle').textContent =
      (id ? 'Edit ' : 'Add ') +
      ({ event: 'event', venue: 'venue', user: 'user', booking: 'booking' }[type]);

    const listFields = fields[type] || [];
    let html = '';

    for (const [key, label, kind, required] of listFields) {
      let value = record[key] ?? '';

      if (kind === 'datetime-local' && value) {
        value = String(value).replace(' ', 'T').slice(0, 16);
      }

      if (key === 'password' && id) continue;

      const full = kind === 'textarea' || key === 'description' || key === 'event_name';

      html += `
        <div class="${full ? 'field-full' : ''}">
          <label for="f_${key}">
            ${label}${required === 'required' ? ' *' : ''}
          </label>
      `;

      if (kind === 'select') {
        let opts = [];

        if (key === 'venue_id') {
          opts = state.venues.map(v => [v.venue_id, v.venue_name]);
        }

        if (key === 'role') {
          opts = [
            ['administrator', 'Administrator'],
            ['organiser', 'Organiser'],
            ['staff', 'Staff'],
            ['customer', 'Customer']
          ];
        }

        if (key === 'booking_status') {
          opts = [
            ['pending', 'Pending'],
            ['confirmed', 'Confirmed'],
            ['cancelled', 'Cancelled']
          ];
        }

        html += `
          <select id="f_${key}" name="${key}" ${required === 'required' ? 'required' : ''}>
            <option value="">Select ${label.toLowerCase()}</option>
            ${opts.map(([v, t]) => `
              <option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>
                ${esc(t)}
              </option>
            `).join('')}
          </select>
        `;
      } else if (kind === 'textarea') {
        html += `
          <textarea id="f_${key}" name="${key}" rows="3" ${required === 'required' ? 'required' : ''}>${esc(value)}</textarea>
        `;
      } else {
        html += `
          <input
            id="f_${key}"
            name="${key}"
            type="${kind}"
            value="${esc(value)}"
            ${required === 'required' ? 'required' : ''}
            ${kind === 'number' ? 'min="0" step="any"' : ''}
            placeholder="${key === 'password' ? 'Set a password' : ''}"
          >
        `;
      }

      html += '</div>';
    }

    if (type === 'event' && extra.bookEvent) {
      html = `
        <div class="field-full">
          <div class="notice">
            Booking: ${esc(record.event_name || 'Selected event')} · ${money(record.ticket_price)} per ticket
          </div>
        </div>
        <div class="field-full">
          <label for="f_quantity">Ticket quantity *</label>
          <input
            id="f_quantity"
            name="quantity"
            type="number"
            min="1"
            max="${Number(record.available_tickets || 0)}"
            value="1"
            required
          >
        </div>
      `;

      state.modal.type = 'newBooking';
      state.modal.record = record;
    }

    $('#modalFields').innerHTML = html;
    $('#modalLayer').classList.remove('hidden');
  }

  function closeModal() {
    $('#modalLayer').classList.add('hidden');
    state.modal = null;
  }

  async function saveModal(ev) {
    ev.preventDefault();

    if (!state.modal) return;

    const { type, id, record } = state.modal;
    const fd = new FormData(ev.target);
    const values = Object.fromEntries(fd.entries());

    let endpoint = '';
    let method = id ? 'PUT' : 'POST';
    let payload = {};

    try {
      if (type === 'event') {
        endpoint = '/events' + (id ? '/' + id : '');

        payload = {
          venue_id: Number(values.venue_id),
          event_name: values.event_name,
          description: values.description,
          event_date: values.event_date.replace('T', ' ') +
            (values.event_date.length === 16 ? ':00' : ''),
          ticket_price: Number(values.ticket_price),
          available_tickets: Number(values.available_tickets)
        };
      } else if (type === 'venue') {
        endpoint = '/venues' + (id ? '/' + id : '');

        payload = {
          venue_name: values.venue_name,
          location: values.location,
          capacity: Number(values.capacity),
          description: values.description || ''
        };
      } else if (type === 'user') {
        endpoint = '/users' + (id ? '/' + id : '');

        payload = {
          name: values.name,
          email: values.email,
          role: values.role
        };

        if (values.password) payload.password = values.password;

        if (!id && !payload.password) {
          throw new Error('Password is required for a new user.');
        }
      } else if (type === 'booking') {
        endpoint = '/bookings/' + id;

        payload = {
          user_id: Number(values.user_id),
          event_id: Number(values.event_id),
          quantity: Number(values.quantity),
          total_price: Number(values.total_price),
          booking_status: values.booking_status
        };
      } else if (type === 'newBooking') {
        endpoint = '/bookings';
        method = 'POST';

        payload = {
          event_id: Number(record.event_id),
          quantity: Number(values.quantity)
        };
      }

      $('#modalSubmit').disabled = true;
      $('#modalSubmit').textContent = 'Saving…';

      const result = await request(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      closeModal();

      toast(result.message || 'Changes saved successfully.');

      await renderPage();
    } catch (e) {
      toast(e.message, true);
    } finally {
      $('#modalSubmit').disabled = false;
      $('#modalSubmit').innerHTML = 'Save changes <span>→</span>';
    }
  }

  async function deleteRecord(type, id) {
    if (!confirm(`Delete this ${type}? This action cannot be undone.`)) return;

    try {
      const endpoint = ({
        event: 'events',
        venue: 'venues',
        user: 'users',
        booking: 'bookings'
      })[type];

      const d = await request('/' + endpoint + '/' + id, {
        method: 'DELETE'
      });

      toast(d.message || 'Record deleted.');

      await renderPage();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function bookEvent(id) {
    try {
      const d = await request('/events/' + id);
      const ev = d.data;

      if (!ev) {
        toast('Event not found.', true);
        return;
      }

      await openModal('event', null, { bookEvent: id });
    } catch (e) {
      toast(e.message, true);
    }
  }

  function setAuthMode(mode) {
    const registering = mode === 'register';

    $('#loginForm').classList.toggle('hidden', registering);
    $('#registerForm').classList.toggle('hidden', !registering);
    $('#loginSwitch').classList.toggle('hidden', registering);
    $('#registerSwitch').classList.toggle('hidden', !registering);
    $('#loginNote').classList.toggle('hidden', registering);

    $('#authEyebrow').textContent =
      registering ? 'JOIN UPTM EVENT' : 'WELCOME BACK';

    $('#authTitle').textContent =
      registering ? 'Create your account' : 'Sign in to UPTM Event';

    $('#authDescription').textContent =
      registering
        ? 'Register to discover events and manage your bookings.'
        : 'Use your existing Event Ticketing account.';

    $('#loginError').textContent = '';
    $('#registerError').textContent = '';

    if (registering) {
      $('#registerName').focus();
    } else {
      $('#email').focus();
    }
  }

  $('#showRegister').addEventListener('click', () => setAuthMode('register'));
  $('#showLogin').addEventListener('click', () => setAuthMode('login'));

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();

    $('#loginError').textContent = '';

    const button = $('#loginButton');
    button.disabled = true;
    button.textContent = 'Signing in…';

    try {
      const data = await request('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#email').value.trim(),
          password: $('#password').value
        })
      });

      state.token = data.token;
      state.user = data.user;

      sessionStorage.setItem('evently_token', state.token);
      sessionStorage.setItem('evently_user', JSON.stringify(state.user));

      showApp();

      toast('Welcome to UPTM Event, ' + (state.user.name || '') + '!');
    } catch (err) {
      $('#loginError').textContent = err.message;
    } finally {
      button.disabled = false;
      button.innerHTML = 'Sign in <span>→</span>';
    }
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();

    $('#registerError').textContent = '';

    const name = $('#registerName').value.trim();
    const email = $('#registerEmail').value.trim();
    const password = $('#registerPassword').value;
    const confirmPassword = $('#confirmPassword').value;

    if (password.length < 8) {
      $('#registerError').textContent = 'Password must be at least 8 characters long.';
      return;
    }

    if (password !== confirmPassword) {
      $('#registerError').textContent = 'Passwords do not match.';
      $('#confirmPassword').focus();
      return;
    }

    const button = $('#registerButton');
    button.disabled = true;
    button.innerHTML = 'Creating account…';

    try {
      const data = await request('/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      $('#email').value = email;
      $('#password').value = '';

      $('#registerForm').reset();

      setAuthMode('login');

      $('#loginError').textContent = '';

      toast(data.message || 'Account created. You can now sign in.');
    } catch (err) {
      $('#registerError').textContent = err.message;
    } finally {
      button.disabled = false;
      button.innerHTML = 'Create account <span>→</span>';
    }
  });

  $('#togglePassword').addEventListener('click', () => {
    const p = $('#password');

    p.type = p.type === 'password' ? 'text' : 'password';

    $('#togglePassword').textContent =
      p.type === 'password' ? 'Show' : 'Hide';
  });

  $('#logoutButton').addEventListener('click', () => logout());

  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);

  $('#modalLayer').addEventListener('click', e => {
    if (e.target === $('#modalLayer')) closeModal();
  });

  $('#recordForm').addEventListener('submit', saveModal);

  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');

    if (b && !b.classList.contains('hidden')) {
      setPage(b.dataset.page);
    }
  });

  $('#pageContent').addEventListener('click', e => {
    const go = e.target.closest('[data-go]');

    if (go) {
      setPage(go.dataset.go);
      return;
    }

    const create = e.target.closest('[data-create]');

    if (create) {
      openModal(create.dataset.create);
      return;
    }

    const edit = e.target.closest('[data-edit]');

    if (edit) {
      openModal(edit.dataset.edit, edit.dataset.id);
      return;
    }

    const del = e.target.closest('[data-delete]');

    if (del) {
      deleteRecord(del.dataset.delete, del.dataset.id);
      return;
    }

    const book = e.target.closest('[data-book-event]');

    if (book) {
      bookEvent(book.dataset.bookEvent);
      return;
    }
  });

  function restore() {
    const token = sessionStorage.getItem('evently_token');
    const user = sessionStorage.getItem('evently_user');

    if (token && user) {
      try {
        state.token = token;
        state.user = JSON.parse(user);

        showApp();
        return;
      } catch {
        sessionStorage.clear();
      }
    }

    showLogin();
  }

  restore();
})();