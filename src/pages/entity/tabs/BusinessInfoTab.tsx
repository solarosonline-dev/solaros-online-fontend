import type { Entity } from "../../../api/entity";

type Props = {
  entity: Entity;
  draft: { name: string; address: string };
  onChange: (draft: { name: string; address: string }) => void;
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
