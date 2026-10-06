import { apiRequest } from "./client";

export type EntityRegistrationInput = {
  entity: {
    name: string;
    type: string;
    gstno: string;
    address: string;
    // Platform role: EPC (default) or VENDOR (sells on the marketplace).
    kind?: "EPC" | "VENDOR";
  };
  admin_user: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
  };
};

export type EntityRegistrationResponse = {
  entity_id: number;
  state: string;
  message: string;
};

export function registerEntity(data: EntityRegistrationInput) {
  return apiRequest<EntityRegistrationResponse>("/entities/register", {
    method: "POST",
    body: data,
    auth: false,
  });
}
