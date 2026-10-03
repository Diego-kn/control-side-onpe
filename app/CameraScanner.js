'use client';

import { useEffect, useRef, useState } from 'react';

export default function CameraScanner({ onScan, onClose }) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const ultimoRef = useRef({ code: '', t: 0 });
  const [estado, setEstado] = useState('iniciando'); // iniciando | activa | error
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState('');
  const [ignorado, setIgnorado] = useState('');

  useEffect(() => {
    let scanner = null;
    let cancelado = false;
    const regionId = 'lector-camara';

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelado) return;

        // SOLO códigos de barras lineales (se ignoran los QR)
        const formatos = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
        ];

        scanner = new Html5Qrcode(regionId, {
          verbose: false,
          formatsToSupport: formatos,
          useBarCodeDetectorIfSupported: true,
        });

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            // Zona ancha y baja: ideal para códigos de barras
            qrbox: (w) => ({
              width: Math.floor(w * 0.92),
              height: Math.floor(Math.max(90, w * 0.32)),
            }),
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (texto) => {
            const code = (texto || '').trim();
            if (!code) return;

            // Si por alguna razón llega un enlace/QR, se ignora sin mostrar error
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

        // Intenta activar enfoque continuo (si el celular lo permite)
        try {
          const track = scanner.getRunningTrackCameraCapabilities
            ? null
            : null;
          const video = document.querySelector('#lector-camara video');
          const t = video?.srcObject?.getVideoTracks?.()[0];
          const caps = t?.getCapabilities?.();
          if (t && caps?.focusMode?.includes('continuous')) {
            await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch (_) {}

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
        <div className="text-xs text-slate-500 text-center space-y-1">
          <p>Apunta SOLO al código de barras (no al QR). Se registra automáticamente.</p>
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