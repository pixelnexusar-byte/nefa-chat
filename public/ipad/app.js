(function () {
  'use strict';

  var state = { contacts: [] };
  var ui = {};

  ['login', 'app', 'login-form', 'username', 'user-name', 'logout', 
   'contacts', 'search', 'welcome', 'selected', 'messages', 'reply-form', 
   'reply-text', 'send-button', 'client-name', 'client-avatar', 'menu-button', 
   'menu', 'workspace', 'back', 'detail', 'sync'].forEach(function(id) {
    ui[id] = document.getElementById(id);
  });

  function show(node, yes) { node.className = node.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); }
  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function text(node, val) { node.textContent = val || ''; }
  function make(tag, cls, txt) { var el = document.createElement(tag); if (cls) el.className = cls; if (txt) el.textContent = txt; return el; }
  
  function request(method, url, data, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch(e) { callback(e); }
      } else { callback({ message: 'Error ' + xhr.status }); }
    };
    xhr.onerror = function() { callback({ message: 'Sin conexión' }); };
    xhr.send(data ? JSON.stringify(data) : null);
  }

  // --- LÓGICA DE LOGIN SIMPLE ---
  ui['login-form'].onsubmit = function(e) {
    e.preventDefault();
    var name = ui.username.value.trim();
    if (!name) return;
    
    localStorage.setItem('nefa_user', name);
    ui['user-name'].textContent = name;
    
    show(ui.login, false);
    show(ui.app, true);
    
    loadContacts();
  };

  // --- LÓGICA DE LOGOUT ---
  ui.logout.onclick = function() {
    localStorage.removeItem('nefa_user');
    window.location.reload();
  };

  // --- MENÚ MÓVIL ---
  ui['menu-button'].onclick = function() {
    var open = ui.menu.className.indexOf('hidden') !== -1;
    show(ui.menu, open);
  };

  // --- CARGAR CONTACTOS (CONECTAR CON TU API REAL) ---
  function loadContacts() {
    clear(ui.contacts);
    ui.contacts.appendChild(make('p', 'empty', 'Cargando chats...'));
    text(ui.sync, 'Actualizando...');
    
    // ⚠️ AQUÍ DEBES PONER TU RUTA REAL DE API EN NEXT.JS
    request('GET', '/api/conversations', null, function(err, data) {
      clear(ui.contacts);
      if (err || !data) {
        text(ui.sync, 'Error');
        ui.contacts.appendChild(make('p', 'empty', 'Error al cargar.'));
        return;
      }
      
      text(ui.sync, 'Conectado');
      data.forEach(function(c) {
        var btn = make('button', 'contact');
        btn.onclick = function() { openChat(c); };
        btn.appendChild(make('span', 'avatar', c.name ? c.name.charAt(0).toUpperCase() : '?'));
        var info = make('div');
        info.appendChild(make('strong', '', c.name || 'Sin nombre'));
        info.appendChild(make('span', 'snippet', c.lastMessage || ''));
        btn.appendChild(info);
        ui.contacts.appendChild(btn);
      });
    });
  }

  // --- ABRIR CHAT ---
  function openChat(contact) {
    show(ui.welcome, false);
    show(ui.selected, true);
    ui.workspace.className = 'workspace show-chat';
    
    text(ui['client-name'], contact.name);
    text(ui['client-avatar'], contact.name ? contact.name.charAt(0).toUpperCase() : '?');
    
    clear(ui.messages);
    
    if (contact.messages) {
      contact.messages.forEach(function(m) {
        var row = make('div', 'message-row' + (m.sender === 'me' ? ' mine' : ''));
        var bubble = make('div', 'bubble');
        bubble.appendChild(make('p', '', m.text));
        row.appendChild(bubble);
        ui.messages.appendChild(row);
      });
      ui.messages.scrollTop = ui.messages.scrollHeight;
    }
  }

  // --- BOTÓN VOLVER (MÓVIL) ---
  ui.back.onclick = function() {
    ui.workspace.className = 'workspace';
  };

  // --- ENVIAR MENSAJE (CONECTAR CON TU API REAL) ---
  ui['reply-form'].onsubmit = function(e) {
    e.preventDefault();
    var msg = ui['reply-text'].value.trim();
    if (!msg) return;
    
    // ⚠️ AQUÍ DEBES PONER TU RUTA REAL DE API EN NEXT.JS
    request('POST', '/api/send-message', { message: msg }, function(err, res) {
      if (!err) {
        ui['reply-text'].value = '';
        // Agregamos el mensaje visualmente sin recargar
        var row = make('div', 'message-row mine');
        var bubble = make('div', 'bubble');
        bubble.appendChild(make('p', '', msg));
        row.appendChild(bubble);
        ui.messages.appendChild(row);
        ui.messages.scrollTop = ui.messages.scrollHeight;
      } else {
        alert('Error al enviar mensaje');
      }
    });
  };

  // --- INICIO DE LA APP ---
  var savedUser = localStorage.getItem('nefa_user');
  if (savedUser) {
    ui['user-name'].textContent = savedUser;
    show(ui.login, false);
    show(ui.app, true);
    loadContacts();
  } else {
    show(ui.login, true);
    show(ui.app, false);
  }
  
})();