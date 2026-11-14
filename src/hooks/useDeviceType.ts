import { useEffect, useState } from "react";

export type DeviceType = "desktop" | "mobile";

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(() => {
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileUA || isSmallScreen ? "mobile" : "desktop";
  });

  useEffect(() => {
    const handleResize = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isSmallScreen = window.innerWidth <= 768;
      const currentDevice = isMobileUA || isSmallScreen ? "mobile" : "desktop";
      setDevice(currentDevice);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (device === "mobile") {
      document.body.classList.add("mobile-view");
    } else {
      document.body.classList.remove("mobile-view");
    }
  }, [device]);

  return device;
}
