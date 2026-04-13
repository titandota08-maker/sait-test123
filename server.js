require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { randomUUID, randomInt, createHash } = require('crypto');
const path = require('path');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const SITE_OWNER_USERNAMES = new Set(['Valera_OwnerSite123', 'Valera_OwnerSite1111']);
const SITE_OWNER_EMAIL = process.env.SITE_OWNER_EMAIL ? process.env.SITE_OWNER_EMAIL.trim().toLowerCase() : 'zatulij@gmail.com';
const SMTP_HOST = process.env.SMTP_HOST || null;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
const SMTP_USER = process.env.SMTP_USER || null;
const SMTP_PASS = process.env.SMTP_PASS || null;
const SMTP_FROM = process.env.SMTP_FROM ? process.env.SMTP_FROM : (SMTP_USER ? `HUMREY <${SMTP_USER}>` : `HUMREY <no-reply@humrey.local>`);
const smtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
const smsEnabled = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
const twilioClient = smsEnabled ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

const findUserByEmail = email => db.findUserByEmail(email);

const hashPassword = password => createHash('sha256').update(password).digest('hex');
const SITE_OWNER_PASSWORD = process.env.SITE_OWNER_PASSWORD || '12345678';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'zatulijvalera@gmail.com';
const defaultOwnerUser = {
  username: 'Valera_OwnerSite1111',
  passwordHash: hashPassword(SITE_OWNER_PASSWORD),
  email: DEFAULT_ADMIN_EMAIL,
  isAdmin: true,
  verified: true,
  createdAt: Date.now(),
};
if (!db.getUserByUsername(defaultOwnerUser.username)) {
  db.createUser(defaultOwnerUser);
}
console.log('Default admin created or loaded:', defaultOwnerUser.username, 'email:', defaultOwnerUser.email, 'password:', SITE_OWNER_PASSWORD);

const formatPhoneNumber = phone => {
  let value = phone.trim();
  if (!value) return null;

  value = value.replace(/[\s()-]+/g, '');
  if (!value) return null;

  if (value.startsWith('00')) {
    value = '+' + value.slice(2);
  }

  if (value.startsWith('+')) {
    if (!/^\+\d{8,15}$/.test(value)) return null;
    if (value.startsWith('+7') || value.startsWith('+375')) return null;
    return value;
  }

  const digits = value.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) {
    return '+38' + digits;
  }
  if (/^\d{8,15}$/.test(digits)) {
    if (digits.startsWith('7') || digits.startsWith('375') || digits.startsWith('8')) return null;
    return '+' + digits;
  }
  return null;
};

const sendVerificationSms = async (phone, code) => {
  if (!smsEnabled) {
    console.warn('SMS service is not configured. Реальна SMS-розсилка відключена.');
    return { debug: true, code };
  }
  return twilioClient.messages.create({
    body: `Ваш код підтвердження HUMREY: ${code}`,
    from: process.env.TWILIO_FROM_NUMBER,
    to: phone,
  });
};

const createVerificationCode = () => String(randomInt(100000, 1000000)).padStart(6, '0');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const maskCard = cardNumber => {
  const digits = cardNumber.replace(/\D/g, '');
  return digits.length >= 4 ? '**** **** **** ' + digits.slice(-4) : cardNumber;
};

app.post('/api/payments/create', (req, res) => {
  const { booking, card, saveCard } = req.body;
  if (!booking || !booking.service || !booking.amount) {
    return res.status(400).json({ error: 'Неповні дані платежу. Перевірте форму.' });
  }

  const paymentMethod = String(booking.payment || 'cash').toLowerCase();
  if (paymentMethod === 'card') {
    if (!card || !card.cardNumber) {
      return res.status(400).json({ error: 'Неповні дані картки для оплати карткою.' });
    }
  }

  const paymentId = randomUUID();
  const payment = {
    id: paymentId,
    status: 'pending',
    method: paymentMethod,
    booking: {
      ...booking
    },
    card: paymentMethod === 'card' ? {
      cardNumber: maskCard(card.cardNumber),
      cardExpiry: card.cardExpiry,
      cardHolder: card.cardHolder
    } : null,
    saveCard: Boolean(saveCard),
    createdAt: Date.now()
  };

  db.addPayment(payment);

  if (paymentMethod === 'card') {
    return res.json({ paymentId, redirectUrl: `/monobank-confirm.html?paymentId=${paymentId}` });
  }

  return res.json({ success: true, paymentId, message: 'Бронювання успішно збережено.' });
});

app.get('/api/payments/status', (req, res) => {
  const paymentId = req.query.paymentId;
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  const payment = db.getPaymentById(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Платіж не знайдено' });
  }

  return res.json({ status: payment.status, booking: payment.booking });
});

app.get('/api/bookings', (req, res) => {
  const adminUsername = String(req.query.adminUsername || '').trim();
  if (!adminUsername) {
    return res.status(400).json({ error: 'adminUsername is required' });
  }

  const adminUser = db.getUserByUsername(adminUsername) || db.getUserByUsernameInsensitive(adminUsername);
  const isOwner = SITE_OWNER_USERNAMES.has(adminUsername);
  if ((!adminUser && !isOwner) || (!isOwner && !adminUser.isAdmin)) {
    return res.status(403).json({ error: 'Доступ заборонено. Ви не є адміном.' });
  }

  const bookings = db.getAllBookings().map(payment => ({
    id: payment.id,
    status: payment.status,
    ...payment.booking,
    createdAt: payment.createdAt,
  }));

  return res.json({ success: true, bookings });
});

app.patch('/api/bookings/:id', (req, res) => {
  const bookingId = String(req.params.id || '').trim();
  const { date, time, adminUsername } = req.body;
  if (!bookingId || !date || !time || !adminUsername) {
    return res.status(400).json({ error: 'Потрібні id бронювання, дата, час та логін адміністратора.' });
  }

  const adminUser = db.getUserByUsername(adminUsername) || db.getUserByUsernameInsensitive(adminUsername);
  const isOwner = SITE_OWNER_USERNAMES.has(adminUsername);
  if ((!adminUser && !isOwner) || (!isOwner && !adminUser.isAdmin)) {
    return res.status(403).json({ error: 'Доступ заборонено. Ви не є адміном.' });
  }

  const payment = db.getPaymentById(bookingId);
  if (!payment) {
    return res.status(404).json({ error: 'Бронювання не знайдено.' });
  }

  payment.booking.date = date;
  payment.booking.time = time;
  const updated = db.updatePayment(payment);
  return res.json({ success: true, booking: updated.booking });
});

app.delete('/api/bookings/:id', (req, res) => {
  const bookingId = String(req.params.id || '').trim();
  const adminUsername = String(req.query.adminUsername || '').trim();
  if (!bookingId || !adminUsername) {
    return res.status(400).json({ error: 'Потрібні id бронювання та логін адміністратора.' });
  }

  const adminUser = db.getUserByUsername(adminUsername) || db.getUserByUsernameInsensitive(adminUsername);
  const isOwner = SITE_OWNER_USERNAMES.has(adminUsername);
  if ((!adminUser && !isOwner) || (!isOwner && !adminUser.isAdmin)) {
    return res.status(403).json({ error: 'Доступ заборонено. Ви не є адміном.' });
  }

  const deleted = db.deletePayment(bookingId);
  if (!deleted) {
    return res.status(404).json({ error: 'Бронювання не знайдено.' });
  }

  return res.json({ success: true, message: 'Бронювання видалено.' });
});

app.post('/api/payments/confirm', (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  const payment = db.getPaymentById(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Платіж не знайдено' });
  }

  payment.status = 'paid';
  db.updatePayment(payment);
  return res.json({ success: true, paymentId });
});

app.post('/api/payments/webhook', (req, res) => {
  const { paymentId, status } = req.body;
  if (!paymentId || !status) {
    return res.status(400).json({ error: 'paymentId and status are required' });
  }

  const payment = db.getPaymentById(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Платіж не знайдено' });
  }

  payment.status = status;
  db.updatePayment(payment);
  return res.json({ success: true });
});

app.post('/api/accounts/register', async (req, res) => {
  const { username, password, confirmPassword, email } = req.body;
  if (!username || !password || !confirmPassword || !email) {
    return res.status(400).json({ error: 'Заповніть всі поля.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Паролі не співпадають.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль повинен мати щонайменше 6 символів.' });
  }
  if (db.getUserByUsername(username) || db.getUserByUsernameInsensitive(username)) {
    return res.status(400).json({ error: 'Користувач з таким логіном вже існує.' });
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Введіть дійсний email.' });
  }

  const isAdmin = SITE_OWNER_USERNAMES.has(username) || (SITE_OWNER_EMAIL ? normalizedEmail === SITE_OWNER_EMAIL : false);
  const user = {
    username,
    passwordHash: hashPassword(password),
    email: normalizedEmail,
    isAdmin,
    verified: true,
    createdAt: Date.now(),
  };

  db.createUser(user);
  return res.json({
    success: true,
    message: 'Реєстрацію успішно завершено. Ви успішно увійшли.',
    user: {
      username: user.username,
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
    },
  });
});

app.post('/api/accounts/verify', (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) {
    return res.status(400).json({ error: 'Потрібні логін та код підтвердження.' });
  }

  const user = db.getUserByUsername(username) || db.getUserByUsernameInsensitive(username);
  if (!user) {
    return res.status(404).json({ error: 'Користувача не знайдено.' });
  }
  if (user.verified) {
    return res.status(400).json({ error: 'Номер уже підтверджено.' });
  }
  if (Date.now() > user.codeExpiresAt) {
    return res.status(400).json({ error: 'Термін діі коду минув. Попросіть повторну відправку.' });
  }
  if (code !== user.verificationCode) {
    return res.status(400).json({ error: 'Неправильний код підтвердження.' });
  }

  user.verified = true;
  delete user.verificationCode;
  delete user.codeExpiresAt;
  db.updateUser(user);

  return res.json({ success: true, message: 'Номер телефону успішно підтверджено.' });
});

app.post('/api/accounts/login', (req, res) => {
  const { username, password } = req.body;
  const loginValue = String(username || '').trim();
  console.log('LOGIN ATTEMPT', { loginValue, passwordPresent: Boolean(password) });
  if (!loginValue || !password) {
    return res.status(400).json({ error: 'Потрібні логін або email та пароль.' });
  }

  let user = db.getUserByUsername(loginValue) || db.getUserByUsernameInsensitive(loginValue);
  if (!user && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginValue)) {
    user = findUserByEmail(loginValue);
  }

  if (!user) {
    return res.status(404).json({ error: 'Неправильний логін або пароль.' });
  }
  if (user.passwordHash !== hashPassword(password)) {
    return res.status(400).json({ error: 'Неправильний логін або пароль.' });
  }

  if (SITE_OWNER_USERNAMES.has(user.username) || user.email === SITE_OWNER_EMAIL) {
    user.isAdmin = true;
    db.updateUser(user);
  }

  return res.json({
    success: true,
    message: 'Вхід успішний.',
    user: {
      username: user.username,
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
    },
  });
});

app.post('/api/accounts/assign-admin', (req, res) => {
  const { adminUsername, targetEmail } = req.body;
  if (!adminUsername || !targetEmail) {
    return res.status(400).json({ error: 'Потрібні логін адміністратора та email цілі.' });
  }

  const adminUser = db.getUserByUsername(adminUsername) || db.getUserByUsernameInsensitive(adminUsername);
  if (!adminUser || !adminUser.isAdmin) {
    return res.status(403).json({ error: 'Доступ заборонено. Ви не є адміном.' });
  }

  const targetUser = findUserByEmail(targetEmail);
  if (!targetUser) {
    return res.status(404).json({ error: 'Користувача з таким email не знайдено.' });
  }

  targetUser.isAdmin = true;
  db.updateUser(targetUser);
  return res.json({ success: true, message: `Користувач ${targetEmail} тепер має права адміністратора.` });
});

app.listen(port, () => {
  console.log(`HUMREY payment server running at http://localhost:${port}`);
});



