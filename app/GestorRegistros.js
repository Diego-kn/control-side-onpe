'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 25;

const p2 = (n) => String(n).padStart(2, '0');
const aLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const fechaStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

const FILTROS_INICIALES = {
  q: '',
  tipo: 'TODOS',
  eleccion: 'TODAS',
  distrito: 'TODOS',
  local: 'TODOS',
  desde: '',
  hasta: '',
  orden: 'recientes',
};

export default function GestorRegistros({ tipos, maestroMesas, distritos, elecciones, tiposPorEleccion }) {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const tipoInfo = (id) => tipos.find((t) => t.id === id);

  const locales = useMemo(() => {
    const base = filtros.distrito === 'TODOS' ? maestroMesas : maestroMesas.filter((m) => m.distrito === filtros.distrito);
    return Array.from(new Set(base.map((m) => m.local_votacion))).sort();
  }, [maestroMesas, filtros.distrito]);

  const setFiltro = (k, v) => {
    setFiltros((f) => ({ ...f, [k]: v, ...(k === 'distrito' ? { local: 'TODOS' } : {}) }));
    setPagina(1);
  };

  const mostrar = (tipo, texto) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso(null), 5000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    let query = supabase.from('registros').select('*', { count: 'exact' });

    const q = filtros.q.trim().replace(/[,()%]/g, '');
    if (q) query = query.or(`codigo_barras.ilike.%${q}%,numero_mesa.ilike.%${q}%`);
    if (filtros.tipo !== 'TODOS') query = query.eq('tipo_documento', filtros.tipo);
    if (filtros.eleccion !== 'TODAS') query = query.eq('tipo_eleccion', filtros.eleccion);
    if (filtros.distrito !== 'TODOS') query = query.eq('distrito', filtros.distrito);
    if (filtros.local !== 'TODOS') query = query.eq('local_votacion', filtros.local);
    if (filtros.desde) query = query.gte('fecha_registro', new Date(`${filtros.desde}T00:00:00`).toISOString());
    if (filtros.hasta) query = query.lte('fecha_registro', new Date(`${filtros.hasta}T23:59:59.999`).toISOString());

    if (filtros.orden === 'recientes') query = query.order('fecha_registro', { ascending: false });
    else if (filtros.orden === 'antiguos') query = query.order('fecha_registro', { ascending: true });
    else query = query.order('codigo_barras', { ascending: true });

    const desdeFila = (pagina - 1) * PAGE_SIZE;
    query = query.range(desdeFila, desdeFila + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      mostrar('error', 'Error al cargar: ' + error.message);
    } else {
      setFilas(data || []);
      setTotal(count || 0);
    }
    setSeleccion(new Set());
    setCargando(false);
  }, [filtros, pagina]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ---------- Selección ---------- */
  const todosSel = filas.length > 0 && filas.every((f) => seleccion.has(f.id));
  const toggleUno = (id) =>
    setSeleccion((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleTodos = () => setSeleccion(todosSel ? new Set() : new Set(filas.map((f) => f.id)));

  /* ---------- Eliminar ---------- */
  const eliminar = async (ids) => {
    if (!ids.length) return;
    const msg =
      ids.length === 1
        ? '¿Eliminar este registro? Esta acción no se puede deshacer.'
        : `¿Eliminar ${ids.length} registros? Esta acción no se puede deshacer.`;
    if (!window.confirm(msg)) return;

    const { data, error } = await supabase.from('registros').delete().in('id', ids).select('id');
    if (error) return mostrar('error', 'No se pudo eliminar: ' + error.message);
    if (!data || data.length === 0) {
      return mostrar('error', 'No se eliminó nada. Falta el permiso (policy) de DELETE en Supabase.');
    }
    mostrar('exito', `🗑️ ${data.length} registro(s) eliminado(s).`);
    cargar();
  };

  /* ---------- Editar ---------- */
  const abrirEdicion = (r) =>
    setEditando({
      id: r.id,
      codigo_barras: r.codigo_barras || '',
      numero_mesa: r.numero_mesa || '',
      tipo_documento: r.tipo_documento,
      local_votacion: r.local_votacion || '',
      distrito: r.distrito || '',
      tipo_eleccion: r.tipo_eleccion || 'GENERAL',
      fecha: aLocalInput(r.fecha_registro),
      recalc: true,
    });

  const guardar = async () => {
    const codigo = editando.codigo_barras.trim().toUpperCase();
    const mesa = editando.numero_mesa.trim();
    if (!codigo) return mostrar('error', 'El código no puede estar vacío.');
    if (!mesa) return mostrar('error', 'El número de mesa no puede estar vacío.');

    setGuardando(true);
    let local = editando.local_votacion.trim().toUpperCase();
    let dist = editando.distrito.trim().toUpperCase();

    if (editando.recalc) {
      const { data: m } = await supabase
        .from('locales_mesas')
        .select('local_votacion, distrito')
        .eq('numero_mesa', mesa)
        .maybeSingle();
      local = m ? m.local_votacion.toUpperCase() : 'LOCAL DESCONOCIDO';
      dist = m ? m.distrito.toUpperCase() : 'NO ASIGNADO';
    }
    const eleccionFinal = tiposPorEleccion.includes(editando.tipo_documento)
      ? (editando.tipo_eleccion === 'GENERAL' ? 'MUNICIPAL' : editando.tipo_eleccion)
      : 'GENERAL';

    const cambios = {
      codigo_barras: codigo,
      numero_mesa: mesa,
      tipo_documento: editando.tipo_documento,
      local_votacion: local,
      distrito: dist,
      tipo_eleccion: eleccionFinal,
    };
    if (editando.fecha) cambios.fecha_registro = new Date(editando.fecha).toISOString();

    const { data, error } = await supabase.from('registros').update(cambios).eq('id', editando.id).select();
    setGuardando(false);

    if (error) {
      if (error.code === '23505') return mostrar('error', `⚠️ DUPLICADO: el código "${codigo}" ya existe en esa elección.`);      
      return mostrar('error', 'No se pudo guardar: ' + error.message);
    }
    if (!data || data.length === 0) {
      return mostrar('error', 'No se guardó nada. Falta el permiso (policy) de UPDATE en Supabase.');
    }
    mostrar('exito', '✅ Registro actualizado.');
    setEditando(null);
    cargar();
  };

  const campo =
    'w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:outline-none';
  const etiqueta = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

  return (
    <div className="space-y-6">
      {/* Aviso */}
      {aviso && (
        <div
          className={`p-4 rounded-xl font-bold text-sm border-l-4 ${
            aviso.tipo === 'error'
              ? 'bg-red-50 text-red-800 border-red-500'
              : 'bg-emerald-50 text-emerald-800 border-emerald-500'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* Filtros */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900">🔎 Buscar y filtrar registros</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setFiltros((f) => ({ ...f, desde: fechaStr(0), hasta: fechaStr(0) })); setPagina(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200"
            >
              Hoy
            </button>
            <button
              onClick={() => { setFiltros((f) => ({ ...f, desde: fechaStr(-1), hasta: fechaStr(-1) })); setPagina(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200"
            >
              Ayer
            </button>
            <button
              onClick={() => { setFiltros((f) => ({ ...f, desde: fechaStr(-6), hasta: fechaStr(0) })); setPagina(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200"
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => { setFiltros(FILTROS_INICIALES); setPagina(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className={etiqueta}>Código o N° de mesa</label>
            <input
              value={filtros.q}
              onChange={(e) => setFiltro('q', e.target.value)}
              placeholder="Ej: 12345678K o 000123"
              className={`${campo} font-mono`}
            />
          </div>
          <div>
            <label className={etiqueta}>Tipo de documento</label>
            <select value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)} className={campo}>
              <option value="TODOS">TODOS</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Elección</label>
            <select value={filtros.eleccion} onChange={(e) => setFiltro('eleccion', e.target.value)} className={campo}>
              <option value="TODAS">TODAS</option>
              {elecciones.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
              <option value="GENERAL">Sin elección (cédulas, listas)</option>
            </select>
          </div>
          <div>
            <label className={etiqueta}>Ordenar por</label>
            <select value={filtros.orden} onChange={(e) => setFiltro('orden', e.target.value)} className={campo}>
              <option value="recientes">Más recientes primero</option>
              <option value="antiguos">Más antiguos primero</option>
              <option value="codigo">Código (A–Z)</option>
            </select>
          </div>
          <div>
            <label className={etiqueta}>Desde</label>
            <input type="date" value={filtros.desde} onChange={(e) => setFiltro('desde', e.target.value)} className={campo} />
          </div>
          <div>
            <label className={etiqueta}>Hasta</label>
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltro('hasta', e.target.value)} className={campo} />
          </div>
          <div>
            <label className={etiqueta}>Distrito</label>
            <select value={filtros.distrito} onChange={(e) => setFiltro('distrito', e.target.value)} className={campo}>
              <option value="TODOS">TODOS</option>
              {distritos.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Local de votación</label>
            <select value={filtros.local} onChange={(e) => setFiltro('local', e.target.value)} className={campo}>
              <option value="TODOS">TODOS</option>
              {locales.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Tabla */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <header className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">🗂️ Registros</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {cargando
                ? 'Cargando…'
                : total === 0
                ? 'Sin resultados'
                : `Mostrando ${(pagina - 1) * PAGE_SIZE + 1}–${Math.min(pagina * PAGE_SIZE, total)} de ${total}`}
            </p>
          </div>
          {seleccion.size > 0 && (
            <button
              onClick={() => eliminar(Array.from(seleccion))}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              🗑️ Eliminar seleccionados ({seleccion.size})
            </button>
          )}
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-white uppercase text-[11px] tracking-wider">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" checked={todosSel} onChange={toggleTodos} className="h-4 w-4 cursor-pointer" />
                </th>
                <th className="p-3">Código</th>
                <th className="p-3">Mesa</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Elección</th>
                <th className="p-3">Local</th>
                <th className="p-3">Distrito</th>
                <th className="p-3">Fecha y hora</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400">
                    {cargando ? 'Cargando…' : 'No hay registros con estos filtros'}
                  </td>
                </tr>
              )}
              {filas.map((r) => {
                const t = tipoInfo(r.tipo_documento);
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${seleccion.has(r.id) ? 'bg-blue-50/60' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={seleccion.has(r.id)}
                        onChange={() => toggleUno(r.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">{r.codigo_barras}</td>
                    <td className="p-3 font-mono text-slate-600">{r.numero_mesa}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${t?.badge || 'bg-slate-100 text-slate-700 border-slate-300'}`}>
                        {t?.label || r.tipo_documento}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.tipo_eleccion && r.tipo_eleccion !== 'GENERAL' ? (
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${elecciones.find((e) => e.id === r.tipo_eleccion)?.badge || ''}`}>
                          {elecciones.find((e) => e.id === r.tipo_eleccion)?.label || r.tipo_eleccion}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-700 min-w-[180px]">{r.local_votacion}</td>
                    <td className="p-3 text-xs text-slate-700">{r.distrito}</td>
                    <td className="p-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {new Date(r.fecha_registro).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => abrirEdicion(r)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => eliminar([r.id])}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <footer className="px-5 py-3 flex items-center justify-between gap-3 border-t border-slate-100">
          <button
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs text-slate-500">
            Página <b className="text-slate-900">{pagina}</b> de {totalPaginas}
          </span>
          <button
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
          >
            Siguiente →
          </button>
        </footer>
      </section>

      {/* Modal de edición */}
      {editando && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">✏️ Editar registro</h3>
              <button onClick={() => setEditando(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
            </header>

            <div className="p-5 space-y-4">
              <div>
                <label className={etiqueta}>Código de barras</label>
                <input
                  value={editando.codigo_barras}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setEditando((x) => ({ ...x, codigo_barras: v, numero_mesa: v.substring(0, 6) }));
                  }}
                  className={`${campo} font-mono`}
                />
                <p className="text-[11px] text-slate-400 mt-1">La mesa se actualiza sola con los 6 primeros caracteres (puedes cambiarla abajo).</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={etiqueta}>N° de mesa</label>
                  <input
                    value={editando.numero_mesa}
                    onChange={(e) => setEditando((x) => ({ ...x, numero_mesa: e.target.value }))}
                    className={`${campo} font-mono`}
                  />
                </div>
                <div>
                  <label className={etiqueta}>Tipo de documento</label>
                  <select
                    value={editando.tipo_documento}
                    onChange={(e) => setEditando((x) => ({ ...x, tipo_documento: e.target.value }))}
                    className={campo}
                  >
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {tiposPorEleccion.includes(editando.tipo_documento) && (
                <div>
                  <label className={etiqueta}>Elección</label>
                  <select
                    value={editando.tipo_eleccion === 'GENERAL' ? 'MUNICIPAL' : editando.tipo_eleccion}
                    onChange={(e) => setEditando((x) => ({ ...x, tipo_eleccion: e.target.value }))}
                    className={campo}
                  >
                    {elecciones.map((e) => (
                      <option key={e.id} value={e.id}>{e.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editando.recalc}
                  onChange={(e) => setEditando((x) => ({ ...x, recalc: e.target.checked }))}
                  className="h-4 w-4"
                />
                Recalcular local y distrito según la mesa
              </label>

              {!editando.recalc && (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={etiqueta}>Local de votación</label>
                    <input
                      value={editando.local_votacion}
                      onChange={(e) => setEditando((x) => ({ ...x, local_votacion: e.target.value }))}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={etiqueta}>Distrito</label>
                    <input
                      value={editando.distrito}
                      onChange={(e) => setEditando((x) => ({ ...x, distrito: e.target.value }))}
                      className={campo}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={etiqueta}>Fecha y hora de registro</label>
                <input
                  type="datetime-local"
                  value={editando.fecha}
                  onChange={(e) => setEditando((x) => ({ ...x, fecha: e.target.value }))}
                  className={campo}
                />
              </div>
            </div>

            <footer className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-3">
              <button onClick={() => setEditando(null)} className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : '💾 Guardar cambios'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}