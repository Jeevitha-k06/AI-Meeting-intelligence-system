import axios from "axios";
import { API_BASE_URL } from "./config";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 600000, // 10 min — ML pipeline can take a while
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Axios timeout produces a generic "timeout of Xms exceeded" message.
    // Preserve the original code so callers can detect it.
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      const timeoutErr = new Error("timeout");
      (timeoutErr as Error & { isTimeout: boolean }).isTimeout = true;
      return Promise.reject(timeoutErr);
    }
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred";
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
