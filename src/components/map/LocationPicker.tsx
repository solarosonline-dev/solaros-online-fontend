import { useState } from "react";
import SiteMap from "./SiteMap";

interface Props {
  initialLat?: number | null;
  initialLng?: number | null;
  /**
   * Callback fired when the user completes location picking or dragging.
   */
  onLocationSelect: (lat: number, lng: number) => void;
}

/**
 * A lightweight wrapper around the SiteMap widget for picking lat/long coordinates.
 * Renders as a toggleable button + inline map.
 */
export default function LocationPicker({ initialLat, initialLng, onLocationSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!isOpen) {
    return (
      <button type="button" className="leads-btn" onClick={() => setIsOpen(true)}>
        {initialLat && initialLng ? "📍 Update Map Location" : "📍 Pin Location on Map"}
      </button>
    );
  }

  return (
    <div style={{ marginTop: "12px", border: "1px solid var(--app-border)", borderRadius: "8px", padding: "12px" }}>
      <SiteMap
        mode="location"
        apiKey={apiKey}
        initialLocation={{ lat: initialLat || 20.5937, lon: initialLng || 78.9629 }} // Default to India center
        onLocationChange={(loc: { lat: number; lon: number }) => {
          onLocationSelect(loc.lat, loc.lon);
        }}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
}
