'use client';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, Hash, Send, Paperclip, Sun, Moon, Phone, Video, CheckCheck, 
  Zap, Tablet, Monitor, ArrowRight, BellRing, ChevronLeft
} from 'lucide-react';

interface Message {
  id: number;
  sender: string;
  text?: string;
  time: string;
  type: 'text' | 'code' | 'file' | 'image' | 'poke';
  isMe: boolean;
}

interface Channel {
  id: string;
  name: string;
  description: string;
  unread: number;
}

interface Member {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'busy' | 'offline';
  avatar: string;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Franco Sierralta');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'channels' | 'dms'>('channels');
  const [currentChatId, setCurrentChatId] = useState<string>('gen-1');
  const [inputText, setInputText] = useState<string>('');
  const [deviceMode, setDeviceMode] = useState<'responsive' | 'ipad'>('responsive');
  
  // ESTADO CLAVE PARA CELULARES: Controla si vemos el menú o el chat
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);

  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isInCall, setIsInCall] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [callTimer, setCallTimer] = useState<number>(0);

  const [channels] = useState<Channel[]>([
    { id: 'gen-1', name: 'general', description: 'Coordinación general del equipo', unread: 0 },
    { id: 'gen-2', name: 'logistica-china', description: 'Embarques, contenedores y courier', unread: 2 },
    { id: 'gen-3', name: 'soporte-it', description: 'Sistemas y automatizaciones', unread: 1 },
  ]);

  const [teamMembers] = useState<Member[]>([
    { id: 'usr-1', name: 'Ariel Diaz', role: 'Co-Founder', status: 'online', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
    { id: 'usr-2', name: 'Melany', role: 'Atención', status: 'online', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
  ]);

  const [messages, setMessages] = useState<Record<string, Message[]>>({
    'gen-1': [
      { id: 1, sender: 'Ariel Diaz', text: 'Buenos días equipo.', time: '09:15', type: 'text', isMe: false },
      { id: 2, sender: 'Franco Sierralta', text: 'Todo en orden por acá.', time: '09:20', type: 'text', isMe: true },
    ],
    'gen-2': [{ id: 1, sender: 'Franco Sierralta', text: 'Shipping mark: 船標', time: 'Ayer', type: 'text', isMe: true }],
    'usr-1': [{ id: 1, sender: 'Ariel Diaz', text: '¿Revisaste la API?', time: '11:00', type: 'text', isMe: false }]
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentChatId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInCall) interval = setInterval(() => setCallTimer(prev => prev + 1), 1000);
    else setCallTimer(0);
    return () => clearInterval(interval);
  }, [isInCall]);

  const formatTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;

  const triggerPoke = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
    const pokeMessage: Message = { id: Date.now(), sender: userName, text: '⚡ ¡ENVIÓ UN ZUMBIDO!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'poke', isMe: true };
    setMessages(prev => ({ ...prev, [currentChatId]: [...(prev[currentChatId] || []), pokeMessage] }));
  };

  const handleSendMessage = (customType: 'text' = 'text') => {
    if (!inputText.trim()) return;
    const newMessage: Message = { id: Date.now(), sender: userName, text: inputText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: customType, isMe: true };
    setMessages(prev => ({ ...prev, [currentChatId]: [...(prev[currentChatId] || []), newMessage] }));
    setInputText('');
  };

  // Función para seleccionar un chat en celular
  const selectChat = (id: string) => {
    setCurrentChatId(id);
    setIsMobileChatOpen(true); // Abre el chat en pantalla completa
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold"><Zap className="w-7 h-7" /></div>
            <h1 className="text-xl font-bold tracking-wide">NEFA Internal</h1>
          </div>
          <div className="space-y-4">
            <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Tu Nombre" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500" />
            <button onClick={() => { if(userName.trim()) setIsLoggedIn(true); }} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2">Ingresar <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} h-screen w-screen flex flex-col overflow-hidden font-sans select-none ${isShaking ? 'animate-bounce' : ''}`}>
      
      <style jsx global>{`
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(3px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .animate-bounce { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
      `}</style>

      {/* BARRA SUPERIOR (Oculta en celular si estás en el chat) */}
      <div className={`h-11 px-4 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between text-xs z-20 shrink-0 ${isMobileChatOpen ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-500" />
          <span className="font-bold hidden sm:inline">NEFA Workspace</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{userName}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => setDeviceMode('responsive')} className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 ${deviceMode === 'responsive' ? 'bg-blue-600 text-white' : 'opacity-70'}`}><Monitor className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Full</span></button>
          <button onClick={() => setDeviceMode('ipad')} className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 ${deviceMode === 'ipad' ? 'bg-blue-600 text-white' : 'opacity-70'}`}><Tablet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">iPad</span></button>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-0 sm:p-2 bg-black/20">
        <div className={`flex h-full w-full transition-all duration-300 shadow-2xl overflow-hidden ${
          deviceMode === 'ipad' ? 'max-w-[1024px] max-h-[768px] rounded-xl border-4 border-slate-700' : 'rounded-none border-0'
        } ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>

          {/* SIDEBAR (Se oculta en celular si el chat está abierto) */}
          <div className={`${isMobileChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-72 sm:w-80 flex-col border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} z-10 shrink-0`}>
            <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold">N</div>
                <div><h1 className="font-bold text-xs">NEFA Internal</h1></div>
              </div>
              <button onClick={() => setDarkMode(!darkMode)} className={`p-2.5 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800 text-yellow-400' : 'border-slate-200 bg-slate-100'}`}>{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
            </div>

            <div className="flex border-b border-slate-700/30 p-2 gap-1.5">
              <button onClick={() => { setActiveTab('channels'); selectChat(channels[0].id); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${activeTab === 'channels' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Hash className="w-3.5 h-3.5" /> Canales</button>
              <button onClick={() => { setActiveTab('dms'); selectChat(teamMembers[0].id); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${activeTab === 'dms' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Users className="w-3.5 h-3.5" /> Directos</button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {activeTab === 'channels' ? channels.map(ch => (
                <button key={ch.id} onClick={() => selectChat(ch.id)} className={`w-full text-left px-3 py-3 rounded-xl flex items-center justify-between ${currentChatId === ch.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>
                  <div className="flex items-center gap-2.5 truncate"><Hash className="w-4 h-4 opacity-70" /><span className="text-xs font-medium">{ch.name}</span></div>
                  {ch.unread > 0 && <span className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded-full">{ch.unread}</span>}
                </button>
              )) : teamMembers.map(usr => (
                <button key={usr.id} onClick={() => selectChat(usr.id)} className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between ${currentChatId === usr.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>
                  <div className="flex items-center gap-3 truncate"><img src={usr.avatar} className="w-8 h-8 rounded-full" /><p className="text-xs font-semibold">{usr.name}</p></div>
                </button>
              ))}
            </div>

            <div className={`p-3 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">{userName.substring(0, 2).toUpperCase()}</div>
                <p className="text-xs font-bold truncate">{userName}</p>
              </div>
              <button onClick={() => setIsLoggedIn(false)} className="text-[10px] underline text-slate-400">Salir</button>
            </div>
          </div>

          {/* ÁREA DE CHAT (Se oculta en celular si no está abierto) */}
          <div className={`${isMobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full relative overflow-hidden`}>
            <div className={`h-16 px-4 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white'} flex items-center justify-between shrink-0`}>
              <div className="flex items-center gap-2">
                {/* BOTÓN VOLVER (Solo visible en celular) */}
                <button onClick={() => setIsMobileChatOpen(false)} className="md:hidden p-2 -ml-2 text-slate-400">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="font-bold text-xs sm:text-sm">{activeTab === 'channels' ? `# ${channels.find(c => c.id === currentChatId)?.name}` : teamMembers.find(m => m.id === currentChatId)?.name}</h2>
                  <p className={`text-[10px] text-slate-400`}>{activeTab === 'channels' ? channels.find(c => c.id === currentChatId)?.description : teamMembers.find(m => m.id === currentChatId)?.role}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => { setIsInCall(true); setCallType('voice'); }} className={`p-2 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300' : 'bg-slate-100'}`}><Phone className="w-4 h-4" /></button>
                <button onClick={() => { setIsInCall(true); setCallType('video'); }} className={`p-2 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300' : 'bg-slate-100'}`}><Video className="w-4 h-4" /></button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
              {(messages[currentChatId] || []).map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                  {!msg.isMe && <span className="text-[10px] font-semibold mb-1 ml-1 opacity-70">{msg.sender}</span>}
                  {msg.type === 'poke' ? (
                    <div className="my-1 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse"><BellRing className="w-4 h-4" /> {msg.sender} envió un Zumbido ⚡</div>
                  ) : (
                    <div className={`max-w-[85%] md:max-w-md rounded-2xl p-3.5 ${msg.isMe ? 'bg-blue-600 text-white rounded-br-none' : darkMode ? 'bg-slate-900 text-slate-100 rounded-bl-none' : 'bg-white text-slate-800 rounded-bl-none'}`}>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${msg.isMe ? 'text-blue-100' : 'opacity-60'}`}><span>{msg.time}</span>{msg.isMe && <CheckCheck className="w-3 h-3" />}</div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={`p-3 border-t ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white'} shrink-0`}>
              <div className="flex items-center gap-2">
                <label className={`p-3 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800 text-slate-300' : 'bg-slate-100'}`}><Paperclip className="w-4 h-4" /><input type="file" className="hidden" /></label>
                <button onClick={triggerPoke} className="p-3 bg-amber-500 text-slate-950 rounded-xl shadow-md font-bold"><BellRing className="w-4 h-4" /></button>
                <input type="text" placeholder="Escribe un mensaje..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('text')} className={`flex-1 rounded-xl border px-3 py-3 text-xs outline-none ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50'}`} />
                <button onClick={() => handleSendMessage('text')} className="p-3 bg-blue-600 text-white rounded-xl shadow-md"><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isInCall && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 text-white">
          <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold mb-4 animate-pulse">{userName.substring(0, 2).toUpperCase()}</div>
          <h3 className="text-xl font-bold mb-1">{callType === 'video' ? 'Videollamada' : 'Llamada de voz'}</h3>
          <p className="text-sm text-slate-400 mb-8 font-mono">{formatTime(callTimer)}</p>
          <button onClick={() => setIsInCall(false)} className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold">Colgar</button>
        </div>
      )}
    </div>
  );
}