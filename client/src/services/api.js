import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Request interceptor - ONLY LOG, token added by useApiAuth
api.interceptors.request.use(
  (config) => {
    console.log('📤 API Request:', config.method.toUpperCase(), config.url);
    console.log('   Headers:', config.headers);
    return config;
  },
  (error) => {
    console.error('❌ Request setup error:', error.message);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log('📥 API Response:', response.status, response.config.url);
    console.log('   Data:', response.data);
    return response;
  },
  (error) => {
    console.error('❌ API Error');
    console.error('   Status:', error.response?.status);
    console.error('   URL:', error.config?.url);
    console.error('   Message:', error.message);
    console.error('   Response:', error.response?.data);
    
    // Log timeout specifically
    if (error.code === 'ECONNABORTED') {
      console.error('   ⏱️  REQUEST TIMEOUT (30s exceeded)');
    }
    
    if (error.response?.status === 401) {
      console.log('Unauthorized - may need to refresh token');
    }
    return Promise.reject(error);
  }
);

export default api;