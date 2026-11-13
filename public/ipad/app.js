(function () {
  'use strict';

  // Datos iniciales basados en tu page.tsx
  var state = {
    user: 'Franco Sierralta',
    activeTab: 'channels',
    currentChatId: 'gen-1',
    channels: [
      { id: 'gen-1', name: 'general', description: 'Coordinación general del equipo', unread: 0 },
      { id: 'gen-2', name: 'logistica-china', description: 'Embarques, contenedores y courier', unread: 2 },
      { id: 'gen-3', name: 'soporte-it', description: 'Sistemas y automatizaciones', unread: 1 }
    ],
    members: [
      { id: 'usr-1', name: 'Ariel Diaz', role: 'Co-Founder / Cotizaciones' },
      { id: 'usr-2', name: 'Melany', role: 'Atención y Promociones' },
      { id: 'usr-3', name: 'Matias', role: 'Ventas y Operaciones' }
    ],
    messages: {
      'gen-1': [
        { id: 1, sender: 'Ariel Diaz', text: 'Buenos días equipo. ¿Cómo venimos con las cotizaciones?', type: 'text', isMe: false },
        { id: 2, sender: 'Franco Sierralta', text: 'Todo en orden por acá. Actualizando valores.', type: 'text', isMe: true }
      ],
      'gen-2': [
        { id: 1, sender: 'Franco Sierralta', text: 'Shipping mark: 船標 DE CHINA AL MUNDO', type: 'text', isMe: true }
      ],
      'usr-1': [
        { id: 1, sender: 'Ariel Diaz', text: 'Franco, ¿revisaste la API de WhatsApp?', type: 'text', isMe: false }
      ]
    }
  };

  var ui = {};
  ['login', 'app', 'login-form', 'username', 'user-display-name', 'user-initials', 
   'logout-btn', 'tab-channels', 'tab-dms', 'sidebar-list', 'chat-name', 'chat-desc', 
   'messages-container', 'chat-input', 'send-btn', 'poke-btn'].forEach(function(id) {
    ui[id] = document.getElementById(id);
  });

  function show(node, yes) { node.className = node.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); }
  
  // Renderiza la lista de Canales o DMs en el sidebar
  function renderSidebar() {
    ui['sidebar-list'].innerHTML = '';
    var list = state.activeTab === 'channels' ? state.channels : state.members;
    
    list.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'list-item' + (state.currentChatId === item.id ? ' active' : '');
      
      var icon = state.activeTab === 'channels' ? '# ' : '';
      div.textContent = icon + (item.name);
      
      div.onclick = function() {
        state.currentChatId = item.id;
        renderSidebar();
        renderChat();
      };
      ui['sidebar-list'].appendChild(div);
    });
  }

  // Renderiza el área central de chat
  function renderChat() {
    var isChannel = state.activeTab === 'channels';
    var current = isChannel ? state.channels.find(function(c) { return c.id === state.currentChatId; }) 
                            : state.members.find(function(m) { return m.id === state.currentChatId; });
    
    if (!current) return;

    ui['chat-name'].textContent = (isChannel ? '# ' : '') + current.name;
    ui['chat-desc'].textContent = isChannel ? current.description : current.role;

    var container = ui['messages-container'];
    container.innerHTML = '';

    var msgs = state.messages[state.currentChatId] || [];
    
    msgs.forEach(function(m) {
      var wrapper = document.createElement('div');
      wrapper.className = 'message' + (m.isMe ? ' is-me' : '');

      if (m.type === 'poke') {
        wrapper.className = ''; // El zumbido va centrado
        var poke = document.createElement('div');
        poke.className = 'poke-message';
        poke.innerHTML = '🔔 ' + m.sender + ' envió un Zumbido ⚡';
        wrapper.appendChild(poke);
      } else {
        if (!m.isMe) {
          var sender = document.createElement('span');
          sender.className = 'message-sender';
          sender.textContent = m.sender;
          wrapper.appendChild(sender);
        }
        var bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = m.text;
        wrapper.appendChild(bubble);
      }
      container.appendChild(wrapper);
    });

    // Auto-scroll al final
    container.scrollTop = container.scrollHeight;
  }

  // Enviar Mensaje
  function sendMessage() {
    var text = ui['chat-input'].value.trim();
    if (!text) return;

    if (!state.messages[state.currentChatId]) state.messages[state.currentChatId] = [];
    
    state.messages[state.currentChatId].push({
      id: Date.now(),
      sender: state.user,
      text: text,
      type: 'text',
      isMe: true
    });

    ui['chat-input'].value = '';
    renderChat();
  }

  // Lógica del Zumbido
  function triggerPoke() {
    var app = document.getElementById('app');
    app.classList.add('shake-active');
    setTimeout(function() { app.classList.remove('shake-active'); }, 600);

    if (!state.messages[state.currentChatId]) state.messages[state.currentChatId] = [];
    
    state.messages[state.currentChatId].push({
      id: Date.now(),
      sender: state.user,
      text: '⚡ ¡ENVIÓ UN ZUMBIDO!',
      type: 'poke',
      isMe: true
    });

    renderChat();
  }

  // --- EVENTOS ---

  // Login
  ui['login-form'].onsubmit = function(e) {
    e.preventDefault();
    var name = ui.username.value.trim();
    if (!name) return;
    
    state.user = name;
    localStorage.setItem('nefa_user', name);
    
    ui['user-display-name'].textContent = name;
    ui['user-initials'].textContent = name.substring(0, 2).toUpperCase();
    
    show(ui.login, false);
    show(ui.app, true);
    renderSidebar();
    renderChat();
  };

  // Logout
  ui['logout-btn'].onclick = function() {
    localStorage.removeItem('nefa_user');
    window.location.reload();
  };

  // Cambio de Pestañas
  ui['tab-channels'].onclick = function() {
    state.activeTab = 'channels';
    state.currentChatId = state.channels[0].id;
    ui['tab-channels'].classList.add('active');
    ui['tab-dms'].classList.remove('active');
    renderSidebar();
    renderChat();
  };

  ui['tab-dms'].onclick = function() {
    state.activeTab = 'dms';
    state.currentChatId = state.members[0].id;
    ui['tab-dms'].classList.add('active');
    ui['tab-channels'].classList.remove('active');
    renderSidebar();
    renderChat();
  };

  // Botones de Chat
  ui['send-btn'].onclick = sendMessage;
  ui['chat-input'].onkeypress = function(e) {
    if (e.key === 'Enter') sendMessage();
  };
  ui['poke-btn'].onclick = triggerPoke;

  // --- INICIALIZACIÓN ---
  var savedUser = localStorage.getItem('nefa_user');
  if (savedUser) {
    state.user = savedUser;
    ui['user-display-name'].textContent = savedUser;
    ui['user-initials'].textContent = savedUser.substring(0, 2).toUpperCase();
    show(ui.login, false);
    show(ui.app, true);
    renderSidebar();
    renderChat();
  } else {
    show(ui.login, true);
    show(ui.app, false);
  }

})();