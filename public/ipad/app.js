/* NEFA Software Chat - ES5 Puro Compatible con iPad 2 (iOS 9) y Celulares */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://fedzgvgobjeokxfhvmok.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZHpndmdvYmplb2t4Zmh2bW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzE4OTksImV4cCI6MjExMDEwNzg5OX0.tnxHWDOWQySJ8VDIQhYX5hmVHGvJCD7UlMrw7XeI2ZY';

  var state = {
    user: '',
    currentChatId: 'gen-1',
    channels: [],
    lastMsgId: null,
    pollTimer: null
  };

  var ui = {};
  var ids = [
    'error-banner', 'login', 'app', 'sidebar', 'login-form', 'username',
    'user-display-name', 'user-initials', 'logout-btn', 'new-channel-btn',
    'sidebar-list', 'chat-name', 'chat-desc', 'messages-container',
    'chat-input', 'send-btn', 'poke-btn', 'menu-btn', 'close-sidebar-btn'
  ];
  for (var i = 0; i < ids.length; i++) {
    ui[ids[i]] = document.getElementById(ids[i]);
  }

  function show(node, yes) {
    if (!node) return;
    var cls = node.className.replace(/\s*hidden\b/g, '');
    node.className = cls + (yes ? '' : ' hidden');
  }

  function showError(msg) {
    if (!ui['error-banner']) return;
    if (!msg) {
      show(ui['error-banner'], false);
      return;
    }
    ui['error-banner'].textContent = msg;
    show(ui['error-banner'], true);
  }

  function getTimeNow() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }

  // Efecto Zumbido MSN (Sacudida + Audio WebKit para iPad + Vibración)
  function triggerMsnNudgeEffect() {
    var appEl = ui['app'];
    appEl.className = appEl.className.replace(/\s*shake-active\b/g, '');
    setTimeout(function () {
      appEl.className = appEl.className + ' shake-active';
    }, 20);
    setTimeout(function () {
      appEl.className = appEl.className.replace(/\s*shake-active\b/g, '');
    }, 900);

    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([120, 40, 120, 40, 200]);
    }

    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        var ctx = new AudioCtx();
        var times = [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.48];
        for (var j = 0; j < times.length; j++) {
          (function (t, idx) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = (idx % 2 === 0) ? 340 : 460;
            gain.gain.value = 0.15;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.06);
          })(times[j], j);
        }
      }
    } catch (e) {}
  }

  // Petición HTTP directa a Supabase REST API (100% compatible con iPad 2 / iOS 9)
  function apiRequest(method, path, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, SUPABASE_URL + '/rest/v1/' + path, true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (method !== 'GET') {
      xhr.setRequestHeader('Prefer', 'return=representation');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          showError(null);
          var data = null;
          try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) {}
          if (callback) callback(null, data);
        } else {
          var errMsg = 'Error HTTP ' + xhr.status;
          try {
            var errObj = JSON.parse(xhr.responseText);
            if (errObj && errObj.message) errMsg = errObj.message;
          } catch (e) {}
          showError('Error Supabase: ' + errMsg);
          if (callback) callback(errMsg, null);
        }
      }
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function findChannelById(id) {
    for (var i = 0; i < state.channels.length; i++) {
      if (String(state.channels[i].id) === String(id)) return state.channels[i];
    }
    return null;
  }

  function loadChannels(callback) {
    apiRequest('GET', 'channels?select=*&order=created_at.asc', null, function (err, data) {
      if (!err && data) {
        state.channels = data;
        if (!findChannelById(state.currentChatId) && data.length > 0) {
          state.currentChatId = data[0].id;
        }
        renderSidebar();
        updateChatHeader();
        if (callback) callback();
      }
    });
  }

  function loadMessages(isInitial) {
    if (!state.currentChatId) return;
    var query = 'messages?select=*&channel_id=eq.' + encodeURIComponent(state.currentChatId) + '&order=created_at.asc';
    apiRequest('GET', query, null, function (err, data) {
      if (!err && data) {
        if (data.length > 0) {
          var newest = data[data.length - 1];
          if (!isInitial && state.lastMsgId && state.lastMsgId !== newest.id) {
            if (newest.type === 'poke' && newest.sender.toLowerCase() !== state.user.toLowerCase()) {
              triggerMsnNudgeEffect();
            }
          }
          state.lastMsgId = newest.id;
        }
        renderMessages(data);
      }
    });
  }

  function sendMessage(text, type) {
    if (!state.currentChatId) return;
    var newMsg = {
      id: 'msg-' + new Date().getTime() + '-' + Math.floor(Math.random() * 9999),
      channel_id: state.currentChatId,
      sender: state.user,
      text: text,
      time: getTimeNow(),
      type: type || 'text'
    };
    state.lastMsgId = newMsg.id;
    apiRequest('POST', 'messages', [newMsg], function (err) {
      if (!err) loadMessages(false);
    });
  }

  function renderSidebar() {
    ui['sidebar-list'].innerHTML = '';
    for (var i = 0; i < state.channels.length; i++) {
      (function (ch) {
        var div = document.createElement('div');
        var isActive = String(state.currentChatId) === String(ch.id);
        div.className = 'list-item' + (isActive ? ' active' : '');

        var titleSpan = document.createElement('span');
        titleSpan.textContent = '# ' + ch.name;
        div.appendChild(titleSpan);

        var actions = document.createElement('div');
        actions.className = 'ch-actions';

        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '✎';
        editBtn.onclick = function (e) {
          e.stopPropagation();
          var newName = prompt('Nuevo nombre del canal:', ch.name);
          if (!newName || !newName.trim()) return;
          var clean = newName.trim().toLowerCase().replace(/\s+/g, '-');
          var newDesc = prompt('Descripción del canal:', ch.description || '');
          apiRequest('PATCH', 'channels?id=eq.' + encodeURIComponent(ch.id), {
            name: clean,
            description: newDesc !== null ? newDesc : ch.description
          }, function () {
            loadChannels();
          });
        };
        actions.appendChild(editBtn);

        if (state.channels.length > 1) {
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.textContent = '✕';
          delBtn.onclick = function (e) {
            e.stopPropagation();
            if (!confirm('¿Eliminar el canal #' + ch.name + '?')) return;
            apiRequest('DELETE', 'channels?id=eq.' + encodeURIComponent(ch.id), null, function () {
              loadChannels(function () { loadMessages(true); });
            });
          };
          actions.appendChild(delBtn);
        }

        div.appendChild(actions);

        div.onclick = function () {
          state.currentChatId = ch.id;
          state.lastMsgId = null;
          ui['sidebar'].className = ui['sidebar'].className.replace(/\s*open\b/g, '');
          renderSidebar();
          updateChatHeader();
          loadMessages(true);
        };

        ui['sidebar-list'].appendChild(div);
      })(state.channels[i]);
    }
  }

  function updateChatHeader() {
    var current = findChannelById(state.currentChatId);
    if (!current) return;
    ui['chat-name'].textContent = '# ' + current.name;
    ui['chat-desc'].textContent = current.description || 'Canal en vivo';
  }

  function renderMessages(msgs) {
    var container = ui['messages-container'];
    var wasAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 80;
    container.innerHTML = '';

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var isMe = m.sender && m.sender.toLowerCase() === state.user.toLowerCase();

      if (m.type === 'poke') {
        var pWrap = document.createElement('div');
        pWrap.className = 'poke-wrapper';
        var poke = document.createElement('div');
        poke.className = 'poke-message';
        poke.textContent = '🔔 ¡' + m.sender + ' ha enviado un Zumbido! ⚡ (' + (m.time || '') + ')';
        pWrap.appendChild(poke);
        container.appendChild(pWrap);
      } else {
        var wrapper = document.createElement('div');
        wrapper.className = 'message' + (isMe ? ' is-me' : '');

        if (!isMe) {
          var sender = document.createElement('span');
          sender.className = 'message-sender';
          sender.textContent = m.sender;
          wrapper.appendChild(sender);
        }

        var bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = m.text || '';

        if (m.time) {
          var tSpan = document.createElement('span');
          tSpan.className = 'msg-time';
          tSpan.textContent = m.time;
          bubble.appendChild(tSpan);
        }

        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
      }
    }

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function startSession(name) {
    state.user = name;
    localStorage.setItem('nefa_username', name);
    ui['user-display-name'].textContent = name;
    ui['user-initials'].textContent = name.substring(0, 2).toUpperCase();
    show(ui['login'], false);
    show(ui['app'], true);

    loadChannels(function () {
      loadMessages(true);
    });

    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      loadMessages(false);
      loadChannels();
    }, 2500);
  }

  // Eventos
  ui['login-form'].onsubmit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    var name = ui['username'].value.replace(/^\s+|\s+$/g, '');
    if (!name) return false;
    startSession(name);
    return false;
  };

  ui['logout-btn'].onclick = function () {
    localStorage.removeItem('nefa_username');
    if (state.pollTimer) clearInterval(state.pollTimer);
    show(ui['app'], false);
    show(ui['login'], true);
  };

  ui['new-channel-btn'].onclick = function () {
    var name = prompt('Nombre del nuevo canal (ej. ventas):');
    if (!name || !name.replace(/^\s+|\s+$/g, '')) return;
    var clean = name.replace(/^\s+|\s+$/g, '').toLowerCase().replace(/\s+/g, '-');
    var desc = prompt('Descripción corta del canal:', 'Canal del equipo');
    var newCh = {
      id: 'ch-' + new Date().getTime(),
      name: clean,
      description: desc || 'Canal del equipo'
    };
    apiRequest('POST', 'channels', [newCh], function (err) {
      if (!err) {
        state.currentChatId = newCh.id;
        loadChannels(function () { loadMessages(true); });
      }
    });
  };

  ui['menu-btn'].onclick = function () {
    ui['sidebar'].className = ui['sidebar'].className.replace(/\s*open\b/g, '') + ' open';
  };

  ui['close-sidebar-btn'].onclick = function () {
    ui['sidebar'].className = ui['sidebar'].className.replace(/\s*open\b/g, '');
  };

  ui['send-btn'].onclick = function () {
    var text = ui['chat-input'].value.replace(/^\s+|\s+$/g, '');
    if (text) {
      ui['chat-input'].value = '';
      sendMessage(text, 'text');
    }
  };

  ui['chat-input'].onkeydown = function (e) {
    var code = e.keyCode || e.which;
    if (code === 13) {
      if (e.preventDefault) e.preventDefault();
      ui['send-btn'].click();
    }
  };

  ui['poke-btn'].onclick = function () {
    triggerMsnNudgeEffect();
    sendMessage('⚡ ¡Acaba de enviar un Zumbido!', 'poke');
  };

  // Auto-inicio si ya había sesión guardada
  var savedUser = localStorage.getItem('nefa_username') || localStorage.getItem('nefa_user');
  if (savedUser) {
    startSession(savedUser);
  } else {
    show(ui['login'], true);
    show(ui['app'], false);
  }
})();