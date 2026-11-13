'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Hash, Send, Paperclip, Sun, Moon, Phone, Video, CheckCheck, 
  Zap, ArrowRight, BellRing, Menu, X, Plus, Edit2, Trash2, Check, AlertCircle, PhoneCall
} from 'lucide-react';

const SUPABASE_URL = 'https://fedzgvgobjeokxfhvmok.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZHpndmdvYmplb2t4Zmh2bW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzE4OTksImV4cCI6MjExMDEwNzg5OX0.tnxHWDOWQySJ8VDIQhYX5hmVHGvJCD7UlMrw7XeI2ZY';

interface Message {
  id: string;
  channel_id: string;
  sender: string;
  text?: string;
  time: string;
  type: string;
  created_at?: string;
}

interface Channel {
  id: string;
  name: string;
  description: string;
}

async function sbFetch(path: string, method: string = 'GET', body?: unknown) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method !== 'GET') {
    headers['Prefer'] = 'return=representation';
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let errText = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.message) errText = errJson.message;
    } catch {}
    throw new Error(errText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Franco Sierralta');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const [channels, setChannels] = useState<Channel[]>([
    { id: 'gen-1', name: 'general', description: 'Coordinación general del equipo' },
    { id: 'gen-2', name: 'logistica-china', description: 'Embarques, contenedores y courier' },
    { id: 'gen-3', name: 'soporte-it', description: 'Sistemas y automatizaciones' },
  ]);
  const [currentChatId, setCurrentChatId] = useState<string>('gen-1');
  const [isAddingChannel, setIsAddingChannel] = useState<boolean>(false);
  const [newChannelName, setNewChannelName] = useState<string>('');
  const [newChannelDesc, setNewChannelDesc] = useState<string>('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState<string>('');
  const [editChannelDesc, setEditChannelDesc] = useState<string>('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [dbError, setDbError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const [isInCall, setIsInCall] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedMsgId = useRef<string | null>(null);

  const playMsnNudgeEffect = useCallback(() => {
    setIsShaking(false);
    setTimeout(() => setIsShaking(true), 10);
    setTimeout(() => setIsShaking(false), 900);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 40, 120, 40, 180, 40, 250]);
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const times = [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.56];
      times.forEach((t, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(index % 2 === 0 ? 340 : 460, ctx.currentTime + t);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.07);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && /OS [789]_/.test(navigator.userAgent)) {
      window.location.replace('/ipad/index.html');
      return;
    }

    try {
      const savedName = localStorage.getItem('nefa_username');
      if (savedName && savedName.trim()) {
        setUserName(savedName.trim());
        setIsLoggedIn(true);
      }
    } catch {}
  }, []);

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = userName.trim() || 'Franco Sierralta';
    try {
      localStorage.setItem('nefa_username', clean);
    } catch {}
    setUserName(clean);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('nefa_username');
    } catch {}
    setIsLoggedIn(false);
  };

  const fetchChannels = useCallback(async () => {
    try {
      const data = await sbFetch('channels?select=*&order=created_at.asc');
      if (Array.isArray(data) && data.length > 0) {
        setChannels(data);
        setCurrentChatId(prev => data.some((c: Channel) => c.id === prev) ? prev : data[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setDbError(`Error Canales: ${msg}`);
    }
  }, []);

  const fetchMessages = useCallback(async (isInitial = false) => {
    if (!currentChatId) return;
    try {
      const data = await sbFetch(`messages?select=*&channel_id=eq.${encodeURIComponent(currentChatId)}&order=created_at.asc`);
      if (Array.isArray(data)) {
        setDbError(null);
        if (data.length > 0) {
          const latest = data[data.length - 1] as Message;
          if (!isInitial && lastProcessedMsgId.current && lastProcessedMsgId.current !== latest.id) {
            if (latest.type === 'poke' && latest.sender.toLowerCase() !== userName.toLowerCase()) {
              playMsnNudgeEffect();
            }
          }
          lastProcessedMsgId.current = latest.id;
        }
        setMessages(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setDbError(`Error Mensajes: ${msg}`);
    }
  }, [currentChatId, userName, playMsnNudgeEffect]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchChannels();
    fetchMessages(true);

    const interval = setInterval(() => {
      fetchMessages(false);
      fetchChannels();
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoggedIn, currentChatId, fetchChannels, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    const cleanName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    const newCh: Channel = {
      id: `ch-${Date.now()}`,
      name: cleanName,
      description: newChannelDesc.trim() || 'Canal del equipo'
    };

    try {
      await sbFetch('channels', 'POST', [newCh]);
      setChannels(prev => [...prev, newCh]);
      setCurrentChatId(newCh.id);
      setNewChannelName('');
      setNewChannelDesc('');
      setIsAddingChannel(false);
      setSidebarOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      setDbError(`No se pudo crear el canal: ${msg}`);
    }
  };

  const startEditingChannel = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChannelId(ch.id);
    setEditChannelName(ch.name);
    setEditChannelDesc(ch.description || '');
  };

  const handleSaveChannelEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editChannelName.trim()) return;
    const cleanName = editChannelName.trim().toLowerCase().replace(/\s+/g, '-');

    try {
      await sbFetch(`channels?id=eq.${encodeURIComponent(id)}`, 'PATCH', {
        name: cleanName,
        description: editChannelDesc.trim(),
      });
      setChannels(prev => prev.map(c => c.id === id ? { ...c, name: cleanName, description: editChannelDesc.trim() } : c));
      setEditingChannelId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      setDbError(`No se pudo editar el canal: ${msg}`);
    }
  };

  const handleDeleteChannel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channels.length <= 1) return;
    try {
      await sbFetch(`channels?id=eq.${encodeURIComponent(id)}`, 'DELETE');
      const remaining = channels.filter(c => c.id !== id);
      setChannels(remaining);
      if (currentChatId === id && remaining.length > 0) {
        setCurrentChatId(remaining[0].id);
      }
    } catch {}
  };
  const triggerPoke = async () => {
    playMsnNudgeEffect();

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channel_id: currentChatId,
      sender: userName,
      text: '⚡ ¡Acaba de enviar un Zumbido!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'poke'
    };

    lastProcessedMsgId.current = newMessage.id;
    setMessages(prev => [...prev, newMessage]);
    try {
      await sbFetch('messages', 'POST', [newMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      setDbError(`Error al enviar zumbido: ${msg}`);
    }
  };

  const startCall = async (mode: 'voice' | 'video', announce = true) => {
    setCallType(mode);
    setIsInCall(true);

    if (announce) {
      const callLabel = mode === 'video' ? 'Videollamada' : 'Llamada de voz';
      const newMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        channel_id: currentChatId,
        sender: userName,
        text: `📞 Inició una ${callLabel} en vivo`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'call'
      };
      lastProcessedMsgId.current = newMessage.id;
      setMessages(prev => [...prev, newMessage]);
      try {
        await sbFetch('messages', 'POST', [newMessage]);
      } catch {}
    }
  };

  const handleSendMessage = async (customType: string = 'text', textContent?: string) => {
    const content = textContent ?? inputText;
    if (!content.trim() && customType === 'text') return;

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channel_id: currentChatId,
      sender: userName,
      text: content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: customType
    };

    lastProcessedMsgId.current = newMessage.id;
    setMessages(prev => [...prev, newMessage]);
    setInputText('');

    try {
      await sbFetch('messages', 'POST', [newMessage]);
      setDbError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      setDbError(`No se guardó el mensaje: ${msg}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSendMessage('file', `📁 Archivo adjunto: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  };

  const activeChannel = channels.find(c => c.id === currentChatId);

  const safeRoomName = `NEFA_Software_Room_${currentChatId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const jitsiUrl = `https://meet.jit.si/${safeRoomName}#userInfo.displayName="${encodeURIComponent(userName)}"&config.prejoinPageEnabled=false&config.startWithVideoMuted=${callType === 'voice'}&config.disableDeepLinking=true`;

  if (!isLoggedIn) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
              <Zap className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-wide">NEFA Software Chat</h1>
            <p className="text-xs text-slate-400">Ingresa tu nombre para conectarte en vivo con el equipo</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tu Nombre:</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ej. Franco, Ariel, Melany..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>

            <button 
              type="submit"
              onClick={() => handleLogin()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              Entrar al Chat <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 text-center">
            <a href="/ipad/index.html" className="text-[11px] text-slate-400 hover:text-blue-400 underline">
              Versión ligera para iPad 2 (iOS 9) →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} h-[100dvh] w-screen flex flex-col overflow-hidden font-sans ${isShaking ? 'msn-buzz-active' : ''}`}>
      
      <style>{`
        @keyframes msn-nudge {
          0% { transform: translate(0, 0) rotate(0deg); }
          5% { transform: translate(-16px, -12px) rotate(-2.5deg); }
          10% { transform: translate(16px, 10px) rotate(2.5deg); }
          15% { transform: translate(-18px, 12px) rotate(-2deg); }
          20% { transform: translate(18px, -12px) rotate(2deg); }
          25% { transform: translate(-16px, -10px) rotate(-2.5deg); }
          30% { transform: translate(16px, 14px) rotate(2.5deg); }
          35% { transform: translate(-14px, 10px) rotate(-1.5deg); }
          40% { transform: translate(14px, -14px) rotate(1.5deg); }
          45% { transform: translate(-16px, -8px) rotate(-2deg); }
          50% { transform: translate(16px, 12px) rotate(2deg); }
          55% { transform: translate(-12px, 10px) rotate(-1.5deg); }
          60% { transform: translate(12px, -10px) rotate(1.5deg); }
          65% { transform: translate(-10px, -8px) rotate(-1deg); }
          70% { transform: translate(10px, 8px) rotate(1deg); }
          75% { transform: translate(-8px, 6px) rotate(-1deg); }
          80% { transform: translate(8px, -6px) rotate(1deg); }
          85% { transform: translate(-6px, -4px) rotate(-0.5deg); }
          90% { transform: translate(6px, 4px) rotate(0.5deg); }
          95% { transform: translate(-4px, 2px) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .msn-buzz-active {
          animation: msn-nudge 0.85s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>

      {dbError && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs flex items-center justify-between z-50 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dbError}</span>
          </div>
          <button onClick={() => setDbError(null)} className="underline ml-2">Cerrar</button>
        </div>
      )}

      <div className="flex-1 flex h-full w-full relative overflow-hidden">

        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-30 md:hidden" 
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* SIDEBAR DE CANALES */}
        <div className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 flex flex-col border-r transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shrink-0`}>
          
          <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow">
                N
              </div>
              <div>
                <h1 className="font-bold text-sm">NEFA Software</h1>
                <p className="text-[10px] text-emerald-400">● En vivo ({userName})</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800 text-yellow-400' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl md:hidden text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Canales</span>
              <button 
                onClick={() => setIsAddingChannel(!isAddingChannel)}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-lg flex items-center gap-1 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>

            {isAddingChannel && (
              <div className={`p-3 rounded-xl border mb-3 space-y-2 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                <input
                  type="text"
                  placeholder="Nombre del canal (ej. ventas)"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-transparent border border-slate-700 outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Descripción corta"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-transparent border border-slate-700 outline-none focus:border-blue-500"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setIsAddingChannel(false)} className="text-xs text-slate-400 px-2 py-1">Cancelar</button>
                  <button onClick={handleCreateChannel} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-semibold">Crear</button>
                </div>
              </div>
            )}

            {channels.map(ch => (
              <div
                key={ch.id}
                onClick={() => { setCurrentChatId(ch.id); setSidebarOpen(false); }}
                className={`group w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                  currentChatId === ch.id 
                    ? (darkMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200') 
                    : (darkMode ? 'text-slate-300 hover:bg-slate-800/60' : 'text-slate-700 hover:bg-slate-100')
                }`}
              >
                {editingChannelId === ch.id ? (
                  <div className="flex-1 space-y-1.5 mr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editChannelName}
                      onChange={(e) => setEditChannelName(e.target.value)}
                      className="w-full px-2 py-1 text-xs rounded bg-slate-950 border border-blue-500 text-white outline-none"
                    />
                    <input
                      type="text"
                      value={editChannelDesc}
                      onChange={(e) => setEditChannelDesc(e.target.value)}
                      placeholder="Descripción"
                      className="w-full px-2 py-1 text-[10px] rounded bg-slate-950 border border-slate-700 text-slate-300 outline-none"
                    />
                    <div className="flex gap-2 pt-1">
                      <button onClick={(e) => handleSaveChannelEdit(ch.id, e)} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Check className="w-3 h-3" /> Guardar
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingChannelId(null); }} className="text-slate-400 text-[10px]">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <Hash className="w-4 h-4 opacity-70 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-semibold truncate">{ch.name}</p>
                        {ch.description && <p className="text-[10px] opacity-60 truncate">{ch.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button 
                        onClick={(e) => startEditingChannel(ch, e)}
                        className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white"
                        title="Editar canal"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {channels.length > 1 && (
                        <button 
                          onClick={(e) => handleDeleteChannel(ch.id, e)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400"
                          title="Eliminar canal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className={`p-3 border-t ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'} flex items-center justify-between`}>
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {userName.substring(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold truncate">{userName}</p>
                <p className="text-[10px] text-emerald-400">Conectado</p>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="text-xs text-red-400 hover:underline px-2 py-1"
            >
              Cambiar
            </button>
          </div>
        </div>

        {/* ÁREA DE CHAT PRINCIPAL */}
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          
          <div className={`h-14 sm:h-16 px-3 sm:px-6 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-2.5 truncate">
              <button 
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-xl border md:hidden ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="truncate">
                <h2 className="font-bold text-sm sm:text-base truncate">
                  # {activeChannel?.name || 'general'}
                </h2>
                <p className={`text-[10px] sm:text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {activeChannel?.description || 'Canal de comunicación en vivo'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                onClick={() => startCall('voice', true)} 
                className={`p-2.5 rounded-xl border transition-colors ${darkMode ? 'border-slate-800 bg-slate-800/50 hover:bg-emerald-600/20 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
                title="Iniciar llamada de voz"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button 
                onClick={() => startCall('video', true)} 
                className={`p-2.5 rounded-xl border transition-colors ${darkMode ? 'border-slate-800 bg-slate-800/50 hover:bg-blue-600/20 hover:border-blue-500/40 text-slate-300 hover:text-blue-400' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
                title="Iniciar videollamada"
              >
                <Video className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista de Mensajes */}
          <div className={`flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50 text-xs">
                <Hash className="w-8 h-8 mb-2 stroke-1" />
                <p>No hay mensajes en #{activeChannel?.name}.</p>
                <p>¡Escribí el primero para iniciar la charla!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender.toLowerCase() === userName.toLowerCase();
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && <span className="text-[11px] font-bold mb-1 ml-1 text-blue-400">{msg.sender}</span>}
                    
                    {msg.type === 'poke' ? (
                      <div className="my-1.5 px-4 py-2 bg-amber-500/20 border-2 border-amber-500 text-amber-400 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-amber-500/10">
                        <BellRing className="w-4 h-4 animate-ping" />
                        <span>¡{msg.sender} ha enviado un Zumbido! ⚡ ({msg.time})</span>
                      </div>
                    ) : msg.type === 'call' ? (
                      <div className="my-1.5 p-3.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-emerald-500 text-slate-950 rounded-xl animate-pulse">
                            <PhoneCall className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-white">{msg.sender} {msg.text}</p>
                            <p className="text-[10px] text-emerald-400">Sala de #{activeChannel?.name} • {msg.time}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => startCall('video', false)}
                          className="w-full sm:w-auto px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-transform active:scale-95 text-center"
                        >
                          Unirse ahora
                        </button>
                      </div>
                    ) : (
                      <div className={`max-w-[85%] sm:max-w-md rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        isMe 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : darkMode ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                      }`}>
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isMe ? 'text-blue-100' : 'opacity-60'}`}>
                          <span>{msg.time}</span>
                          {isMe && <CheckCheck className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Entrada */}
          <div className={`p-2.5 sm:p-4 border-t ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shrink-0`}>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <label className={`p-2.5 sm:p-3 rounded-xl border cursor-pointer shrink-0 ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                <Paperclip className="w-4 h-4" />
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>

              <button 
                onClick={triggerPoke}
                className="p-2.5 sm:p-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-transform active:scale-90 font-bold shrink-0"
                title="Enviar Zumbido MSN"
              >
                <BellRing className="w-4 h-4" />
              </button>
              
              <div className={`flex-1 flex items-center rounded-xl border px-3 py-2.5 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                <input 
                  type="text" 
                  placeholder={`Mensaje en #${activeChannel?.name || 'canal'}...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('text')}
                  className="w-full bg-transparent border-none outline-none text-xs sm:text-sm"
                />
              </div>

              <button 
                onClick={() => handleSendMessage('text')}
                className="p-2.5 sm:p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-all shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SALA DE LLAMADA / VIDEOLLAMADA EN VIVO */}
      {isInCall && (
        <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
          <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-bold text-xs sm:text-sm text-white">
                Sala en vivo: #{activeChannel?.name || 'general'} ({callType === 'video' ? 'Videollamada' : 'Voz'})
              </span>
            </div>
            <button 
              onClick={() => setIsInCall(false)}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow transition-transform active:scale-95"
            >
              Salir de la Sala
            </button>
          </div>
          <div className="flex-1 w-full bg-black relative">
            <iframe
              src={jitsiUrl}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-full border-0"
              title="NEFA Live Call"
            />
          </div>
        </div>
      )}
    </div>
  );
}
