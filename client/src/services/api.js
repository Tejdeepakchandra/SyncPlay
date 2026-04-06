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
    console.log(`[API] 📤 ${method} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] ❌ Request error:', error.message);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log(`[API] ✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const url = error.config?.url || 'unknown';
    const method = error.config?.method?.toUpperCase() || 'unknown';
    
    if (error.code === 'ECONNABORTED') {
      console.error(`[API] ⏱️ TIMEOUT on ${method} ${url} (${error.message})`);
    } else if (!error.response) {
      console.error(`[API] 🌐 No response from server on ${method} ${url}`);
    } else {
      console.error(`[API] ❌ ${error.response.status} ${method} ${url}: ${error.response.data?.message || error.message}`);
    }
    
    return Promise.reject(error);
  }
);

export default api;