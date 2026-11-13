import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Conectamos con Supabase usando las variables de entorno
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) return NextResponse.json({ error: 'Falta chatId' }, { status: 400 });

  // Buscamos los mensajes en Supabase, ordenados por fecha
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Adaptamos los datos al formato que espera nuestro iPad
  const formattedData = data.map((m: any) => ({
    id: m.id,
    sender: m.sender,
    text: m.text,
    type: m.type,
    time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }));

  return NextResponse.json(formattedData);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { chatId, message } = body;

  if (!chatId || !message) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  // Guardamos el mensaje en Supabase
  const { data, error } = await supabase
    .from('messages')
    .insert([
      { 
        chat_id: chatId, 
        sender: message.sender, 
        text: message.text, 
        type: message.type 
      }
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}