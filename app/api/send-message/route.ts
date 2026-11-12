import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  
  // Aquí iría tu lógica para enviar el mensaje por WhatsApp
  console.log("Mensaje a enviar:", body);

  // Simulamos que se envió correctamente
  return NextResponse.json({ success: true });
}