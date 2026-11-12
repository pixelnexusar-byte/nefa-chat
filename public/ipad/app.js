/* Nefa Chat para Safari / iOS 9. ES5 only. */
(function () {
  'use strict';

  var state = { contacts: [], selectedId: null, contactLimit: 70, messageLimit: 70,
    session: null, busy: false, timer: null, generation: 0, messageKey: '',
    filterKey: '', filterValue: '', searchTimer: null, drafts: {},
    sendStatus: {}, sending: false, sendingId: null };
    
  var ids = ['login', 'app', 'login-form', 'username', 'password', 'login-error',
    'login-button', 'sync', 'refresh', 'menu-button', 'menu', 'user-name',
    'logout', 'total', 'active', 'closed', 'notice', 'workspace', 'search',
    'filter', 'result-count', 'contacts', 'welcome', 'selected', 'client-avatar',
    'client-name', 'client-phone', 'client-status', 'messages', 'back',
    'install-app', 'install-dialog', 'close-install', 'reply-form', 'reply-text',
    'send-button', 'send-status'];
    
  var ui = {}, i;
  for (i = 0; i < ids.length; i += 1) { ui[ids[i]] = document.getElementById(ids[i]); }

  function text(node, value) { node.textContent = value === null || value === undefined ? '' : String(value); }
  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function show(node, yes) { node.className = node.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); }
  function make(tag, className, value) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (value !== undefined) { text(node, value); }
    return node;
  }
  function lower(value) { return String(value || '').toLowerCase(); }
  function initial(name) {
    var parts = String(name || '?').replace(/^\s+|\s+$/g, '').split(/\s+/);
    return ((parts[0] || '?').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }
  function formEncode(data) {
    var pairs = [], key;
    for (key in data) { if (Object.prototype.hasOwnProperty.call(data, key)) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
    } }
    return pairs.join('&');
  }

  function request(method, path, data, callback, options) {
    var xhr = new XMLHttpRequest(), ended = false, watchdog, timeout = options && options.timeout || 22000;
    function finish(error, value) {
      if (!ended) { ended = true; if (watchdog) { window.clearTimeout(watchdog); } callback(error, value); }
    }
    if (method === 'GET') { path += (path.indexOf('?') === -1 ? '?' : '&') + '_dcam=' + new Date().getTime(); }
    xhr.open(method, path, true);
    xhr.timeout = timeout;
    xhr.setRequestHeader('Accept', 'application/json');
    if (data !== null) { xhr.setRequestHeader('Content-Type', options && options.json ? 'application/json' : 'application/x-www-form-urlencoded'); }
    xhr.onreadystatechange = function () {
      var parsed;
      if (xhr.readyState !== 4) { return; }
      if (xhr.status === 401 || xhr.status === 403) { finish({ auth: true, message: 'Sesión vencida.' }); return; }
      try { parsed = JSON.parse(xhr.responseText); } catch (ignore) {
        finish({ message: 'Respuesta inválida del servidor.', uncertain: !!(options && options.json) || xhr.status === 0 }); return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish({ message: 'Error del servidor (' + xhr.status + ').', status: xhr.status, uncertain: xhr.status >= 500 }); return;
      }
      finish(null, parsed);
    };
    xhr.onerror = function () { finish({ message: 'Sin conexión.', uncertain: true }); };
    xhr.ontimeout = function () { finish({ message: 'El servidor tardó demasiado.', uncertain: true }); };
    watchdog = window.setTimeout(function () {
      finish({ message: 'Tiempo de espera agotado.', uncertain: true });
      xhr.abort();
    }, timeout + 1000);
    xhr.send(data === null ? null : options && options.json ? JSON.stringify(data) : formEncode(data));
  }

  function loginScreen(message) {
    state.generation += 1; state.session = null; state.contacts = [];
    state.selectedId = null; state.messageKey = ''; state.filterKey = '';
    state.busy = false; state.drafts = {}; state.sendStatus = {}; state.sending = false; state.sendingId = null;
    ui['reply-text'].value = '';
    if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
    clear(ui.contacts); clear(ui.messages);
    text(ui['client-name'], ''); text(ui['client-phone'], ''); text(ui['user-name'], '');
    text(ui.total, '—'); text(ui.active, '—'); text(ui.closed, '—');
    ui.search.value = ''; state.filterValue = '';
    ui['menu-button'].setAttribute('aria-expanded', 'false');
    show(ui.menu, false); show(ui.app, false); show(ui.login, true);
    ui['login-button'].disabled = false; text(ui['login-button'], 'Ingresar a Nefa');
    text(ui['login-error'], message || ''); ui.password.value = '';
  }

  function enter(session) {
    state.session = session;
    show(ui.login, false); show(ui.app, true);
    text(ui['user-name'], session.user.name || session.user.email || 'Mi cuenta');
    loadContacts(false);
  }

  function schedule() {
    if (state.timer) { window.clearTimeout(state.timer); }
    if (state.session && !document.hidden) {
      state.timer = window.setTimeout(function () { loadContacts(false); }, 30000);
    }
  }

  function notify(message) {
    text(ui.notice, message || ''); show(ui.notice, !!message);
    ui.app.className = message ? 'app has-notice' : 'app';
  }

  function loadContacts(manual) {
    var generation = state.generation;
    if (state.busy || !state.session || (!manual && document.hidden)) { schedule(); return; }
    state.busy = true; ui.refresh.disabled = true;
    text(ui.sync, 'Actualizando…');
    
    // AQUI VA TU RUTA DE API DE NEXT.JS PARA OBTENER CONTACTOS
    request('GET', '/api/conversations', null, function (error, data) {
      var now;
      if (generation !== state.generation) { return; }
      state.busy = false; ui.refresh.disabled = false;
      if (error && error.auth) { loginScreen(error.message); return; }
      if (error || Object.prototype.toString.call(data) !== '[object Array]') {
        notify((error && error.message) || 'No se pudieron cargar las conversaciones.');
        text(ui.sync, 'Sin actualizar'); ui.sync.className = 'sync error';
        if (!state.contacts.length) { clear(ui.contacts); ui.contacts.appendChild(make('p', 'empty', 'No se pudieron cargar. Tocá Actualizar.')); }
        if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
        return;
      }
      state.contacts = data;
      notify(''); renderSummary(); renderFilters(); renderContacts(); renderSelected(false);
      now = new Date();
      text(ui.sync, 'Actualizado ' + pad(now.getHours()) + ':' + pad(now.getMinutes()));
      ui.sync.className = 'sync'; schedule();
    });
  }

  function pad(value) { return value < 10 ? '0' + value : String(value); }

  function renderSummary() {
    var active = 0, closed = 0, j, status;
    for (j = 0; j < state.contacts.length; j += 1) {
      status = lower(state.contacts[j].status);
      if (status !== 'closed' && status !== 'cerrado') { active += 1; }
      if (status === 'closed' || status === 'cerrado') { closed += 1; }
    }
    text(ui.total, state.contacts.length); text(ui.active, active); text(ui.closed, closed);
  }

  function renderFilters() {
    var list = [], j, status, option, key;
    for (j = 0; j < state.contacts.length; j += 1) {
      status = state.contacts[j].status;
      if (status && list.indexOf(status) === -1) { list.push(status); }
    }
    list.sort(); key = JSON.stringify(list);
    if (key === state.filterKey) { return; }
    state.filterKey = key; clear(ui.filter);
    option = make('option', '', 'Todos los estados'); option.value = ''; ui.filter.appendChild(option);
    for (j = 0; j < list.length; j += 1) {
      option = make('option', '', list[j]); option.value = list[j]; ui.filter.appendChild(option);
    }
    if (list.indexOf(state.filterValue) === -1) { state.filterValue = ''; }
    ui.filter.value = state.filterValue;
  }

  function filteredContacts() {
    var result = [], q = lower(ui.search.value).replace(/^\s+|\s+$/g, ''), j, c;
    for (j = 0; j < state.contacts.length; j += 1) {
      c = state.contacts[j];
      if (state.filterValue && c.status !== state.filterValue) { continue; }
      if (q && lower((c.name || '') + ' ' + (c.lastMessage || '')).indexOf(q) === -1) { continue; }
      result.push(c);
    }
    return result;
  }

  function renderContacts() {
    var data = filteredContacts(), j, c, button, oldTop = ui.contacts.scrollTop;
    clear(ui.contacts); text(ui['result-count'], data.length);
    for (j = 0; j < Math.min(data.length, state.contactLimit); j += 1) {
      c = data[j]; button = make('button', 'contact' + (String(c.id) === state.selectedId ? ' active' : ''));
      button.type = 'button'; button.setAttribute('data-id', String(c.id));
      button.setAttribute('aria-pressed', String(c.id) === state.selectedId ? 'true' : 'false');
      button.appendChild(make('span', 'avatar', initial(c.name || c.phone)));
      button.appendChild(make('strong', '', c.name || c.phone || 'Sin nombre'));
      button.appendChild(make('time', '', c.time || ''));
      button.appendChild(make('span', 'snippet', c.lastMessage || 'Sin mensajes'));
      button.appendChild(make('span', 'status', c.status || 'Nuevo'));
      ui.contacts.appendChild(button);
    }
    if (!data.length) { ui.contacts.appendChild(make('p', 'empty', 'No hay chats.')); }
    ui.contacts.scrollTop = oldTop;
  }

  function selectedContact() {
    var j;
    for (j = 0; j < state.contacts.length; j += 1) {
      if (String(state.contacts[j].id) === state.selectedId) { return state.contacts[j]; }
    }
    return null;
  }

  function choose(id) {
    if (id !== state.selectedId) { state.messageLimit = 70; state.messageKey = ''; }
    state.selectedId = id;
    ui.workspace.className = 'workspace show-detail';
    renderContacts(); renderSelected(true);
  }

  function renderSelected(force) {
    var c = selectedContact();
    show(ui.welcome, !c); show(ui.selected, !!c);
    if (!c) { clear(ui.messages); state.messageKey = ''; show(ui['reply-form'], false); return; }
    text(ui['client-avatar'], initial(c.name || c.phone));
    text(ui['client-name'], c.name || c.phone || 'Sin nombre');
    text(ui['client-phone'], c.phone ? '+' + String(c.phone).replace(/^\+/, '') : 'Sin teléfono');
    text(ui['client-status'], c.status || 'Nuevo');
    show(ui.messages, true);
    show(ui['reply-form'], true); renderComposer(c);
    renderMessages(c, force);
  }

  function renderComposer(c) {
    var id = String(c.id), status = state.sendStatus[id], value = state.drafts[id] || '', canSend = !!(c.phone || c.jid);
    if (ui['reply-text'].value !== value) { ui['reply-text'].value = value; }
    ui['reply-text'].disabled = !canSend || state.sending && state.sendingId === id;
    ui['send-button'].disabled = !canSend || state.sending || !value.replace(/^\s+|\s+$/g, '');
    text(ui['send-button'], state.sending && state.sendingId === id ? 'Enviando…' : 'Enviar');
    text(ui['send-status'], !canSend ? 'Sin WhatsApp registrado.' : status ? status.message : 'Tu respuesta se envía por WhatsApp.');
    ui['send-status'].className = 'send-status' + (status && status.kind ? ' ' + status.kind : '');
  }

  ui['reply-text'].oninput = function () {
    var c = selectedContact(), id;
    if (!c) { return; }
    id = String(c.id); state.drafts[id] = ui['reply-text'].value;
    if (!state.sending && state.sendStatus[id] && state.sendStatus[id].kind === 'success') { delete state.sendStatus[id]; }
    renderComposer(c);
  };

  ui['reply-form'].onsubmit = function (event) {
    var c = selectedContact(), id, message, generation = state.generation;
    event.preventDefault();
    if (!c || state.sending || (!c.phone && !c.jid)) { return; }
    id = String(c.id); message = (state.drafts[id] || '').replace(/^\s+|\s+$/g, '');
    if (!message || message.length > 12000) { return; }
    state.sending = true; state.sendingId = id;
    state.sendStatus[id] = { message: 'Enviando…' }; renderComposer(c);
    
    // AQUI VA TU RUTA DE API DE NEXT.JS PARA ENVIAR MENSAJES
    request('POST', '/api/send-message', {
      phone: c.phone || c.jid, jid: c.jid || null, message: message, contactId: c.id
    }, function (error, result) {
      var current;
      if (generation !== state.generation) { return; }
      state.sending = false; state.sendingId = null;
      if (error && error.auth) { loginScreen('Sesión vencida.'); return; }
      if (error || !result || result.success !== true) {
        state.sendStatus[id] = { kind: 'error', message: 'No se pudo enviar. Reintentá.' };
      } else {
        state.drafts[id] = '';
        state.sendStatus[id] = { kind: 'success', message: 'Mensaje enviado.' };
        c.lastMessage = message; renderContacts(); loadContacts(true);
      }
      current = selectedContact(); if (current) { renderComposer(current); }
    }, { json: true, timeout: 45000 });
  };

  function dateLabel(value) {
    var date;
    if (!value) { return ''; }
    date = new Date(value);
    if (isNaN(date.getTime())) { return ''; }
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
  }

  function renderMessages(c, force) {
    var all = c.messages || [], start = Math.max(0, all.length - state.messageLimit),
      key = c.id + ':' + start + ':' + JSON.stringify(all.slice(start)), j, m, row, bubble,
      day = '', label, oldTop = ui.messages.scrollTop, oldHeight = ui.messages.scrollHeight,
      atBottom = oldHeight - oldTop - ui.messages.clientHeight < 100;
    if (!force && key === state.messageKey) { return; }
    state.messageKey = key; clear(ui.messages);
    if (!all.length) { ui.messages.appendChild(make('p', 'empty', 'Este chat no tiene mensajes.')); }
    for (j = start; j < all.length; j += 1) {
      m = all[j]; label = dateLabel(m.createdAt);
      if (label && label !== day) { ui.messages.appendChild(make('div', 'day', label)); day = label; }
      row = make('div', 'message-row' + (m.sender === 'me' ? ' mine' : ''));
      bubble = make('div', 'bubble');
      if (m.text) { bubble.appendChild(make('p', '', m.text)); }
      bubble.appendChild(make('time', '', m.time || '')); row.appendChild(bubble); ui.messages.appendChild(row);
    }
    if (force || atBottom) { ui.messages.scrollTop = ui.messages.scrollHeight; }
    else { ui.messages.scrollTop = oldTop; }
  }

  // EVENTOS DE INTERFAZ
  ui['login-form'].onsubmit = function (event) {
    var username = ui.username.value.replace(/^\s+|\s+$/g, ''), password = ui.password.value;
    event.preventDefault();
    if (!username || !password || ui['login-button'].disabled) { return; }
    ui['login-button'].disabled = true; text(ui['login-button'], 'Ingresando…'); text(ui['login-error'], '');
    
    // SI USAS NEXTAUTH, ESTO FUNCIONA IGUAL.
    request('GET', '/api/auth/csrf', null, function (error, csrf) {
      if (error || !csrf || !csrf.csrfToken) { password = ''; loginScreen('No se pudo iniciar acceso.'); return; }
      request('POST', '/api/auth/callback/credentials', { csrfToken: csrf.csrfToken,
        email: username, password: password, json: 'true' }, function (loginError) {
        password = ''; ui.password.value = '';
        if (loginError) { loginScreen('Usuario o contraseña incorrectos.'); return; }
        request('GET', '/api/auth/session', null, function (sessionError, session) {
          if (sessionError || !session || !session.user) { loginScreen('Error de sesión.'); return; }
          enter(session);
        });
      });
    });
  };

  ui.refresh.onclick = function () { loadContacts(true); };
  ui.contacts.onclick = function (event) {
    var node = event.target;
    while (node && node !== ui.contacts) {
      if (node.getAttribute && node.getAttribute('data-id') !== null) { choose(node.getAttribute('data-id')); return; }
      node = node.parentNode;
    }
  };
  ui.search.oninput = function () {
    if (state.searchTimer) { window.clearTimeout(state.searchTimer); }
    state.searchTimer = window.setTimeout(function () { renderContacts(); }, 160);
  };
  ui.filter.onchange = function () { state.filterValue = ui.filter.value; renderContacts(); };
  ui.back.onclick = function () { ui.workspace.className = 'workspace'; };
  ui['menu-button'].onclick = function () {
    var open = ui.menu.className.indexOf('hidden') !== -1;
    show(ui.menu, open); ui['menu-button'].setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  
  function install() { show(ui['install-dialog'], true); show(ui.menu, false); }
  ui['install-app'].onclick = install;
  ui['close-install'].onclick = function () { show(ui['install-dialog'], false); };
  
  ui.logout.onclick = function () {
    ui.logout.disabled = true;
    request('GET', '/api/auth/csrf', null, function (error, csrf) {
      if (error || !csrf || !csrf.csrfToken) { ui.logout.disabled = false; return; }
      request('POST', '/api/auth/signout', { csrfToken: csrf.csrfToken }, function () {
        ui.logout.disabled = false; loginScreen('');
      });
    });
  };

  // INICIO
  if (window.location.protocol === 'file:') {
    loginScreen('Subí estos archivos a la carpeta public/ipad de tu proyecto.');
    ui['login-button'].disabled = true;
  } else {
    request('GET', '/api/auth/session', null, function (error, session) {
      if (error) { loginScreen(''); }
      else if (session && session.user) { enter(session); }
      else { loginScreen(''); }
    });
  }
}());