/* Nefa Chat - iPad App conectada a Supabase Realtime (ES5) */
(function () {
  'use strict';

  // ⚠️ REEMPLAZA ESTO CON TUS CREDENCIALES DE SUPABASE (Project Settings > API)
  var SUPABASE_URL = 'https://fedzgvgobjeokxfhvmok.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZHpndmdvYmplb2t4Zmh2bW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzE4OTksImV4cCI6MjExMDEwNzg5OX0.tnxHWDOWQySJ8VDIQhYX5hmVHGvJCD7UlMrw7XeI2ZY';

  // Inicializamos Supabase
  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var state = {
    user: '',
    activeTab: 'channels',
    currentChatId: null,
    channels: [],
    members: [
      { id: 'usr-1', name: 'Ariel Diaz', role: 'Co-Founder' },
      { id: 'usr-2', name: 'Melany', role: 'Atención' }
    ]
  };

  var ui = {};
  ['login', 'app', 'login-form', 'username', 'user-display-name', 'user-initials', 
   'logout-btn', 'tab-channels', 'tab-dms', 'sidebar-list', 'chat-name', 'chat-desc', 
   'messages-container', 'chat-input', 'send-btn', 'poke-btn'].forEach(function(id) {
    ui[id] = document.getElementById(id);
  });

  function show(node, yes) { node.className = node.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); }

  // --- CONSULTAS A SUPABASE ---
  
  // 1. Traer Canales
  function loadChannels(callback) {
    supabase.from('channels').select('*').order('id').then(function(res) {
      if (res.data) {
        state.channels = res.data;
        if (!state.currentChatId && state.channels.length > 0) {
          state.currentChatId = state.channels[0].id;
        }
        if (callback) callback();
      }
    });
  }

  // 2. Traer Mensajes de un Canal
  function loadMessages() {
    if (!state.currentChatId || state.activeTab !== 'channels') return;
    
    supabase.from('messages')
      .select('*')
      .eq('channel_id', state.currentChatId)
      .order('created_at', { ascending: true })
      .then(function(res) {
        if (res.data) renderMessages(res.data);
      });
  }

  // 3. Enviar Mensaje
  function sendMessage(text, type) {
    var channelId = state.currentChatId;
    if (!channelId) { alert('Selecciona un canal válido'); return; }

    supabase.from('messages').insert([{
      channel_id: channelId,
      sender: state.user,
      text: text,
      type: type || 'text'
    }]).then(function(res) {
      if (res.error) alert('Error al enviar: ' + res.error.message);
    });
  }

  // --- TIEMPO REAL (WEBSOCKETS) ---
  function setupRealtime() {
    supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function(payload) {
        // Si llega un mensaje nuevo al canal actual, lo agregamos
        if (payload.new.channel_id === state.currentChatId) {
          loadMessages(); 
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels' }, function(payload) {
        // Si alguien crea un canal, recargamos la lista
        loadChannels(renderSidebar);
      })
      .subscribe();
  }

  // --- RENDERIZADO ---
  function renderSidebar() {
    ui['sidebar-list'].innerHTML = '';
    var list = state.activeTab === 'channels' ? state.channels : state.members;
    
    list.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'list-item' + (String(state.currentChatId) === String(item.id) ? ' active' : '');
      var icon = state.activeTab === 'channels' ? '# ' : '';
      div.textContent = icon + (item.name);
      
      div.onclick = function() {
        state.currentChatId = item.id;
        renderSidebar();
        updateChatHeader();
        loadMessages();
      };
      ui['sidebar-list'].appendChild(div);
    });
  }

  function updateChatHeader() {
    var isChannel = state.activeTab === 'channels';
    var current = isChannel ? state.channels.find(function(c) { return String(c.id) === String(state.currentChatId); }) 
                            : state.members.find(function(m) { return String(m.id) === String(state.currentChatId); });
    if (!current) return;

    ui['chat-name'].textContent = (isChannel ? '# ' : '') + current.name;
    ui['chat-desc'].textContent = isChannel ? (current.description || '') : current.role;
  }

  function renderMessages(msgs) {
    var container = ui['messages-container'];
    var isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    container.innerHTML = '';
    
    msgs.forEach(function(m) {
      var isMe = (m.sender === state.user);
      var wrapper = document.createElement('div');
      wrapper.className = 'message' + (isMe ? ' is-me' : '');

      if (m.type === 'poke') {
        wrapper.className = '';
        var poke = document.createElement('div');
        poke.className = 'poke-message';
        poke.innerHTML = '🔔 ' + m.sender + ' envió un Zumbido ⚡';
        wrapper.appendChild(poke);
      } else {
        if (!isMe) {
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

    if (isAtBottom) container.scrollTop = container.scrollHeight;
  }

  // --- EVENTOS ---
  ui['login-form'].onsubmit = function(e) {
    e.preventDefault();
    var name = ui.username.value.trim();
    if (!name) return;
    
    state.user = name;
    localStorage.setItem('nefa_user', name);
    ui['user-display-name'].textContent = name;
    ui['user-initials'].textContent = name.substring(0, 2).toUpperCase();
    
    // Forzamos la visualización de la app
    show(ui.login, false);
    show(ui.app, true);
    
    // Cargamos los canales
    loadChannels(function() {
      renderSidebar();
      updateChatHeader();
      loadMessages();
      setupRealtime();
    });
  };

  ui['logout-btn'].onclick = function() {
    localStorage.removeItem('nefa_user');
    window.location.reload();
  };

  ui['tab-channels'].onclick = function() {
    state.activeTab = 'channels';
    state.currentChatId = state.channels.length > 0 ? state.channels[0].id : null;
    ui['tab-channels'].classList.add('active');
    ui['tab-dms'].classList.remove('active');
    renderSidebar();
    updateChatHeader();
    loadMessages();
  };

  ui['send-btn'].onclick = function() {
    var text = ui['chat-input'].value.trim();
    if (text) {
      ui['chat-input'].value = '';
      sendMessage(text, 'text');
    }
  };

  ui['chat-input'].onkeypress = function(e) {
    if (e.key === 'Enter') ui['send-btn'].click();
  };

  ui['poke-btn'].onclick = function() {
    var app = document.getElementById('app');
    app.classList.add('shake-active');
    setTimeout(function() { app.classList.remove('shake-active'); }, 600);
    sendMessage('⚡ ¡ENVIÓ UN ZUMBIDO!', 'poke');
  };

  // --- INICIALIZACIÓN ---
  var savedUser = localStorage.getItem('nefa_user');
  if (savedUser) {
    state.user = savedUser;
    ui['user-display-name'].textContent = savedUser;
    ui['user-initials'].textContent = savedUser.substring(0, 2).toUpperCase();
    show(ui.login, false);
    show(ui.app, true);
    
    loadChannels(function() {
      renderSidebar();
      updateChatHeader();
      loadMessages();
      setupRealtime();
    });
  } else {
    show(ui.login, true);
    show(ui.app, false);
  }

})();