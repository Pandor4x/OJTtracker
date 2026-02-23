const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const { authenticateToken, authorizeRole } = require("./middleware/auth");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "ojt_tracker",
    password: "yourpassword",
    port: 5432
});

const SECRET = "SECRETKEY";

// Ensure DB tables exist
(async function initDb(){
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        last_name VARCHAR(100),
        first_name VARCHAR(100),
        middle_name VARCHAR(100),
        suffix VARCHAR(50),
        student_id VARCHAR(50) UNIQUE,
        course VARCHAR(255),
        address TEXT,
        age INTEGER,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
    );
    `);

    // ensure course column exists if table was created previously without it
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS course VARCHAR(255);");

    await pool.query(`
    CREATE TABLE IF NOT EXISTS time_logs (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE DEFAULT CURRENT_DATE,
        start_time VARCHAR(20),
        end_time VARCHAR(20),
        total_hours NUMERIC,
        status VARCHAR(20) DEFAULT 'pending'
    );
    `);
})();

/////////////////////////////////////////////////
// REGISTER
/////////////////////////////////////////////////
app.post("/register", async (req,res)=>{
    const { last_name, first_name, middle_name, suffix, student_id, course, address, age, email, password, role } = req.body;

    if(!last_name || !first_name || !student_id || !email || !password) return res.status(400).json({message:'Missing required fields'});

    // prevent duplicate email or student_id
    const exists = await pool.query("SELECT id FROM users WHERE email=$1 OR student_id=$2",[email,student_id]);
    if(exists.rows.length>0) return res.status(400).json({message:'Email or Student ID already registered'});

    const hashed = await bcrypt.hash(password,10);

    await pool.query(
        `INSERT INTO users (last_name,first_name,middle_name,suffix,student_id,course,address,age,email,password,role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [last_name,first_name,middle_name,suffix,student_id,course,address,age,email,hashed,role]
    );
    res.json({message:"User created"});
});

/////////////////////////////////////////////////
// LOGIN
/////////////////////////////////////////////////
app.post("/login", async (req,res)=>{
    const { email, password } = req.body;

    const user = await pool.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
    );

    if(user.rows.length === 0)
        return res.status(400).json({message:"User not found"});

    const valid = await bcrypt.compare(password,user.rows[0].password);
    if(!valid) return res.status(401).json({message:"Invalid password"});

    const token = jwt.sign({
        id:user.rows[0].id,
        role:user.rows[0].role
    }, SECRET);

    res.json({token});
});

/////////////////////////////////////////////////
// STUDENT TIME LOG
/////////////////////////////////////////////////
app.post("/time-log",
authenticateToken,
authorizeRole("student"),
async (req,res)=>{
    const { start_time, end_time } = req.body;

    const start = new Date(`1970-01-01T${start_time}`);
    const end = new Date(`1970-01-01T${end_time}`);
    const hours = (end-start)/1000/60/60;

    await pool.query(
        `INSERT INTO time_logs (student_id,start_time,end_time,total_hours)
         VALUES ($1,$2,$3,$4)`,
        [req.user.id,start_time,end_time,hours]
    );

    res.json({message:"Time logged"});
});

/////////////////////////////////////////////////
// EDIT TIME LOG
/////////////////////////////////////////////////
app.put("/time-log/:id",
authenticateToken,
authorizeRole("student"),
async (req,res)=>{
    const { start_time, end_time } = req.body;
    const id = req.params.id;

    const start = new Date(`1970-01-01T${start_time}`);
    const end = new Date(`1970-01-01T${end_time}`);
    const hours = (end-start)/1000/60/60;

    await pool.query(
        `UPDATE time_logs
         SET start_time=$1,end_time=$2,total_hours=$3,status='pending'
         WHERE id=$4 AND student_id=$5`,
        [start_time,end_time,hours,id,req.user.id]
    );

    res.json({message:"Updated"});
});

/////////////////////////////////////////////////
// DELETE LOG
/////////////////////////////////////////////////
app.delete("/time-log/:id",
authenticateToken,
authorizeRole("student"),
async (req,res)=>{
    await pool.query(
        `DELETE FROM time_logs WHERE id=$1 AND student_id=$2`,
        [req.params.id,req.user.id]
    );
    res.json({message:"Deleted"});
});

/////////////////////////////////////////////////
// ADMIN - list students with total hours
/////////////////////////////////////////////////
app.get("/admin/students",
authenticateToken,
authorizeRole("admin"),
async (req,res)=>{
    const { course } = req.query;
    if(course){
        const q = await pool.query(`
            SELECT u.id, u.student_id, u.course,
            (u.last_name || ', ' || u.first_name || ' ' || COALESCE(u.middle_name,'' ) || ' ' || COALESCE(u.suffix,'')) as full_name,
            COALESCE(SUM(t.total_hours),0) as total_hours
            FROM users u
            LEFT JOIN time_logs t ON t.student_id = u.id
            WHERE u.role='student' AND u.course=$1
            GROUP BY u.id
            ORDER BY u.last_name
        `,[course]);
        return res.json(q.rows);
    }

    const q = await pool.query(`
        SELECT u.id, u.student_id, u.course,
        (u.last_name || ', ' || u.first_name || ' ' || COALESCE(u.middle_name,'' ) || ' ' || COALESCE(u.suffix,'')) as full_name,
        COALESCE(SUM(t.total_hours),0) as total_hours
        FROM users u
        LEFT JOIN time_logs t ON t.student_id = u.id
        WHERE u.role='student'
        GROUP BY u.id
        ORDER BY u.last_name
    `);

    res.json(q.rows);
});

/////////////////////////////////////////////////
// STUDENT - my dashboard data
/////////////////////////////////////////////////
app.get("/student/me",
authenticateToken,
authorizeRole("student"),
async (req,res)=>{
    // total hours
    const totalQ = await pool.query(`SELECT COALESCE(SUM(total_hours),0) as total FROM time_logs WHERE student_id=$1`,[req.user.id]);
    const total = parseFloat(totalQ.rows[0].total) || 0;

    // recent logs
    const logsQ = await pool.query(`SELECT id, date, start_time, end_time, total_hours, status FROM time_logs WHERE student_id=$1 ORDER BY date DESC`,[req.user.id]);

    // weekly aggregation (last 7 days)
    const weekQ = await pool.query(`
        SELECT date, COALESCE(SUM(total_hours),0) as hours
        FROM time_logs
        WHERE student_id=$1 AND date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY date
        ORDER BY date
    `,[req.user.id]);

    // build labels and data for 7 days
    const labels = [];
    const data = [];
    for(let i=6;i>=0;i--){
        const d = new Date();
        d.setDate(d.getDate()-i);
        const iso = d.toISOString().slice(0,10);
        labels.push(iso);
        const row = weekQ.rows.find(r=>r.date.toISOString().slice(0,10)===iso);
        data.push(row?parseFloat(row.hours):0);
    }

    res.json({total,weekLabels:labels,weekHours:data,logs:logsQ.rows});
});

/////////////////////////////////////////////////
// SUPERVISOR APPROVAL
/////////////////////////////////////////////////
app.put("/approve/:id",
authenticateToken,
authorizeRole("supervisor"),
async (req,res)=>{
    await pool.query(
        `UPDATE time_logs SET status='approved' WHERE id=$1`,
        [req.params.id]
    );
    res.json({message:"Approved"});
});

/////////////////////////////////////////////////
// EXPORT PDF
/////////////////////////////////////////////////
app.get("/export",
authenticateToken,
authorizeRole("student"),
async (req,res)=>{

    const logs = await pool.query(
        `SELECT * FROM time_logs WHERE student_id=$1`,
        [req.user.id]
    );

    const doc = new PDFDocument();
    res.setHeader("Content-Type","application/pdf");
    doc.pipe(res);

    doc.fontSize(16).text("OJT Hours Report",{align:"center"});
    doc.moveDown();

    logs.rows.forEach(log=>{
        doc.text(
        `${log.date} | ${log.start_time} - ${log.end_time} | ${log.total_hours} hrs | ${log.status}`
        );
    });

    doc.end();
});

app.listen(3000,()=>console.log("Server running on 3000"));