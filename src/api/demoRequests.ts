import { apiRequest } from "./client";

export type DemoRequestInput = {
  name: string;
  email: string;
  company: string;
  type: string;
  team_size: string;
  active_projects: string;
  notes?: string;
};

export type DemoRequestResponse = {
  demo_request_id: number;
  message: string;
};

export function submitDemoRequest(data: DemoRequestInput) {
  return apiRequest<DemoRequestResponse>("/public/demo-requests", {
    method: "POST",
    body: data,
    auth: false,
  });
}
