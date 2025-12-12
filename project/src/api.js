import axios from "axios";

const API = `http://${window.location.hostname}:5000`;

export default API;

// Get current language from localStorage
export const getCurrentLang = () => {
  return localStorage.getItem('i18nextLng') || 'en';
};

export const recommend = (payload) =>
  axios.post(`${API}/api/recommend`, { ...payload, lang: getCurrentLang() }).then((r) => r.data);

export const createRequest = (payload) =>
  axios.post(`${API}/api/request`, { ...payload, lang: getCurrentLang() }).then((r) => r.data);

export const listRequests = (params) =>
  axios.get(`${API}/api/requests`, { params: { ...params, lang: getCurrentLang() } }).then((r) => r.data);

export const listNotifications = (params) =>
  axios.get(`${API}/api/notifications`, { params: { ...params, lang: getCurrentLang() } }).then((r) => r.data);

export const acceptRequest = (id) =>
  axios.post(`${API}/api/accept/${id}`, { lang: getCurrentLang() }).then((r) => r.data);

export const rejectRequest = (id) =>
  axios.post(`${API}/api/reject/${id}`, { lang: getCurrentLang() }).then((r) => r.data);

export const sendMessage = (payload) =>
  axios.post(`${API}/api/chat/send`, { ...payload, lang: getCurrentLang() }).then((r) => r.data);

export const getChatHistory = (room) =>
  axios.get(`${API}/api/chat/history`, { params: { room, lang: getCurrentLang() } }).then((r) => r.data);

export const getUser = (id) =>
  axios.get(`${API}/api/user`, { params: { id, lang: getCurrentLang() } }).then((r) => r.data);

// Translate text from English to current language
export const translateText = async (text) => {
  const lang = getCurrentLang();
  if (lang === 'en' || !text) return text;

  try {
    const response = await axios.post(`${API}/api/translate`, { text, lang });
    return response.data.translated || text;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
};