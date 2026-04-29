import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout (was 30s, too long)
});

// Request interceptor - ONLY LOG, token added by useApiAuth
api.interceptors.request.use(
  (config) => {
    const method = config.method?.toUpperCase() || 'GET';
    return config;
  },
  (error) => {
    console.error('[API] ❌ Request error:', error.message);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const url = error.config?.url || 'unknown';
    const method = error.config?.method?.toUpperCase() || 'unknown';
    const status = error.response?.status;
    
    if (error.code === 'ECONNABORTED') {
      console.error(`[API] ⏱️ TIMEOUT on ${method} ${url} (${error.message})`);
    } else if (!error.response) {
      console.error(`[API] 🌐 No response from server on ${method} ${url}`);
    } else if (status === 401) {
      // Silently ignore 401s — expected during auth bootstrap (Clerk loading)
    } else {
      console.error(`[API] ❌ ${status} ${method} ${url}: ${error.response.data?.message || error.message}`);
    }
    
    return Promise.reject(error);
  }
);

export default api;