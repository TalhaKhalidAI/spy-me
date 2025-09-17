// src/api/sdpApi.js
import axios from "axios";
import { toast } from "react-toastify";

// ✅ Create axios instance with env-based base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000, // prevent infinite waits
});

// ===== Interceptors =====
// Success handler: just return data
api.interceptors.response.use(
  (response) => response,
  
  (error) => {
    let message = "An unknown error occurred";

    // 1️⃣ Check if server responded (FastAPI error, 4xx/5xx)
    if (error.response) {
      const status = error.response.status;

      // Prefer backend `detail` or `message`
      message =
        error.response.data?.detail ||
        error.response.data?.message ||
        `Server returned status ${status}`;

      if (status >= 500) {
        message = `Server Error (${status}): ${message}`;
      } else if (status >= 400) {
        message = `Request Error (${status}): ${message}`;
      }
    }
    // 2️⃣ No response means network or CORS issue
    else if (error.request) {
      message =
        "No response from server. Possible network error or CORS misconfiguration.";
    }
    // 3️⃣ Something else failed before sending request
    else {
      message = `Request Setup Error: ${error.message}`;
    }

    toast.error(message);
    return Promise.reject(error);
  }
);

// ===== API Functions =====
export const registerSDP = async (payload) => {
  const res = await api.post("/register_sdp", payload);
  toast.success("SDP registered successfully");
  return res.data;
};

export const registerAnswer = async (payload) => {
  const res = await api.post("/register_answer", payload);
  toast.success("Answer registered successfully");
  return res.data;
};

export const getClients = async (id = null) => {
  const res = await api.get("/get_clients", {
    params: id ? { id } : {},
  });
  return res.data;
};

export const updateSDP = async (payload) => {
  const res = await api.put("/update_sdp", payload);
  toast.success("SDP updated successfully");
  return res.data;
};

export const updateAnswer = async (payload) => {
  const res = await api.put("/update_answer", payload);
  toast.success("Answer updated successfully");
  return res.data;
};

export const deleteClient = async (clientId) => {
  const res = await api.delete(`/delete_client/${clientId}`);
  toast.success("Client deleted successfully");
  return res.data;
};

export const heartbeat = async (payload,verbose=false) => {
  const res = await api.post("/heartbeat", payload);
  if(verbose){
  toast.success("Heartbeat updated successfully");
  }
  return res.data;
};

export default api;
