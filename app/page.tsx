'use client';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Hash, Send, Paperclip, Sun, Moon, Phone, Video, CheckCheck, 
  Zap, ArrowRight, BellRing, Menu, X, Plus, Edit2, Trash2, Check, AlertCircle
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const [channels, setChannels] = useState<Channel[]>([]);
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
  const [callTimer, setCallTimer] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedMsgId = useRef<string | null>(null);

  // Función que ejecuta el combo clásico de MSN: Sacudida + Sonido + Vibración
  const playMsnNudgeEffect = () => {
    setIsShaking(false);
    setTimeout(() => setIsShaking(true), 10);
    setTimeout(() => setIsShaking(false), 900);

    // Vibración física en celulares compatibles
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 40, 120, 40, 180, 40, 250]);
    }

    // Sonido clásico sintetizado (no requiere archivos mp3 externos)
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
    } catch {
      // Ignorar si el navegador bloquea el audio sin interacción previa
    }
  };

  useEffect(() => {
    const savedName = localStorage.getItem('nefa_username');
    if (savedName) {
      setUserName(savedName);
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = () => {
    if (!userName.trim()) return;
    localStorage.setItem('nefa_username', userName.trim());
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('nefa_username');
    setIsLoggedIn(false);
  };

  // 1. Cargar Canales y escuchar cambios
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        setDbError(`Error de base de datos (Canales): ${error.message}`);
      } else if (data) {
        setChannels(data);
        if (data.length > 0 && !data.some(c => c.id === currentChatId)) {
          setCurrentChatId(data[0].id);
        }
      }
    };

    fetchChannels();

    const chSub = supabase
      .channel('public-channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        fetchChannels();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chSub);
    };
  }, [isLoggedIn]);

  // 2. Cargar Mensajes y escuchar nuevos mensajes + zumbidos en vivo
  useEffect(() => {
    if (!isLoggedIn || !currentChatId) return;

    const fetchMessages = async (isInitial = false) => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', currentChatId)
        .order('created_at', { ascending: true });

      if (error) {
        setDbError(`Error al leer mensajes: ${error.message}`);
      } else if (data) {
        setDbError(null);
        if (data.length > 0) {
          const latest = data[data.length - 1];
          // Si llegó un zumbido nuevo por polling que aún no sacudió la pantalla
          if (!isInitial && lastProcessedMsgId.current && lastProcessedMsgId.current !== latest.id) {
            if (latest.type === 'poke' && latest.sender.toLowerCase() !== userName.toLowerCase()) {
              playMsnNudgeEffect();
            }
          }
          lastProcessedMsgId.current = latest.id;
        }
        setMessages(data);
      }
    };

    fetchMessages(true);

    const pollInterval = setInterval(() => fetchMessages(false), 2500);

    const msgSub = supabase
      .channel(`room-${currentChatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const incoming = payload.new as Message;
        if (incoming.channel_id === currentChatId) {
          if (incoming.type === 'poke' && incoming.sender.toLowerCase() !== userName.toLowerCase() && lastProcessedMsgId.current !== incoming.id) {
            playMsnNudgeEffect();
          }
          lastProcessedMsgId.current = incoming.id;
          setMessages((prev) => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      })
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(msgSub);
    };
  }, [currentChatId, isLoggedIn, userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInCall) {
      interval = setInterval(() => setCallTimer(prev => prev + 1), 1000);
    } else {
      setCallTimer(0);
    }
    return () => clearInterval(interval);
  }, [isInCall]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    const cleanName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    const newCh: Channel = {
      id: `ch-${Date.now()}`,
      name: cleanName,
      description: newChannelDesc.trim() || 'Canal del equipo'
    };

    const { error } = await supabase.from('channels').insert([newCh]);
    if (error) {
      setDbError(`No se pudo crear el canal: ${error.message}`);
    } else {
      setChannels(prev => [...prev, newCh]);
      setCurrentChatId(newCh.id);
      setNewChannelName('');
      setNewChannelDesc('');
      setIsAddingChannel(false);
      setSidebarOpen(false);
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

    const { error } = await supabase
      .from('channels')
      .update({ name: cleanName, description: editChannelDesc.trim() })
      .eq('id', id);

    if (error) {
      setDbError(`No se pudo editar el canal: ${error.message}`);
    } else {
      setChannels(prev => prev.map(c => c.id === id ? { ...c, name: cleanName, description: editChannelDesc.trim() } : c));
      setEditingChannelId(null);
    }
  };

  const handleDeleteChannel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channels.length <= 1) return;
    const { error } = await supabase.from('channels').delete().eq('id', id);
    if (!error) {
      const remaining = channels.filter(c => c.id !== id);
      setChannels(remaining);
      if (currentChatId === id && remaining.length > 0) {
        setCurrentChatId(remaining[0].id);
      }
    }
  };
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
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
    const { error } = await supabase.from('messages').insert([newMessage]);
    if (error) setDbError(`Error al enviar zumbido: ${error.message}`);
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

    const { error } = await supabase.from('messages').insert([newMessage]);
    if (error) {
      setDbError(`No se guardó el mensaje en Supabase: ${error.message}`);
    } else {
      setDbError(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSendMessage('file', `📁 Archivo adjunto: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  };

  const activeChannel = channels.find(c => c.id === currentChatId);

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

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tu Nombre:</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Ej. Franco, Ariel, Melany..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>

            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
            >
              Entrar al Chat <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} h-[100dvh] w-screen flex flex-col overflow-hidden font-sans ${isShaking ? 'msn-buzz-active' : ''}`}>
      
      {/* ANIMACIÓN AUTÉNTICA DE ZUMBIDO MSN MESSENGER */}
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

      {/* BANNER DE ERROR SI SUPABASE BLOQUEA ALGO */}
      {dbError && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs flex items-center justify-between z-50 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dbError}</span>
          </div>
          <button onClick={() => setDbError(null)} className="underline ml-2">Cerrar</button>
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL ADAPTADO A CELULAR Y PC */}
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
                onClick={() => { setIsInCall(true); setCallType('voice'); }} 
                className={`p-2.5 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
              >
                <Phone className="w-4 h-4" />
              </button>
              <button 
                onClick={() => { setIsInCall(true); setCallType('video'); }} 
                className={`p-2.5 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
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

      {/* MODAL DE LLAMADA */}
      {isInCall && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 text-white">
          <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold mb-4 shadow-xl animate-pulse">
            {userName.substring(0, 2).toUpperCase()}
          </div>
          <h3 className="text-xl font-bold mb-1">
            {callType === 'video' ? 'Videollamada en curso' : 'Llamada de voz en curso'}
          </h3>
          <p className="text-sm text-slate-400 mb-8 font-mono">{formatTime(callTimer)}</p>

          <button 
            onClick={() => setIsInCall(false)}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95"
          >
            Colgar Llamada
          </button>
        </div>
      )}
    </div>
  );
}