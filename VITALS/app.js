const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// --- 1. Database Connection ---
const dbUrl = 'mongodb://localhost:27017/hospital_info';
mongoose.connect(dbUrl)
  .then(() => console.log('Connected to MongoDB: hospital_info'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- 2. Schemas ---

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true }, 
  name: String
}, { collection: 'employees' });

const User = mongoose.model('User', userSchema);

// [NEW] Review Schema (For Testimonials)
const reviewSchema = new mongoose.Schema({
  name: String,
  text: String,
  date: { type: Date, default: Date.now }
}, { collection: 'reviews' });

const Review = mongoose.model('Review', reviewSchema);
// --- 2. Schemas ---
// ... (User Schema and Review Schema are already here) ...

// [NEW] Appointment Schema
const appointmentSchema = new mongoose.Schema({
  doctorId: { type: String, default: 'Dr.AmitSharma' }, // Use a fixed ID for this doctor
  dateKey: { type: String, required: true }, // e.g., "2025-11-25"
  timeSlot: { type: String, required: true }, // e.g., "09:00 AM - 09:30 AM"
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fee: { type: Number, default: 1200 },
  status: { type: String, default: 'Confirmed' }
}, { collection: 'appointments' });

const Appointment = mongoose.model('Appointment', appointmentSchema);

// --- 3. Middleware ---
// Ensure you have express.json() for reading POST requests:
// app.use(express.json()); 
// ...

// --- 3. Middleware ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // [NEW] This allows us to read JSON from the fetch API

app.use(session({
  secret: 'sachidanand_secret_key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: dbUrl }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

// --- 4. ROUTES ---

// Authentication Routes
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/signup', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.send('<script>alert("User exists. Login."); window.location.href="/login";</script>');
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name: name || "New Member", username, password: hashedPassword });
    await newUser.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.send('<script>alert("Error"); window.location.href="/login";</script>');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.send('<script>alert("User not found"); window.location.href="/login";</script>');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.send('<script>alert("Invalid Password"); window.location.href="/login";</script>');

    req.session.userId = user._id;
    req.session.username = user.name;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('<script>alert("Server Error"); window.location.href="/login";</script>');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'main.html'));
});

// [NEW] API Routes for Testimonials
// 1. Get all reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ date: -1 }); // Newest first
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});
// [NEW] API Routes for Appointments

// 1. GET Booked Slots
app.get('/api/appointments/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    // Find all appointments for this doctor and only return the dateKey and timeSlot
    const appointments = await Appointment.find({ doctorId: doctorId }, 'dateKey timeSlot -_id');
    
    // Convert array of objects into a map for quick lookup on the client side:
    // { "YYYY-MM-DD": ["time slot 1", "time slot 2"], ... }
    const bookedMap = appointments.reduce((acc, current) => {
      acc[current.dateKey] = acc[current.dateKey] || [];
      acc[current.dateKey].push(current.timeSlot);
      return acc;
    }, {});

    res.json(bookedMap);
  } catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// 2. POST New Appointment
app.post('/api/appointments', async (req, res) => {
  if (!req.session.userId) {
    // If user is not logged in, they can't book
    return res.status(401).json({ error: 'Please log in to book an appointment.' });
  }

  const { dateKey, timeSlot, doctorId, fee } = req.body;
  
  try {
    const newAppointment = new Appointment({ 
      doctorId, 
      dateKey, 
      timeSlot, 
      userId: req.session.userId, // Link booking to the logged-in user
      fee: fee || 1200
    });
    
    await newAppointment.save();
    res.json({ success: true });
    
  } catch (err) {
    console.error("Error saving appointment:", err);
    res.status(500).json({ error: 'Failed to save appointment' });
  }
});

// 2. Save a new review
app.post('/api/reviews', async (req, res) => {
  // Only allow logged in users to post (Optional security)
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, text } = req.body;
  try {
    const newReview = new Review({ name, text });
    await newReview.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review' });
  }
});

// Static Files
app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});