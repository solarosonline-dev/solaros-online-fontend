import { createContext, useContext, useState, type ReactNode } from "react";

type TourState = {
  /** True while some page wants the "Entity Settings" nav link highlighted --
   * set by QuoteBuilderPage when the entity has zero AMC plans defined, so a
   * user can't get partway into building a quote without knowing where to go
   * set one up first. Cleared once that page unmounts or the condition no
   * longer holds, so the highlight never outlives the page that asked for it. */
  needsAmcSetup: boolean;
  setNeedsAmcSetup: (value: boolean) => void;
};

const TourContext = createContext<TourState | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [needsAmcSetup, setNeedsAmcSetup] = useState(false);
  return <TourContext.Provider value={{ needsAmcSetup, setNeedsAmcSetup }}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
