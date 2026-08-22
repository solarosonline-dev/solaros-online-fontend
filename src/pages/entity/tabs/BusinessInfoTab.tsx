import type { Entity } from "../../../api/entity";

export type BusinessInfoDraft = { name: string; address: string; business_phone: string; business_email: string };

type Props = {
  entity: Entity;
  draft: BusinessInfoDraft;
  onChange: (draft: BusinessInfoDraft) => void;
};

export default function BusinessInfoTab({ entity, draft, onChange }: Props) {
  return (
    <div>
      <div className="entity-field">
        <label htmlFor="name">Business name</label>
        <input
          id="name"
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="entity-field">
        <label htmlFor="address">Address</label>
        <textarea
          id="address"
          rows={3}
          value={draft.address}
          onChange={(e) => onChange({ ...draft, address: e.target.value })}
        />
      </div>

      <div className="entity-field-row">
        <div className="entity-field">
          <label htmlFor="businessPhone">
            Contact phone <span className="entity-field-help">(shown to customers on quotes/agreements)</span>
          </label>
          <input
            id="businessPhone"
            type="tel"
            placeholder="+91 98XXX XXXXX"
            value={draft.business_phone}
            onChange={(e) => onChange({ ...draft, business_phone: e.target.value })}
          />
        </div>
        <div className="entity-field">
          <label htmlFor="businessEmail">
            Contact email <span className="entity-field-help">(shown to customers on quotes/agreements)</span>
          </label>
          <input
            id="businessEmail"
            type="email"
            placeholder="contact@yourcompany.com"
            value={draft.business_email}
            onChange={(e) => onChange({ ...draft, business_email: e.target.value })}
          />
        </div>
      </div>

      <div className="entity-field-row">
        <div className="entity-field">
          <label>
            GST number <span className="entity-field-help">(fixed at registration)</span>
          </label>
          <input type="text" value={entity.gstno} disabled />
        </div>
        <div className="entity-field">
          <label>
            Business type <span className="entity-field-help">(fixed at registration)</span>
          </label>
          <input type="text" value={entity.type} disabled />
        </div>
      </div>
    </div>
  );
}
