import { NextResponse } from 'next/server';

export async function GET() {
  // Aquí iría tu lógica para buscar en la base de datos
  // Por ahora devolvemos un ejemplo estático para que veas que funciona
  const mockConversations = [
    {
      id: "1",
      name: "Cliente de Prueba",
      phone: "5491122334455",
      status: "Activo",
      lastMessage: "Hola, necesito info",
      time: "10:30",
      messages: [
        { text: "Hola, necesito info", sender: "client", time: "10:30" }
      ]
    }
  ];
  
  return NextResponse.json(mockConversations);
}