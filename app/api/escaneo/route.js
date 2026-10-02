import { NextResponse } from 'next/server';

// Variable en memoria dentro del servidor de Vercel
let ultimoEscaneo = null;

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.codigo) {
      ultimoEscaneo = {
        codigo: body.codigo,
        clientId: body.clientId || 'desconocido',
        timestamp: Date.now()
      };
      return NextResponse.json({ success: true, codigo: body.codigo, clientId: ultimoEscaneo.clientId });
    }
    return NextResponse.json({ success: false, error: 'Código no proporcionado' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ escaneo: ultimoEscaneo });
}