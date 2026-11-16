'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Hash, Send, Paperclip, Sun, Moon, Phone, Video, CheckCheck, 
  Zap, ArrowRight, BellRing, Menu, X, Plus, Edit2, Trash2, Check, 
  AlertCircle, PhoneCall, Volume2, VolumeX, MessageSquare,
  Pin, Search, Reply, CheckSquare, Square, Bot, Sparkles, Users, Package, Calculator, FileText, Share2, ExternalLink, Upload
} from 'lucide-react';

const SUPABASE_URL = 'https://fedzgvgobjeokxfhvmok.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZHpndmdvYmplb2t4Zmh2bW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzE4OTksImV4cCI6MjExMDEwNzg5OX0.tnxHWDOWQySJ8VDIQhYX5hmVHGvJCD7UlMrw7XeI2ZY';
const DEFAULT_GROQ_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY || '';

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

interface PresenceUser {
  username: string;
  status: 'online' | 'away' | 'busy';
  custom_status: string;
  typing_in: string;
  typing_at: string;
  last_seen: string;
}

interface ClientRecord {
  id: string;
  name: string;
  company: string;
  phone: string;
  shipment_status: string;
  paid: number;
  total_debt: number;
  arrival_date: string;
  notes: string;
}

interface ComexShipment {
  id: string;
  container_code: string;
  client_name: string;
  has_invoice: boolean;
  has_packing: boolean;
  has_bl: boolean;
  has_origin: boolean;
  status: string;
}

async function sbFetch(path: string, method: string = 'GET', body?: unknown, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(extraHeaders || {}),
  };
  if (method !== 'GET' && !extraHeaders?.['Prefer']) {
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

async function askGroqQwen(apiKey: string, promptText: string, recentMessages: Message[], channelName: string, senderName: string): Promise<string> {
  const contextLines = recentMessages.slice(-8).map(m => `${m.sender}: ${(m.text || '').replace(/^❝ [^\n]+\n/, '')}`).join('\n');
  const systemPrompt = 
    `Eres NEFA AI (@nefa), asistente inteligente para el equipo de "De China al Mundo" / "NEFA Software". ` +
    `Ayudas con logística internacional China-Argentina, cálculo de CBM, costos, aduana y operaciones. Responde claro y conciso en español. Canal: #${channelName}. Usuario: ${senderName}.`;

  const modelsToTry = ['qwen/qwen3-32b', 'qwen-qwq-32b', 'qwen-2.5-32b'];
  let lastError = 'No se pudo conectar con Groq';

  for (const modelName of modelsToTry) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Contexto:\n${contextLines}\n\nConsulta de ${senderName}: ${promptText}` }],
          temperature: 0.5, max_tokens: 1024,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawReply: string = data?.choices?.[0]?.message?.content || '';
        return rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || 'Respuesta vacía.';
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = errData?.error?.message || `HTTP ${res.status}`;
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Error';
    }
  }
  throw new Error(lastError);
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Franco Sierralta');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'clients' | 'comex'>('chat');

  const [myStatus, setMyStatus] = useState<'online' | 'away' | 'busy'>('online');
  const [myCustomStatus, setMyCustomStatus] = useState<string>('');
  const [presenceList, setPresenceList] = useState<PresenceUser[]>([]);

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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [groqApiKey, setGroqApiKey] = useState<string>(DEFAULT_GROQ_KEY);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isAddingClient, setIsAddingClient] = useState<boolean>(false);
  const [clientName, setClientName] = useState<string>('');
  const [clientCompany, setClientCompany] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [clientStatus, setClientStatus] = useState<string>('En Aduana');
  const [clientPaid, setClientPaid] = useState<string>('');
  const [clientDebt, setClientDebt] = useState<string>('');
  const [clientArrival, setClientArrival] = useState<string>('');
  const [clientNotes, setClientNotes] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');

  const [shipments, setShipments] = useState<ComexShipment[]>([]);
  const [isAddingShipment, setIsAddingShipment] = useState<boolean>(false);
  const [shipContainer, setShipContainer] = useState<string>('');
  const [shipClient, setShipClient] = useState<string>('');
  const [boxLength, setBoxLength] = useState<string>('');
  const [boxWidth, setBoxWidth] = useState<string>('');
  const [boxHeight, setBoxHeight] = useState<string>('');
  const [boxQuantity, setBoxQuantity] = useState<string>('');
  const [cbmResult, setCbmResult] = useState<number | null>(null);

  const [isInCall, setIsInCall] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastProcessedMsgId = useRef<string | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const lastTypedAtRef = useRef<number>(0);
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const playMsnMessageSound = useCallback((isMention = false) => {
    if (!soundEnabled || myStatus === 'busy') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = isMention
        ? [{ f: 783.99, t: 0, d: 0.08 }, { f: 1046.50, t: 0.09, d: 0.08 }, { f: 783.99, t: 0.18, d: 0.08 }, { f: 1318.51, t: 0.27, d: 0.25 }]
        : [{ f: 587.33, t: 0, d: 0.09 }, { f: 880.0, t: 0.10, d: 0.09 }, { f: 1174.66, t: 0.20, d: 0.22 }];
      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.d);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + n.t); osc.stop(ctx.currentTime + n.t + n.d);
      });
    } catch {}
  }, [soundEnabled, myStatus]);

  const flashTabTitle = useCallback((sender: string, isMention = false) => {
    if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    let toggle = false;
    titleIntervalRef.current = setInterval(() => {
      document.title = toggle ? 'NEFA Software Chat' : (isMention ? `🔔 ¡${sender} te mencionó!` : `💬 ¡Mensaje de ${sender}!`);
      toggle = !toggle;
    }, 900);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
        document.title = 'NEFA Software Chat';
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const playMsnNudgeEffect = useCallback(() => {
    setIsShaking(false);
    setTimeout(() => setIsShaking(true), 10);
    setTimeout(() => setIsShaking(false), 900);
    if (typeof window !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([120, 40, 120, 40, 180, 40, 250]);
    if (!soundEnabled) return;
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
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.07);
      });
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined' && /OS [789]_/.test(navigator.userAgent)) {
      window.location.replace('/ipad/index.html');
      return;
    }

    try {
      const savedName = localStorage.getItem('nefa_username');
      const savedStatus = localStorage.getItem('nefa_status') as 'online' | 'away' | 'busy';
      const savedCustom = localStorage.getItem('nefa_custom_msg');
      const savedGroq = localStorage.getItem('nefa_groq_key');
      if (savedStatus) setMyStatus(savedStatus);
      if (savedCustom) setMyCustomStatus(savedCustom);
      if (savedGroq) setGroqApiKey(savedGroq);
      if (savedName && savedName.trim()) {
        setUserName(savedName.trim());
        setIsLoggedIn(true);
      }
    } catch {}
  }, []);

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = userName.trim() || 'Franco Sierralta';
    try { localStorage.setItem('nefa_username', clean); } catch {}
    setUserName(clean);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    try { localStorage.removeItem('nefa_username'); } catch {}
    setIsLoggedIn(false);
  };

  const handleConfigureGroqKey = () => {
    const val = prompt('Pegá tu API Key de Groq (gsk_...):', groqApiKey);
    if (val !== null) {
      const clean = val.trim();
      setGroqApiKey(clean);
      try { localStorage.setItem('nefa_groq_key', clean); } catch {}
    }
  };

  const syncPresence = useCallback(async (overrideTypingChannel?: string) => {
    if (!userName) return;
    const typingChannel = typeof overrideTypingChannel === 'string' ? overrideTypingChannel : (isTypingRef.current ? currentChatId : '');

    try {
      await sbFetch('presence?on_conflict=username', 'POST', [{
        username: userName, status: myStatus, custom_status: myCustomStatus,
        typing_in: typingChannel, typing_at: new Date().toISOString(), last_seen: new Date().toISOString(),
      }], { Prefer: 'resolution=merge-duplicates,return=minimal' });

      const list = await sbFetch('presence?select=*&order=username.asc');
      if (Array.isArray(list)) setPresenceList(list);
    } catch {}
  }, [userName, myStatus, myCustomStatus, currentChatId]);

  const fetchChannels = useCallback(async () => {
    try {
      const data = await sbFetch('channels?select=*');
      if (Array.isArray(data) && data.length > 0) {
        setChannels(data);
        setCurrentChatId(prev => data.some((c: Channel) => String(c.id) === String(prev)) ? prev : String(data[0].id));
      } else if (Array.isArray(data) && data.length === 0) {
        const initial = { id: 'gen-1', name: 'general', description: 'Coordinación general del equipo' };
        await sbFetch('channels', 'POST', [initial]);
        setChannels([initial]);
        setCurrentChatId('gen-1');
      }
    } catch {}
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const data = await sbFetch('clients?select=*&order=created_at.desc');
      if (Array.isArray(data)) setClients(data);
    } catch {}
  }, []);

  const fetchShipments = useCallback(async () => {
    try {
      const data = await sbFetch('comex_shipments?select=*&order=created_at.desc');
      if (Array.isArray(data)) setShipments(data);
    } catch {}
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
            if (latest.sender.toLowerCase() !== userName.toLowerCase()) {
              const firstName = userName.split(' ')[0].toLowerCase();
              const isMention = (latest.text || '').toLowerCase().includes(`@${firstName}`) || (latest.text || '').toLowerCase().includes(`@${userName.toLowerCase()}`);
              if (latest.type === 'poke') playMsnNudgeEffect();
              else playMsnMessageSound(isMention);
              flashTabTitle(latest.sender, isMention);
            }
          }
          lastProcessedMsgId.current = latest.id;
        }
        setMessages(data);
      }
    } catch {}
  }, [currentChatId, userName, playMsnNudgeEffect, playMsnMessageSound, flashTabTitle]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchChannels();
    fetchClients();
    fetchShipments();
    fetchMessages(true);
    syncPresence();

    const interval = setInterval(() => {
      if (isTypingRef.current && Date.now() - lastTypedAtRef.current > 4000) isTypingRef.current = false;
      fetchMessages(false);
      fetchChannels();
      fetchClients();
      fetchShipments();
      syncPresence();
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoggedIn, currentChatId, fetchChannels, fetchClients, fetchShipments, fetchMessages, syncPresence]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isAiThinking]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    const cleanName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    const cleanDesc = newChannelDesc.trim() || 'Canal del equipo';
    const newId = `ch-${Date.now()}`;
    try {
      let created: Channel[] | null = null;
      try { created = await sbFetch('channels', 'POST', [{ id: newId, name: cleanName, description: cleanDesc }]); }
      catch { created = await sbFetch('channels', 'POST', [{ name: cleanName, description: cleanDesc }]); }
      const added = Array.isArray(created) && created[0] ? created[0] : { id: newId, name: cleanName, description: cleanDesc };
      setChannels(prev => [...prev, added]);
      setCurrentChatId(String(added.id));
      setNewChannelName(''); setNewChannelDesc(''); setIsAddingChannel(false); setSidebarOpen(false);
    } catch (err: unknown) {
      setDbError(`Error creando canal: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const startEditingChannel = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChannelId(String(ch.id));
    setEditChannelName(ch.name);
    setEditChannelDesc(ch.description || '');
  };

  const handleSaveChannelEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editChannelName.trim()) return;
    const cleanName = editChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      await sbFetch(`channels?id=eq.${encodeURIComponent(id)}`, 'PATCH', { name: cleanName, description: editChannelDesc.trim() });
      setChannels(prev => prev.map(c => String(c.id) === String(id) ? { ...c, name: cleanName, description: editChannelDesc.trim() } : c));
      setEditingChannelId(null);
    } catch {}
  };

  const handleDeleteChannel = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channels.length <= 1) { setDbError('Debe quedar al menos 1 canal.'); return; }
    if (!window.confirm(`¿Eliminar #${name}?`)) return;
    try {
      await sbFetch(`messages?channel_id=eq.${encodeURIComponent(id)}`, 'DELETE');
      await sbFetch(`channels?id=eq.${encodeURIComponent(id)}`, 'DELETE');
      const remaining = channels.filter(c => String(c.id) !== String(id));
      setChannels(remaining);
      if (String(currentChatId) === String(id) && remaining.length > 0) setCurrentChatId(String(remaining[0].id));
    } catch {}
  };

  const handleUploadToFirebase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = prompt(
      `Subiendo "${file.name}". Ingresá o pegá la URL pública de Firebase Storage (Cuenta: sierraltaemiliano@gmail.com):`,
      `https://firebasestorage.googleapis.com/v0/b/chat-dcam.appspot.com/o/clients%2F${encodeURIComponent(file.name)}?alt=media`
    );

    if (fileUrl && fileUrl.trim()) {
      setClientNotes(prev => prev ? `${prev} | Archivo: ${fileUrl.trim()}` : `Archivo: ${fileUrl.trim()}`);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    const newClient: ClientRecord = {
      id: `cli-${Date.now()}`, name: clientName.trim(), company: clientCompany.trim() || 'Particular',
      phone: clientPhone.trim() || '', shipment_status: clientStatus, paid: parseFloat(clientPaid) || 0,
      total_debt: parseFloat(clientDebt) || 0, arrival_date: clientArrival.trim() || 'A definir', notes: clientNotes.trim() || ''
    };
    try {
      await sbFetch('clients', 'POST', [newClient]);
      setClients(prev => [newClient, ...prev]);
      setClientName(''); setClientCompany(''); setClientPhone(''); setClientPaid(''); setClientDebt(''); setClientArrival(''); setClientNotes(''); setIsAddingClient(false);
    } catch {}
  };

  const handleDeleteClient = async (id: string) => {
    if (!window.confirm('¿Eliminar cliente?')) return;
    try { await sbFetch(`clients?id=eq.${encodeURIComponent(id)}`, 'DELETE'); setClients(prev => prev.filter(c => c.id !== id)); } catch {}
  };

  const calculateCbm = () => {
    const l = parseFloat(boxLength) || 0, w = parseFloat(boxWidth) || 0, h = parseFloat(boxHeight) || 0, qty = parseFloat(boxQuantity) || 0;
    if (l > 0 && w > 0 && h > 0 && qty > 0) {
      const total = (l * w * h * qty) / 1000000;
      setCbmResult(Number(total.toFixed(3)));
    } else { alert('Completa las medidas correctamente.'); }
  };

  const shareCbmToChat = () => {
    if (cbmResult === null) return;
    const text = `📊 *Resultado Cotizador CBM Comex*:\n• Medidas: ${boxLength}x${boxWidth}x${boxHeight} cm\n• Cantidad: ${boxQuantity} cajas\n• CBM Total: *${cbmResult} m³*`;
    setActiveTab('chat');
    handleSendMessage('text', text);
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipContainer.trim() || !shipClient.trim()) return;
    const newShip: ComexShipment = { id: `shp-${Date.now()}`, container_code: shipContainer.trim(), client_name: shipClient.trim(), has_invoice: false, has_packing: false, has_bl: false, has_origin: false, status: 'En Origen (China)' };
    try {
      await sbFetch('comex_shipments', 'POST', [newShip]);
      setShipments(prev => [newShip, ...prev]);
      setShipContainer(''); setShipClient(''); setIsAddingShipment(false);
    } catch {}
  };

  const handleToggleDoc = async (shipId: string, field: string, currentValue: boolean) => {
    const updatedVal = !currentValue;
    setShipments(prev => prev.map(s => s.id === shipId ? { ...s, [field]: updatedVal } : s));
    try { await sbFetch(`comex_shipments?id=eq.${encodeURIComponent(shipId)}`, 'PATCH', { [field]: updatedVal }); } catch {}
  };

  const handleDeleteShipment = async (id: string) => {
    if (!window.confirm('¿Eliminar embarque?')) return;
    try { await sbFetch(`comex_shipments?id=eq.${encodeURIComponent(id)}`, 'DELETE'); setShipments(prev => prev.filter(s => s.id !== id)); } catch {}
  };
  const handleEditCustomStatus = () => {
    const val = prompt('Frase personal MSN:', myCustomStatus);
    if (val !== null) { setMyCustomStatus(val.trim()); try { localStorage.setItem('nefa_custom_msg', val.trim()); } catch {} }
  };

  const handleChangeStatus = (newSt: 'online' | 'away' | 'busy') => {
    setMyStatus(newSt);
    try { localStorage.setItem('nefa_status', newSt); } catch {}
  };

  const handleTogglePin = async (msg: Message) => {
    const newType = msg.type === 'pinned' ? 'text' : 'pinned';
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, type: newType } : m));
    try { await sbFetch(`messages?id=eq.${encodeURIComponent(msg.id)}`, 'PATCH', { type: newType }); } catch {}
  };

  const handleToggleTask = async (msg: Message) => {
    const raw = msg.text || '';
    let updated = raw;
    const shortName = userName.split(' ')[0];
    if (raw.includes('[ ] ')) updated = raw.replace('[ ] ', '[x] ') + ` (✓ ${shortName})`;
    else if (raw.includes('[x] ')) updated = raw.replace('[x] ', '[ ] ').replace(/\s*\(✓ [^)]+\)$/, '');
    else return;

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, text: updated } : m));
    try { await sbFetch(`messages?id=eq.${encodeURIComponent(msg.id)}`, 'PATCH', { text: updated }); } catch {}
  };

  const insertTaskTemplate = () => {
    if (inputText.startsWith('[ ] ')) setInputText(inputText.replace(/^\[ \]\s*/, ''));
    else setInputText(`[ ] ${inputText}`);
    inputRef.current?.focus();
  };

  const insertAiPrompt = () => {
    if (inputText.toLowerCase().startsWith('@nefa ')) setInputText(inputText.replace(/^@nefa\s+/i, ''));
    else setInputText(`@nefa ${inputText}`);
    inputRef.current?.focus();
  };

  const handleStartReply = (msg: Message) => { setReplyingTo(msg); inputRef.current?.focus(); };

  const parseMessageBody = (rawText?: string) => {
    const txt = rawText || '';
    let quoteHeader: string | null = null;
    let mainText = txt;
    if (txt.startsWith('❝ ')) {
      const newlineIdx = txt.indexOf('\n');
      if (newlineIdx !== -1) { quoteHeader = txt.substring(0, newlineIdx); mainText = txt.substring(newlineIdx + 1); }
    }
    const isTaskUnchecked = mainText.startsWith('[ ] ');
    const isTaskChecked = mainText.startsWith('[x] ');
    const isTask = isTaskUnchecked || isTaskChecked;
    const cleanTaskText = isTask ? mainText.substring(4) : mainText;
    return { quoteHeader, mainText, isTask, isTaskChecked, cleanTaskText };
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[\wáéíóúÁÉÍÓÚñÑ.-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@') && part.length > 1) {
        const isAiMention = part.toLowerCase() === '@nefa';
        return <span key={idx} className={`${isAiMention ? 'bg-purple-500/30 text-purple-200 border-purple-400/50' : 'bg-amber-400/25 text-amber-300 border-amber-400/40'} border px-1.5 py-0.5 rounded-md font-bold`}>{part}</span>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  const triggerPoke = async () => {
    playMsnNudgeEffect();
    const newMessage: Message = { id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, channel_id: currentChatId, sender: userName, text: '⚡ ¡Acaba de enviar un Zumbido!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'poke' };
    lastProcessedMsgId.current = newMessage.id;
    setMessages(prev => [...prev, newMessage]);
    try { await sbFetch('messages', 'POST', [newMessage]); } catch {}
  };

  const startCall = async (mode: 'voice' | 'video', announce = true) => {
    setCallType(mode); setIsInCall(true);
    if (announce) {
      const callLabel = mode === 'video' ? 'Videollamada' : 'Llamada de voz';
      const newMessage: Message = { id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, channel_id: currentChatId, sender: userName, text: `📞 Inició una ${callLabel} en vivo`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'call' };
      lastProcessedMsgId.current = newMessage.id;
      setMessages(prev => [...prev, newMessage]);
      try { await sbFetch('messages', 'POST', [newMessage]); } catch {}
    }
  };

  const activeChannel = channels.find(c => String(c.id) === String(currentChatId));

  const handleSendMessage = async (customType: string = 'text', textContent?: string) => {
    const rawContent = textContent ?? inputText;
    if (!rawContent.trim() && customType === 'text') return;

    let finalContent = rawContent;
    if (replyingTo && customType === 'text') {
      const cleanOriginal = (replyingTo.text || '').replace(/^❝ [^\n]+\n/, '').substring(0, 65);
      finalContent = `❝ @${replyingTo.sender}: ${cleanOriginal}\n${rawContent}`;
    }

    isTypingRef.current = false;
    const newMessage: Message = { id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, channel_id: currentChatId, sender: userName, text: finalContent, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: customType };
    lastProcessedMsgId.current = newMessage.id;
    setMessages(prev => [...prev, newMessage]);
    setInputText(''); setReplyingTo(null);

    try { await sbFetch('messages', 'POST', [newMessage]); syncPresence(''); setDbError(null); } catch {}

    if (customType === 'text' && /(?:^|\s)@nefa\b/i.test(rawContent)) {
      let activeKey = groqApiKey.trim();
      if (!activeKey) {
        const entered = prompt('Pegá tu API Key de Groq (gsk_...) para @nefa:');
        if (entered && entered.trim()) { activeKey = entered.trim(); setGroqApiKey(activeKey); try { localStorage.setItem('nefa_groq_key', activeKey); } catch {} }
        else return;
      }
      const cleanPrompt = rawContent.replace(/@nefa\b/gi, '').trim() || 'Hola';
      setIsAiThinking(true);
      try {
        const aiReply = await askGroqQwen(activeKey, cleanPrompt, [...messages, newMessage], activeChannel?.name || 'general', userName);
        const botMsg: Message = { id: `msg-${Date.now()}-ai`, channel_id: currentChatId, sender: '🤖 NEFA AI', text: `❝ @${userName}: ${cleanPrompt.substring(0, 60)}\n${aiReply}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'ai' };
        lastProcessedMsgId.current = botMsg.id;
        setMessages(prev => [...prev, botMsg]);
        await sbFetch('messages', 'POST', [botMsg]);
      } catch (err: unknown) {
        setDbError(`Error IA: ${err instanceof Error ? err.message : 'Error'}`);
      } finally { setIsAiThinking(false); }
    }
  };

  const handleInputTyping = (val: string) => {
    setInputText(val); lastTypedAtRef.current = Date.now();
    if (!isTypingRef.current && val.trim()) { isTypingRef.current = true; syncPresence(currentChatId); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSendMessage('file', `📁 Archivo adjunto: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  };

  const nowMs = Date.now();
  const combinedRoster: PresenceUser[] = React.useMemo(() => {
    const map = new Map<string, PresenceUser>();
    presenceList.forEach(p => { if (p.username) map.set(p.username.toLowerCase(), p); });
    if (userName) {
      map.set(userName.toLowerCase(), { username: userName, status: myStatus, custom_status: myCustomStatus, typing_in: isTypingRef.current ? currentChatId : '', typing_at: new Date().toISOString(), last_seen: new Date().toISOString() });
    }
    messages.forEach(m => {
      if (m.sender && m.sender !== '🤖 NEFA AI' && !map.has(m.sender.toLowerCase())) {
        map.set(m.sender.toLowerCase(), { username: m.sender, status: 'online', custom_status: '', typing_in: '', typing_at: '', last_seen: new Date().toISOString() });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [presenceList, messages, userName, myStatus, myCustomStatus, currentChatId]);

  const onlineUsersCount = combinedRoster.filter(p => nowMs - new Date(p.last_seen).getTime() < 90000).length;
  const typingUsers = combinedRoster.filter(p => nowMs - new Date(p.last_seen).getTime() < 90000 && String(p.typing_in) === String(currentChatId) && nowMs - new Date(p.typing_at).getTime() < 6000 && p.username.toLowerCase() !== userName.toLowerCase()).map(p => p.username);

  const pinnedMessages = messages.filter(m => m.type === 'pinned');
  const displayedMessages = searchQuery.trim() ? messages.filter(m => (m.text || '').toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  const filteredClients = clientSearch.trim() ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.company.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch)) : clients;

  const safeRoomName = `NEFA_Software_Room_${String(currentChatId).replace(/[^a-zA-Z0-9]/g, '_')}`;
  const jitsiUrl = `https://meet.jit.si/${safeRoomName}#userInfo.displayName="${encodeURIComponent(userName)}"&config.prejoinPageEnabled=false&config.startWithVideoMuted=${callType === 'voice'}&config.disableDeepLinking=true`;

  if (!isLoggedIn) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg"><Zap className="w-7 h-7" /></div>
            <h1 className="text-xl font-bold tracking-wide">NEFA Software Workspace</h1>
            <p className="text-xs text-slate-400">Ingresa tu nombre para entrar al sistema</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tu Nombre:</label>
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej. Franco, Ariel..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer">
              Entrar al Sistema <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <div className="pt-2 border-t border-slate-800 text-center"><a href="/ipad/index.html" className="text-[11px] text-slate-400 hover:text-blue-400 underline">Versión ligera para iPad 2 →</a></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} h-[100dvh] w-screen flex flex-col overflow-hidden font-sans ${isShaking ? 'msn-buzz-active' : ''}`}>
      <style>{`
        @keyframes msn-nudge { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-16px, -12px); } 40% { transform: translate(16px, 12px); } 60% { transform: translate(-14px, 10px); } 80% { transform: translate(14px, -10px); } }
        .msn-buzz-active { animation: msn-nudge 0.8s ease-in-out both; }
      `}</style>

      {dbError && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs flex items-center justify-between z-50 shrink-0">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{dbError}</span></div>
          <button onClick={() => setDbError(null)} className="underline ml-2">Cerrar</button>
        </div>
      )}

      <div className={`h-12 px-4 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">N</div>
          <span className="font-bold text-sm tracking-wide">NEFA Software Workspace</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-slate-800">
          <button onClick={() => setActiveTab('chat')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${activeTab === 'chat' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><MessageSquare className="w-3.5 h-3.5" /> Chat</button>
          <button onClick={() => setActiveTab('clients')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${activeTab === 'clients' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Users className="w-3.5 h-3.5" /> Clientes & Firebase</button>
          <button onClick={() => setActiveTab('comex')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${activeTab === 'comex' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Package className="w-3.5 h-3.5" /> Comex & CBM</button>
        </div>
      </div>

      {activeTab === 'clients' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Gestión de Clientes (Firebase Storage: <span className="text-purple-400 font-mono text-xs">sierraltaemiliano@gmail.com</span>)</h1>
              <p className="text-xs text-slate-400">Control de contactos, deudas, estados y archivos en la nube de Firebase.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className={`flex items-center rounded-xl border px-3 py-2 flex-1 sm:w-64 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input type="text" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente o teléfono..." className="bg-transparent border-0 outline-none text-xs w-full" />
              </div>
              <button onClick={() => setIsAddingClient(!isAddingClient)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer shrink-0"><Plus className="w-4 h-4" /> Nuevo Cliente</button>
            </div>
          </div>

          {isAddingClient && (
            <form onSubmit={handleCreateClient} className={`p-6 rounded-2xl border space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800 shadow-2xl' : 'bg-white border-slate-300'}`}>
              <h2 className="text-sm font-bold text-blue-400">Registrar Cliente y Enlazar Documentación Firebase</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Nombre:</label><input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Juan Pérez" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Empresa:</label><input type="text" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Empresa S.A." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Teléfono / Contacto:</label><input type="text" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+54 9 351..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Estado de Carga:</label>
                  <select value={clientStatus} onChange={(e) => setClientStatus(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none">
                    <option value="En origen (China)">📦 En origen (China)</option><option value="En Tránsito">🚢 En Tránsito</option><option value="En Aduana">🛃 En Aduana</option><option value="Listo para Retirar">✅ Listo para Retirar</option>
                  </select>
                </div>
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Pagó ($):</label><input type="number" step="0.01" value={clientPaid} onChange={(e) => setClientPaid(e.target.value)} placeholder="0" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Debe ($):</label><input type="number" step="0.01" value={clientDebt} onChange={(e) => setClientDebt(e.target.value)} placeholder="0" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div><label className="block text-[11px] font-semibold text-slate-400 mb-1">Llegada Est.:</label><input type="text" value={clientArrival} onChange={(e) => setClientArrival(e.target.value)} placeholder="25 de Noviembre" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Subir Documento / DNI / Factura (Firebase):</label>
                  <label className="w-full bg-purple-950/40 border border-purple-500/40 hover:bg-purple-900/40 text-purple-200 rounded-xl px-3 py-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer font-semibold">
                    <Upload className="w-3.5 h-3.5" /> Adjuntar a Firebase
                    <input type="file" onChange={handleUploadToFirebase} className="hidden" />
                  </label>
                </div>
                <div className="sm:col-span-4"><label className="block text-[11px] font-semibold text-slate-400 mb-1">Notas / Enlaces de Firebase / CBM:</label><input type="text" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} placeholder="Notas y links de Firebase..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsAddingClient(false)} className="px-4 py-2 text-xs text-slate-400">Cancelar</button><button type="submit" className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-semibold">Guardar Cliente</button></div>
            </form>
          )}

          <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] uppercase tracking-wider ${darkMode ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                    <th className="p-3.5">Cliente / Empresa</th><th className="p-3.5">Teléfono / Contacto</th><th className="p-3.5">Estado</th><th className="p-3.5">Pagó ($)</th><th className="p-3.5">Debe ($)</th><th className="p-3.5">Notas y Docs (Firebase)</th><th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredClients.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500">No hay clientes cargados.</td></tr>
                  ) : (
                    filteredClients.map(c => (
                      <tr key={c.id} className={`${darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                        <td className="p-3.5"><div className="font-bold">{c.name}</div><div className="text-[10px] text-slate-400">{c.company}</div></td>
                        <td className="p-3.5 font-mono text-emerald-400">{c.phone || 'Sin teléfono'}</td>
                        <td className="p-3.5"><span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">{c.shipment_status}</span></td>
                        <td className="p-3.5 font-semibold text-emerald-400">${Number(c.paid).toLocaleString()}</td>
                        <td className="p-3.5 font-semibold">{Number(c.total_debt) > 0 ? <span className="text-red-400">${Number(c.total_debt).toLocaleString()}</span> : <span className="text-emerald-400">Al día ✓</span>}</td>
                        <td className="p-3.5 text-slate-300 max-w-xs truncate">
                          {c.notes ? (
                            c.notes.includes('http') ? (
                              <a href={c.notes.split('http')[1] ? 'http' + c.notes.split('http')[1].split(' ')[0] : '#'} target="_blank" rel="noreferrer" className="text-purple-400 underline flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Ver archivo Firebase
                              </a>
                            ) : c.notes
                          ) : '-'}
                        </td>
                        <td className="p-3.5 text-right"><button onClick={() => handleDeleteClient(c.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'comex' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8">
          <div><h1 className="text-xl font-bold tracking-tight">Operativa Comex y Calculador CBM</h1><p className="text-xs text-slate-400">Calculá el volumen cúbico y llevá la bitácora de documentación.</p></div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-6 rounded-2xl border space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm"><Calculator className="w-4 h-4" /> <span>Calculadora Express CBM (m³)</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className="block text-[10px] font-semibold text-slate-400 mb-1">Largo (cm):</label><input type="number" value={boxLength} onChange={(e) => setBoxLength(e.target.value)} placeholder="60" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" /></div>
                <div><label className="block text-[10px] font-semibold text-slate-400 mb-1">Ancho (cm):</label><input type="number" value={boxWidth} onChange={(e) => setBoxWidth(e.target.value)} placeholder="40" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" /></div>
                <div><label className="block text-[10px] font-semibold text-slate-400 mb-1">Alto (cm):</label><input type="number" value={boxHeight} onChange={(e) => setBoxHeight(e.target.value)} placeholder="40" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" /></div>
                <div><label className="block text-[10px] font-semibold text-slate-400 mb-1">Cantidad:</label><input type="number" value={boxQuantity} onChange={(e) => setBoxQuantity(e.target.value)} placeholder="100" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" /></div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button onClick={calculateCbm} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow cursor-pointer">Calcular CBM</button>
                {cbmResult !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-emerald-400">Total: {cbmResult} m³</span>
                    <button onClick={shareCbmToChat} className="bg-purple-600 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 shadow cursor-pointer"><Share2 className="w-3.5 h-3.5" /> Compartir Chat</button>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-6 rounded-2xl border space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm"><FileText className="w-4 h-4" /> <span>Bitácora Aduanera</span></div>
                <button onClick={() => setIsAddingShipment(!isAddingShipment)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Nuevo Contenedor</button>
              </div>
              {isAddingShipment && (
                <form onSubmit={handleCreateShipment} className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" required value={shipContainer} onChange={(e) => setShipContainer(e.target.value)} placeholder="Contenedor / BL" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" />
                    <input type="text" required value={shipClient} onChange={(e) => setShipClient(e.target.value)} placeholder="Cliente" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsAddingShipment(false)} className="text-xs text-slate-400 px-2 py-1">Cancelar</button><button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold">Registrar</button></div>
                </form>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] uppercase tracking-wider ${darkMode ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                    <th className="p-3.5">Contenedor / BL</th><th className="p-3.5">Cliente</th><th className="p-3.5 text-center">Factura</th><th className="p-3.5 text-center">Packing List</th><th className="p-3.5 text-center">B/L</th><th className="p-3.5 text-center">Cert. Origen</th><th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {shipments.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500">No hay embarques cargados.</td></tr>
                  ) : (
                    shipments.map(s => (
                      <tr key={s.id} className={`${darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                        <td className="p-3.5 font-bold font-mono">{s.container_code}</td>
                        <td className="p-3.5">{s.client_name}</td>
                        <td className="p-3.5 text-center"><input type="checkbox" checked={s.has_invoice} onChange={() => handleToggleDoc(s.id, 'has_invoice', s.has_invoice)} className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" /></td>
                        <td className="p-3.5 text-center"><input type="checkbox" checked={s.has_packing} onChange={() => handleToggleDoc(s.id, 'has_packing', s.has_packing)} className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" /></td>
                        <td className="p-3.5 text-center"><input type="checkbox" checked={s.has_bl} onChange={() => handleToggleDoc(s.id, 'has_bl', s.has_bl)} className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" /></td>
                        <td className="p-3.5 text-center"><input type="checkbox" checked={s.has_origin} onChange={() => handleToggleDoc(s.id, 'has_origin', s.has_origin)} className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" /></td>
                        <td className="p-3.5 text-right"><button onClick={() => handleDeleteShipment(s.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex h-full w-full relative overflow-hidden">
          {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}
          <div className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 flex flex-col border-r transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shrink-0`}>
            
            <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow">N</div>
                <div><h1 className="font-bold text-sm">NEFA Software</h1><p className="text-[10px] text-emerald-400">● En vivo ({userName})</p></div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleConfigureGroqKey} className={`p-2 rounded-xl border ${groqApiKey ? 'border-purple-500/40 bg-purple-500/15 text-purple-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`} title="Configurar Groq"><Bot className="w-4 h-4" /></button>
                <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-200" title="Sonido">{soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}</button>
                <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-xl md:hidden text-slate-400"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Canales</span>
                  <button onClick={() => setIsAddingChannel(!isAddingChannel)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold cursor-pointer"><Plus className="w-3.5 h-3.5" /> Nuevo</button>
                </div>
                {isAddingChannel && (
                  <div className={`p-3 rounded-xl border mb-3 space-y-2 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                    <input type="text" placeholder="Nombre canal..." value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()} autoFocus className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-transparent border border-slate-700 outline-none" />
                    <input type="text" placeholder="Descripción" value={newChannelDesc} onChange={(e) => setNewChannelDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()} className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-transparent border border-slate-700 outline-none" />
                    <div className="flex justify-end gap-2 pt-1"><button onClick={() => setIsAddingChannel(false)} className="text-xs text-slate-400 px-2 py-1">Cancelar</button><button onClick={handleCreateChannel} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-semibold">Crear</button></div>
                  </div>
                )}
                {channels.map(ch => (
                  <div key={ch.id} onClick={() => { setCurrentChatId(String(ch.id)); setSidebarOpen(false); setReplyingTo(null); setSearchQuery(''); }} className={`group w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all ${String(currentChatId) === String(ch.id) ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40 font-bold' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                    {editingChannelId === String(ch.id) ? (
                      <div className="flex-1 space-y-1.5 mr-2" onClick={(e) => e.stopPropagation()}>
                        <input type="text" value={editChannelName} onChange={(e) => setEditChannelName(e.target.value)} className="w-full px-2 py-1 text-xs rounded bg-slate-950 border border-blue-500 text-white outline-none" />
                        <div className="flex gap-2 pt-1"><button onClick={(e) => handleSaveChannelEdit(String(ch.id), e)} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">Guardar</button><button onClick={(e) => { e.stopPropagation(); setEditingChannelId(null); }} className="text-slate-400 text-[10px]">Cancelar</button></div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 truncate pr-2"><Hash className="w-4 h-4 opacity-70 shrink-0" /><div className="truncate"><p className="text-xs font-semibold truncate">{ch.name}</p></div></div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={(e) => startEditingChannel(ch, e)} className="p-1 hover:bg-slate-700/50 rounded text-slate-400 hover:text-white" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
                          {channels.length > 1 && (<button onClick={(e) => handleDeleteChannel(String(ch.id), ch.name, e)} className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>)}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between px-2"><span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Equipo en línea</span><span className="text-[10px] font-bold text-emerald-400">{onlineUsersCount} activos</span></div>
                <div onClick={insertAiPrompt} className="px-2.5 py-2 rounded-xl flex items-center gap-2.5 cursor-pointer border bg-purple-950/30 border-purple-500/30 hover:bg-purple-900/40 text-purple-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                  <div className="truncate flex-1"><p className="text-xs font-bold flex items-center gap-1">🤖 @nefa <span className="text-[10px] font-normal opacity-75">(IA)</span></p><p className="text-[10px] opacity-75 truncate">Asistente logístico</p></div>
                </div>
                <div className="space-y-1">
                  {combinedRoster.map((p) => {
                    const isOnline = nowMs - new Date(p.last_seen).getTime() < 90000;
                    const dotColor = !isOnline ? 'bg-slate-600 opacity-50' : p.status === 'away' ? 'bg-amber-500' : p.status === 'busy' ? 'bg-red-500' : 'bg-emerald-500';
                    return (
                      <div key={p.username} onClick={() => { setInputText(prev => `${prev}@${p.username.split(' ')[0]} `); setSidebarOpen(false); inputRef.current?.focus(); }} className="px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 cursor-pointer hover:bg-slate-800/40">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                        <div className="truncate flex-1"><p className="text-xs font-semibold truncate">{p.username}</p>{p.custom_status && <p className="text-[10px] text-slate-400 italic truncate">“{p.custom_status}”</p>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={`p-3 border-t ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'} space-y-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">{userName.substring(0, 2).toUpperCase()}</div>
                  <div className="truncate"><p className="text-xs font-bold truncate">{userName}</p><p onClick={handleEditCustomStatus} className="text-[10px] text-blue-400 hover:underline cursor-pointer truncate max-w-[140px]">{myCustomStatus ? `“{myCustomStatus}”` : '✏️ Frase...'}</p></div>
                </div>
                <button onClick={handleLogout} className="text-xs text-red-400 hover:underline px-2 py-1">Salir</button>
              </div>
              <select value={myStatus} onChange={(e) => handleChangeStatus(e.target.value as 'online' | 'away' | 'busy')} className="w-full text-[11px] px-2 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-slate-200 cursor-pointer outline-none">
                <option value="online">🟢 Conectado</option><option value="away">🟠 Ausente</option><option value="busy">🔴 Ocupado</option>
              </select>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            <div className={`h-14 sm:h-16 px-3 sm:px-6 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between shrink-0 gap-2`}>
              <div className="flex items-center gap-2.5 truncate">
                <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl border md:hidden bg-slate-800 text-slate-200"><Menu className="w-5 h-5" /></button>
                <div className="truncate"><h2 className="font-bold text-sm sm:text-base truncate"># {activeChannel?.name || 'general'}</h2><p className="text-[10px] sm:text-xs text-slate-400 truncate">{activeChannel?.description || 'Canal de equipo'}</p></div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {searchOpen ? (
                  <div className={`flex items-center rounded-xl border px-2.5 py-1.5 ${darkMode ? 'bg-slate-950 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar..." autoFocus className="bg-transparent outline-none text-xs w-28 sm:w-40" />
                    <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-white ml-1"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setSearchOpen(true)} className="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 text-slate-300 hover:text-white" title="Buscar"><Search className="w-4 h-4" /></button>
                )}
                <button onClick={() => startCall('voice', true)} className="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 text-slate-300 hover:text-emerald-400" title="Voz"><Phone className="w-4 h-4" /></button>
                <button onClick={() => startCall('video', true)} className="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 text-slate-300 hover:text-blue-400" title="Video"><Video className="w-4 h-4" /></button>
              </div>
            </div>

            {pinnedMessages.length > 0 && (
              <div className="px-3 sm:px-6 py-2 border-b flex items-center justify-between gap-2 text-xs bg-amber-500/10 border-amber-500/30 text-amber-200 shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0 rotate-45" />
                  <span className="font-bold">Fijado ({pinnedMessages[pinnedMessages.length - 1].sender}):</span>
                  <span className="opacity-90 truncate">{(pinnedMessages[pinnedMessages.length - 1].text || '').replace(/^❝ [^\n]+\n/, '')}</span>
                </div>
                <button onClick={() => handleTogglePin(pinnedMessages[pinnedMessages.length - 1])} className="text-[10px] underline shrink-0">Desfijar</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 bg-slate-950">
              {displayedMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50 text-xs"><Hash className="w-8 h-8 mb-2" /><p>No hay mensajes en este canal todavía.</p></div>
              ) : (
                displayedMessages.map((msg) => {
                  const isAi = msg.type === 'ai' || msg.sender === '🤖 NEFA AI';
                  const isMe = !isAi && msg.sender.toLowerCase() === userName.toLowerCase();
                  const isPinned = msg.type === 'pinned';
                  const parsed = parseMessageBody(msg.text);

                  return (
                    <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && <span className={`text-[11px] font-bold mb-1 ml-1 flex items-center gap-1 ${isAi ? 'text-purple-400' : 'text-blue-400'}`}>{isAi && <Sparkles className="w-3 h-3" />}{msg.sender}</span>}
                      {msg.type === 'poke' ? (
                        <div className="my-1.5 px-4 py-2 bg-amber-500/20 border-2 border-amber-500 text-amber-400 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-lg"><BellRing className="w-4 h-4 animate-ping" /><span>¡{msg.sender} envió un Zumbido! ⚡</span></div>
                      ) : msg.type === 'call' ? (
                        <div className="my-1.5 p-3.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs flex items-center gap-3 shadow-lg">
                          <div className="p-2 bg-emerald-500 text-slate-950 rounded-xl animate-pulse"><PhoneCall className="w-4 h-4" /></div>
                          <div><p className="font-bold text-white">{msg.sender} {msg.text}</p></div>
                          <button onClick={() => startCall('video', false)} className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs">Unirse</button>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-1.5 max-w-[90%] sm:max-w-md ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`rounded-2xl px-3.5 py-2.5 shadow-sm relative ${isPinned ? 'ring-2 ring-amber-400' : ''} ${isAi ? 'bg-gradient-to-br from-purple-950/90 to-slate-900 border border-purple-500/40 text-purple-100 rounded-bl-none' : isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'}`}>
                            {parsed.quoteHeader && <div className="text-[11px] mb-1.5 px-2.5 py-1 rounded-lg border-l-2 bg-slate-800/80 border-blue-400 text-slate-300">{parsed.quoteHeader}</div>}
                            {parsed.isTask ? (
                              <div onClick={() => handleToggleTask(msg)} className="flex items-start gap-2 cursor-pointer select-none py-0.5">
                                {parsed.isTaskChecked ? <CheckSquare className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" /> : <Square className="w-4 h-4 opacity-80 shrink-0 mt-0.5" />}
                                <span className={`text-xs sm:text-sm leading-relaxed break-words ${parsed.isTaskChecked ? 'line-through opacity-75' : 'font-medium'}`}>{renderFormattedText(parsed.cleanTaskText)}</span>
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">{renderFormattedText(parsed.mainText)}</p>
                            )}
                            <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-60">
                              {isPinned && <Pin className="w-3 h-3 text-amber-300 mr-0.5" />}
                              <span>{msg.time}</span>{isMe && <CheckCheck className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => handleStartReply(msg)} className="p-1.5 rounded-lg border bg-slate-900 border-slate-800 text-slate-400 hover:text-white" title="Responder"><Reply className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleTogglePin(msg)} className="p-1.5 rounded-lg border bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400" title="Fijar"><Pin className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {(typingUsers.length > 0 || isAiThinking) && (
              <div className="px-4 py-1 text-[11px] italic flex items-center gap-2 bg-slate-950 shrink-0">
                {isAiThinking && <span className="text-purple-400 font-semibold animate-pulse">🤖 NEFA AI está pensando...</span>}
                {typingUsers.length > 0 && <span className="text-blue-400">💬 {typingUsers.join(', ')} escribiendo...</span>}
              </div>
            )}

            {replyingTo && (
              <div className="px-4 py-2 border-t flex items-center justify-between text-xs bg-slate-900 border-slate-800 text-slate-300 shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <Reply className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-bold text-blue-400">Respondiendo a {replyingTo.sender}:</span>
                  <span className="truncate opacity-80">{(replyingTo.text || '').replace(/^❝ [^\n]+\n/, '')}</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div className="p-2.5 sm:p-4 border-t bg-slate-900 border-slate-800 shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <label className="p-2.5 sm:p-3 rounded-xl border border-slate-800 bg-slate-800 text-slate-300 cursor-pointer shrink-0"><Paperclip className="w-4 h-4" /><input type="file" onChange={handleFileUpload} className="hidden" /></label>
                <button onClick={insertTaskTemplate} className="p-2.5 sm:p-3 rounded-xl border border-slate-800 bg-slate-800 text-emerald-400 shrink-0" title="Tarea"><CheckSquare className="w-4 h-4" /></button>
                <button onClick={insertAiPrompt} className="p-2.5 sm:p-3 rounded-xl border border-slate-800 bg-slate-800 text-purple-400 shrink-0" title="Consultar a @nefa"><Bot className="w-4 h-4" /></button>
                <button onClick={triggerPoke} className="p-2.5 sm:p-3 bg-amber-500 text-slate-950 rounded-xl font-bold shrink-0" title="Zumbido"><BellRing className="w-4 h-4" /></button>
                <div className="flex-1 flex items-center rounded-xl border px-3 py-2.5 bg-slate-950 border-slate-800 text-slate-100">
                  <input ref={inputRef} type="text" placeholder="Escribe un mensaje o @nefa consulta..." value={inputText} onChange={(e) => handleInputTyping(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('text')} className="w-full bg-transparent border-none outline-none text-xs sm:text-sm" />
                </div>
                <button onClick={() => handleSendMessage('text')} className="p-2.5 sm:p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow shrink-0"><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInCall && (
        <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
          <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span className="font-bold text-xs sm:text-sm text-white">Sala de llamadas en vivo</span>
            <button onClick={() => setIsInCall(false)} className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl">Salir</button>
          </div>
          <div className="flex-1 w-full bg-black"><iframe src={jitsiUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="w-full h-full border-0" title="Call" /></div>
        </div>
      )}
    </div>
  );
}
