require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "client")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "login.html"));
});

// ================= DATABASE CONNECTION =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});




// ================= REGISTER USER =================
app.post('/register', (req, res) => {
    const { name, email, password } = req.body;

    const sql = `
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, 'user')
    `;

    db.query(sql, [name, email, password], (err) => {
        if (err) return res.status(500).send("Error registering user");
        res.send("User Registered Successfully");
    });
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {

    const { email, password } = req.body;

    try {

        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND password = $2",
            [email, password]
        );

        if (result.rows.length > 0) {

            res.json({
                message: "Login Successful",
                user: result.rows[0]
            });

        } else {

            res.status(401).json({
                message: "Invalid Email or Password"
            });

        }

    } catch (error) {

        console.log(error);
        res.status(500).json({
    message: "Login error"
});

    }

});

// ================= CREATE EVENT =================
app.post('/create-event', (req, res) => {
    const { title, description, date, location, category } = req.body;

    const sql = `
        INSERT INTO events (title, description, date, location, category)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [title, description, date, location, category], (err) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error creating event");
        }

        res.json({ message: "Event Created Successfully" });
    });
});

// ================= GET EVENTS =================
app.get('/events', (req, res) => {
    db.query("SELECT * FROM events", (err, results) => {
        if (err) return res.status(500).send("Error fetching events");
        res.json(results);
    });
});

// ================= REGISTER FOR EVENT + QR =================
app.post('/register-event', (req, res) => {

    const { user_id, event_id } = req.body;

    const checkSql = `
        SELECT * FROM registrations 
        WHERE user_id = ? AND event_id = ?
    `;

    db.query(checkSql, [user_id, event_id], async (err, results) => {

        if (err) return res.status(500).send("Error checking registration");

        if (results.length > 0) {
            return res.status(400).json({
                message: "You are already registered for this event."
            });
        }

        const qrValue = `${user_id}-${event_id}-${Date.now()}`;

        const qrImage = await QRCode.toDataURL(qrValue, {
            width: 400,
            margin: 2,
            color: {
                dark: "#000000",
                light: "#ffffff"
            }
        });

        const insertSql = `
            INSERT INTO registrations (user_id, event_id, qr_code)
            VALUES (?, ?, ?)
        `;

        db.query(insertSql, [user_id, event_id, qrValue], (err) => {

            if (err) return res.status(500).send("Error registering");

            res.json({
                message: "Registered Successfully",
                qr: qrImage,
                qr_value: qrValue   // 👈 IMPORTANT
            });

        });

    });
});

// ================= MARK ATTENDANCE =================
app.post('/mark-attendance', (req, res) => {

    const { qr_value } = req.body;

    const checkSql = `
        SELECT * FROM registrations 
        WHERE qr_code = ?
    `;

    db.query(checkSql, [qr_value], (err, results) => {

        if (err) return res.status(500).send("Error checking QR");

        if (results.length === 0) {
            return res.status(404).send("Invalid QR Code");
        }

        if (results[0].attended === 1) {
            return res.send("Attendance Already Marked");
        }

        const updateSql = `
            UPDATE registrations 
            SET attended = 1
            WHERE qr_code = ?
        `;

        db.query(updateSql, [qr_value], (err) => {
            if (err) return res.status(500).send("Error marking attendance");
            res.send("Attendance Marked Successfully");
        });

    });
});
// ================= CREATE ADMIN =================
app.post('/create-admin', (req, res) => {

    const { name, email, password } = req.body;

    const sql = `
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, 'admin')
    `;

    db.query(sql, [name, email, password], (err) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ message: "Error creating admin" });
        }

        res.json({ message: "Admin Created Successfully" });
    });

});
// ================= ATTENDANCE SUMMARY =================
app.get('/attendance-summary/:event_id', (req, res) => {

    const eventId = req.params.event_id;

    const sql = `
        SELECT 
            COUNT(*) AS total_registrations,
            SUM(CASE WHEN attended = 1 THEN 1 ELSE 0 END) AS total_present,
            SUM(CASE WHEN attended = 0 OR attended IS NULL THEN 1 ELSE 0 END) AS total_absent
        FROM registrations
        WHERE event_id = ?
    `;

    db.query(sql, [eventId], (err, results) => {

        if (err) return res.status(500).send("Error fetching attendance");

        const data = results[0];

        const percentage = data.total_registrations > 0
            ? ((data.total_present / data.total_registrations) * 100).toFixed(2)
            : 0;

        res.json({
            total_registrations: data.total_registrations || 0,
            total_present: data.total_present || 0,
            total_absent: data.total_absent || 0,
            attendance_percentage: percentage + "%"
        });

    });
});
// ================= SERVER START =================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});