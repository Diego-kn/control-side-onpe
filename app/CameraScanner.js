'use client';

import { useEffect, useRef, useState } from 'react';

export default function CameraScanner({ onScan, onClose }) {
  // Siempre apunta a la versión más reciente de onScan (evita datos viejos)
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const ultimoRef = useRef({ code: '', t: 0 });
  const [estado, setEstado] = useState('iniciando'); // iniciando | activa | error
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState('');

  useEffect(() => {
    let scanner = null;
    let cancelado = false;
    const regionId = 'lector-camara';

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelado) return;

        scanner = new Html5Qrcode(regionId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true, // usa el detector nativo de Android si existe (mejor para barras)
        });

        await scanner.start(
          { facingMode: 'environment' }, // cámara trasera
          {
            fps: 10,
            qrbox: (w, h) => ({
              width: Math.floor(w * 0.9),
              height: Math.floor(Math.max(80, Math.min(h * 0.6, w * 0.45))),
            }),
          },
          (texto) => {
            const code = (texto || '').trim();
            if (!code) return;

            // Evita leer el mismo código muchas veces seguidas
            const ahora = Date.now();
            if (ultimoRef.current.code === code && ahora - ultimoRef.current.t < 3000) return;
            ultimoRef.current = { code, t: ahora };

            if (navigator.vibrate) navigator.vibrate(100);
            setUltimo(code);
            onScanRef.current(code);
          },
          () => {} // errores de lectura por frame: se ignoran
        );

        if (cancelado) {
          await scanner.stop().catch(() => {});
          return;
        }
        setEstado('activa');
      } catch (e) {
        if (cancelado) return;
        setEstado('error');
        setError(
          String(e).includes('Permission')
            ? 'Permiso de cámara denegado. Actívalo en la configuración del navegador y vuelve a intentar.'
            : 'No se pudo abrir la cámara: ' + (e?.message || e)
        );
      }
    })();

    return () => {
      cancelado = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black border-2 border-slate-300">
        <div id="lector-camara" className="w-full min-h-[240px]" />
        {estado === 'iniciando' && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/60">
            Activando cámara…
          </div>
        )}
      </div>

      {estado === 'error' && (
        <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-sm font-semibold">
          {error}
        </div>
      )}

      {estado === 'activa' && (
        <p className="text-xs text-slate-500 text-center">
          Apunta al código de barras o QR. Se registra automáticamente.
          {ultimo && (
            <>
              <br />
              Último leído: <b className="font-mono text-slate-800">{ultimo}</b>
            </>
          )}
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold"
      >
        ✖ Cerrar cámara
      </button>
    </div>
  );
}