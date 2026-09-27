// Loads the Google Maps JavaScript API exactly once, however many times
// it's called, and returns the same promise/`google` object on every call.
let loadPromise: Promise<any> | null = null;

export function loadGoogleMaps(apiKey: string) {
  const w = window as any;
  if (w.google && w.google.maps) return Promise.resolve(w.google);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = '__googleMapsInitCallback';
    w[callbackName] = () => {
      delete w[callbackName];
      resolve(w.google);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps — check the API key and enabled APIs.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
