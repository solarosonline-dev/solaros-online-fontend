import { useState, type KeyboardEvent } from "react";
import type { DocumentCustomization } from "../../../api/entityPreferences";
import AccordionSection from "../../../components/AccordionSection";
// Reuses QuoteBuilderPage's quote-accordion-* classes -- see
// AccordionSection.tsx's own comment on why it doesn't import its own CSS.
import "../../quotes/QuoteBuilderPage.css";

type Props = {
  draft: DocumentCustomization;
  onChange: (draft: DocumentCustomization) => void;
};

type SectionKey = "quote_notes" | "agreement_notes" | "skip_quote_otp" | "require_work_order_photo";

function LineListField({
  id,
  help,
  value,
  onChange,
}: {
  id: string;
  help: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");

  function handleAdd() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setNewItem("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <span className="entity-field-help">{help}</span>

      {value.length > 0 && (
        <ul className="entity-line-list">
          {value.map((item, i) => (
            <li key={i}>
              <span>{item}</span>
              <button type="button" className="entity-line-remove" onClick={() => handleRemove(i)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="entity-line-add-row">
        <input
          id={id}
          type="text"
          placeholder="Type a line and press Add"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="entity-btn" onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}

export default function DocumentsTab({ draft, onChange }: Props) {
  // Single-open-at-a-time, same pattern as QuoteBuilderPage/AgreementBuilderPage.
  const [openSection, setOpenSection] = useState<SectionKey | null>("quote_notes");
  function toggleSection(id: SectionKey) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

  return (
    <div className="entity-documents-accordion">
      <AccordionSection
        id="quote_notes"
        title="Quote Terms & Conditions"
        open={openSection === "quote_notes"}
        onToggle={toggleSection}
      >
        <LineListField
          id="quote_notes"
          help="one clause per line — used as the default for new quotes"
          value={draft.quote_notes}
          onChange={(v) => onChange({ ...draft, quote_notes: v })}
        />
      </AccordionSection>

      <AccordionSection
        id="agreement_notes"
        title="Agreement Terms & Conditions"
        open={openSection === "agreement_notes"}
        onToggle={toggleSection}
      >
        <LineListField
          id="agreement_notes"
          help="one clause per line — used as the default for new agreements"
          value={draft.agreement_notes}
          onChange={(v) => onChange({ ...draft, agreement_notes: v })}
        />
      </AccordionSection>

      <AccordionSection
        id="skip_quote_otp"
        title="Quote Acceptance Verification"
        open={openSection === "skip_quote_otp"}
        onToggle={toggleSection}
      >
        <div className="entity-field">
          <label htmlFor="skip_quote_otp" className="entity-checkbox-label">
            <input
              id="skip_quote_otp"
              type="checkbox"
              checked={draft.skip_quote_otp}
              onChange={(e) => onChange({ ...draft, skip_quote_otp: e.target.checked })}
            />
            <span>Skip email OTP for quote acceptance</span>
          </label>
          <span className="entity-field-help">
            When enabled, customers accepting a quote only need to check the terms/AMC consent box — no code is
            emailed. Turn this on temporarily if your email delivery is down; otherwise leave it off, since OTP
            verification protects against a forwarded quote link being accepted by someone other than the customer.
          </span>
        </div>
      </AccordionSection>

      <AccordionSection
        id="require_work_order_photo"
        title="Work Order Photo Requirement"
        open={openSection === "require_work_order_photo"}
        onToggle={toggleSection}
      >
        <div className="entity-field">
          <label htmlFor="require_work_order_photo" className="entity-checkbox-label">
            <input
              id="require_work_order_photo"
              type="checkbox"
              checked={draft.require_work_order_photo}
              onChange={(e) => onChange({ ...draft, require_work_order_photo: e.target.checked })}
            />
            <span>Require a photo before marking a work order completed</span>
          </label>
          <span className="entity-field-help">
            When enabled, a technician can't mark a work order "Completed" until at least one photo has been
            captured or uploaded to it (via the work order's "Take Photo" or "Choose files to upload" controls).
            Only image uploads count toward this — a PDF or spreadsheet document does not satisfy the requirement.
            Leave this off if your workflow doesn't require photo proof.
          </span>
        </div>
      </AccordionSection>
    </div>
  );
}
