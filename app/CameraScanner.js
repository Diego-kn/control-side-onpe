'use client';

import { useEffect, useRef, useState } from 'react';

// Elige la mejor cámara trasera de la lista
function elegirCamaraTrasera(cams) {
  if (!cams.length) return null;
  const guardada = (() => {
    try { return localStorage.getItem('CAM_ID'); } catch { return null; }
  })();
  if (guardada && cams.some((c) => c.id === guardada)) return guardada;

  const esTrasera = (c) => /back|rear|trasera|posterior|environment|0, facing back/i.test(c.label || '');
  const esExtra = (c) => /wide|ultra|macro|depth|tele|zoom|front|frontal|user/i.test(c.label || '');

  const traseras = cams.filter(esTrasera);
  const principal = traseras.find((c) => !esExtra(c)) || traseras[0];
  if (principal) return principal.id;

  // Sin etiquetas útiles: normalmente la última de la lista es la trasera
  return cams[cams.length - 1].id;
}

export default function CameraScanner({ onScan, onClose }) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const ultimoRef = useRef({ code: '', t: 0 });
  const [camaras, setCamaras] = useState([]);
  const [camaraId, setCamaraId] = useState(null);
  const [estado, setEstado] = useState('iniciando'); // iniciando | activa | error
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState('');
  const [ignorado, setIgnorado] = useState('');

  // 1) Listar cámaras (pide permiso la primera vez)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const cams = await Html5Qrcode.getCameras();
        if (cancelado) return;
        if (!cams || !cams.length) {
          setEstado('error');
          setError('No se encontró ninguna cámara.');
          return;
        }
        setCamaras(cams);
        setCamaraId(elegirCamaraTrasera(cams));
      } catch (e) {
        if (cancelado) return;
        setEstado('error');
        setError(
          String(e).includes('Permission')
            ? 'Permiso de cámara denegado. Actívalo en la configuración del navegador y vuelve a intentar.'
            : 'No se pudo acceder a las cámaras: ' + (e?.message || e)
        );
      }
    })();
    return () => { cancelado = true; };
  }, []);

  // 2) Iniciar el lector con la cámara elegida (se reinicia al cambiarla)
  useEffect(() => {
    if (!camaraId) return;
    let scanner = null;
    let cancelado = false;
    setEstado('iniciando');

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelado) return;

        const formatos = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
        ];

        scanner = new Html5Qrcode('lector-camara', {
          verbose: false,
          formatsToSupport: formatos,
          useBarCodeDetectorIfSupported: true,
        });

        await scanner.start(
          { deviceId: { exact: camaraId } },
          {
            fps: 15,
            qrbox: (w) => ({
              width: Math.floor(w * 0.92),
              height: Math.floor(Math.max(90, w * 0.32)),
            }),
            videoConstraints: {
              deviceId: { exact: camaraId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (texto) => {
            const code = (texto || '').trim();
            if (!code) return;

            const low = code.toLowerCase();
            if (low.startsWith('http') || low.includes('www.') || low.includes('.pe') || low.includes('.com')) {
              setIgnorado(code);
              return;
            }

            const ahora = Date.now();
            if (ultimoRef.current.code === code && ahora - ultimoRef.current.t < 3000) return;
            ultimoRef.current = { code, t: ahora };

            if (navigator.vibrate) navigator.vibrate(100);
            setIgnorado('');
            setUltimo(code);
            onScanRef.current(code);
          },
          () => {}
        );

        if (cancelado) {
          await scanner.stop().catch(() => {});
          return;
        }

        // Enfoque continuo si el celular lo permite
        try {
          const video = document.querySelector('#lector-camara video');
          const t = video?.srcObject?.getVideoTracks?.()[0];
          const caps = t?.getCapabilities?.();
          if (t && caps?.focusMode?.includes('continuous')) {
            await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch (_) {}

        try { localStorage.setItem('CAM_ID', camaraId); } catch (_) {}
        setEstado('activa');
      } catch (e) {
        if (cancelado) return;
        setEstado('error');
        setError('No se pudo abrir la cámara: ' + (e?.message || e));
      }
    })();

    return () => {
      cancelado = true;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, [camaraId]);

  const cambiarCamara = () => {
    if (camaras.length < 2) return;
    const i = camaras.findIndex((c) => c.id === camaraId);
    setCamaraId(camaras[(i + 1) % camaras.length].id);
  };

  const camActual = camaras.find((c) => c.id === camaraId);

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
        <div className="text-xs text-slate-500 text-center space-y-1">
          <p>Apunta SOLO al código de barras (no al QR). Se registra automáticamente.</p>
          {camActual?.label && <p className="text-slate-400">Cámara: {camActual.label}</p>}
          {ultimo && (
            <p>
              Último leído: <b className="font-mono text-slate-800">{ultimo}</b>
            </p>
          )}
          {ignorado && (
            <p className="text-amber-600 font-semibold">QR/enlace ignorado. Apunta al código de barras.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={cambiarCamara}
          disabled={camaras.length < 2}
          className="py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
        >
          🔄 Cambiar cámara
        </button>
        <button
          type="button"
          onClick={onClose}
          className="py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold"
        >
          ✖ Cerrar cámara
        </button>
      </div>
    </div>
  );
}