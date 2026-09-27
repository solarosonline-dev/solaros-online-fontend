import { apiRequest } from "./client";

export type MaterialType = "PANEL" | "INVERTER" | "MOUNTING_STRUCTURE" | "CABLE" | "OTHER";
export type MaterialUnit = "PIECES" | "METERS" | "KGS";

export type Warehouse = {
  warehouse_id: number;
  entity_id: number;
  vendor_id: number | null;
  vendor_name: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WarehouseList = {
  items: Warehouse[];
};

export type WarehouseCreateInput = {
  name: string;
  vendor_id?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
};

export type WarehouseUpdateInput = Partial<WarehouseCreateInput>;

export type InventoryItem = {
  inventory_id: number;
  warehouse_id: number;
  material_type: MaterialType;
  make: string | null;
  model: string | null;
  quantity_available: number;
  unit: MaterialUnit;
  created_at: string;
  updated_at: string;
};

export type InventoryList = {
  items: InventoryItem[];
};

export type InventoryItemCreateInput = {
  material_type: MaterialType;
  make?: string | null;
  model?: string | null;
  quantity_available: number;
  unit: MaterialUnit;
};

export type InventoryItemUpdateInput = {
  quantity_available: number;
};

export function listWarehouses(entityId: number) {
  return apiRequest<WarehouseList>(`/entities/${entityId}/warehouses`);
}

export function createWarehouse(entityId: number, data: WarehouseCreateInput) {
  return apiRequest<Warehouse>(`/entities/${entityId}/warehouses`, {
    method: "POST",
    body: data,
  });
}

export function updateWarehouse(entityId: number, warehouseId: number, data: WarehouseUpdateInput) {
  return apiRequest<Warehouse>(`/entities/${entityId}/warehouses/${warehouseId}`, {
    method: "PATCH",
    body: data,
  });
}

export function listInventory(entityId: number, warehouseId: number) {
  return apiRequest<InventoryList>(`/entities/${entityId}/warehouses/${warehouseId}/inventory`);
}

export function addInventoryItem(entityId: number, warehouseId: number, data: InventoryItemCreateInput) {
  return apiRequest<InventoryItem>(`/entities/${entityId}/warehouses/${warehouseId}/inventory`, {
    method: "POST",
    body: data,
  });
}

export function updateInventoryItem(entityId: number, warehouseId: number, inventoryId: number, data: InventoryItemUpdateInput) {
  return apiRequest<InventoryItem>(`/entities/${entityId}/warehouses/${warehouseId}/inventory/${inventoryId}`, {
    method: "PATCH",
    body: data,
  });
}
