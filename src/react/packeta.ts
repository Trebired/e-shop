import { PACKAGE_VERSION } from "./../version.js";
import type { PickupPoint } from "./../types.js";

const WIDGET_SCRIPT = "https://widget.packeta.com/v6/www/js/library.js";
const APP_IDENTITY = `trebired-e-shop-${PACKAGE_VERSION}`;

type WidgetPoint = { carrierId?: string | number | null; id: string | number; name?: string; place?: string };
type PacketaGlobal = { Widget: { pick: (apiKey: string, done: (point: WidgetPoint | null) => void, options: Record<string, unknown>) => void } };

let loading: Promise<PacketaGlobal>|null = null;

function loadWidget(): Promise<PacketaGlobal> {
  const existing = (window as unknown as { Packeta?: PacketaGlobal }).Packeta;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT;
      script.async = true;
      script.onload = () => resolve((window as unknown as { Packeta: PacketaGlobal }).Packeta);
      script.onerror = () => {
        loading = null;
        reject(new Error("eshop-packeta-widget-failed"));
      };
      document.head.appendChild(script);
  });
  return loading;
}

function pickupPointOf(point: WidgetPoint): PickupPoint {
  return { carrierId: point.carrierId ? String(point.carrierId) : "", id: String(point.id), name: String(point.name ?? point.place ?? "") };
}

async function pickPickupPoint(apiKey: string, locale: string, country = "cz"): Promise<PickupPoint|null> {
  const packeta = await loadWidget();
  return await new Promise((resolve) => {
      packeta.Widget.pick(
        apiKey,
        (point) => resolve(point ? pickupPointOf(point) : null),
        { appIdentity: APP_IDENTITY, country, language: locale },
      );
  });
}

export { pickPickupPoint };
