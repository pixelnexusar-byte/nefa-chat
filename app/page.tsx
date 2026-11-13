'use client';
import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, Users, Hash, Send, Paperclip, 
  Sun, Moon, Phone, Video, CheckCheck, 
  Zap, Tablet, Monitor, ArrowRight, BellRing
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase con tus variables del .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Message {
  id: number;
  channel_id: string;
  sender: string;
  text?: string;
  time: string;
  type: 'text' | 'code' | 'file' | 'image' | 'poke';
  is_me?: boolean;
}

interface Channel {
  id: string;
  name: string;
  description: string;
  unread: number;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Franco Sierralta');

  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [currentChatId, setCurrentChatId] = useState<string>('gen-1');
  const [inputText, setInputText] = useState<string>('');
  const [deviceMode, setDeviceMode] = useState<'responsive' | 'ipad'>('responsive');
  
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isInCall, setIsInCall] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [callTimer, setCallTimer] = useState<number>(0);

  const [channels, setChannels] = useState<Channel[]>([
    { id: 'gen-1', name: 'general', description: 'Coordinación general del equipo', unread: 0 },
    { id: 'gen-2', name: 'logistica-china', description: 'Embarques, contenedores y courier', unread: 0 },
    { id: 'gen-3', name: 'soporte-it', description: 'Sistemas y automatizaciones', unread: 0 },
  ]);

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar mensajes desde Supabase al cambiar de canal o iniciar sesión
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', currentChatId)
        .order('id', { ascending: true });

      if (data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Suscripción en Tiempo Real (Realtime)
    const channelSubscription = supabase
      .channel(`public:messages:channel_id=eq.${currentChatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${currentChatId}`
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages((prev) => {
          // Evitar duplicados si ya fue agregado localmente
          if (prev.some(m => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelSubscription);
    };
  }, [currentChatId, isLoggedIn]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cronógrafo de llamadas
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInCall) {
      interval = setInterval(() => setCallTimer(prev => prev + 1), 1000);
    } else {
      setCallTimer(0);
    }
    return () => clearInterval(interval);
  }, [isInCall]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const triggerPoke = async () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);

    const newMessage: Message = {
      id: Date.now(),
      channel_id: currentChatId,
      sender: userName,
      text: '⚡ ¡ENVIÓ UN ZUMBIDO!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'poke'
    };

    // Guardar en Supabase para que le llegue a todos
    await supabase.from('messages').insert([newMessage]);
  };

  const handleSendMessage = async (customType: 'text' | 'code' | 'file' | 'image' | 'poke' = 'text', textContent?: string) => {
    const content = textContent || inputText;
    if (!content.trim() && customType === 'text') return;

    const newMessage: Message = {
      id: Date.now(),
      channel_id: currentChatId,
      sender: userName,
      text: content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: customType
    };

    // Actualización optimista local
    setMessages(prev => [...prev, newMessage]);
    setInputText('');

    // Guardar en Supabase Database
    const { error } = await supabase.from('messages').insert([newMessage]);
    if (error) {
      console.error('Error al enviar mensaje a Supabase:', error.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSendMessage('file', `📁 Archivo adjunto: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
              <Zap className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-wide">NEFA Internal Workspace</h1>
            <p className="text-xs text-slate-400">Ingresa tu nombre para acceder al historial en tiempo real</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tu Nombre o Perfil:</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ej. Franco Sierralta"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="pt-2">
              <button 
                onClick={() => { if(userName.trim()) setIsLoggedIn(true); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95"
              >
                Conectar al Chat <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} h-screen w-screen flex flex-col overflow-hidden font-sans select-none touch-pan-y ${isShaking ? 'animate-bounce' : ''}`}>
      
      <style jsx global>{`
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .animate-bounce {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>

      {/* BARRA SUPERIOR */}
      <div className={`h-11 px-4 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between text-xs z-20 shrink-0`}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-500" />
          <span className="font-bold">NEFA Workspace</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">En Línea: {userName}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] opacity-70 hidden sm:inline">Vista:</span>
          <button 
            onClick={() => setDeviceMode('responsive')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors ${deviceMode === 'responsive' ? 'bg-blue-600 text-white' : 'opacity-70 hover:opacity-100'}`}
          >
            <Monitor className="w-3.5 h-3.5" /> Full
          </button>
          <button 
            onClick={() => setDeviceMode('ipad')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors ${deviceMode === 'ipad' ? 'bg-blue-600 text-white' : 'opacity-70 hover:opacity-100'}`}
          >
            <Tablet className="w-3.5 h-3.5" /> iPad 2 View
          </button>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-0 sm:p-2 bg-black/20">
        <div className={`flex h-full w-full transition-all duration-300 shadow-2xl overflow-hidden ${
          deviceMode === 'ipad' 
            ? 'max-w-[1024px] max-h-[768px] rounded-xl border-4 border-slate-700' 
            : 'rounded-none border-0'
        } ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>

          {/* SIDEBAR */}
          <div className={`w-72 sm:w-80 flex flex-col border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} z-10 shrink-0`}>
            <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow">
                  N
                </div>
                <div>
                  <h1 className="font-bold text-xs">NEFA Internal</h1>
                  <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Canales Compartidos</p>
                </div>
              </div>
              
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2.5 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800 text-yellow-400' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>

            {/* Listado de Canales */}
            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
              <p className="px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-2">Canales</p>
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setCurrentChatId(ch.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl flex items-center justify-between transition-all ${currentChatId === ch.id ? (darkMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200') : (darkMode ? 'text-slate-300 hover:bg-slate-800/60' : 'text-slate-700 hover:bg-slate-100')}`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Hash className="w-4 h-4 opacity-70 shrink-0" />
                    <span className="text-xs font-medium truncate">{ch.name}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer Sesión */}
            <div className={`p-3 border-t ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                  {userName.substring(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold truncate">{userName}</p>
                  <p className={`text-[9px] ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Sincronizado</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLoggedIn(false)} 
                className={`text-[10px] underline ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'}`}
              >
                Salir
              </button>
            </div>
          </div>

          {/* ÁREA DE CHAT PRINCIPAL */}
          <div className="flex-1 flex flex-col h-full relative overflow-hidden">
            <div className={`h-16 px-4 sm:px-6 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between shrink-0`}>
              <div>
                <h2 className="font-bold text-xs sm:text-sm">
                  # {channels.find(c => c.id === currentChatId)?.name}
                </h2>
                <p className={`text-[10px] sm:text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {channels.find(c => c.id === currentChatId)?.description}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
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

            {/* Mensajes en tiempo real */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
              {messages.map((msg) => {
                const isMe = msg.sender === userName;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && <span className="text-[10px] font-semibold mb-1 ml-1 opacity-70">{msg.sender}</span>}
                    
                    {msg.type === 'poke' ? (
                      <div className="my-1 px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse">
                        <BellRing className="w-4 h-4" /> {msg.sender} envió un Zumbido ⚡
                      </div>
                    ) : (
                      <div className={`max-w-md rounded-2xl p-3.5 shadow-sm ${
                        isMe 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : darkMode ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                      }`}>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${isMe ? 'text-blue-100' : 'opacity-60'}`}>
                          <span>{msg.time}</span>
                          {isMe && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Mensaje */}
            <div className={`p-3 sm:p-4 border-t ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shrink-0`}>
              <div className="flex items-center gap-2">
                <label className={`p-3 rounded-xl border cursor-pointer ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                  <Paperclip className="w-4 h-4" />
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>

                <button 
                  onClick={triggerPoke}
                  className="p-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-transform active:scale-90 font-bold flex items-center gap-1"
                  title="Enviar Zumbido"
                >
                  <BellRing className="w-4 h-4" />
                </button>
                
                <div className={`flex-1 flex items-center rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                  <input 
                    type="text" 
                    placeholder="Escribe un mensaje..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('text')}
                    className="w-full bg-transparent border-none outline-none text-xs"
                  />
                </div>

                <button 
                  onClick={() => handleSendMessage('text')}
                  className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
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