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
app.post('/register', async (req, res) => {

    const { name, email, password } = req.body;

    try {

        await pool.query(
            `INSERT INTO users (name,email,password,role)
             VALUES ($1,$2,$3,'user')`,
            [name,email,password]
        );

        res.json({ message: "User Registered Successfully" });

    } catch(error) {

        console.log(error);
        res.status(500).json({ message:"Error registering user" });

    }

});


// ================= LOGIN =================
app.post('/login', async (req, res) => {

    const { email, password } = req.body;

    try {

        const result = await pool.query(
            "SELECT * FROM users WHERE email=$1 AND password=$2",
            [email,password]
        );

        if(result.rows.length > 0){

            res.json({
                message:"Login Successful",
                user: result.rows[0]
            });

        }else{

            res.status(401).json({
                message:"Invalid Email or Password"
            });

        }

    } catch(error){

        console.log(error);
        res.status(500).json({message:"Login error"});

    }

});


// ================= CREATE EVENT =================
app.post('/create-event', async (req, res) => {

    const { title, description, date, location, category } = req.body;

    try{

        await pool.query(
            `INSERT INTO events (title,description,date,location,category)
             VALUES ($1,$2,$3,$4,$5)`,
            [title,description,date,location,category]
        );

        res.json({ message:"Event created successfully" });

    }catch(error){

        console.log(error);
        res.status(500).json({message:"Error creating event"});

    }

});


// ================= GET EVENTS =================
app.get('/events', async (req,res)=>{

    try{

        const result = await pool.query("SELECT * FROM events ORDER BY event_id DESC");

        res.json(result.rows);

    }catch(error){

        console.log(error);
        res.status(500).json({message:"Error fetching events"});

    }

});


// ================= REGISTER FOR EVENT =================
app.post('/register-event', async (req,res)=>{

    const { user_id, event_id } = req.body;

    try{

        const check = await pool.query(
            `SELECT * FROM registrations
             WHERE user_id=$1 AND event_id=$2`,
            [user_id,event_id]
        );

        if(check.rows.length>0){

            return res.status(400).json({
                message:"Already registered"
            });

        }

        const qrValue = `${user_id}-${event_id}-${Date.now()}`;

        const qrImage = await QRCode.toDataURL(qrValue);

        await pool.query(
            `INSERT INTO registrations (user_id,event_id,qr_code)
             VALUES ($1,$2,$3)`,
            [user_id,event_id,qrValue]
        );

        res.json({
            message:"Registered Successfully",
            qr: qrImage,
            qr_value: qrValue
        });

    }catch(error){

        console.log(error);
        res.status(500).json({message:"Error registering"});

    }

});


// ================= MARK ATTENDANCE =================
app.post('/mark-attendance', async (req,res)=>{

    const { qr_value } = req.body;

    try{

        const result = await pool.query(
            `SELECT * FROM registrations WHERE qr_code=$1`,
            [qr_value]
        );

        if(result.rows.length===0){

            return res.status(404).json({
                message:"Invalid QR Code"
            });

        }

        if(result.rows[0].attended===1){

            return res.json({
                message:"Attendance Already Marked"
            });

        }

        await pool.query(
            `UPDATE registrations
             SET attended=1
             WHERE qr_code=$1`,
            [qr_value]
        );

        res.json({
            message:"Attendance Marked Successfully"
        });

    }catch(error){

        console.log(error);
        res.status(500).json({
            message:"Error checking QR"
        });

    }

});


// ================= CREATE ADMIN =================
app.post('/create-admin', async (req,res)=>{

    const { name,email,password } = req.body;

    try{

        await pool.query(
            `INSERT INTO users (name,email,password,role)
             VALUES ($1,$2,$3,'admin')`,
            [name,email,password]
        );

        res.json({message:"Admin Created Successfully"});

    }catch(error){

        console.log(error);
        res.status(500).json({message:"Error creating admin"});

    }

});


// ================= ATTENDANCE SUMMARY =================
app.get('/attendance-summary/:event_id', async (req,res)=>{

    const eventId = req.params.event_id;

    try{

        const result = await pool.query(
            `SELECT 
                COUNT(*) AS total_registrations,
                SUM(CASE WHEN attended=1 THEN 1 ELSE 0 END) AS total_present,
                SUM(CASE WHEN attended=0 OR attended IS NULL THEN 1 ELSE 0 END) AS total_absent
             FROM registrations
             WHERE event_id=$1`,
            [eventId]
        );

        const data = result.rows[0];

        const percentage = data.total_registrations>0
        ? ((data.total_present/data.total_registrations)*100).toFixed(2)
        : 0;

        res.json({
            total_registrations: data.total_registrations || 0,
            total_present: data.total_present || 0,
            total_absent: data.total_absent || 0,
            attendance_percentage: percentage + "%"
        });

    }catch(error){

        console.log(error);
        res.status(500).json({message:"Error fetching attendance"});

    }

});


// ================= SERVER START =================
const PORT = process.env.PORT || 5000;

app.listen(PORT,()=>{
    console.log("Server running on port "+PORT);
});