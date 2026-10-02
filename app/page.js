'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const TIPOS = [
  { id: 'ACTA_ROJA', label: 'Acta ROJA', color: 'bg-red-600 text-white', badge: 'bg-red-100 text-red-800 border-red-300' },
  { id: 'ACTA_CELESTE', label: 'Acta CELESTE', color: 'bg-sky-500 text-white', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'ACTA_VERDE', label: 'Acta VERDE', color: 'bg-emerald-600 text-white', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'ACTA_ANARANJADA', label: 'Acta ANARANJADA', color: 'bg-amber-500 text-white', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'CEDULAS', label: 'Cédulas', color: 'bg-slate-700 text-white', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  { id: 'LISTA_ELECTORES', label: 'Lista Electores', color: 'bg-indigo-600 text-white', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { id: 'CONTROL_ASISTENCIA', label: 'Control Asistencia', color: 'bg-purple-600 text-white', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
];

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

  // Estados para métricas y reportes
  const [resumenData, setResumenData] = useState([]);
  const [totalMesasEsperadas, setTotalMesasEsperadas] = useState(231);
  const [registrosFiltradosRaw, setRegistrosFiltradosRaw] = useState([]);

  // Referencias para elementos de Audio pre-cargados
  const audioSuccessRef = useRef(null);
  const audioErrorRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const inputRef = useRef(null);

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
    let ultimoTimestamp = 0;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/escaneo');
        const data = await res.json();

        if (data.escaneo && data.escaneo.timestamp > ultimoTimestamp) {
          ultimoTimestamp = data.escaneo.timestamp;
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

  const exportarExcel = async () => {
    if (!registrosFiltradosRaw || registrosFiltradosRaw.length === 0) {
      alert('No hay datos registrados con el filtro seleccionado para exportar.');
      return;
    }

    const formateado = registrosFiltradosRaw.map(row => ({
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

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Encabezado Principal */}
        <div className="bg-white p-4 rounded-xl shadow border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Control Parallel SIDE - ONPE</h1>
            <p className="text-xs text-slate-500">Mapeo por Local de Votación, Distrito y Detección de Faltantes</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setVista('registro')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                vista === 'registro' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              📷 Registro
            </button>
            <button
              onClick={() => setVista('reportes')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                vista === 'reportes' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              📊 Reportes y Gráficos
            </button>
          </div>
        </div>

        {/* VISTA 1: REGISTRO */}
        {vista === 'registro' && (
          <>
            <div className="bg-white p-6 rounded-xl shadow border">
              <label className="block text-sm font-semibold mb-3">1. Selecciona Tipo de Documento:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTipoSeleccionado(t.id); inputRef.current?.focus(); }}
                    className={`p-3 rounded-lg text-xs font-bold transition-all ${
                      tipoSeleccionado === t.id
                        ? `${t.color} ring-4 ring-offset-2 ring-slate-400 scale-105`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow border">
              <form onSubmit={procesarEscaneo}>
                <label className="block text-sm font-semibold mb-2">2. Escanear Código de Barras:</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  placeholder="Escanea aquí..."
                  className="w-full text-2xl font-mono p-4 border-2 border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none"
                  autoFocus
                />
              </form>

              {mensaje && (
                <div
                  className={`mt-4 p-4 rounded-lg font-bold text-sm flex items-center gap-2 ${
                    mensaje.tipo === 'error'
                      ? 'bg-red-100 text-red-700 border border-red-300 animate-bounce'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  }`}
                >
                  {mensaje.texto}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow border">
              <h2 className="text-md font-bold mb-3">Últimos Escaneos Realizados</h2>
              <div className="divide-y divide-slate-100">
                {ultimosRegistros.map((r) => {
                  const infoTipo = getTipoStyle(r.tipo_documento);
                  return (
                    <div key={r.id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-800">{r.codigo_barras}</span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${infoTipo.badge}`}>
                          {infoTipo.label || r.tipo_documento}
                        </span>
                      </div>
                      <div className="text-slate-600 font-medium">
                        <span className="font-bold text-slate-900">Mesa {r.numero_mesa}</span> | {r.local_votacion || 'S/L'} ({r.distrito || 'S/D'})
                      </div>
                      <span className="text-slate-400 font-mono">{new Date(r.fecha_registro).toLocaleTimeString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* VISTA 2: REPORTES CON FILTROS Y GRÁFICOS */}
        {vista === 'reportes' && (
          <div className="space-y-6">

            {/* SECCIÓN DE FILTROS */}
            <div className="bg-white p-5 rounded-xl shadow border space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                🔍 Filtros por Ubicación
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Distrito:</label>
                  <select
                    value={filtroDistrito}
                    onChange={(e) => setFiltroDistrito(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="TODOS">📍 TODOS LOS DISTRITOS</option>
                    {distritosUnicos.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Local (Colegio):</label>
                  <select
                    value={filtroLocal}
                    onChange={(e) => setFiltroLocal(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="TODOS">🏫 TODOS LOS LOCALES DE VOTACIÓN</option>
                    {localesFiltrados.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* BARRA SUPERIOR DE ACCIÓN E INFORMACIÓN */}
            <div className="bg-white p-6 rounded-xl shadow border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-lg font-bold">Resumen de Materiales Escaneados</h2>
                <p className="text-xs text-slate-500">
                  Total de mesas esperadas para este filtro: <strong className="text-blue-600 font-mono text-sm">{totalMesasEsperadas}</strong>
                </p>
              </div>
              <button
                onClick={exportarExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 shadow transition-all"
              >
                📥 Exportar Excel de Filtro (.xlsx)
              </button>
            </div>

            {/* BARRAS DE PROGRESO Y GRÁFICOS VISUALES */}
            <div className="bg-white p-6 rounded-xl shadow border space-y-6">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b pb-2">
                📊 Gráficos de Porcentajes y Cantidades (Recibidos vs Faltantes)
              </h3>

              <div className="space-y-5">
                {resumenData.map((row) => (
                  <div key={row.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between text-xs font-bold gap-1">
                      <span className="text-slate-800 text-sm">{row.tipo}</span>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Completado: <strong>{row.recibidos}</strong> ({row.porcentajeAvance}%)
                        </span>
                        <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                          Falta: <strong>{row.faltantes}</strong> ({row.porcentajeFaltante}%)
                        </span>
                      </div>
                    </div>

                    {/* Gráfico Visual en Barra Dual */}
                    <div className="w-full h-5 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                      <div
                        style={{ width: `${row.porcentajeAvance}%` }}
                        className="bg-emerald-500 transition-all duration-500 flex items-center justify-center text-[10px] text-white font-bold"
                      >
                        {row.porcentajeAvance > 5 && `${row.porcentajeAvance}%`}
                      </div>
                      <div
                        style={{ width: `${row.porcentajeFaltante}%` }}
                        className="bg-red-500 transition-all duration-500 flex items-center justify-center text-[10px] text-white font-bold"
                      >
                        {row.porcentajeFaltante > 5 && `${row.porcentajeFaltante}%`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TABLA RESUMEN COMPLETA */}
            <div className="bg-white p-6 rounded-xl shadow border space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b pb-2">
                📋 Detalle Consolidado
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="p-3">Tipo de Material</th>
                      <th className="p-3 text-center">Recibidos</th>
                      <th className="p-3 text-center">% Recibido</th>
                      <th className="p-3 text-center">Faltantes</th>
                      <th className="p-3 text-center">% Faltante</th>
                      <th className="p-3 text-center">Total Esperados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumenData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-800">{row.tipo}</td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-600 bg-emerald-50/50">{row.recibidos}</td>
                        <td className="p-3 text-center font-mono text-emerald-700 font-semibold">{row.porcentajeAvance}%</td>
                        <td className={`p-3 text-center font-mono font-bold ${row.faltantes > 0 ? 'text-red-600 bg-red-50/50' : 'text-slate-400'}`}>
                          {row.faltantes}
                        </td>
                        <td className="p-3 text-center font-mono text-red-700 font-semibold">{row.porcentajeFaltante}%</td>
                        <td className="p-3 text-center font-mono text-slate-500">{row.esperados}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}