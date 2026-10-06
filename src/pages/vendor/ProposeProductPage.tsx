import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import {
  vendorListCategories,
  vendorListProducts,
  vendorProposeProduct,
  type Category,
  type Product,
} from "../../api/marketplaceCatalog";
import { useAuth } from "../../lib/AuthContext";
import ProductForm from "../marketplace/ProductForm";
import "../marketplace/mp.css";

export default function ProposeProductPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id ?? null;
  const [cats, setCats] = useState<Category[]>([]);
  const [mine, setMine] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (entityId == null) return;
    vendorListProducts(entityId, { mine: true, page_size: 100 })
      .then((r) => setMine(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load proposals"));
  }, [entityId]);

  useEffect(() => {
    if (entityId == null) return;
    vendorListCategories(entityId)
      .then((r) => setCats(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load categories"));
    load();
  }, [entityId, load]);

  const catName = (id: number) => cats.find((c) => c.category_id === id)?.name ?? id;

  return (
    <div className="mp-page">
      <h1>Propose a product</h1>
      <p className="mp-intro">
        Can't find your product in the catalog? Propose it. Solaros reviews it, and once approved you can list it for sale.
      </p>
      {error && <p className="mp-error">{error}</p>}
      {entityId != null && (
        <ProductForm
          categories={cats}
          submitLabel="Submit proposal"
          onSubmit={async (input) => {
            await vendorProposeProduct(entityId, input);
            load();
          }}
        />
      )}
      <h2>My proposals</h2>
      <div className="mp-card mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {mine.length === 0 && (
              <tr>
                <td colSpan={4}>No proposals yet.</td>
              </tr>
            )}
            {mine.map((p) => (
              <tr key={p.product_id}>
                <td>{p.name}</td>
                <td>{catName(p.category_id)}</td>
                <td>
                  <span className={`mp-badge ${p.status === "ACTIVE" ? "ok" : p.status === "REJECTED" ? "bad" : ""}`}>{p.status}</span>
                </td>
                <td>{p.reject_reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
