'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const TIPOS = [
  { id: 'ACTA_ROJA', label: 'Acta ROJA', short: 'Roja', hex: '#dc2626', color: 'bg-red-600 text-white', badge: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'ACTA_CELESTE', label: 'Acta CELESTE', short: 'Celeste', hex: '#0ea5e9', color: 'bg-sky-500 text-white', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'ACTA_VERDE', label: 'Acta VERDE', short: 'Verde', hex: '#059669', color: 'bg-emerald-600 text-white', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'ACTA_ANARANJADA', label: 'Acta ANARANJADA', short: 'Anaranj.', hex: '#f59e0b', color: 'bg-amber-500 text-white', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'CEDULAS', label: 'Cédulas', short: 'Cédulas', hex: '#334155', color: 'bg-slate-700 text-white', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  { id: 'LISTA_ELECTORES', label: 'Lista Electores', short: 'Electores', hex: '#4f46e5', color: 'bg-indigo-600 text-white', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'CONTROL_ASISTENCIA', label: 'Control Asistencia', short: 'Asistencia', hex: '#9333ea', color: 'bg-purple-600 text-white', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
];

/* ============================================================
   COMPONENTES VISUALES (solo presentación)
   ============================================================ */

const Card = ({ title, subtitle, right, children, className = '' }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
    {(title || right) && (
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const Kpi = ({ label, value, sub, accent = 'text-slate-900', icon }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
    <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center text-lg">{icon}</div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold leading-tight ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
    </div>
  </div>
);

const Empty = ({ text = 'Sin datos para mostrar' }) => (
  <div className="h-40 flex items-center justify-center text-sm text-slate-400">{text}</div>
);

// Dona
const Donut = ({ data, centerTop, centerBottom }) => {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let acc = 0;
  if (total === 0) return <Empty text="Aún no hay escaneos" />;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0">
        <g transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f5f9" strokeWidth="28" />
          {data.map((d) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.label}
                cx="100" cy="100" r={r} fill="none"
                stroke={d.color} strokeWidth="28"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="100" y="98" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 28, fontWeight: 800 }}>{centerTop}</text>
        <text x="100" y="118" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>{centerBottom}</text>
      </svg>
      <ul className="grid grid-cols-1 gap-1.5 text-xs w-full">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <span className="font-mono font-semibold text-slate-900">
              {d.value} <span className="text-slate-400 font-normal">({Math.round((d.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Barras verticales apiladas: recibidos vs faltantes
const StackedBars = ({ rows }) => {
  if (!rows.length) return <Empty />;
  const W = 640, H = 260, pad = { l: 36, r: 10, t: 14, b: 44 };
  const max = Math.max(1, ...rows.map((r) => Math.max(r.esperados, r.recibidos)));
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" style={{ fontSize: 9 }} className="fill-slate-400">{t}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const x = pad.l + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const hRec = y(0) - y(Math.min(r.recibidos, max));
        const hFal = y(0) - y(r.faltantes);
        return (
          <g key={r.id}>
            <rect x={x} y={y(r.recibidos)} width={w} height={hRec} rx="4" fill={TIPOS.find((t) => t.id === r.id).hex} />
            <rect x={x} y={y(r.recibidos) - hFal} width={w} height={hFal} rx="4" fill="#fecaca" />
            <text x={x + w / 2} y={y(r.recibidos) - hFal - 5} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700 }} className="fill-slate-700">{r.recibidos}</text>
            <text x={x + w / 2} y={H - 26} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600 }} className="fill-slate-600">{TIPOS.find((t) => t.id === r.id).short}</text>
            <text x={x + w / 2} y={H - 13} textAnchor="middle" style={{ fontSize: 9 }} className="fill-slate-400">{r.porcentajeAvance}%</text>
          </g>
        );
      })}
    </svg>
  );
};

// Radar de avance por tipo
const Radar = ({ rows }) => {
  if (!rows.length) return <Empty />;
  if (rows.length < 3) return <Empty text="Selecciona al menos 3 tipos para ver el radar" />;
  const cx = 160, cy = 150, R = 100, n = rows.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  const poly = rows.map((r, i) => pt(i, r.porcentajeAvance / 100).join(',')).join(' ');
  return (
    <svg viewBox="0 0 320 310" className="w-full max-w-sm mx-auto h-auto">
      {[0.25, 0.5, 0.75, 1].map((lv) => (
        <polygon key={lv} points={rows.map((_, i) => pt(i, lv).join(',')).join(' ')} fill="none" stroke="#e2e8f0" />
      ))}
      {rows.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" />;
      })}
      <polygon points={poly} fill="rgba(37,99,235,0.18)" stroke="#2563eb" strokeWidth="2" />
      {rows.map((r, i) => {
        const [x, y] = pt(i, r.porcentajeAvance / 100);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={r.id}>
            <circle cx={x} cy={y} r="3.5" fill="#2563eb" />
            <text x={lx} y={ly} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600 }} className="fill-slate-600">{TIPOS.find((t) => t.id === r.id).short}</text>
            <text x={lx} y={ly + 11} textAnchor="middle" style={{ fontSize: 9 }} className="fill-slate-400">{r.porcentajeAvance}%</text>
          </g>
        );
      })}
    </svg>
  );
};

// Área: escaneos por hora
const AreaChart = ({ points }) => {
  if (points.length < 1) return <Empty text="Sin escaneos en el filtro" />;
  const W = 640, H = 220, pad = { l: 34, r: 12, t: 14, b: 30 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (W - pad.l - pad.r) / (points.length - 1) : 0;
  const X = (i) => pad.l + (points.length > 1 ? i * step : (W - pad.l - pad.r) / 2);
  const Y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i)},${Y(p.value)}`).join(' ');
  const area = `${line} L${X(points.length - 1)},${Y(0)} L${X(0)},${Y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(max * t)} y2={Y(max * t)} stroke="#e2e8f0" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={Y(max * t) + 3} textAnchor="end" style={{ fontSize: 9 }} className="fill-slate-400">{Math.round(max * t)}</text>
        </g>
      ))}
      <path d={area} fill="url(#gArea)" />
      <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={X(i)} cy={Y(p.value)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
          <text x={X(i)} y={H - 10} textAnchor="middle" style={{ fontSize: 9 }} className="fill-slate-500">{p.label}</text>
        </g>
      ))}
    </svg>
  );
};

// Barras horizontales (ranking)
const HBars = ({ items, color = '#2563eb', suffix = '%', max = 100 }) => {
  if (!items.length) return <Empty />;
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className={`truncate ${it.active ? 'font-bold text-blue-700' : 'font-medium text-slate-700'}`}>{it.label}</span>
            <span className="font-mono font-bold text-slate-900 shrink-0">{it.value}{suffix}{it.extra ? <span className="text-slate-400 font-normal"> · {it.extra}</span> : null}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (it.value / max) * 100)}%`, background: it.color || color }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const heatColor = (p) => {
  if (p === null) return '#f8fafc';
  if (p >= 100) return '#059669';
  if (p >= 75) return '#34d399';
  if (p >= 50) return '#fde047';
  if (p >= 25) return '#fb923c';
  if (p > 0) return '#f87171';
  return '#fecaca';
};

/* ============================================================
   PÁGINA PRINCIPAL
   ============================================================ */

export default function Home() {
  const [vista, setVista] = useState('registro');
  const [tipoSeleccionado, setTipoSeleccionado] = useState('ACTA_ROJA');
  const [codigoInput, setCodigoInput] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [ultimosRegistros, setUltimosRegistros] = useState([]);

  // Estados para Maestros y Filtros
  const [maestroMesas, setMaestroMesas] = useState([]);
  const [distritosUnicos, setDistritosUnicos] = useState([]);
  const [localesFiltrados, setLocalesFiltrados] = useState([]);

  const [filtroDistrito, setFiltroDistrito] = useState('TODOS');
  const [filtroLocal, setFiltroLocal] = useState('TODOS');

  // NUEVO: filtro (checklist) de tipos de documento a visualizar en reportes
  const [tiposVisibles, setTiposVisibles] = useState(TIPOS.map((t) => t.id));

  // Estados para métricas y reportes
  const [resumenData, setResumenData] = useState([]);
  const [totalMesasEsperadas, setTotalMesasEsperadas] = useState(231);
  const [registrosFiltradosRaw, setRegistrosFiltradosRaw] = useState([]);
  const [todosRegistros, setTodosRegistros] = useState([]);

  // Referencias para elementos de Audio pre-cargados
  const audioSuccessRef = useRef(null);
  const audioErrorRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const inputRef = useRef(null);
  const ultimoTimestampRef = useRef(0); // persiste al cambiar de tipo de documento

  // Inicialización y precarga de audio con desbloqueo de Autoplay
  useEffect(() => {
    audioSuccessRef.current = new Audio('/qrico.ogg');
    audioErrorRef.current = new Audio('/error.ogg');

    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;

      const p1 = audioSuccessRef.current.play();
      if (p1 !== undefined) {
        p1.then(() => {
          audioSuccessRef.current.pause();
          audioSuccessRef.current.currentTime = 0;
        }).catch(() => {});
      }

      const p2 = audioErrorRef.current.play();
      if (p2 !== undefined) {
        p2.then(() => {
          audioErrorRef.current.pause();
          audioErrorRef.current.currentTime = 0;
        }).catch(() => {});
      }

      audioUnlockedRef.current = true;
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    cargarMaestro();
  }, []);

  useEffect(() => {
    if (vista === 'registro') {
      inputRef.current?.focus();
      cargarUltimos();
    } else {
      cargarReporte();
    }
  }, [vista, filtroDistrito, filtroLocal, maestroMesas]);

  // CONSULTAR API DE ESCANEO CONTINUAMENTE (POLLING DESDE TAMPERMONKEY)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/escaneo');
        const data = await res.json();

        if (data.escaneo && data.escaneo.timestamp > ultimoTimestampRef.current) {
          ultimoTimestampRef.current = data.escaneo.timestamp;
          console.log("📥 Código recibido en Vercel vía API:", data.escaneo.codigo);

          // Actualiza el campo de texto en pantalla
          setCodigoInput(data.escaneo.codigo);

          // Dispara la función que procesa y guarda el registro
          ejecutarRegistro(data.escaneo.codigo, tipoSeleccionado);
        }
      } catch (err) {
        console.error("Error al consultar /api/escaneo:", err);
      }
    }, 400); // Revisa si hay código nuevo cada 400 ms

    return () => clearInterval(interval);
  }, [tipoSeleccionado]);

  const cargarMaestro = async () => {
    const { data } = await supabase.from('locales_mesas').select('*');
    if (data && data.length > 0) {
      setMaestroMesas(data);
      const dists = Array.from(new Set(data.map(d => d.distrito))).sort();
      setDistritosUnicos(dists);
    }
  };

  useEffect(() => {
    if (filtroDistrito === 'TODOS') {
      const locales = Array.from(new Set(maestroMesas.map(d => d.local_votacion))).sort();
      setLocalesFiltrados(locales);
    } else {
      const locales = Array.from(
        new Set(maestroMesas.filter(m => m.distrito === filtroDistrito).map(d => d.local_votacion))
      ).sort();
      setLocalesFiltrados(locales);
    }
    setFiltroLocal('TODOS');
  }, [filtroDistrito, maestroMesas]);

  const cargarUltimos = async () => {
    const { data } = await supabase
      .from('registros')
      .select('*')
      .order('fecha_registro', { ascending: false })
      .limit(10);
    if (data) setUltimosRegistros(data);
  };

  const cargarReporte = async () => {
    let mesasFiltradas = maestroMesas;
    if (filtroDistrito !== 'TODOS') {
      mesasFiltradas = mesasFiltradas.filter(m => m.distrito === filtroDistrito);
    }
    if (filtroLocal !== 'TODOS') {
      mesasFiltradas = mesasFiltradas.filter(m => m.local_votacion === filtroLocal);
    }

    const countEsperado = mesasFiltradas.length || (filtroDistrito === 'TODOS' && filtroLocal === 'TODOS' ? 231 : 0);
    setTotalMesasEsperadas(countEsperado);

    const { data } = await supabase.from('registros').select('*');
    if (!data) return;

    setTodosRegistros(data);

    let escaneos = data;
    if (filtroDistrito !== 'TODOS') {
      escaneos = escaneos.filter(r => r.distrito === filtroDistrito);
    }
    if (filtroLocal !== 'TODOS') {
      escaneos = escaneos.filter(r => r.local_votacion === filtroLocal);
    }

    setRegistrosFiltradosRaw(escaneos);

    const conteos = {};
    TIPOS.forEach(t => conteos[t.id] = 0);

    escaneos.forEach(r => {
      if (conteos[r.tipo_documento] !== undefined) {
        conteos[r.tipo_documento]++;
      }
    });

    const reporte = TIPOS.map(t => {
      const recibidos = conteos[t.id];
      const faltantes = Math.max(0, countEsperado - recibidos);
      const porcentajeAvance = countEsperado > 0 ? Math.min(100, Math.round((recibidos / countEsperado) * 100)) : 0;
      const porcentajeFaltante = countEsperado > 0 ? Math.max(0, 100 - porcentajeAvance) : 0;

      return {
        tipo: t.label,
        id: t.id,
        recibidos,
        esperados: countEsperado,
        faltantes,
        porcentajeAvance,
        porcentajeFaltante
      };
    });

    setResumenData(reporte);
  };

  const validarFormatoCodigo = (codigoUpper, tipo) => {
    const esNumero = (str) => /^\d+$/.test(str);

    switch (tipo) {
      case 'CEDULAS':
        if (!codigoUpper.endsWith('CE')) {
          return 'El código para CÉDULAS debe terminar en "CE".';
        }
        break;

      case 'LISTA_ELECTORES':
        if (
          codigoUpper.length !== 13 ||
          !esNumero(codigoUpper.substring(0, 12)) ||
          !codigoUpper.endsWith('A')
        ) {
          return 'LISTA DE ELECTORES debe tener 12 números seguidos de la letra "A" (Ej: 123456789012A).';
        }
        break;

      case 'CONTROL_ASISTENCIA':
        if (
          codigoUpper.length !== 9 ||
          !esNumero(codigoUpper.substring(0, 8)) ||
          !codigoUpper.endsWith('A')
        ) {
          return 'CONTROL DE ASISTENCIA debe tener 8 números seguidos de la letra "A" (Ej: 12345678A).';
        }
        break;

      case 'ACTA_CELESTE':
        if (
          codigoUpper.length !== 9 ||
          !esNumero(codigoUpper.substring(0, 8)) ||
          (!codigoUpper.endsWith('F') && !codigoUpper.endsWith('C'))
        ) {
          return 'ACTA CELESTE debe tener 8 números y terminar en "F" o "C".';
        }
        break;

      case 'ACTA_VERDE':
        if (
          codigoUpper.length !== 9 ||
          !esNumero(codigoUpper.substring(0, 8)) ||
          (!codigoUpper.endsWith('J') && !codigoUpper.endsWith('D'))
        ) {
          return 'ACTA VERDE debe tener 8 números y terminar en "J" o "D".';
        }
        break;

      case 'ACTA_ROJA':
        if (
          codigoUpper.length !== 9 ||
          !esNumero(codigoUpper.substring(0, 8)) ||
          (!codigoUpper.endsWith('K') && !codigoUpper.endsWith('E'))
        ) {
          return 'ACTA ROJA debe tener 8 números y terminar en "K" o "E".';
        }
        break;

      default:
        break;
    }

    return null;
  };

  // REPRODUCCIÓN ROBUSTA DE AUDIO
  const playBeep = (exito) => {
    try {
      const audio = exito ? audioSuccessRef.current : audioErrorRef.current;
      if (audio) {
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Bloqueo de reproductor o archivo faltante:', err);
          });
        }
      }
    } catch (e) {
      console.error('Error en reproducción de audio:', e);
    }
  };

  // LÓGICA DE REGISTRO REUTILIZABLE
  const ejecutarRegistro = async (codigo, tipoDoc) => {
    if (!codigo) return;

    const codigoUpper = codigo.trim().toUpperCase();
    const codigoLower = codigo.trim().toLowerCase();

    // 1. VALIDACIÓN GENERAL
    const esLink =
      codigoLower.startsWith('http') ||
      codigoLower.includes('www.') ||
      codigoLower.includes('.gob.pe') ||
      codigoLower.includes('.com') ||
      codigoLower.includes('.pe');

    if (esLink || codigoUpper.length < 6) {
      playBeep(false);
      setMensaje({
        tipo: 'error',
        texto: `❌ CÓDIGO INVÁLIDO: Formato no permitido o QR web detectado.`
      });
      setCodigoInput('');
      inputRef.current?.focus();
      return;
    }

    // 2. VALIDACIÓN ESPECÍFICA POR TIPO SELECCIONADO
    const errorFormato = validarFormatoCodigo(codigoUpper, tipoDoc);
    if (errorFormato) {
      playBeep(false);
      setMensaje({
        tipo: 'error',
        texto: `🚫 TIPO INCORRECTO: ${errorFormato}`
      });
      setCodigoInput('');
      inputRef.current?.focus();
      return;
    }

    // EXTRAER LOS 6 PRIMEROS DÍGITOS PARA LA MESA
    const mesa = codigoUpper.substring(0, 6);

    let localVotacion = 'LOCAL DESCONOCIDO';
    let distrito = 'NO ASIGNADO';

    const { data: localData } = await supabase
      .from('locales_mesas')
      .select('local_votacion, distrito')
      .eq('numero_mesa', mesa)
      .single();

    if (localData) {
      localVotacion = localData.local_votacion.toUpperCase();
      distrito = localData.distrito.toUpperCase();
    }

    // INSERTAR EN SUPABASE
    const { error } = await supabase
      .from('registros')
      .insert([
        {
          codigo_barras: codigoUpper,
          numero_mesa: mesa,
          tipo_documento: tipoDoc,
          local_votacion: localVotacion,
          distrito: distrito
        },
      ]);

    if (error) {
      if (error.code === '23505') {
        playBeep(false);
        setMensaje({ tipo: 'error', texto: `⚠️ ¡DUPLICADO! El código "${codigoUpper}" ya fue registrado.` });
      } else {
        playBeep(false);
        setMensaje({ tipo: 'error', texto: `Error: ${error.message}` });
      }
    } else {
      playBeep(true);
      setMensaje({
        tipo: 'exito',
        texto: `✅ MESA ${mesa} | LOCAL: ${localVotacion} (${distrito}) | ${tipoDoc}`
      });
      cargarUltimos();
    }

    setCodigoInput('');
    inputRef.current?.focus();
  };

  const procesarEscaneo = (e) => {
    e.preventDefault();
    ejecutarRegistro(codigoInput, tipoSeleccionado);
  };

  /* ============================================================
     FILTRO DE TIPOS (CHECKLIST)
     ============================================================ */
  const todosMarcados = tiposVisibles.length === TIPOS.length;

  const toggleTipoVisible = (id) => {
    setTiposVisibles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTodosTipos = () => {
    setTiposVisibles(todosMarcados ? [] : TIPOS.map((t) => t.id));
  };

  // Tipos activos (respetando el orden original)
  const tiposActivos = useMemo(
    () => TIPOS.filter((t) => tiposVisibles.includes(t.id)),
    [tiposVisibles]
  );
  const nTipos = tiposActivos.length;

  // Datos ya filtrados por tipo
  const resumenVis = useMemo(
    () => resumenData.filter((r) => tiposVisibles.includes(r.id)),
    [resumenData, tiposVisibles]
  );
  const registrosVis = useMemo(
    () => registrosFiltradosRaw.filter((r) => tiposVisibles.includes(r.tipo_documento)),
    [registrosFiltradosRaw, tiposVisibles]
  );
  const todosVis = useMemo(
    () => todosRegistros.filter((r) => tiposVisibles.includes(r.tipo_documento)),
    [todosRegistros, tiposVisibles]
  );

  const exportarExcel = async () => {
    if (!registrosVis || registrosVis.length === 0) {
      alert('No hay datos registrados con el filtro seleccionado para exportar.');
      return;
    }

    const formateado = registrosVis.map(row => ({
      'Código de Barras': row.codigo_barras,
      'Número de Mesa': row.numero_mesa,
      'Local de Votación': row.local_votacion,
      'Distrito': row.distrito,
      'Tipo de Documento': row.tipo_documento,
      'Fecha y Hora': new Date(row.fecha_registro).toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(formateado);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registros SIDE');

    XLSX.writeFile(workbook, `BD_SIDE_${filtroDistrito}_${filtroLocal}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const getTipoStyle = (tipoId) => {
    return TIPOS.find(t => t.id === tipoId) || { badge: 'bg-slate-100 text-slate-800 border-slate-300', label: tipoId };
  };

  /* ============================================================
     ANALÍTICA DERIVADA (solo para gráficos)
     ============================================================ */
  const analitica = useMemo(() => {
    const mesasFiltradas = maestroMesas.filter(
      (m) =>
        (filtroDistrito === 'TODOS' || m.distrito === filtroDistrito) &&
        (filtroLocal === 'TODOS' || m.local_votacion === filtroLocal)
    );

    const totalRecibidos = resumenVis.reduce((a, r) => a + r.recibidos, 0);
    const totalEsperadoDocs = totalMesasEsperadas * nTipos;
    const avanceGlobal = totalEsperadoDocs > 0 ? Math.min(100, Math.round((totalRecibidos / totalEsperadoDocs) * 100)) : 0;
    const faltantesTotal = resumenVis.reduce((a, r) => a + r.faltantes, 0);

    // Tipos distintos por mesa
    const tiposPorMesa = {};
    registrosVis.forEach((r) => {
      if (!tiposPorMesa[r.numero_mesa]) tiposPorMesa[r.numero_mesa] = new Set();
      tiposPorMesa[r.numero_mesa].add(r.tipo_documento);
    });

    const buckets = Array.from({ length: nTipos + 1 }, (_, i) => ({ n: i, mesas: 0 }));
    let mesasCompletas = 0;
    const base = mesasFiltradas.length > 0 ? mesasFiltradas.map((m) => m.numero_mesa) : Object.keys(tiposPorMesa);
    base.forEach((mesa) => {
      const k = tiposPorMesa[mesa] ? tiposPorMesa[mesa].size : 0;
      buckets[Math.min(k, nTipos)].mesas++;
      if (nTipos > 0 && k >= nTipos) mesasCompletas++;
    });

    // Escaneos por hora
    const porHora = {};
    registrosVis.forEach((r) => {
      const h = new Date(r.fecha_registro).getHours();
      porHora[h] = (porHora[h] || 0) + 1;
    });
    const horas = Object.keys(porHora).map(Number);
    const puntosHora = [];
    if (horas.length) {
      const hMin = Math.min(...horas);
      const hMax = Math.max(...horas);
      for (let h = hMin; h <= hMax; h++) puntosHora.push({ label: `${String(h).padStart(2, '0')}h`, value: porHora[h] || 0 });
    }

    // Ranking por distrito (siempre sobre todo el universo, pero solo tipos visibles)
    const mesasPorDist = {};
    maestroMesas.forEach((m) => { mesasPorDist[m.distrito] = (mesasPorDist[m.distrito] || 0) + 1; });
    const recPorDist = {};
    todosVis.forEach((r) => { recPorDist[r.distrito] = (recPorDist[r.distrito] || 0) + 1; });
    const rankingDistritos = Object.keys(mesasPorDist)
      .map((d) => {
        const esp = mesasPorDist[d] * nTipos;
        const rec = recPorDist[d] || 0;
        return { label: d, value: esp > 0 ? Math.min(100, Math.round((rec / esp) * 100)) : 0, extra: `${rec}/${esp}`, active: d === filtroDistrito };
      })
      .sort((a, b) => b.value - a.value);

    // Heatmap local x tipo (solo columnas visibles)
    const locales = {};
    mesasFiltradas.forEach((m) => {
      if (!locales[m.local_votacion]) locales[m.local_votacion] = { mesas: 0, tipos: {} };
      locales[m.local_votacion].mesas++;
    });
    registrosVis.forEach((r) => {
      if (locales[r.local_votacion]) {
        locales[r.local_votacion].tipos[r.tipo_documento] = (locales[r.local_votacion].tipos[r.tipo_documento] || 0) + 1;
      }
    });
    const heat = Object.keys(locales)
      .map((loc) => {
        const info = locales[loc];
        const celdas = tiposActivos.map((t) => (info.mesas > 0 ? Math.min(100, Math.round(((info.tipos[t.id] || 0) / info.mesas) * 100)) : null));
        const avg = nTipos > 0 ? Math.round(celdas.reduce((a, b) => a + (b || 0), 0) / nTipos) : 0;
        return { local: loc, mesas: info.mesas, celdas, avg };
      })
      .sort((a, b) => a.avg - b.avg);

    const rankingLocales = [...heat]
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8)
      .map((h) => ({ label: h.local, value: h.avg, extra: `${h.mesas} mesas`, color: heatColor(h.avg) === '#f8fafc' ? '#2563eb' : undefined }));

    return { totalRecibidos, totalEsperadoDocs, avanceGlobal, faltantesTotal, buckets, mesasCompletas, puntosHora, rankingDistritos, heat, rankingLocales };
  }, [maestroMesas, registrosVis, todosVis, resumenVis, tiposActivos, nTipos, filtroDistrito, filtroLocal, totalMesasEsperadas]);

  const donutData = tiposActivos.map((t) => ({
    label: t.label,
    color: t.hex,
    value: resumenVis.find((r) => r.id === t.id)?.recibidos || 0,
  }));

  const tipoActual = TIPOS.find((t) => t.id === tipoSeleccionado);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">

      {/* ===== BARRA SUPERIOR ===== */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-lg shadow-inner">🗳️</div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight leading-tight">Control Parallel SIDE · ONPE</h1>
              <p className="text-[11px] text-slate-400">Mapeo por local de votación, distrito y detección de faltantes</p>
            </div>
          </div>
          <nav className="flex gap-1 bg-white/10 p-1 rounded-xl self-start sm:self-auto">
            {[
              { id: 'registro', label: '📷 Registro' },
              { id: 'reportes', label: '📊 Reportes y Gráficos' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setVista(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  vista === tab.id ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ============================================================
            VISTA 1: REGISTRO
            ============================================================ */}
        {vista === 'registro' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            <div className="lg:col-span-3 space-y-6">
              {/* Paso 1 */}
              <Card
                title="1 · Tipo de documento"
                subtitle="Selecciona el material que vas a escanear"
                right={
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${tipoActual.color}`}>{tipoActual.label}</span>
                }
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TIPOS.map((t) => {
                    const activo = tipoSeleccionado === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => { setTipoSeleccionado(t.id); inputRef.current?.focus(); }}
                        className={`relative p-3 rounded-xl text-xs font-bold transition-all border-2 text-left ${
                          activo
                            ? `${t.color} border-transparent shadow-lg scale-[1.03]`
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="block h-1.5 w-8 rounded-full mb-2"
                          style={{ background: activo ? 'rgba(255,255,255,0.7)' : t.hex }}
                        />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Paso 2 */}
              <Card title="2 · Escanear código de barras" subtitle="El cursor permanece activo para el lector">
                <form onSubmit={procesarEscaneo}>
                  <div className="relative">
                    <svg
                      className="absolute left-4 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 pointer-events-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M4 5v14M8 5v14M12 5v14M16 5v14M20 5v14" />
                      <path d="M6 5v14" strokeWidth="1" />
                    </svg>
                    <input
                      ref={inputRef}
                      type="text"
                      value={codigoInput}
                      onChange={(e) => setCodigoInput(e.target.value)}
                      placeholder="Escanea aquí..."
                      className="w-full text-2xl font-mono pl-16 pr-4 py-5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:outline-none transition"
                      autoFocus
                    />
                  </div>
                </form>

                {mensaje ? (
                  <div
                    className={`mt-4 p-4 rounded-xl font-bold text-sm flex items-start gap-3 border-l-4 ${
                      mensaje.tipo === 'error'
                        ? 'bg-red-50 text-red-800 border-red-500 animate-bounce'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-500'
                    }`}
                  >
                    {mensaje.texto}
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-sm text-slate-400 text-center">
                    Esperando escaneo…
                  </div>
                )}
              </Card>
            </div>

            {/* Últimos escaneos */}
            <div className="lg:col-span-2">
              <Card title="Últimos escaneos" subtitle="Las 10 lecturas más recientes" className="h-full">
                {ultimosRegistros.length === 0 ? (
                  <Empty text="Aún no hay registros" />
                ) : (
                  <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
                    {ultimosRegistros.map((r) => {
                      const infoTipo = getTipoStyle(r.tipo_documento);
                      return (
                        <li key={r.id} className="ml-4 relative">
                          <span
                            className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white"
                            style={{ background: TIPOS.find((t) => t.id === r.tipo_documento)?.hex || '#94a3b8' }}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900">{r.codigo_barras}</span>
                            <span className="text-[11px] font-mono text-slate-400">{new Date(r.fecha_registro).toLocaleTimeString()}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${infoTipo.badge}`}>
                              {infoTipo.label || r.tipo_documento}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              <b className="text-slate-900">Mesa {r.numero_mesa}</b> · {r.local_votacion || 'S/L'} ({r.distrito || 'S/D'})
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ============================================================
            VISTA 2: REPORTES
            ============================================================ */}
        {vista === 'reportes' && (
          <div className="space-y-6">

            {/* Filtros + exportar */}
            <Card>
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">📍 Distrito</label>
                    <select
                      value={filtroDistrito}
                      onChange={(e) => setFiltroDistrito(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="TODOS">TODOS LOS DISTRITOS</option>
                      {distritosUnicos.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">🏫 Local de votación</label>
                    <select
                      value={filtroLocal}
                      onChange={(e) => setFiltroLocal(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="TODOS">TODOS LOS LOCALES DE VOTACIÓN</option>
                      {localesFiltrados.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={exportarExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  📥 Exportar Excel (.xlsx)
                </button>
              </div>
            </Card>

            {/* NUEVO: Checklist de tipos de documento */}
            <Card
              title="🗂️ Tipos de documento a visualizar"
              subtitle="Marca solo los que quieres ver en todos los gráficos, tablas y en el Excel"
              right={
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-slate-900 text-white">
                  {nTipos} de {TIPOS.length} seleccionados
                </span>
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                {/* Opción TODOS */}
                <label
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-xs font-bold transition-all select-none ${
                    todosMarcados
                      ? 'bg-slate-900 text-white border-slate-900 shadow'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={toggleTodosTipos}
                    className="h-4 w-4 accent-blue-600 cursor-pointer"
                  />
                  TODOS
                </label>

                {TIPOS.map((t) => {
                  const marcado = tiposVisibles.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-xs font-bold transition-all select-none ${
                        marcado ? 'bg-white shadow' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-400'
                      }`}
                      style={marcado ? { borderColor: t.hex, color: '#0f172a' } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleTipoVisible(t.id)}
                        className="h-4 w-4 cursor-pointer"
                        style={{ accentColor: t.hex }}
                      />
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.hex }} />
                      <span className="leading-tight">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </Card>

            {nTipos === 0 ? (
              <Card>
                <Empty text="Selecciona al menos un tipo de documento para visualizar los reportes" />
              </Card>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Kpi icon="🧾" label="Mesas esperadas" value={totalMesasEsperadas} sub="según el filtro actual" />
                  <Kpi icon="✅" label="Documentos recibidos" value={analitica.totalRecibidos} sub={`de ${analitica.totalEsperadoDocs} esperados`} accent="text-emerald-600" />
                  <Kpi icon="⏳" label="Documentos faltantes" value={analitica.faltantesTotal} sub="suma de los tipos seleccionados" accent="text-red-600" />
                  <Kpi icon="🏁" label="Mesas completas" value={analitica.mesasCompletas} sub={`con ${nTipos === 1 ? 'el documento' : `los ${nTipos} documentos`} seleccionados`} accent="text-blue-600" />
                </div>

                {/* Avance global + progreso por tipo */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card title="Avance global" subtitle="Documentos seleccionados combinados" className="lg:col-span-1">
                    <div className="flex flex-col items-center">
                      <svg viewBox="0 0 200 120" className="w-full max-w-[280px]">
                        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#e2e8f0" strokeWidth="18" strokeLinecap="round" />
                        <path
                          d="M 20 110 A 80 80 0 0 1 180 110"
                          fill="none"
                          stroke={analitica.avanceGlobal >= 75 ? '#059669' : analitica.avanceGlobal >= 40 ? '#f59e0b' : '#dc2626'}
                          strokeWidth="18"
                          strokeLinecap="round"
                          pathLength="100"
                          strokeDasharray={`${analitica.avanceGlobal} 100`}
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                        <text x="100" y="95" textAnchor="middle" style={{ fontSize: 34, fontWeight: 800 }} className="fill-slate-900">{analitica.avanceGlobal}%</text>
                        <text x="100" y="112" textAnchor="middle" style={{ fontSize: 9 }} className="fill-slate-400">COMPLETADO</text>
                      </svg>
                      <p className="text-xs text-slate-500 mt-2 text-center">
                        {analitica.totalRecibidos} de {analitica.totalEsperadoDocs} documentos registrados
                      </p>
                    </div>
                  </Card>

                  <Card title="Progreso por tipo de material" subtitle="Recibidos vs faltantes" className="lg:col-span-2">
                    <div className="space-y-4">
                      {resumenVis.map((row) => {
                        const t = TIPOS.find((x) => x.id === row.id);
                        return (
                          <div key={row.id}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <span className="h-3 w-3 rounded" style={{ background: t.hex }} />
                                {row.tipo}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] font-mono">
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  Completado <b>{row.recibidos}</b> ({row.porcentajeAvance}%)
                                </span>
                                <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                                  Falta <b>{row.faltantes}</b> ({row.porcentajeFaltante}%)
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                              <div
                                style={{ width: `${row.porcentajeAvance}%` }}
                                className="bg-emerald-500 transition-all duration-700 flex items-center justify-center text-[10px] text-white font-bold"
                              >
                                {row.porcentajeAvance > 7 && `${row.porcentajeAvance}%`}
                              </div>
                              <div
                                style={{ width: `${row.porcentajeFaltante}%` }}
                                className="bg-red-400 transition-all duration-700 flex items-center justify-center text-[10px] text-white font-bold"
                              >
                                {row.porcentajeFaltante > 7 && `${row.porcentajeFaltante}%`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                {/* Análisis intermedio */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card title="Recibidos y faltantes por tipo" subtitle="Color = recibidos · Rosado = faltantes">
                    <StackedBars rows={resumenVis} />
                  </Card>
                  <Card title="Composición de lo escaneado" subtitle="Participación de cada tipo en el total">
                    <Donut data={donutData} centerTop={analitica.totalRecibidos} centerBottom="documentos" />
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card title="Radar de avance" subtitle={`Equilibrio entre ${nTipos === 1 ? 'el tipo' : `los ${nTipos} tipos`} de material seleccionados`}>
                    <Radar rows={resumenVis} />
                  </Card>
                  <Card title="Mesas según documentos recibidos" subtitle={`Cuántas mesas tienen 0, 1… ${nTipos} tipo${nTipos === 1 ? '' : 's'} de documento`}>
                    <HBars
                      items={analitica.buckets.map((b) => ({
                        label: b.n === nTipos ? `${b.n} (completas)` : `${b.n} ${b.n === 1 ? 'tipo' : 'tipos'}`,
                        value: b.mesas,
                        color: b.n === nTipos ? '#059669' : b.n === 0 ? '#dc2626' : '#2563eb',
                      }))}
                      suffix=" mesas"
                      max={Math.max(1, ...analitica.buckets.map((b) => b.mesas))}
                    />
                  </Card>
                </div>

                {/* Análisis avanzado */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card title="Ritmo de escaneo por hora" subtitle="Productividad de la digitación durante el día">
                    <AreaChart points={analitica.puntosHora} />
                  </Card>
                  <Card title="Ranking de distritos" subtitle="% de avance sobre el total esperado (resalta el distrito filtrado)">
                    <div className="max-h-72 overflow-y-auto pr-2">
                      <HBars items={analitica.rankingDistritos} />
                    </div>
                  </Card>
                </div>

                <Card title="Mejores locales de votación" subtitle="Top 8 por % de avance dentro del filtro">
                  <HBars items={analitica.rankingLocales} />
                </Card>

                {/* Mapa de calor */}
                <Card
                  title="Mapa de calor · Local × Tipo de documento"
                  subtitle="Ordenado de menor a mayor avance para detectar rápido dónde faltan documentos"
                  right={
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500">
                      {[0, 25, 50, 75, 100].map((p) => (
                        <span key={p} className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded" style={{ background: heatColor(p === 0 ? 0 : p) }} />{p}%
                        </span>
                      ))}
                    </div>
                  }
                >
                  {analitica.heat.length === 0 ? (
                    <Empty />
                  ) : (
                    <div className="overflow-auto max-h-[28rem] rounded-xl border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900 text-white">
                          <tr>
                            <th className="p-2.5 text-left font-semibold">Local de votación</th>
                            <th className="p-2.5 text-center font-semibold">Mesas</th>
                            {tiposActivos.map((t) => (
                              <th key={t.id} className="p-2.5 text-center font-semibold whitespace-nowrap">{t.short}</th>
                            ))}
                            <th className="p-2.5 text-center font-semibold">Prom.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analitica.heat.map((h) => (
                            <tr key={h.local} className="border-t border-slate-100">
                              <td className="p-2.5 font-semibold text-slate-800 min-w-[200px]">{h.local}</td>
                              <td className="p-2.5 text-center font-mono text-slate-500">{h.mesas}</td>
                              {h.celdas.map((c, i) => (
                                <td key={i} className="p-1">
                                  <div
                                    className="rounded-md py-1.5 text-center font-mono font-bold"
                                    style={{ background: heatColor(c), color: c !== null && c >= 50 && c < 75 ? '#713f12' : c >= 75 ? '#fff' : '#7f1d1d' }}
                                  >
                                    {c === null ? '–' : `${c}%`}
                                  </div>
                                </td>
                              ))}
                              <td className="p-2.5 text-center font-mono font-extrabold text-slate-900">{h.avg}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                {/* Tabla consolidada */}
                <Card title="Detalle consolidado" subtitle="Cifras exactas por tipo de material">
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900 text-white uppercase text-[11px] tracking-wider">
                        <tr>
                          <th className="p-3">Tipo de material</th>
                          <th className="p-3 text-center">Recibidos</th>
                          <th className="p-3 text-center">% Recibido</th>
                          <th className="p-3 text-center">Faltantes</th>
                          <th className="p-3 text-center">% Faltante</th>
                          <th className="p-3 text-center">Total esperados</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumenVis.map((row) => {
                          const t = TIPOS.find((x) => x.id === row.id);
                          return (
                            <tr key={row.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">
                                <span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: t.hex }} />
                                {row.tipo}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-600 bg-emerald-50/50">{row.recibidos}</td>
                              <td className="p-3 text-center font-mono text-emerald-700 font-semibold">{row.porcentajeAvance}%</td>
                              <td className={`p-3 text-center font-mono font-bold ${row.faltantes > 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-400'}`}>
                                {row.faltantes}
                              </td>
                              <td className="p-3 text-center font-mono text-red-700 font-semibold">{row.porcentajeFaltante}%</td>
                              <td className="p-3 text-center font-mono text-slate-500">{row.esperados}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-slate-400 py-6">Control Parallel SIDE · ONPE</footer>
    </div>
  );
}