const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');
const DEFAULT_STATE = {
  users: [],
  payments: [],
};

const loadState = () => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_STATE));
  } catch (error) {
    console.error('Database load error:', error);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
};

const saveState = state => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Database save error:', error);
  }
};

const state = loadState();

const normalizeUsername = username => String(username || '').trim();
const normalizeEmail = email => String(email || '').trim().toLowerCase();

const getUserByUsername = username => {
  const normalized = normalizeUsername(username);
  return state.users.find(user => user.username === normalized) || null;
};

const getUserByUsernameInsensitive = username => {
  const normalized = normalizeUsername(username).toLowerCase();
  return state.users.find(user => String(user.username || '').toLowerCase() === normalized) || null;
};

const findUserByEmail = email => {
  const normalized = normalizeEmail(email);
  return state.users.find(user => String(user.email || '').toLowerCase() === normalized) || null;
};

const createUser = user => {
  const normalizedUsername = normalizeUsername(user.username);
  if (getUserByUsername(normalizedUsername) || findUserByEmail(user.email)) {
    return null;
  }
  const newUser = { ...user, username: normalizedUsername, email: normalizeEmail(user.email) };
  state.users.push(newUser);
  saveState(state);
  return newUser;
};

const updateUser = user => {
  const normalizedUsername = normalizeUsername(user.username);
  const existingIndex = state.users.findIndex(u => u.username === normalizedUsername);
  if (existingIndex === -1) {
    return null;
  }
  state.users[existingIndex] = { ...state.users[existingIndex], ...user, username: normalizedUsername, email: normalizeEmail(user.email) };
  saveState(state);
  return state.users[existingIndex];
};

const addOrUpdateUser = user => {
  const normalizedUsername = normalizeUsername(user.username);
  const existingIndex = state.users.findIndex(u => u.username === normalizedUsername);
  if (existingIndex === -1) {
    return createUser(user);
  }
  state.users[existingIndex] = { ...state.users[existingIndex], ...user, username: normalizedUsername, email: normalizeEmail(user.email) };
  saveState(state);
  return state.users[existingIndex];
};

const getPaymentById = paymentId => {
  return state.payments.find(payment => payment.id === paymentId) || null;
};

const addPayment = payment => {
  state.payments.push(payment);
  saveState(state);
  return payment;
};

const updatePayment = payment => {
  const existingIndex = state.payments.findIndex(p => p.id === payment.id);
  if (existingIndex === -1) {
    return null;
  }
  state.payments[existingIndex] = { ...state.payments[existingIndex], ...payment };
  saveState(state);
  return state.payments[existingIndex];
};

const deletePayment = paymentId => {
  const existingIndex = state.payments.findIndex(p => p.id === paymentId);
  if (existingIndex === -1) {
    return false;
  }
  state.payments.splice(existingIndex, 1);
  saveState(state);
  return true;
};

const getAllBookings = () => {
  return state.payments.map(payment => ({ ...payment }));
};

module.exports = {
  getUserByUsername,
  getUserByUsernameInsensitive,
  findUserByEmail,
  createUser,
  updateUser,
  addOrUpdateUser,
  getPaymentById,
  addPayment,
  updatePayment,
  deletePayment,
  getAllBookings,
};
