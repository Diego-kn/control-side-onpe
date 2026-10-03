import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.codigo) {
      return NextResponse.json(
        { success: false, error: 'Código no proporcionado' },
        { status: 400 }
      );
    }

    const clientId = body.clientId || 'desconocido';

    const { error } = await sb.from('escaneos_pendientes').upsert({
      client_id: clientId,
      codigo: body.codigo,
      timestamp: Date.now(),
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, codigo: body.codigo, clientId });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const clientId = new URL(request.url).searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json({ escaneo: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data } = await sb
    .from('escaneos_pendientes')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  const escaneo = data
    ? { codigo: data.codigo, clientId: data.client_id, timestamp: Number(data.timestamp) }
    : null;

  return NextResponse.json({ escaneo }, { headers: { 'Cache-Control': 'no-store' } });
}