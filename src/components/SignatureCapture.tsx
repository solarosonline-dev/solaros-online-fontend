import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";
import "./SignatureCapture.css";

/** Same handle shape as SignaturePadHandle -- this wraps it, so it's a
 * drop-in replacement anywhere a bare SignaturePad is used. */
export type SignatureCaptureHandle = {
  toDataUrl: () => string | null;
  clear: () => void;
};

/** Adds an "upload a photo/scan of a signature" option alongside the usual
 * draw-on-canvas pad -- for signers (consumer or vendor/EPC) who already
 * have a signature captured elsewhere (e.g. a scanned wet-ink signature, or
 * a signature exported from another app) and don't want to redraw it with a
 * mouse/finger. Exposes the same `toDataUrl`/`clear` handle as SignaturePad
 * so callers don't need to branch on which mode is active. */
const SignatureCapture = forwardRef<SignatureCaptureHandle, { onChange?: (hasSignature: boolean) => void; disabled?: boolean }>(
  function SignatureCapture({ onChange, disabled }, ref) {
    const [mode, setMode] = useState<"draw" | "upload">("draw");
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const padRef = useRef<SignaturePadHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function switchMode(next: "draw" | "upload") {
      if (next === mode || disabled) return;
      // Switching modes discards whatever was captured in the other one --
      // only one signature image should ever be "the" signature at a time.
      if (mode === "upload") {
        setUploadedImage(null);
        setUploadError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        padRef.current?.clear();
      }
      setMode(next);
      onChange?.(false);
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setUploadError("Please choose an image file.");
        return;
      }
      setUploadError(null);
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(typeof reader.result === "string" ? reader.result : null);
        onChange?.(true);
      };
      reader.onerror = () => setUploadError("Couldn't read that image — try again.");
      reader.readAsDataURL(file);
    }

    function handleRemoveUpload() {
      setUploadedImage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onChange?.(false);
    }

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (mode === "upload" ? uploadedImage : padRef.current?.toDataUrl() ?? null),
      clear: () => (mode === "upload" ? handleRemoveUpload() : padRef.current?.clear()),
    }));

    return (
      <div className="sigcap">
        <div className="sigcap-tabs">
          <button
            type="button"
            className={`sigcap-tab${mode === "draw" ? " sigcap-tab--active" : ""}`}
            onClick={() => switchMode("draw")}
            disabled={disabled}
          >
            Draw signature
          </button>
          <button
            type="button"
            className={`sigcap-tab${mode === "upload" ? " sigcap-tab--active" : ""}`}
            onClick={() => switchMode("upload")}
            disabled={disabled}
          >
            Upload image
          </button>
        </div>

        {mode === "draw" ? (
          <SignaturePad ref={padRef} onChange={onChange} disabled={disabled} />
        ) : (
          <div className="sigcap-upload">
            {uploadedImage ? (
              <div className="sigcap-preview">
                <img src={uploadedImage} alt="Uploaded signature" className="sigcap-preview-img" />
                <button type="button" className="sigcap-clear" onClick={handleRemoveUpload} disabled={disabled}>
                  Remove
                </button>
              </div>
            ) : (
              <label className={`sigcap-drop${disabled ? " sigcap-drop--disabled" : ""}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={disabled}
                  className="sigcap-file-input"
                />
                <span>Choose an image of your signature (PNG/JPG)</span>
              </label>
            )}
            {uploadError && <p className="sigcap-error">{uploadError}</p>}
          </div>
        )}
      </div>
    );
  },
);

export default SignatureCapture;
