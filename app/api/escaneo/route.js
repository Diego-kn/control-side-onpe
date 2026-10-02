import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Un último escaneo POR computadora (clave = clientId)
const escaneos = {};

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.codigo) {
      const clientId = body.clientId || 'desconocido';
      escaneos[clientId] = {
        codigo: body.codigo,
        clientId,
        timestamp: Date.now(),
      };
      return NextResponse.json({ success: true, codigo: body.codigo, clientId });
    }
    return NextResponse.json({ success: false, error: 'Código no proporcionado' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  // Solo devuelve el escaneo de ESA computadora
  const escaneo = clientId ? escaneos[clientId] || null : null;
  return NextResponse.json({ escaneo }, { headers: { 'Cache-Control': 'no-store' } });
}